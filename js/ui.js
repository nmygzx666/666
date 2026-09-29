/**
 * ui.js — 极小的 DOM 助手
 *
 * 词库数据来自用户自己找的文件，内容不可信，所以所有插值一律走 esc()。
 */

export function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 把 HTML 字符串变成节点 */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function on(node, sel, evt, fn) {
  node.addEventListener(evt, (e) => {
    const t = e.target.closest(sel);
    if (t && node.contains(t)) fn(e, t);
  });
}

let toastTimer = 0;
export function toast(msg, ms = 1900) {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('<div id="toast"></div>');
    Object.assign(t.style, {
      position: 'fixed', left: '50%', bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
      transform: 'translateX(-50%)', background: 'rgba(20,22,28,.92)', color: '#fff',
      padding: '10px 18px', borderRadius: '99px', fontSize: '14px', zIndex: 300,
      maxWidth: '86vw', textAlign: 'center', opacity: '0', transition: 'opacity .18s',
      pointerEvents: 'none',
    });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; }, ms);
}

/** 上次答题位置记忆，让「继续背」能接上 */
const POS_KEY = 'vocab:pos:';

export function savePos(chapterId, clusterIndex, wordIndex) {
  try {
    localStorage.setItem(POS_KEY + chapterId, JSON.stringify([clusterIndex, wordIndex]));
  } catch (e) { /* 忽略 */ }
}

export function loadPos(chapterId) {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY + chapterId));
    return Array.isArray(v) ? v : [0, 0];
  } catch (e) { return [0, 0]; }
}

/** 盒子上色用的等级 */
export function boxDot(box) {
  const b = Math.max(0, Math.min(5, box | 0));
  return `<i class="dot b${b}"></i>`;
}
