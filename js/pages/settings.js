/**
 * settings.js — 设置
 *
 * 音色、语速、每日目标、进度备份，以及一个诊断面板。
 * 诊断面板是有意做在界面里的：手机上出问题时你截一张图，
 * 比在聊天里描述半天症状管用得多。
 */

import * as store from '../store.js';
import * as tts from '../tts.js';
import { canSpeak } from '../env.js';
import { esc, $, toast } from '../ui.js';

export default async function renderSettings() {
  const app = $('#app');
  const meta = store.getMeta();
  const speakable = canSpeak();
  const usg = store.usage();

  app.innerHTML = `
    <div class="topbar">
      <button class="iconbtn" id="bk">‹</button>
      <h1>设置</h1>
    </div>

    <div class="card">
      <div class="title-sm">朗读</div>

      ${speakable ? `
        <div class="setrow">
          <span class="lbl">音色</span>
        </div>
        <select id="voice" style="margin-bottom:8px"></select>
        <button class="btn ghost" id="tryVoice" style="margin-bottom:12px">试听这个音色</button>

        <div class="setrow">
          <span class="lbl">语速</span>
          <span class="val" id="rateVal">${(meta.rate || 0.9).toFixed(2)}×</span>
        </div>
        <input type="range" id="rate" class="range" min="0.6" max="1.2" step="0.05"
               value="${meta.rate || 0.9}" style="width:100%">
      ` : `
        <div class="note warn">这个浏览器不支持朗读。</div>
      `}
    </div>

    <div class="card">
      <div class="title-sm">学习</div>
      <div class="setrow">
        <span class="lbl">每日目标</span>
        <span class="val" id="goalVal">${meta.dailyGoal} 个词</span>
      </div>
      <input type="range" id="goal" class="range" min="5" max="100" step="5"
             value="${meta.dailyGoal}" style="width:100%">
      <div class="note" style="margin-top:12px">背够这个数就算当天打卡。定小一点更容易坚持，20 个词大概 10 分钟。</div>
    </div>

    <div class="card">
      <div class="title-sm">进度备份</div>
      <div class="note">本地占用 ${fmtBytes(usg.bytes)}，共 ${usg.keys} 项。Safari 会清掉 7 天没打开的网站数据，记得偶尔导出一份。</div>
      <button class="btn sec" id="exp" style="margin-bottom:8px">导出进度</button>
      <button class="btn ghost" id="copy" style="margin-bottom:8px">复制到剪贴板</button>
      <button class="btn ghost" id="imp">导入进度</button>
      <input type="file" id="impFile" accept=".json,application/json" hidden>
    </div>

    <div class="card">
      <div class="title-sm">诊断</div>
      <div class="note">手机上朗读出问题的时候，把下面这段截图发我。</div>
      <pre class="diag" id="diag"></pre>
      <button class="btn ghost" id="reload" style="margin-top:10px">重新加载音色列表</button>
    </div>

    <div class="card">
      <div class="title-sm">词库出处</div>
      <div class="note">
        单词、音标、释义来自 <a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noopener">ECDICT</a>（MIT License，Copyright &copy; 2025 Linwei）；
        例句来自 <a href="https://tatoeba.org" target="_blank" rel="noopener">Tatoeba</a>（CC-BY 2.0 FR）。
        两个都是开源数据源，按它们的协议在这里署名。
      </div>
    </div>

    <div class="card">
      <div class="title-sm">危险操作</div>
      <button class="btn danger" id="wipe">清空所有进度</button>
    </div>
  `;

  $('#bk', app).addEventListener('click', () => { location.hash = '#/home'; });

  /* ---------- 音色 ---------- */

  const sel = $('#voice', app);
  if (sel) {
    const fill = () => {
      const list = tts.englishVoices();
      const cur = tts.currentVoice();
      if (!list.length) {
        sel.innerHTML = `<option value="">没有找到英语语音</option>`;
        return;
      }
      sel.innerHTML = list.map(v =>
        `<option value="${esc(v.voiceURI)}" ${cur && cur.voiceURI === v.voiceURI ? 'selected' : ''}>
          ${esc(v.name)} · ${esc(v.lang)}${v.localService ? ' · 本地' : ''}
        </option>`).join('');
    };
    fill();
    window.addEventListener('voices', fill, { once: true });

    sel.addEventListener('change', () => {
      if (tts.setVoice(sel.value)) toast('已切换音色');
    });

    $('#tryVoice', app).addEventListener('click', () => {
      tts.preview(sel.value);
    });
  }

  const rate = $('#rate', app);
  if (rate) {
    rate.addEventListener('input', () => {
      $('#rateVal', app).textContent = Number(rate.value).toFixed(2) + '×';
    });
    rate.addEventListener('change', () => {
      tts.setRate(Number(rate.value));
      store.setMeta({ rate: Number(rate.value) });
    });
  }

  /* ---------- 每日目标 ---------- */

  const goal = $('#goal', app);
  goal.addEventListener('input', () => {
    $('#goalVal', app).textContent = goal.value + ' 个词';
  });
  goal.addEventListener('change', () => {
    store.setMeta({ dailyGoal: Number(goal.value) });
    toast('每日目标已设为 ' + goal.value + ' 个词');
  });

  /* ---------- 备份 ---------- */

  $('#exp', app).addEventListener('click', () => {
    const data = store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `雅思词汇进度_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    store.setMeta({ lastExportAt: Date.now() });
    toast('已导出');
  });

  $('#copy', app).addEventListener('click', async () => {
    const txt = JSON.stringify(store.exportAll());
    try {
      await navigator.clipboard.writeText(txt);
      store.setMeta({ lastExportAt: Date.now() });
      toast('已复制，粘贴到备忘录存着');
    } catch (e) {
      toast('复制失败，用「导出进度」吧');
    }
  });

  $('#imp', app).addEventListener('click', () => $('#impFile', app).click());
  $('#impFile', app).addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const n = store.importAll(data, { merge: true });
      toast(`合并了 ${n} 项，进度只增不减`);
    } catch (err) {
      toast('导入失败：' + err.message, 3000);
    }
    e.target.value = '';
  });

  /* ---------- 诊断 ---------- */

  const showDiag = () => {
    const info = tts.devInfo();
    const st = store.todayProgress();
    const lines = [
      `浏览器 ${navigator.userAgent.slice(0, 90)}`,
      `主屏幕启动 ${window.navigator.standalone ? '是' : '否'}`,
      `支持朗读 ${info.支持 ? '是' : '否'}　已解锁 ${info.已解锁 ? '是' : '否'}`,
      `音色 共 ${info.音色总数} 个，其中英语 ${info.英语音色} 个`,
      `当前音色 ${info.当前音色}`,
      `语速 ${info.语速}　队列 ${info.队列长度}　正在播 ${info.正在播 ? '是' : '否'}`,
      `今日 ${st.reviewed}/${st.goal}　连续 ${st.streak} 天　最佳 ${st.best}`,
      `存储 ${fmtBytes(usg.bytes)} / ${usg.keys} 项`,
      '',
      '最近事件：',
      ...info.事件.map(x => '  ' + x),
    ];
    $('#diag', app).textContent = lines.join('\n');
  };

  showDiag();
  $('#reload', app).addEventListener('click', async () => {
    await tts.reloadVoices();
    showDiag();
    const s = $('#voice', app);
    if (s) s.dispatchEvent(new Event('change'));
    toast('音色列表已重新加载');
  });

  /* ---------- 清空 ---------- */

  $('#wipe', app).addEventListener('click', () => {
    if (!confirm('会清掉所有背诵进度、打卡记录和错题本，确定吗？\n（建议先导出一份备份）')) return;
    store.wipe();
    toast('已清空');
    location.hash = '#/home';
    location.reload();
  });
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
