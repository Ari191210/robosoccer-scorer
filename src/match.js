import { clock, remaining, start, stop } from './clock.js';

export const HALF_MS = 3 * 60_000;
export const FINAL_HALF_MS = 4 * 60_000;
export const BREAK_MS = 60_000;
export const GOLDEN_MS = 60_000;

export const PLAYING = new Set(['h1', 'h2', 'gg']);

export const PHASE_LABEL = {
  pre: 'Ready',
  h1: '1st half',
  ht: 'Half-time',
  h2: '2nd half',
  tied: 'Full time',
  gg: 'Golden goal',
  pens: 'Penalties',
  done: 'Full time',
};

export const halfFor = (stage) => (stage === 'Final' ? FINAL_HALF_MS : HALF_MS);

export function newMatch({ id, names = { A: '', B: '' }, stage = 'Match', fixture = null }) {
  const half = halfFor(stage);
  return {
    id,
    names: { ...names },
    stage,
    fixture,
    half,
    phase: 'pre',
    clock: clock(half),
    score: { A: 0, B: 0 },
    goals: [],
    flash: null,
    result: null,
  };
}

export const sideName = (side) => (side === 'A' ? 'White' : 'Black');
export const teamName = (m, side) => (m.names[side] || '').trim() || `${sideName(side)} team`;
export const inProgress = (m) => m.phase !== 'pre' && m.phase !== 'done';

// Match time since the 1st-half kick-off, so goals from different matches compare fairly.
export function elapsedAt(m, at) {
  const left = remaining(m.clock, at);
  if (m.phase === 'h1') return m.half - left;
  if (m.phase === 'h2') return 2 * m.half - left;
  if (m.phase === 'gg') return 2 * m.half + GOLDEN_MS - left;
  return m.half;
}

function finish(m, side, how, at) {
  stop(m.clock, at);
  m.phase = 'done';
  m.result = { winner: side, how, at };
  return 'finished';
}

// Applies one event to a match in place. Returns a word describing what
// changed when the event moved the match on ('finished', 'halfTime', ...).
// Events that do not fit the current phase are ignored, which keeps replays
// of an old log safe.
export function applyMatchEvent(m, ev) {
  const { at } = ev;
  switch (ev.type) {
    case 'start':
      if (m.phase !== 'pre') return null;
      m.phase = 'h1';
      m.clock = clock(m.half);
      start(m.clock, at);
      return 'started';

    case 'pause':
      if (PLAYING.has(m.phase)) stop(m.clock, at);
      return null;

    case 'resume':
      if (PLAYING.has(m.phase)) start(m.clock, at);
      return null;

    case 'secondHalf':
      if (m.phase !== 'ht') return null;
      m.phase = 'h2';
      m.clock = clock(m.half);
      start(m.clock, at);
      return 'started';

    case 'goldenGoal':
      if (m.phase !== 'tied') return null;
      m.phase = 'gg';
      m.clock = clock(GOLDEN_MS);
      start(m.clock, at);
      return 'started';

    case 'goal':
      if (!PLAYING.has(m.phase)) return null;
      m.score[ev.side]++;
      m.goals.push({ side: ev.side, t: elapsedAt(m, at) });
      m.flash = { side: ev.side, at };
      return m.phase === 'gg' ? finish(m, ev.side, 'Golden goal', at) : 'goal';

    case 'removeGoal': {
      if (!(PLAYING.has(m.phase) || m.phase === 'ht') || m.score[ev.side] === 0) return null;
      m.score[ev.side]--;
      const k = m.goals.map((g) => g.side).lastIndexOf(ev.side);
      if (k >= 0) m.goals.splice(k, 1);
      m.flash = null;
      return 'removed';
    }

    case 'timeUp':
      if (!m.clock.running || remaining(m.clock, at) > 0) return null;
      stop(m.clock, at);
      if (m.phase === 'h1') {
        m.phase = 'ht';
        m.clock = clock(BREAK_MS);
        start(m.clock, at);
        return 'halfTime';
      }
      if (m.phase === 'h2') {
        if (m.score.A !== m.score.B) return finish(m, m.score.A > m.score.B ? 'A' : 'B', 'Full time', at);
        m.phase = 'tied';
        return 'tied';
      }
      if (m.phase === 'gg') {
        m.phase = 'pens';
        return 'penalties';
      }
      return 'breakOver';

    case 'winner':
      if (m.phase === 'done') return null;
      return finish(m, ev.side, m.phase === 'pens' ? 'Penalties' : 'Referee decision', at);

    case 'rename': {
      const name = String(ev.name ?? '').trim().slice(0, 40);
      if (m.phase === 'done' || !name) return null;
      m.names[ev.side] = name;
      return 'renamed';
    }

    default:
      return null;
  }
}
