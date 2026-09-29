/**
 * data.js — 词库加载
 *
 * 章节按需加载：手机上绝不一次性下载 22 章。打开哪章拉哪章，拉过的进内存缓存。
 * 外面的人只跟 ensureChapter(id) 打交道，不关心文件在哪、怎么缓存。
 */

const BASE = new URL('../', import.meta.url);
const cache = new Map();     // id -> Promise
const resolved = new Map();  // id -> 已加载好的章节（承诺对象本身分不出已决/未决，另存一份）
let manifest = null;
let manifestPromise = null;

async function getJSON(url) {
  const r = await fetch(url, { cache: 'default' });
  if (!r.ok) throw new Error(`加载失败 ${r.status}: ${url}`);
  return r.json();
}

/** 章节清单，只拉一次。失败时给一个保底的空清单，界面上好提示。 */
export function getManifest() {
  if (manifest) return Promise.resolve(manifest);
  if (manifestPromise) return manifestPromise;

  manifestPromise = getJSON(`${BASE}data/index.json`)
    .then(m => {
      manifest = normalizeManifest(m);
      return manifest;
    })
    .catch(e => {
      console.warn('[data] 清单加载失败', e);
      manifest = { dataVersion: 1, chapters: [], error: e.message };
      return manifest;
    });
  return manifestPromise;
}

function normalizeManifest(m) {
  const chapters = Array.isArray(m.chapters) ? m.chapters : [];
  return {
    dataVersion: m.dataVersion || 1,
    generatedAt: m.generatedAt || null,
    chapters: chapters.map(c => ({
      id: c.id,
      n: c.n != null ? c.n : null,
      title: c.title || c.id,
      titleEn: c.titleEn || '',
      count: c.count || 0,
    })),
  };
}

/**
 * 取一章的词，带缓存。同一个 id 并发调用只会真正请求一次。
 */
export function ensureChapter(id) {
  if (cache.has(id)) return cache.get(id);

  const p = getManifest()
    .then(m => getJSON(`${BASE}data/ch/${id}.json?v=${m.dataVersion}`))
    .then(raw => {
      const ch = normalizeChapter(raw, id);
      resolved.set(id, ch);
      return ch;
    })
    .catch(e => {
      cache.delete(id);           // 失败不留下坏的缓存，下次可以重试
      throw e;
    });

  cache.set(id, p);
  return p;
}

function normalizeChapter(raw, id) {
  const clusters = Array.isArray(raw.clusters) ? raw.clusters : [];
  let n = 0;

  const out = clusters.map((cl, ci) => ({
    id: cl.id || `${id}-g${ci + 1}`,
    name: cl.name || `第 ${ci + 1} 组`,
    words: (Array.isArray(cl.words) ? cl.words : []).map(w => normalizeWord(w, id, ci)).filter(Boolean),
  })).filter(cl => cl.words.length);

  out.forEach(cl => { n += cl.words.length; });

  return {
    id: raw.id || id,
    n: raw.n != null ? raw.n : null,
    title: raw.title || id,
    titleEn: raw.titleEn || '',
    clusters: out,
    count: n,
  };
}

/**
 * 词条兜底。只有 w 和 zh 是必填，其余缺了就是 null——
 * 界面负责"有就显示，没有就不显示"，绝不能渲染出空的 /  / 括号。
 */
function normalizeWord(w, chapterId, ci) {
  if (!w) return null;
  // 允许 ["word", "中文"] 这种极简写法
  if (Array.isArray(w)) {
    if (!w[0]) return null;
    return { id: `${chapterId}-${ci}-${w[0]}`, w: String(w[0]), zh: String(w[1] || ''), ipa: null, pos: null, ex: null, exZh: null, syn: [], accept: [] };
  }
  const head = (w.w || w.word || '').trim();
  const zh = (w.zh || w.cn || w.meaning || '').trim();
  if (!head || !zh) return null;

  return {
    id: w.id || `${chapterId}-${ci}-${head.toLowerCase()}`,
    w: head,
    ipa: w.ipa || w.phonetic || null,
    pos: w.pos || null,
    zh,
    ex: w.ex || w.example || null,
    exZh: w.exZh || w.exZh === '' ? w.exZh : (w.exampleZh || null),
    syn: Array.isArray(w.syn) ? w.syn : [],
    accept: Array.isArray(w.accept) ? w.accept : [head.toLowerCase()],
  };
}

/** 某一章所有词拉平成一个数组，检测和复习用 */
export function flatten(chapter) {
  const out = [];
  for (const cl of chapter.clusters) {
    for (const w of cl.words) out.push({ ...w, clusterId: cl.id, clusterName: cl.name, chapterId: chapter.id });
  }
  return out;
}

/** 词池：所有已经真正加载完的章节里的词。检测抽题用。 */
export function loadedWords() {
  const out = [];
  for (const ch of resolved.values()) out.push(...flatten(ch));
  return out;
}

export function isLoaded(id) {
  return resolved.has(id);
}
