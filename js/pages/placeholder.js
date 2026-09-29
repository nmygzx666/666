/**
 * placeholder.js — 还没做的页面
 *
 * 故意做成"告诉你在做"而不是"功能不存在"，
 * 免得点进来以为坏了。
 */

import * as store from '../store.js';
import { esc, $ } from '../ui.js';

const INFO = {
  quiz: {
    icon: '✍️',
    title: '随机检测',
    lines: [
      '四种题型：中译英、英译中、听音辨词、拼写填空',
      '答错自动进错题本，隔天再答对一次才移出',
      '出题时会避开同词群的近义词，不会出得不公平',
    ],
  },
  stats: {
    icon: '📅',
    title: '打卡日历',
    lines: [
      '连续天数、最佳纪录、累计打卡天数',
      '按月看哪些天背过、哪些天断了',
    ],
  },
  wrongbook: {
    icon: '📕',
    title: '错题本',
    lines: [
      '按章节分组，可按题型筛选',
      '点进去能重听发音、重做一遍',
    ],
  },
};

export function renderPlaceholder(key) {
  const info = INFO[key] || { icon: '🚧', title: '施工中', lines: [] };
  const app = $('#app');

  const wrong = store.getWrong();
  const wrongCount = Object.keys(wrong).length;

  app.innerHTML = `
    <div class="topbar">
      <button class="iconbtn" id="bk">‹</button>
      <h1>${esc(info.title)}</h1>
    </div>
    <div class="card" style="text-align:center;padding:32px 18px">
      <div style="font-size:44px;margin-bottom:8px">${info.icon}</div>
      <h2 style="font-size:18px;margin-bottom:10px">还没做</h2>
      <div style="color:var(--ink-2);font-size:14px;line-height:1.8;text-align:left">
        ${info.lines.map(l => `· ${esc(l)}`).join('<br>')}
      </div>
      ${key === 'wrongbook' && wrongCount ? `<div class="note" style="margin-top:18px;text-align:left">已经有 <b>${wrongCount}</b> 个词在错题本里等着了。</div>` : ''}
    </div>
    <div class="note">先做的是「按章节背诵 + 朗读」，这一步你确认能在手机上跑了，我就接着做这块。</div>
    <button class="btn ghost" id="home">回首页</button>
  `;

  $('#bk', app).addEventListener('click', () => { location.hash = '#/home'; });
  $('#home', app).addEventListener('click', () => { location.hash = '#/home'; });
}
