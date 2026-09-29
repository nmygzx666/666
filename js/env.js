/**
 * env.js — 运行环境判断
 *
 * 这些判断直接影响功能可用性，不是锦上添花：
 *  - 微信内置浏览器：发音经常坏，且无法「添加到主屏幕」
 *  - 是否已加到主屏幕：决定进度会不会被 7 天规则清掉
 */

const ua = navigator.userAgent || '';

export function isIOS() {
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isAndroid() {
  return /Android/.test(ua);
}

export function isWeChat() {
  return /MicroMessenger/i.test(ua);
}

/** 从主屏幕图标启动（而不是 Safari 标签页）——这意味着进度不会被清 */
export function isStandalone() {
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

/** 是否支持发音 */
export function canSpeak() {
  return typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';
}
