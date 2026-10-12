/* Chord Finder JI — UI */
(function () {
  'use strict';

  const E = window.ChordEngine;
  const A = window.ChordAudio;
  const $ = (id) => document.getElementById(id);

  const SETTINGS_KEY = 'chord-finder-ji:settings';
  const WHITE_W = 36;
  const KEY_LOW = 36; // C2
  const KEY_HIGH = 84; // C6
  const BLACK = new Set([1, 3, 6, 8, 10]);

  const RATIO_NAMES = {
    '1/1': 'ユニゾン（ルート）',
    '16/15': '純正短2度', '256/243': 'ピタゴラス短2度（リンマ）', '17/16': '第17倍音',
    '9/8': '大全音', '10/9': '小全音',
    '6/5': '純正短3度', '7/6': 'セプティマル短3度', '32/27': 'ピタゴラス短3度',
    '75/64': '純正増2度', '19683/16384': 'ピタゴラス増2度',
    '5/4': '純正長3度（第5倍音）', '81/64': 'ピタゴラス長3度', '9/7': 'セプティマル長3度',
    '4/3': '純正完全4度', '11/8': '第11倍音',
    '45/32': '純正増4度', '729/512': 'ピタゴラス増4度',
    '64/45': '純正減5度', '7/5': 'セプティマル減5度', '1024/729': 'ピタゴラス減5度',
    '3/2': '純正完全5度（第3倍音）',
    '25/16': '純正増5度', '6561/4096': 'ピタゴラス増5度',
    '8/5': '純正短6度', '128/81': 'ピタゴラス短6度',
    '5/3': '純正長6度', '27/16': 'ピタゴラス長6度', '12/7': 'セプティマル長6度',
    '128/75': '純正減7度', '32768/19683': 'ピタゴラス減7度',
    '9/5': '純正短7度（大）', '16/9': '純正短7度（小）＝ピタゴラス短7度', '7/4': '自然7度（第7倍音）',
    '15/8': '純正長7度', '243/128': 'ピタゴラス長7度',
  };

  const LIMIT_NAMES = { 1: '', 3: '3リミット', 5: '5リミット', 7: '7リミット', 11: '11リミット', 17: '17リミット' };

  const state = {
    input: '',
    mode: 'just5',
    ref: 'root',
    tonic: 0,
    a4: 440,
    spelling: 'flat',
    selected: 0,
    overrides: {},
    analysis: null,
    tuning: null,
  };

  /* ---------------------------------------------------------- helpers */

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (s.mode in E.MODES) state.mode = s.mode;
      if (['root', 'bass', 'key'].includes(s.ref)) state.ref = s.ref;
      if (Number.isInteger(s.tonic) && s.tonic >= 0 && s.tonic < 12) state.tonic = s.tonic;
      if (s.a4 >= 400 && s.a4 <= 480) state.a4 = s.a4;
      if (s.spelling === 'sharp' || s.spelling === 'flat') state.spelling = s.spelling;
    } catch (e) { /* storage unavailable */ }
  }

  function saveSettings() {
    try {
      const { mode, ref, tonic, a4, spelling } = state;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, ref, tonic, a4, spelling }));
    } catch (e) { /* storage unavailable */ }
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  }

  function fmtCents(x) {
    const r = Math.round(x * 10) / 10;
    if (r === 0) return '0.0';
    return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(1);
  }
  const centsClass = (x) => (Math.abs(x) < 0.05 ? 'zero' : x < 0 ? 'neg' : 'pos');
  const degLabel = (d) => (d === '1' ? 'R' : d);

  function tuneOpts() {
    return { mode: state.mode, ref: state.ref, tonic: state.tonic, a4: state.a4, overrides: state.overrides };
  }

  /* ---------------------------------------------------------- analyze */

  function compute() {
    state.analysis = E.analyze(state.input);
    state.selected = 0;
    state.overrides = {};
    try {
      const url = state.input.trim() ? '#q=' + encodeURIComponent(state.input) : location.pathname + location.search;
      history.replaceState(null, '', url);
    } catch (e) { /* sandboxed */ }
    render();
  }

  function render() {
    renderChips();
    renderResult();
    renderTuning();
    renderKeyboard();
  }

  function renderChips() {
    const box = $('chips');
    box.replaceChildren();
    const a = state.analysis;
    if (!a) return;
    for (const n of a.notes) {
      box.append(el('span', { class: 'chip' }, n.name + n.octave, el('small', {}, n.solfege)));
    }
    if (a.unknown.length) {
      box.append(el('span', { class: 'chip error' }, '読めない文字：' + [...new Set(a.unknown)].join(' ')));
    }
  }

  function renderResult() {
    const a = state.analysis;
    const box = $('result');
    const head = $('result-head');
    const body = $('result-body');
    const old = document.querySelector('.cand-wrap');
    if (old) old.remove();
    if (!a || !a.notes.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const label = '「' + state.input.trim() + '」';
    const cands = a.candidates;
    const pcs = new Set(a.notes.map((n) => n.pc));

    if (!cands.length) {
      box.classList.add('none');
      head.textContent = label;
      body.textContent = pcs.size === 1
        ? '単音（' + a.notes[0].name + '）です。'
        : '該当するコード名が見つかりませんでした。';
    } else {
      box.classList.remove('none');
      head.textContent = label + 'のコード名は';
      body.textContent = cands[state.selected].name + ' です。';
    }

    const wrap = el('div', { class: 'cand-wrap' });
    if (cands.length) {
      const tbody = el('tbody');
      cands.slice(0, 10).forEach((c, i) => {
        tbody.append(el('tr', {
          class: i === state.selected ? 'selected' : '',
          onclick: () => {
            state.selected = i;
            state.overrides = {};
            renderResult();
            renderTuning();
            renderKeyboard();
          },
        }, el('td', {}, c.name), el('td', { class: 'score' }, String(-c.cost))));
      });
      wrap.append(el('table', { class: 'candidates' },
        el('thead', {}, el('tr', {}, el('th', {}, '該当するコード名'), el('th', {}, 'スコア'))),
        tbody));
      wrap.append(el('p', { class: 'cand-note' },
        '※どのコード名も同じ構成音になります。', el('br'),
        '※スコアは単純で一般的なほど高くなります。', el('br'),
        '※行をタップすると、その解釈で純正律を計算します。'));
    }
    if (pcs.size === 2) {
      const [x, y] = [...new Map(a.notes.map((n) => [n.pc, n])).values()];
      wrap.append(el('p', { class: 'cand-note' }, '音程：' + x.name + '→' + y.name + ' は ' + E.intervalName(x, y)));
    }
    box.after(wrap);
  }

  function meter(offset) {
    const clamped = Math.max(-50, Math.min(50, offset));
    const pct = 50 + clamped;
    const m = el('div', { class: 'meter' }, el('div', { class: 'track' }));
    for (const t of [-50, -25, 0, 25, 50]) {
      m.append(el('div', { class: 'tick' + (t === 0 ? ' center' : ''), style: 'left:' + (50 + t) + '%' }));
    }
    m.append(el('div', { class: 'needle ' + centsClass(offset), style: 'left:' + pct + '%' }));
    return m;
  }

  function renderTuning() {
    const a = state.analysis;
    const box = $('ji');
    if (!a || !a.notes.length) {
      box.hidden = true;
      state.tuning = null;
      return;
    }
    box.hidden = false;
    const cand = a.candidates[state.selected] || null;
    const t = E.tune(a.notes, cand, tuneOpts());
    state.tuning = t;

    const line = $('ratio-line');
    line.replaceChildren();
    const basis = cand ? cand.name + ' のルート ' + t.root.name : '最低音 ' + t.root.name;
    line.append('度数は ' + basis + ' から。');
    if (t.ints && t.rows.length > 1) {
      line.append(el('br'), '周波数比 ', el('strong', {}, t.ints.join(' : ')));
      if (t.fundamental && t.ints[0] > 1 && t.fundamental.freq >= 20) {
        line.append('（共通の基音 ' + E.midiName(t.fundamental.midi, state.spelling === 'flat') +
          ' ≈ ' + t.fundamental.freq.toFixed(1) + ' Hz）');
      }
    }
    if (state.ref !== 'root') {
      line.append(el('br'), 'ルート ' + t.root.name + ' のずれ：' + fmtCents(t.refOffset) + '¢');
    }

    const rows = $('ji-rows');
    rows.replaceChildren();
    t.rows.forEach((r, i) => {
      const opt = r.options[r.choice];
      const ratioBtn = el('button', {
        class: 'ratio-btn' + (r.isDefault ? '' : ' changed'),
        'aria-label': '純正比を変更',
        onclick: () => openSheet(i),
      }, opt.label, el('span', { class: 'lim' }, LIMIT_NAMES[opt.limit] || opt.limit + 'リミット'),
      r.options.length > 1 ? el('span', { class: 'caret' }, '▼') : null);
      if (r.options.length < 2) ratioBtn.disabled = true;

      rows.append(el('div', { class: 'ji-row' },
        el('div', { class: 'ji-note' },
          el('span', { class: 'nm' }, r.note.name), el('span', { class: 'oct' }, String(r.note.octave)),
          el('span', { class: 'solf' }, r.note.solfege)),
        el('div', { class: 'ji-mid' },
          el('span', { class: 'deg' + (r.inChord ? '' : ' outside'), title: r.inChord ? '度数' : 'コード外の音' }, degLabel(r.degree)),
          ratioBtn,
          el('span', { class: 'ji-hz' }, r.freqET.toFixed(2) + ' → ' + r.freqJI.toFixed(2) + ' Hz')),
        el('div', { class: 'ji-cents ' + centsClass(r.offset) }, fmtCents(r.offset), el('small', {}, '¢')),
        meter(r.offset)));
    });
    rows.append(el('div', { class: 'meter-labels' },
      el('span', {}, '−50¢'), el('span', {}, '低く ← 平均律 → 高く'), el('span', {}, '+50¢')));
  }

  /* ------------------------------------------------------- ratio sheet */

  function openSheet(rowIndex) {
    const r = state.tuning.rows[rowIndex];
    const close = () => backdrop.remove();
    const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      el('h3', {}, r.note.name + r.note.octave + '（' + degLabel(r.degree) + '）の純正比'),
      el('p', { class: 'hint' }, 'ルートからの比を選びます。セントは平均律との差（ルート基準）です。'));
    const def = r.defaultChoice;
    r.options.forEach((o, k) => {
      sheet.append(el('button', {
        class: 'opt' + (k === r.choice ? ' active' : ''),
        onclick: () => {
          state.overrides[rowIndex] = k;
          close();
          renderTuning();
          renderKeyboard();
        },
      },
      el('span', { class: 'r' }, o.label),
      el('span', { class: 'd' }, (RATIO_NAMES[o.label] || '') + (LIMIT_NAMES[o.limit] ? '・' + LIMIT_NAMES[o.limit] : '') +
        (k === def ? '・既定' : '')),
      el('span', { class: 'c ' + centsClass(o.dev) + '-t' }, fmtCents(o.dev) + '¢')));
    });
    sheet.append(el('button', { class: 'btn', style: 'width:100%;margin-top:12px', onclick: close }, '閉じる'));
    const backdrop = el('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, sheet);
    document.body.append(backdrop);
  }

  /* ---------------------------------------------------------- keyboard */

  const SPELL = {
    sharp: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]],
    flat: [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]],
  };

  const whiteIndex = (midi) => {
    let n = 0;
    for (let m = KEY_LOW; m < midi; m++) if (!BLACK.has(m % 12)) n++;
    return n;
  };

  function buildKeyboard() {
    const kb = $('keyboard');
    let whites = 0;
    for (let m = KEY_LOW; m <= KEY_HIGH; m++) {
      const black = BLACK.has(m % 12);
      const left = black ? whites * WHITE_W - 12 : whites * WHITE_W;
      if (!black) whites++;
      kb.append(el('button', {
        class: 'key ' + (black ? 'black' : 'white'),
        style: 'left:' + left + 'px',
        'data-midi': m,
        'aria-label': E.midiName(m, true),
        onclick: () => toggleKey(m),
      }));
    }
    kb.style.width = whites * WHITE_W + 'px';
  }

  function renderKeyboard() {
    const byMidi = new Map();
    if (state.tuning) for (const r of state.tuning.rows) byMidi.set(r.note.midi, r);
    for (const key of $('keyboard').children) {
      const m = Number(key.dataset.midi);
      const r = byMidi.get(m);
      key.classList.toggle('on', !!r);
      key.replaceChildren();
      if (r) key.append(el('span', { class: 'k-cents' }, fmtCents(r.offset)));
      if (m % 12 === 0) key.append(el('span', { class: 'k-label' }, 'C' + (Math.floor(m / 12) - 1)));
    }
    document.querySelectorAll('#spelling-seg button').forEach((b) => {
      b.classList.toggle('active', b.dataset.value === state.spelling);
    });
  }

  function toggleKey(midi) {
    const notes = state.analysis ? state.analysis.notes.slice() : [];
    const at = notes.findIndex((n) => n.midi === midi);
    let list = notes.map((n) => ({ midi: n.midi, text: n.name + n.octave }));
    if (at >= 0) list.splice(at, 1);
    else {
      const [l, acc] = SPELL[state.spelling][midi % 12];
      const text = E.LETTERS[l] + (acc > 0 ? '♯' : acc < 0 ? '♭' : '') + (Math.floor(midi / 12) - 1);
      list.push({ midi, text });
    }
    list.sort((x, y) => x.midi - y.midi);
    state.input = list.map((x) => x.text).join(' ');
    $('notes-input').value = state.input;
    compute();
  }

  function scrollKeyboard() {
    const notes = state.analysis ? state.analysis.notes : [];
    const target = notes.length ? notes[0].midi - 2 : 48;
    $('keyboard-scroll').scrollLeft = Math.max(0, whiteIndex(Math.max(KEY_LOW, target)) * WHITE_W - 8);
  }

  /* ------------------------------------------------------------- audio */

  function playButtons(active) {
    for (const id of ['play-et', 'play-ji', 'play-ab']) $(id).classList.remove('playing');
    const status = $('play-status');
    if (active === 'et') status.textContent = '♪ 平均律で再生中…';
    else if (active === 'ji') status.textContent = '♪ 純正律で再生中…';
    else status.textContent = '※iPhoneの消音モード中は音が出ない場合があります。';
  }

  function play(kind) {
    const t = state.tuning;
    if (!t) return;
    const et = t.rows.map((r) => r.freqET);
    const ji = t.rows.map((r) => r.freqJI);
    let steps;
    if (kind === 'et') steps = [{ freqs: et, dur: 3, label: 'et' }];
    else if (kind === 'ji') steps = [{ freqs: ji, dur: 3, label: 'ji' }];
    else steps = [et, ji, et, ji].map((f, i) => ({ freqs: f, dur: 1.8, label: i % 2 ? 'ji' : 'et' }));
    const btn = $('play-' + kind);
    A.playSequence(steps, (label) => {
      playButtons(label);
      if (label) btn.classList.add('playing');
    });
  }

  /* -------------------------------------------------------------- bulk */

  function renderBulk() {
    const out = $('bulk-result');
    out.replaceChildren();
    const lines = $('bulk-input').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    const tbody = el('tbody');
    lines.forEach((line, i) => {
      const a = E.analyze(line);
      const c = a.candidates[0];
      const offs = el('div', { class: 'offs' });
      if (a.notes.length) {
        const t = E.tune(a.notes, c || null, { mode: state.mode, ref: state.ref, tonic: state.tonic, a4: state.a4 });
        for (const r of t.rows) {
          offs.append(el('span', {}, r.note.name + ' ', el('b', { class: centsClass(r.offset) + '-t' }, fmtCents(r.offset))));
        }
        if (t.ints && t.rows.length > 1) offs.append(el('span', {}, '(' + t.ints.join(':') + ')'));
      }
      tbody.append(el('tr', {
        onclick: () => {
          state.input = line;
          $('notes-input').value = line;
          switchTab('single');
          compute();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      },
      el('td', {}, String(i + 1)),
      el('td', { class: 'in' }, line),
      el('td', {}, el('div', { class: 'chord' }, c ? c.name : '—'), offs)));
    });
    out.append(el('table', { class: 'bulk-table' },
      el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, '入力'), el('th', {}, 'コード名 / 純正律のずれ(¢)'))),
      tbody));
  }

  /* -------------------------------------------------------------- tabs */

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    $('tab-single').hidden = name !== 'single';
    $('tab-bulk').hidden = name !== 'bulk';
    if (name === 'bulk') renderBulk();
  }

  /* -------------------------------------------------------------- init */

  function syncSettingsUI() {
    $('mode-select').value = state.mode;
    $('ref-select').value = state.ref;
    $('tonic-select').value = String(state.tonic);
    $('tonic-setting').hidden = state.ref !== 'key';
    $('a4-input').value = state.a4;
  }

  function onSettingsChanged() {
    saveSettings();
    syncSettingsUI();
    state.overrides = {};
    renderTuning();
    renderKeyboard();
    if (!$('tab-bulk').hidden) renderBulk();
  }

  function init() {
    loadSettings();

    const tonic = $('tonic-select');
    E.PC_NAMES_FLAT.forEach((n, i) => tonic.append(el('option', { value: i }, n + (i === 6 ? ' / F♯' : '') + ' を主音に')));
    syncSettingsUI();
    buildKeyboard();

    const input = $('notes-input');
    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => {
      composing = false;
      state.input = input.value;
      compute();
    });
    input.addEventListener('input', () => {
      if (composing) return;
      state.input = input.value;
      compute();
    });
    $('clear-input').addEventListener('click', () => {
      input.value = '';
      state.input = '';
      compute();
      input.focus();
    });
    $('kb-clear').addEventListener('click', () => {
      input.value = '';
      state.input = '';
      compute();
    });
    $('keyboard-box').addEventListener('toggle', () => { if ($('keyboard-box').open) scrollKeyboard(); });
    document.querySelectorAll('#spelling-seg button').forEach((b) => b.addEventListener('click', () => {
      state.spelling = b.dataset.value;
      saveSettings();
      renderKeyboard();
    }));

    $('mode-select').addEventListener('change', (e) => { state.mode = e.target.value; onSettingsChanged(); });
    $('ref-select').addEventListener('change', (e) => { state.ref = e.target.value; onSettingsChanged(); });
    $('tonic-select').addEventListener('change', (e) => { state.tonic = Number(e.target.value); onSettingsChanged(); });
    $('a4-input').addEventListener('change', (e) => {
      const v = Number(e.target.value);
      if (v >= 400 && v <= 480) state.a4 = v;
      onSettingsChanged();
    });

    $('play-et').addEventListener('click', () => play('et'));
    $('play-ji').addEventListener('click', () => play('ji'));
    $('play-ab').addEventListener('click', () => play('ab'));

    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    let bulkTimer = null;
    $('bulk-input').addEventListener('input', () => {
      clearTimeout(bulkTimer);
      bulkTimer = setTimeout(renderBulk, 150);
    });

    if (location.hash.startsWith('#q=')) {
      try { state.input = decodeURIComponent(location.hash.slice(3)); } catch (e) { state.input = ''; }
      input.value = state.input;
    }
    compute();

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* not available here */ });
    }
  }

  init();
})();
