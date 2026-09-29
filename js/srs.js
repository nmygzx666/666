/**
 * srs.js — 间隔重复（Leitner 五盒）
 *
 * 为什么不用 SM-2：SM-2 要给每个词存一个浮点难度系数，还得不停调参，
 * 最后算出来的间隔你自己都解释不清。Leitner 每个词只存一个整数，
 * 间隔就是 [今天、明天、后天、4天后、7天后、15天后]，
 * 哪天该复习一眼就懂，出问题也能自己查。
 *
 * 存法（和 store.js 里的注释必须保持一致）：
 *   [box, dueDay, right, wrong, lastDay]
 */

import { getSrs, setSrs, dayNum, addWrong, markWrongCorrect } from './store.js';

const INTERVALS = [0, 1, 2, 4, 7, 15];   // 每个盒子对应的间隔天数
export const MAX_BOX = 5;

/** 取一个词的记录，没有就返回一个全新的 */
export function rec(table, word) {
  const k = word.toLowerCase();
  return table[k] || [0, dayNum(), 0, 0, 0];
}

/**
 * 作答后更新。
 * @param {string} chapterId
 * @param {string} word      英文单词（做 key，不用位置 id——
 *                           将来重跑转换脚本后索引会变，用词才稳）
 * @param {boolean} correct
 * @param {number} modeIndex 题型序号，错题本要记
 */
export function grade(chapterId, word, correct, modeIndex = 0) {
  const table = getSrs(chapterId);
  const k = word.toLowerCase();
  const r = table[k] || [0, dayNum(), 0, 0, 0];

  if (correct) {
    r[0] = Math.min(MAX_BOX, r[0] + 1);
    r[2] += 1;
  } else {
    r[0] = 0;
    r[3] += 1;
  }
  r[1] = dayNum() + INTERVALS[r[0]];
  r[4] = dayNum();
  table[k] = r;
  setSrs(chapterId, table);

  if (correct) {
    // 错题本里的词要隔天再对一次才移出（逻辑在 store.markWrongCorrect）
    markWrongCorrect(k);
  } else {
    addWrong(k, chapterId, modeIndex);
  }

  return r;
}

/** 已掌握：进到 4 号盒以上，且累计答对 3 次 */
export function isMastered(r) {
  return r[0] >= 4 && r[2] >= 3;
}

/** 今天该复习的词（按 chapterId 分组，调用方已经加载好那一章） */
export function dueWords(chapter, table) {
  const today = dayNum();
  const out = [];
  for (const cl of chapter.clusters) {
    for (const w of cl.words) {
      const r = table[w.w.toLowerCase()];
      if (r && r[1] <= today) out.push(w);
    }
  }
  return out;
}

/** 整章掌握情况，章节页顶部显示用 */
export function chapterStats(chapter, table) {
  let total = 0, seen = 0, mastered = 0, due = 0;
  const today = dayNum();
  for (const cl of chapter.clusters) {
    for (const w of cl.words) {
      total++;
      const r = table[w.w.toLowerCase()];
      if (!r) continue;
      seen++;
      if (isMastered(r)) mastered++;
      if (r[1] <= today) due++;
    }
  }
  return { total, seen, mastered, due };
}
