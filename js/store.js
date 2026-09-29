/**
 * store.js — 本地存储
 *
 * 三条铁律：
 *  1. 所有读写包 try/catch。iOS 无痕模式、存储吃紧时 setItem 会直接抛异常，
 *     一次没接住就可能在答题中途崩掉整局。
 *  2. 拆成多个 key。localStorage 是同步的，写一次要重新序列化整个值——
 *     每答一题就重写 150KB 的大对象，手机上会明显卡。
 *  3. 日期一律用「天数整数」，不用日期字符串。连续天数变成整数比较，
 *     没有 Date 解析，也不怕时区抖动。
 */

const NS = 'vocab:';
export const VERSION = 1;

/* ---------- 基础读写 ---------- */

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[store] 读取失败', key, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('[store] 写入失败', key, e);
    return false;
  }
}

function drop(key) {
  try { localStorage.removeItem(NS + key); } catch (e) { /* 忽略 */ }
}

/* ---------- 天数 ---------- */

/**
 * 把时间戳换算成「本地天数整数」。
 * 凌晨 4 点前算前一天——背单词到半夜不该被算成断签。
 */
export function dayNum(ts = Date.now(), dayStartHour = 4) {
  const d = new Date(ts);
  d.setHours(d.getHours() - dayStartHour);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

export function dayLabel(n) {
  const d = new Date(n * 86400000 + new Date().getTimezoneOffset() * 60000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- 设置 ---------- */

const DEFAULT_META = {
  v: VERSION,
  updatedAt: 0,
  unlocked: false,      // 是否已经点过「开启发音」
  voiceURI: null,       // 用户手选的音色
  rate: 0.9,            // 语速
  dailyGoal: 20,        // 每日目标词数
  installPromptSeen: false,
  wechatWarned: false,
  lastExportAt: 0,
  dataVersion: 1,
};

export function getMeta() {
  return Object.assign({}, DEFAULT_META, read('meta', {}));
}

export function setMeta(patch) {
  const next = Object.assign(getMeta(), patch, { updatedAt: Date.now() });
  write('meta', next);
  return next;
}

/* ---------- 打卡 / 连续天数 ---------- */

const DEFAULT_STREAK = { current: 0, best: 0, lastDay: 0, totalDays: 0 };

export function getStreak() {
  return Object.assign({}, DEFAULT_STREAK, read('streak', {}));
}

export function getHistory() {
  return read('history', {});
}

/**
 * 记录今天的学习量，够每日目标就算打卡。
 * 返回 { checkedIn, streak, justCheckedIn }
 */
export function logStudy(count = 1, correct = 0, seconds = 0) {
  const today = dayNum();
  const meta = getMeta();
  const goal = meta.dailyGoal || 20;

  const hist = getHistory();
  const key = dayLabel(today);
  const rec = hist[key] || [0, 0, 0];
  rec[0] += count;
  rec[1] += correct;
  rec[2] += seconds;
  hist[key] = rec;

  // 只留最近 400 天，防止无限膨胀
  const keys = Object.keys(hist).sort();
  while (keys.length > 400) delete hist[keys.shift()];
  write('history', hist);

  const streak = getStreak();
  const wasCheckedIn = streak.lastDay === today && streak.current > 0;
  const reachedGoal = rec[0] >= goal;

  let justCheckedIn = false;
  if (reachedGoal && !wasCheckedIn) {
    if (streak.lastDay === today - 1) streak.current += 1;
    else streak.current = 1;
    streak.lastDay = today;
    streak.totalDays += 1;
    streak.best = Math.max(streak.best, streak.current);
    write('streak', streak);
    justCheckedIn = true;
  }

  return {
    checkedIn: streak.lastDay === today && streak.current > 0,
    streak,
    justCheckedIn,
    today: rec,
    goal,
  };
}

export function todayProgress() {
  const today = dayNum();
  const meta = getMeta();
  const rec = getHistory()[dayLabel(today)] || [0, 0, 0];
  const streak = getStreak();
  return {
    reviewed: rec[0],
    correct: rec[1],
    goal: meta.dailyGoal || 20,
    streak: streak.current,
    best: streak.best,
    totalDays: streak.totalDays,
    checkedIn: streak.lastDay === today && streak.current > 0,
  };
}

/* ---------- 间隔重复（Leitner 五盒）---------- */
/*
 * 每个词存一条定长数组，顺序固定，改这里必须同步改 srs.js：
 *   [box, dueDay, right, wrong, lastDay]
 *    box     0–5，盒子号，越大间隔越长
 *    dueDay  该复习的天数整数
 *    right   累计答对次数
 *    wrong   累计答错次数
 *    lastDay 最后一次作答的天数
 * 数组比对象省 3 倍空间，3600 个词差出 350KB。
 */

export function getSrs(chapterId) {
  return read('srs:' + chapterId, {});
}

export function setSrs(chapterId, table) {
  return write('srs:' + chapterId, table);
}

export function getAllSrsChapterIds() {
  const ids = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS + 'srs:')) ids.push(k.slice((NS + 'srs:').length));
    }
  } catch (e) { /* 忽略 */ }
  return ids;
}

/* ---------- 错题本 ---------- */

export function getWrong() {
  return read('wrong', {});
}

/**
 * 记一道错题。
 * 存法：[错误次数, 最近错误日, 题型位掩码, chapterId, [答对过的日子…]]
 */
export function addWrong(word, chapterId, modeIndex) {
  const k = word.toLowerCase();
  const t = getWrong();
  const cur = t[k] || [0, 0, 0, chapterId, []];
  cur[0] += 1;                       // 累计错误次数
  cur[1] = dayNum();                 // 最近一次错误
  cur[2] = (cur[2] || 0) | (1 << modeIndex);
  cur[3] = chapterId;
  cur[4] = cur[4] || [];
  t[k] = cur;
  write('wrong', t);
  return t;
}

/**
 * 在错题本里答对一次。
 * 要在**两个不同的日子**各答对一次才移出——答对一次就放走等于碰运气。
 * 返回 true 表示已移出。
 */
export function markWrongCorrect(word) {
  const k = word.toLowerCase();
  const t = getWrong();
  const cur = t[k];
  if (!cur) return false;

  const days = cur[4] || (cur[4] = []);
  const d = dayNum();
  if (!days.includes(d)) days.push(d);

  if (days.length >= 2) { delete t[k]; write('wrong', t); return true; }
  write('wrong', t);
  return false;
}

export function clearWrong(word) {
  const t = getWrong();
  delete t[word.toLowerCase()];
  write('wrong', t);
}

/* ---------- 自定义生词本 ---------- */

export function getPersonal() {
  return read('personal', []);
}

export function setPersonal(list) {
  return write('personal', list);
}

/* ---------- 导出 / 导入 ---------- */

export function exportAll() {
  const data = { version: VERSION, exportedAt: Date.now(), keys: {} };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) data.keys[k.slice(NS.length)] = localStorage.getItem(k);
    }
  } catch (e) { console.warn('[store] 导出遍历失败', e); }
  data.wordCount = Object.keys(getWrong()).length;
  return data;
}

export function importAll(payload, { merge = true } = {}) {
  if (!payload || typeof payload !== 'object' || !payload.keys) {
    throw new Error('这不是本应用导出的进度文件');
  }
  if (payload.version > VERSION) {
    throw new Error('进度文件来自更新的版本，请先更新网页');
  }

  let n = 0;
  for (const [k, raw] of Object.entries(payload.keys)) {
    if (!merge) { write(k, JSON.parse(raw)); n++; continue; }

    // 合并策略：一律取「更大的值」，永不覆盖成更差的状态
    if (k.startsWith('srs:')) {
      const mine = read(k, {});
      const theirs = JSON.parse(raw);
      for (const [w, rec] of Object.entries(theirs)) {
        const cur = mine[w];
        if (!cur) { mine[w] = rec; continue; }
        cur[0] = Math.max(cur[0], rec[0]);              // 盒子取高
        cur[2] = Math.max(cur[2], rec[2]);              // 答对数取高
        cur[4] = Math.max(cur[4], rec[4]);
        cur[1] = Math.min(cur[1], rec[1]);              // 到期日取早，宁可多复习
      }
      write(k, mine);
    } else if (k === 'wrong') {
      const mine = getWrong();
      for (const [w, rec] of Object.entries(JSON.parse(raw))) {
        const cur = mine[w];
        if (!cur) { mine[w] = rec; continue; }
        cur[0] = Math.max(cur[0], rec[0]);
        cur[1] = Math.max(cur[1], rec[1]);
        cur[2] = (cur[2] || 0) | (rec[2] || 0);
      }
      write('wrong', mine);
    } else if (k === 'streak') {
      const mine = getStreak();
      const theirs = JSON.parse(raw);
      mine.best = Math.max(mine.best, theirs.best || 0);
      mine.totalDays = Math.max(mine.totalDays, theirs.totalDays || 0);
      if ((theirs.current || 0) > mine.current && theirs.lastDay >= mine.lastDay) {
        mine.current = theirs.current;
        mine.lastDay = theirs.lastDay;
      }
      write('streak', mine);
    } else if (k === 'history') {
      const mine = getHistory();
      for (const [d, rec] of Object.entries(JSON.parse(raw))) {
        const cur = mine[d] || [0, 0, 0];
        mine[d] = [Math.max(cur[0], rec[0]), Math.max(cur[1], rec[1]), Math.max(cur[2], rec[2])];
      }
      write('history', mine);
    } else if (k === 'meta') {
      const mine = getMeta();
      const theirs = JSON.parse(raw);
      mine.unlocked = mine.unlocked || !!theirs.unlocked;
      mine.dataVersion = Math.max(mine.dataVersion || 1, theirs.dataVersion || 1);
      write('meta', mine);
    }
    n++;
  }
  return n;
}

/** 估算占用字节数，诊断面板用 */
export function usage() {
  let bytes = 0, keys = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) {
        bytes += (k.length + (localStorage.getItem(k) || '').length) * 2;
        keys++;
      }
    }
  } catch (e) { /* 忽略 */ }
  return { bytes, keys };
}

/** 清空（设置页用，会二次确认） */
export function wipe() {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch (e) { console.warn('[store] 清空失败', e); }
}
