/**
 * chapter.js — 一章的词，按逻辑词群分组
 *
 * 词群是这本书的编排单位，所以它是第一等公民，不是装饰。
 */

import { ensureChapter, flatten } from '../data.js';
import * as store from '../store.js';
import * as tts from '../tts.js';
import { esc, $, boxDot, toast } from '../ui.js';

export default async function renderChapter({ id }) {
  const app = $('#app');
  app.innerHTML = `
    <div class="topbar">
      <button class="iconbtn" id="bk">‹</button>
      <h1 id="ttl">加载中…</h1>
    </div>
    <div class="spinner"></div>
  `;
  $('#bk', app).addEventListener('click', () => { location.hash = '#/chapters'; });

  let ch;
  try {
    ch = await ensureChapter(id);
  } catch (e) {
    app.innerHTML = `<div class="topbar"><button class="iconbtn" id="bk">‹</button><h1>出错了</h1></div>
      <div class="note bad">这一章加载失败：${esc(e.message)}<br>检查 data/ch/${esc(id)}.json 是否存在、格式对不对。</div>`;
    $('#bk', app).addEventListener('click', () => { location.hash = '#/chapters'; });
    return;
  }

  // 记住最后打开过哪章，首页的「继续背诵」要用
  try { localStorage.setItem('vocab:lastChapter', id); } catch (e) { /* 忽略 */ }

  const srs = store.getSrs(id);

  app.innerHTML = `
    <div class="topbar">
      <button class="iconbtn" id="bk">‹</button>
      <h1>${esc(ch.n != null ? `第 ${ch.n} 章 · ` : '')}${esc(ch.title)}</h1>
    </div>

    <div class="note">共 ${ch.count} 个词，分 ${ch.clusters.length} 组。点词看卡片，点喇叭听发音。</div>

    <button class="btn" id="start" style="margin-bottom:16px">开始顺序背诵</button>

    <div id="groups"></div>
  `;

  $('#bk', app).addEventListener('click', () => { location.hash = '#/chapters'; });

  // 顺序背诵从第 0 个词开始
  $('#start', app).addEventListener('click', () => {
    location.hash = `#/ch/${id}/w/0`;
  });

  const box = $('#groups', app);
  box.innerHTML = ch.clusters.map((cl, ci) => `
    <div class="group-head">${esc(cl.name)} · ${cl.words.length}</div>
    <div class="wlist">
      ${cl.words.map((w, wi) => {
        const boxNo = srs[w.w.toLowerCase()] ? srs[w.w.toLowerCase()][0] : 0;
        return `<button class="witem" data-i="${flatIndex(ch, ci, wi)}">
          ${boxDot(boxNo)}
          <span class="grow">
            <span class="we">${esc(w.w)}</span>
            <span class="wz">${esc(w.zh)}</span>
          </span>
          <span class="chev">›</span>
        </button>`;
      }).join('')}
    </div>
  `).join('');

  box.addEventListener('click', (e) => {
    const b = e.target.closest('.witem');
    if (b) location.hash = `#/ch/${id}/w/${b.dataset.i}`;
  });
}

/** 词在整章里的扁平序号 —— 单词页靠它前后翻页 */
function flatIndex(ch, ci, wi) {
  let n = 0;
  for (let i = 0; i < ci; i++) n += ch.clusters[i].words.length;
  return n + wi;
}
