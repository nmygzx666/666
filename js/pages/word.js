/**
 * word.js — 单词卡
 *
 * 背诵循环的核心。一屏一个词，三个喇叭（词 / 句 / 连读），
 * 底下两个按钮决定它进哪个盒子。
 */

import { ensureChapter, flatten } from '../data.js';
import * as store from '../store.js';
import * as srs from '../srs.js';
import * as tts from '../tts.js';
import { canSpeak } from '../env.js';
import { esc, $, savePos, toast } from '../ui.js';

export default async function renderWord({ id, wi }) {
  const app = $('#app');
  const i = Math.max(0, parseInt(wi, 10) || 0);

  let ch, words;
  try {
    ch = await ensureChapter(id);
    words = flatten(ch);
  } catch (e) {
    app.innerHTML = `<div class="note bad">加载失败：${esc(e.message)}</div>`;
    return;
  }

  if (!words.length) {
    app.innerHTML = `<div class="note warn">这一章没有词。</div>`;
    return;
  }

  const word = words[Math.min(i, words.length - 1)];
  const realIndex = words.indexOf(word);

  savePos(id, 0, realIndex);
  try { localStorage.setItem('vocab:lastChapter', id); } catch (e) { /* 忽略 */ }

  const rec = srs.rec(store.getSrs(id), word.w);
  const speakable = canSpeak();
  const canPrev = realIndex > 0;
  const canNext = realIndex < words.length - 1;

  app.innerHTML = `
    <div class="topbar">
      <button class="iconbtn" id="bk">‹</button>
      <h1 style="font-size:16px;color:var(--ink-2);font-weight:500">
        ${esc(ch.title)} · ${realIndex + 1} / ${words.length}
      </h1>
    </div>

    <div class="wordcard">
      <div class="w en">${esc(word.w)}</div>
      ${word.ipa ? `<div class="ipa">${esc(word.ipa)}</div>` : ''}
      <div class="zh">
        ${word.pos ? `<span class="pos">${esc(word.pos)}</span>` : ''}${esc(word.zh)}
      </div>
      ${word.syn && word.syn.length ? `<div class="syn">${word.syn.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}

      ${speakable ? `
        <div>
          <button class="spk" id="spkW">🔊 单词</button>
          ${word.ex ? `<button class="spk" id="spkS">🔊 例句</button>` : ''}
          ${word.ex ? `<button class="spk" id="spkBoth">▶ 连读</button>` : ''}
        </div>` : `<div class="note" style="margin-top:14px;text-align:left">这台设备没有可用的英语语音，发音按钮先隐藏了。</div>`}
    </div>

    ${word.ex ? `
    <div class="example">
      <div class="en-s">${esc(word.ex)}</div>
      ${word.exZh ? `<div class="zh-s">${esc(word.exZh)}</div>` : ''}
    </div>` : ''}

    <div class="note">
      当前盒子：<b>${rec[0]}</b>${rec[0] >= 5 ? '（已到最长间隔 15 天）' : `　答对后下次复习：<b>${intervalLabel(rec[0])}</b>`}
    </div>

    <div class="btnrow" style="margin-bottom:10px">
      <button class="btn sec" id="dont">不认识</button>
      <button class="btn" id="know">认识</button>
    </div>

    <div class="btnrow">
      <button class="btn ghost" id="prev" ${canPrev ? '' : 'disabled'}>‹ 上一个</button>
      <button class="btn ghost" id="next" ${canNext ? '' : 'disabled'}>下一个 ›</button>
    </div>
  `;

  /* ---------- 朗读 ---------- */

  if (speakable) {
    const spkW = $('#spkW', app);
    const spkS = $('#spkS', app);
    const spkBoth = $('#spkBoth', app);

    if (spkW) spkW.addEventListener('click', () => tts.speak(word.w));
    if (spkS) spkS.addEventListener('click', () => tts.speak(word.ex));
    if (spkBoth) spkBoth.addEventListener('click', () => tts.speakSeq([word.w, word.ex]));
  }

  /* ---------- 翻页 ---------- */

  const go = (n) => {
    const t = realIndex + n;
    if (t < 0 || t >= words.length) return;
    location.hash = `#/ch/${id}/w/${t}`;
  };

  $('#prev', app).addEventListener('click', () => go(-1));
  $('#next', app).addEventListener('click', () => go(1));
  $('#bk', app).addEventListener('click', () => { location.hash = `#/ch/${id}`; });

  /* ---------- 判分 ---------- */

  const answer = (correct) => {
    srs.grade(id, word.w, correct, 0);
    const st = store.logStudy(1, correct ? 1 : 0);

    if (st.justCheckedIn) {
      toast(`今日已打卡 · 连续 ${st.streak.current} 天`);
    } else if (!correct) {
      toast('已记入错题本');
    }

    if (correct && canNext) go(1);
    else if (correct && !canNext) finish();
    else renderWord({ id, wi: String(realIndex) });   // 不认识：原地刷新，盒子归零
  };

  $('#know', app).addEventListener('click', () => answer(true));
  $('#dont', app).addEventListener('click', () => answer(false));

  function finish() {
    tts.cancelAll();
    const p = store.todayProgress();
    app.innerHTML = `
      <div class="topbar"><h1>这一章过完了</h1></div>
      <div class="hero">
        <div class="big">${p.reviewed}<span style="font-size:16px;font-weight:400;opacity:.8"> / ${p.goal}</span></div>
        <div class="cap">${p.checkedIn ? `今天已打卡 · 连续 ${p.streak} 天` : `今日目标还差 ${Math.max(0, p.goal - p.reviewed)} 个词`}</div>
      </div>
      <button class="btn" id="again" style="margin-bottom:10px">再来一轮</button>
      <button class="btn ghost" id="home">回首页</button>
    `;
    $('#again', app).addEventListener('click', () => { location.hash = `#/ch/${id}/w/0`; });
    $('#home', app).addEventListener('click', () => { location.hash = '#/home'; });
  }
}

function intervalLabel(box) {
  const days = [0, 1, 2, 4, 7, 15][Math.min(5, box + 1)];
  if (days === 0) return '今天内';
  if (days === 1) return '明天';
  if (days === 2) return '后天';
  return `${days} 天后`;
}
