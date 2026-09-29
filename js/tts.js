/**
 * tts.js — 朗读
 *
 * 全项目风险最高的一块。设计前提是：**这台手机上可能根本没有英语语音**，
 * 而整个 App 依然必须完全可用。所以这里所有失败都走降级，绝不抛出、绝不阻塞。
 *
 * iPhone 上要防的坑（按踩到的概率排序）：
 *  1. 静音拨片拨到静音 → speak() 返回成功、不报错、**完全没声音**。JS 检测不到，
 *     只能靠界面上提示用户。这是最常见的「怎么又不出声了」。
 *  2. 首次发音必须在真实的用户点击里同步触发。setTimeout、页面加载、
 *     promise 回调都不算数。所以有个「开启发音」按钮。
 *  3. getVoices() 刚打开页面时返回空数组，要等 voiceschanged。
 *     但温启动时这个事件可能永远不触发 —— 所以先直接取一次，空了才挂监听。
 *  4. 系统自带一堆玩具音色（Zarvox、Bubbles、Bad News…），
 *     随手 find 一个就念成搞怪音。必须硬排除。
 *  5. 某个音色卡住不回调 onend 时，队列会永久死锁。每个朗读挂看门狗兜底。
 */

import { getMeta, setMeta } from './store.js';

/* ---------- 常量 ---------- */

// iPhone/macOS 内置的玩具音色，绝不能用来背单词
const NOVELTY = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
  'deranged', 'good news', 'jester', 'organ', 'superstar', 'trinoids',
  'whisper', 'zarvox', 'hysterical', 'pipe organ', 'wobble', 'junior',
  'ralph', 'fred', 'kathy', 'princess', 'bruce', 'agnes',
]);

// 雅思是英音考试，英音优先
const LANG_SCORE = { 'en-gb': 100, 'en-au': 70, 'en-us': 60 };
const GOOD_NAMES = ['daniel', 'serena', 'kate', 'stephanie', 'oliver', 'arthur',
  'google uk english female', 'google uk english male',
  'microsoft ryan', 'microsoft sonia', 'microsoft libby'];

const MAX_CHUNK = 200;     // 超过这个长度要切句，绕开 Chrome 的长句截断

/* ---------- 状态 ---------- */

let voices = [];
let chosen = null;
let queue = [];
let gen = 0;              // 代际令牌：cancel 时 +1，用来作废旧的 onend 回调
let speaking = false;
let watchdog = 0;
let voiceLoadPromise = null;

// 诊断面板用的事件环形缓冲
const diag = [];
function note(msg) {
  diag.push({ t: Date.now(), msg });
  if (diag.length > 60) diag.shift();
  if (isDev()) console.log('[tts]', msg);
}

function isDev() {
  try { return new URLSearchParams(location.search).get('dev') === '1'; }
  catch (e) { return false; }
}

export function diagnostics() {
  return { voices: voices.map(v => ({ name: v.name, lang: v.lang, uri: v.voiceURI, local: v.localService })), chosen: chosen && chosen.name, events: diag.slice(-30) };
}

/* ---------- 音色加载 ---------- */

function isNovelty(v) {
  return NOVELTY.has((v.name || '').toLowerCase().trim());
}

/** 给一个音色打分，越高越合适。不合格返回 -1。 */
function scoreVoice(v) {
  const lang = (v.lang || '').toLowerCase().replace('_', '-');
  if (!lang.startsWith('en')) return -1;          // 只要英语
  if (isNovelty(v)) return -1;                    // 玩具音色，直接出局
  if (/\(zarvox\)|whisper/i.test(v.name)) return -1;

  let s = LANG_SCORE[lang] || 40;                 // 英音 > 澳音 > 美音 > 其他英语
  if (v.localService) s += 15;                    // 本地音色，离线也能用
  if (GOOD_NAMES.includes((v.name || '').toLowerCase())) s += 10;
  if (!v.default) s += 5;                         // 显式装过的一般更好
  return s;
}

export function englishVoices() {
  return voices
    .map(v => ({ v, s: scoreVoice(v) }))
    .filter(x => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.v);
}

export function hasEnglishVoice() {
  return englishVoices().length > 0;
}

/**
 * 加载音色列表。
 * 先直接取一次（温启动时已经有值，voiceschanged 根本不会触发）；
 * 空了才挂监听 + 轮询兜底。
 */
export function loadVoices(timeoutMs = 3000) {
  if (voiceLoadPromise) return voiceLoadPromise;

  voiceLoadPromise = new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(bail);
      voices = safeGetVoices();
      pickDefault();
      note(`音色加载完成，共 ${voices.length} 个，英语 ${englishVoices().length} 个`);
      resolve(voices);
    };

    const safeGetVoices = () => {
      try { return window.speechSynthesis ? speechSynthesis.getVoices() || [] : []; }
      catch (e) { note('getVoices 抛异常: ' + e.message); return []; }
    };

    if (!window.speechSynthesis) {
      note('本浏览器不支持 speechSynthesis');
      done = true; resolve([]);
      return;
    }

    // ① 立刻取一次
    voices = safeGetVoices();
    if (voices.length) { pickDefault(); note(`音色已就绪: ${voices.length} 个`); resolve(voices); return; }

    // ② 空的，挂 voiceschanged
    try { speechSynthesis.addEventListener('voiceschanged', finish); } catch (e) { /* 忽略 */ }

    // ③ 轮询 + 超时兜底（iOS 有时要点一下才填充）
    let poll = setInterval(() => {
      voices = safeGetVoices();
      if (voices.length) finish();
    }, 300);
    let bail = setTimeout(finish, timeoutMs);
  });

  return voiceLoadPromise;
}

/** 语音列表变化后强制重载（用户可能在设置里刚装了语音包） */
export function reloadVoices() {
  voiceLoadPromise = null;
  return loadVoices();
}

/* ---------- 选音色 ---------- */

function pickDefault() {
  const meta = getMeta();

  // 用户手选过就尊重用户
  if (meta.voiceURI) {
    const hit = voices.find(v => v.voiceURI === meta.voiceURI);
    if (hit && scoreVoice(hit) >= 0) { chosen = hit; return; }
  }
  const list = englishVoices();
  chosen = list[0] || null;
  note('自动选中音色: ' + (chosen ? `${chosen.name} (${chosen.lang})` : '无'));
}

export function setVoice(voiceURI) {
  const hit = voices.find(v => v.voiceURI === voiceURI);
  if (!hit) return false;
  chosen = hit;
  setMeta({ voiceURI });
  note('切换音色: ' + hit.name);
  return true;
}

export function currentVoice() { return chosen; }

export function setRate(r) {
  setMeta({ rate: Math.min(1.2, Math.max(0.5, r)) });
}

function currentRate() {
  const r = getMeta().rate;
  return (typeof r === 'number' && r >= 0.5 && r <= 1.2) ? r : 0.9;
}

/* ---------- 解锁 ---------- */

/**
 * 必须在真实的点击事件里同步调用。
 * 里面不能出现 await / setTimeout / .then ——任何一个都会让 iOS 认为不是用户手势。
 */
export function unlock() {
  if (!window.speechSynthesis) return false;
  try {
    speechSynthesis.cancel();
    speechSynthesis.resume();                      // iOS/Chrome 有时会卡在 paused
    const u = new SpeechSynthesisUtterance('Ready');
    u.volume = 1; u.rate = 1; u.lang = 'en-GB';
    if (chosen) u.voice = chosen;
    speechSynthesis.speak(u);
    setMeta({ unlocked: true });
    note('已解锁发音');
    return true;
  } catch (e) {
    note('解锁失败: ' + e.message);
    return false;
  }
}

export function isUnlocked() {
  return getMeta().unlocked === true;
}

/* ---------- 播放队列 ---------- */

/** 把长文本切成句级片段，绕开 Chrome 的长句截断 */
function chunk(text) {
  const t = String(text || '').trim();
  if (t.length <= MAX_CHUNK) return [t];
  const parts = t.split(/(?<=[.!?;:])\s+/);
  const out = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + ' ' + p).trim().length > MAX_CHUNK && buf) { out.push(buf.trim()); buf = p; }
    else buf = (buf + ' ' + p).trim();
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

export function speak(text, { lang = null, rate = null } = {}) {
  for (const c of chunk(text)) queue.push({ text: c, lang, rate });
  pump();
}

/** 依次朗读多段，段间留一点空隙 */
export function speakSeq(texts, opts = {}) {
  texts.forEach((t, i) => {
    if (i > 0) queue.push({ gap: 250 });
    for (const c of chunk(t)) queue.push({ text: c, lang: opts.lang || null, rate: opts.rate || null });
  });
  pump();
}

/** 只朗读某个音色做试听，不影响当前选择 */
export function preview(voiceURI, sample = 'The quick brown fox jumps over the lazy dog.') {
  const v = voices.find(x => x.voiceURI === voiceURI);
  if (!v) return;
  cancelAll();
  try {
    const u = new SpeechSynthesisUtterance(sample);
    u.voice = v; u.lang = v.lang; u.rate = currentRate();
    speechSynthesis.speak(u);
    note('试听: ' + v.name);
  } catch (e) { note('试听失败: ' + e.message); }
}

function pump() {
  if (speaking) return;
  const item = queue.shift();
  if (!item) return;
  if (!window.speechSynthesis) { queue.length = 0; return; }

  if (item.gap) {
    // 段间停顿也走队列，保证顺序
    speaking = true;
    const myGen = gen;
    setTimeout(() => {
      if (myGen !== gen) return;
      speaking = false; pump();
    }, item.gap);
    return;
  }

  speaking = true;
  const myGen = gen;

  try {
    speechSynthesis.resume();   // 从 paused 状态里捞出来
  } catch (e) { /* 忽略 */ }

  let u;
  try {
    u = new SpeechSynthesisUtterance(item.text);
  } catch (e) {
    note('构造 utterance 失败: ' + e.message);
    speaking = false; pump();
    return;
  }

  if (chosen) { u.voice = chosen; u.lang = chosen.lang; }
  else if (item.lang) { u.lang = item.lang; }
  u.rate = item.rate || currentRate();
  u.volume = 1;

  const done = (why) => {
    if (myGen !== gen) return;              // 已被 cancel，别再推进队列
    if (!speaking) return;
    speaking = false;
    clearTimeout(watchdog);
    if (why !== 'end') note(`朗读结束(${why}): ${item.text.slice(0, 24)}`);
    pump();
  };

  u.onend = () => done('end');
  u.onerror = (e) => done('err:' + (e && e.error));

  // 看门狗：音色卡死不回调时，队列不能跟着死
  const budget = Math.min(30000, 8000 + 60 * item.text.length);
  clearTimeout(watchdog);
  watchdog = setTimeout(() => done('timeout'), budget);

  try {
    speechSynthesis.speak(u);
  } catch (e) {
    note('speak 抛异常: ' + e.message);
    done('throw');
  }
}

/**
 * 停掉一切并清空队列。
 * gen++ 是关键：cancel() 会给被取消的 utterance 触发 onend，
 * 不换代的话那个 onend 会把队列里的下一句接着读出来——就是
 * 「我按了停它还在念」的经典 bug。
 */
export function cancelAll() {
  gen++;
  clearTimeout(watchdog);
  queue.length = 0;
  speaking = false;
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
}

export function isSpeaking() { return speaking || queue.length > 0; }

/* ---------- 诊断面板数据 ---------- */

export function devInfo() {
  return {
    支持: !!window.speechSynthesis,
    音色总数: voices.length,
    英语音色: englishVoices().length,
    当前音色: chosen ? `${chosen.name} (${chosen.lang})` : '无',
    已解锁: isUnlocked(),
    语速: currentRate(),
    队列长度: queue.length,
    正在播: speaking,
    事件: diag.slice(-15).map(d => `${new Date(d.t).toLocaleTimeString()} ${d.msg}`),
  };
}

/* ---------- 启动 ---------- */

// 页面切到后台时停掉朗读：iOS 本来就会掐掉，硬留着队列回来会乱续
try {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAll();
  });
} catch (e) { /* 忽略 */ }
