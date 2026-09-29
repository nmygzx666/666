/**
 * home.js — 首页
 *
 * 一屏说清三件事：今天背了没、接下来去哪、这台手机有没有坑。
 */

import { getManifest } from '../data.js';
import * as store from '../store.js';
import * as tts from '../tts.js';
import { isWeChat, isStandalone, canSpeak } from '../env.js';
import { esc, $ } from '../ui.js';

export default async function renderHome() {
  const app = $('#app');
  const p = store.todayProgress();
  const meta = store.getMeta();

  const pct = Math.min(100, Math.round(p.reviewed / Math.max(1, p.goal) * 100));

  // 上次背到哪一章
  const lastCh = localStorage.getItem('vocab:lastChapter');

  app.innerHTML = `
    <div class="topbar">
      <h1>雅思词汇</h1>
      <button class="iconbtn" id="goSet" title="设置">⚙️</button>
    </div>

    <div class="hero">
      <div class="big">${p.reviewed}<span style="font-size:16px;font-weight:400;opacity:.8"> / ${p.goal}</span></div>
      <div class="cap">${p.checkedIn ? `今天已打卡 · 连续 ${p.streak} 天` : `今日目标还差 ${Math.max(0, p.goal - p.reviewed)} 个词`}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>

    <div id="envnotes"></div>

    <button class="btn" id="cont" style="margin-bottom:12px">
      ${lastCh ? '继续背诵' : '开始背诵'}
    </button>

    <div class="card flat">
      <div class="title-sm">章节</div>
      <div id="chapbox"><div class="note">正在加载章节…</div></div>
    </div>
  `;

  $('#goSet', app).addEventListener('click', () => { location.hash = '#/settings'; });

  $('#cont', app).addEventListener('click', () => {
    location.hash = lastCh ? `#/ch/${lastCh}` : '#/chapters';
  });

  renderEnvNotes();

  // 章节清单可能还没到，到了再填
  const fill = (m) => {
    const box = $('#chapbox', app);
    if (!box) return;
    if (m.error) { box.innerHTML = `<div class="note bad">章节清单加载失败：${esc(m.error)}</div>`; return; }
    if (!m.chapters.length) { box.innerHTML = `<div class="note warn">还没有任何章节数据。</div>`; return; }
    box.innerHTML = m.chapters.slice(0, 3).map(c => chapRow(c)).join('') +
      (m.chapters.length > 3 ? `<button class="btn ghost" id="moreCh">查看全部 ${m.chapters.length} 章</button>` : '');
    const more = $('#moreCh', box);
    if (more) more.addEventListener('click', () => { location.hash = '#/chapters'; });
    box.querySelectorAll('.chap').forEach(a => {
      a.addEventListener('click', () => { location.hash = '#/ch/' + a.dataset.id; });
    });
  };

  getManifest().then(fill);
  window.addEventListener('manifest', e => fill(e.detail), { once: true });
}

function chapRow(c) {
  return `<div class="chap" data-id="${esc(c.id)}">
    <div class="num">${c.n != null ? esc(c.n) : '·'}</div>
    <div class="nm"><b>${esc(c.title)}</b><span>${esc(c.titleEn || '')}${c.count ? ' · ' + c.count + ' 词' : ''}</span></div>
    <div class="chev">›</div>
  </div>`;
}

/** 只显示真正会影响使用的提示，不堆废话 */
function renderEnvNotes() {
  const box = $('#envnotes');
  if (!box) return;
  const notes = [];

  if (isWeChat()) {
    notes.push(`<div class="note warn"><b>你在微信里打开。</b>朗读常常不出声，也没法加到主屏幕。点右上角「···」→「在 Safari 中打开」。</div>`);
  }

  if (canSpeak() && !tts.isUnlocked()) {
    notes.push(`<div class="note">还没开启发音。点下面的按钮授权一次就行。</div>`);
  }

  if (canSpeak() && tts.isUnlocked() && !tts.hasEnglishVoice()) {
    notes.push(`<div class="note bad"><b>这台设备上没有英语语音。</b>「听音辨词」暂时用不了，其他功能不受影响。<br>
      装一个：设置 → 辅助功能 → 朗读内容 → 声音 → 英语。</div>`);
  }

  if (!isStandalone()) {
    notes.push(`<div class="note"><b>建议加到主屏幕。</b>Safari 会把 7 天没打开的网站数据清掉，包括你的背诵进度。加到主屏幕就不怕了。<br>
      点底部「分享」→「添加到主屏幕」。</div>`);
  }

  box.innerHTML = notes.join('');
}
