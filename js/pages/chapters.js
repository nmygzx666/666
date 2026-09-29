/**
 * chapters.js — 全部章节
 */

import { getManifest } from '../data.js';
import { esc, $ } from '../ui.js';

export default async function renderChapters() {
  const app = $('#app');
  app.innerHTML = `
    <div class="topbar">
      <button class="iconbtn" id="bk">‹</button>
      <h1>章节</h1>
    </div>
    <div id="list"><div class="note">正在加载…</div></div>
  `;

  $('#bk', app).addEventListener('click', () => { location.hash = '#/home'; });

  const m = await getManifest();
  const box = $('#list', app);
  if (!box) return;

  if (m.error) {
    box.innerHTML = `<div class="note bad">章节清单加载失败：${esc(m.error)}<br>检查一下 data/index.json 是否存在。</div>`;
    return;
  }
  if (!m.chapters.length) {
    box.innerHTML = `<div class="note warn">还没有章节数据。用 tools/convert.py 生成后再刷新。</div>`;
    return;
  }

  const demo = m.demo ? `<div class="note warn"><b>当前是示例数据</b>，只有 ${m.chapters.length} 章 ${m.chapters.reduce((s, c) => s + (c.count || 0), 0)} 个词，用来跑通流程。真实词库请用转换工具生成。</div>` : '';

  box.innerHTML = demo + m.chapters.map(c => `
    <div class="chap" data-id="${esc(c.id)}">
      <div class="num">${c.n != null ? esc(c.n) : '·'}</div>
      <div class="nm"><b>${esc(c.title)}</b><span>${esc(c.titleEn || '')}${c.count ? ' · ' + c.count + ' 词' : ''}</span></div>
      <div class="chev">›</div>
    </div>`).join('');

  box.querySelectorAll('.chap').forEach(a => {
    a.addEventListener('click', () => { location.hash = '#/ch/' + a.dataset.id; });
  });
}
