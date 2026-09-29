/**
 * main.js — 应用外壳
 *
 * 启动顺序有讲究：
 *   先挂路由渲染出界面（哪怕数据还没到），再后台加载音色。
 *   音色加载可能等 3 秒，绝不能把整个 App 卡在那儿。
 */

import * as router from './router.js';
import * as tts from './tts.js';
import * as store from './store.js';
import { getManifest } from './data.js';
import { $, toast } from './ui.js';
import { isWeChat } from './env.js';

import renderHome from './pages/home.js';
import renderChapters from './pages/chapters.js';
import renderChapter from './pages/chapter.js';
import renderWord from './pages/word.js';
import renderSettings from './pages/settings.js';
import { renderPlaceholder } from './pages/placeholder.js';

/* ---------- 路由 ---------- */

// 注意：模式里不带 #。router.currentPath() 已经把 # 去掉了
router.route('/home', renderHome);
router.route('/chapters', renderChapters);
router.route('/ch/:id', renderChapter);
router.route('/ch/:id/w/:wi', renderWord);
router.route('/settings', renderSettings);
router.route('/quiz', () => renderPlaceholder('quiz'));
router.route('/stats', () => renderPlaceholder('stats'));
router.route('/wrongbook', () => renderPlaceholder('wrongbook'));

router.setNotFound(({ path }) => {
  const app = $('#app');
  app.innerHTML = `<div class="note bad">页面不存在：${path || ''}</div>
    <button class="btn" onclick="location.hash='#/home'">回到首页</button>`;
});

/* ---------- 标签栏高亮 ---------- */

function syncTabs() {
  const tab = router.currentPath().split('/')[1] || 'home';
  document.querySelectorAll('#tabbar a').forEach(a => {
    a.classList.toggle('on', a.dataset.tab === tab ||
      (tab === 'ch' && a.dataset.tab === 'chapters'));
  });
}

/* ---------- 启动 ---------- */

async function boot() {
  // 微信内置浏览器里发音会坏、也加不了主屏，先把话说在前头
  if (isWeChat() && !store.getMeta().wechatWarned) {
    store.setMeta({ wechatWarned: true });
    setTimeout(() => toast('微信里发音会不稳定，建议用 Safari 打开', 3600), 700);
  }

  const app = $('#app');

  // 先把路由跑起来，页面立刻可见
  router.start();
  window.addEventListener('hashchange', () => {
    tts.cancelAll();     // 换页就别念了，不然翻到下一屏还在读上一屏的内容
    syncTabs();
  });
  syncTabs();

  // 清单在后台加载，加载完让首页自己重画
  getManifest().then(m => {
    window.dispatchEvent(new CustomEvent('manifest', { detail: m }));
  });

  // 音色加载不阻塞界面
  tts.loadVoices().then(() => {
    window.dispatchEvent(new CustomEvent('voices'));
  });

  $('#tabbar').classList.remove('hide');

  // 没解锁过发音 → 弹一次全屏引导。这个点击是后面所有朗读的通行证
  if (window.speechSynthesis && !tts.isUnlocked()) {
    showUnlock();
  }
}

function showUnlock() {
  const veil = $('#unlockVeil');
  veil.hidden = false;

  $('#unlockBtn').addEventListener('click', () => {
    // 关键：这一串必须同步执行完，中间不能有 await / setTimeout
    tts.unlock();
    veil.hidden = true;
    // 解锁后再读一次音色列表——iOS 常常要等到用户点过才填充
    tts.reloadVoices().then(() => {
      window.dispatchEvent(new CustomEvent('voices'));
      toast('发音已开启');
    });
  }, { once: true });

  $('#unlockSkip').addEventListener('click', () => {
    store.setMeta({ unlocked: true });
    veil.hidden = true;
  }, { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
