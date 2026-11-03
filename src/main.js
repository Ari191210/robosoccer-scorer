import { countdown, remaining, zeroAt } from './clock.js';
import { champion, makeDraw as buildDraw, newDrawCode, normaliseCode } from './draw.js';
import { resultsCsv } from './export.js';
import { PLAYING } from './match.js';
import { demoEvents } from './demo.js';
import { createStore } from './store.js';
import { confetti, sound, unlockAudio } from './ui/effects.js';
import { MAX_TEAMS, MIN_TEAMS, transientKey, view } from './ui/views.js';

// In the single-file build the logo is inlined; in development it is a file.
const LOGO = typeof __LOGO_URL__ !== 'undefined' ? __LOGO_URL__ : 'assets/roboknights-logo.png';

function browserStorage() {
  try {
    const probe = '__probe__';
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

// ?demo opens a sample tournament kept in memory only, so it can never
// overwrite a real tournament saved in this browser.
const DEMO = new URLSearchParams(location.search).has('demo');
const store = createStore({ storage: DEMO ? null : browserStorage(), key: 'robosoccer-scorer' });
if (DEMO) {
  for (const ev of demoEvents()) store.dispatch(ev);
  const note = Object.assign(document.createElement('p'), { className: 'demo-note' });
  note.innerHTML = 'Sample tournament. Try anything, nothing is saved. <a href="./">Start your own</a>';
  document.body.prepend(note);
}
const ui = { tab: store.setup.tab ?? 'match', confirm: null, declare: false, editing: false, code: '', drawError: '', dataError: '' };
const app = document.getElementById('app');
const canvas = document.getElementById('fx');
let shown = 0;
let confirmTimer = 0;

function render() {
  const focused = document.activeElement;
  const keep = focused?.tagName === 'INPUT' && focused.id
    ? { id: focused.id, value: focused.value, start: focused.selectionStart, end: focused.selectionEnd }
    : null;
  const now = Date.now();
  app.innerHTML = view({ state: store.state, setup: store.setup, ui, now, canUndo: store.canUndo, logo: LOGO });
  shown = transientKey(store.state, now);
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      if (el.type !== 'file') el.value = keep.value;
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(keep.start, keep.end);
      } catch {
        // number inputs have no selection
      }
    }
  }
}

function send(type, extra = {}) {
  const before = store.state.match.phase;
  const result = store.dispatch({ type, at: Date.now(), ...extra });
  react(result, before);
  render();
}

function react(result, phaseBefore) {
  if (result === 'goal') sound('goal');
  if (result === 'halfTime' || result === 'tied' || result === 'penalties') sound('horn');
  if (result === 'breakOver') sound('beep');
  if (result === 'finished' && phaseBefore !== 'done') {
    sound(store.state.match.result.how === 'Golden goal' ? 'goal' : 'horn');
    const s = store.state;
    const final = Boolean(s.match.fixture && s.draw && s.match.fixture.r === s.draw.rounds.length - 1 && champion(s.draw));
    confetti(canvas, final);
  }
}

// Two-tap confirmation for anything that throws work away.
function confirmed(el) {
  if (!el.dataset.confirm) return true;
  if (ui.confirm === el.id) {
    ui.confirm = null;
    clearTimeout(confirmTimer);
    return true;
  }
  ui.confirm = el.id;
  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(() => {
    ui.confirm = null;
    render();
  }, 3000);
  render();
  return false;
}

function setTeamCount(n) {
  const count = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Math.round(n) || 10));
  const teams = store.setup.teams.slice(0, count);
  while (teams.length < count) teams.push('');
  store.saveSetup({ teams });
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeDraw() {
  const names = store.setup.teams.map((v, i) => v.trim() || `Team ${i + 1}`);
  const typed = ui.code.trim();
  const code = typed ? normaliseCode(typed) : newDrawCode();
  if (!code) {
    ui.drawError = 'That draw code is not valid. It has 12 letters and digits, like K7QM-2XRA-9DPF.';
    return render();
  }
  try {
    buildDraw(names, code);
  } catch (err) {
    ui.drawError = err.message;
    return render();
  }
  ui.drawError = '';
  ui.code = '';
  ui.editing = false;
  send('draw', { names, code });
}

const actions = {
  tab: (x) => {
    ui.tab = x;
    ui.declare = false;
    store.saveSetup({ tab: x });
    render();
  },
  start: () => send('start'),
  pause: () => send('pause'),
  resume: () => send('resume'),
  secondHalf: () => send('secondHalf'),
  goldenGoal: () => send('goldenGoal'),
  goal: (x) => send('goal', { side: x }),
  removeGoal: (x) => send('removeGoal', { side: x }),
  winner: (x) => {
    ui.declare = false;
    send('winner', { side: x });
  },
  declare: () => {
    ui.declare = !ui.declare;
    render();
  },
  next: () => send('next'),
  replay: () => {
    ui.declare = false;
    send('replay');
  },
  load: (x) => {
    const [r, i] = x.split('-').map(Number);
    ui.tab = 'match';
    send('load', { r, i });
  },
  undo: () => {
    store.undo();
    render();
  },
  count: (x) => {
    setTeamCount(store.setup.teams.length + Number(x));
    render();
  },
  draw: makeDraw,
  edit: () => {
    ui.editing = true;
    render();
  },
  keep: () => {
    ui.editing = false;
    ui.drawError = '';
    render();
  },
  csv: () => download('robosoccer-results.csv', resultsCsv(store.state.history), 'text/csv'),
  backup: () => download(`robosoccer-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportBackup(), 'application/json'),
  reset: () => {
    store.reset();
    ui.editing = false;
    render();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  unlockAudio();
  if (!confirmed(el)) return;
  actions[el.dataset.a]?.(el.dataset.x);
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.team != null) {
    const teams = store.setup.teams.slice();
    teams[Number(el.dataset.team)] = el.value;
    store.saveSetup({ teams });
    ui.drawError = '';
  } else if (el.id === 'draw-code') {
    ui.code = el.value;
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'count') {
    setTeamCount(Number(el.value));
    render();
  } else if (el.dataset.rename) {
    if (el.value.trim() && el.value.trim() !== store.state.match.names[el.dataset.rename]) {
      send('rename', { side: el.dataset.rename, name: el.value });
    } else {
      render();
    }
  } else if (el.id === 'restore' && el.files?.[0]) {
    el.files[0].text().then((text) => {
      try {
        store.importBackup(text);
        ui.dataError = '';
      } catch (err) {
        ui.dataError = err.message;
      }
      render();
    });
  }
});

document.addEventListener('paste', (e) => {
  const el = e.target;
  if (el.dataset?.team == null) return;
  const lines = (e.clipboardData?.getData('text') || '')
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*\d+\s*[.)-]\s*/, '').trim())
    .filter(Boolean);
  if (lines.length < 2) return;
  e.preventDefault();
  const start = Number(el.dataset.team);
  setTeamCount(Math.max(store.setup.teams.length, start + lines.length));
  const teams = store.setup.teams.slice();
  lines.forEach((name, k) => {
    if (start + k < MAX_TEAMS) teams[start + k] = name.slice(0, 40);
  });
  store.saveSetup({ teams });
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== ' ' || e.target.closest?.('input,button')) return;
  const m = store.state.match;
  if (!PLAYING.has(m.phase)) return;
  e.preventDefault();
  send(m.clock.running ? 'pause' : 'resume');
});

setInterval(() => {
  const m = store.state.match;
  const now = Date.now();
  if (m.clock.running && remaining(m.clock, now) === 0) {
    const before = m.phase;
    const result = store.dispatch({ type: 'timeUp', at: zeroAt(m.clock) });
    react(result, before);
    render();
    return;
  }
  updateClock(m, now);
  if (shown !== transientKey(store.state, now)) render();
}, 200);

function updateClock(m, now) {
  const left = remaining(m.clock, now);
  const text = countdown(left);
  const low = PLAYING.has(m.phase) && m.clock.running && left <= 10_000;
  for (const el of document.querySelectorAll('[data-clock]')) {
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('low', low);
  }
}

render();
