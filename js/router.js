/**
 * router.js — 极简 hash 路由
 *
 * 用 hash（#/chapters）而不是 History API 的原因：hash 不需要服务端配合，
 * 部署到任何静态托管上刷新都不会 404。
 */

const routes = [];
let current = null;
let notFound = () => { };

/** route('#/ch/:id', handler) */
export function route(pattern, handler) {
  const keys = [];
  const rx = new RegExp('^' + pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })
    + '$');
  routes.push({ rx, keys, handler });
}

export function setNotFound(fn) { notFound = fn; }

export function go(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : '#' + path;
  if (replace) {
    const url = location.href.split('#')[0] + target;
    history.replaceState(null, '', url);
    resolve();
  } else if (location.hash === target) {
    resolve();
  } else {
    location.hash = target;
  }
}

export function back() {
  if (history.length > 1) history.back();
  else go('/home');
}

export function currentPath() {
  return location.hash.replace(/^#/, '') || '/home';
}

let lastPath = null;

async function resolve() {
  const path = currentPath();
  if (path === lastPath) return;      // 同一个地址不重复渲染
  lastPath = path;
  current = path;

  for (const r of routes) {
    const m = path.match(r.rx);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    try {
      await r.handler(params);
    } catch (e) {
      console.error('[router] 渲染出错', path, e);
      notFound({ error: e });
    }
    return;
  }
  notFound({ path });
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}

/** 让外部可以主动触发一次重渲染（比如数据加载完） */
export function refresh() {
  lastPath = null;
  resolve();
}
