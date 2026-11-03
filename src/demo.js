// A sample tournament for visitors who open the app with ?demo. It is built
// the same way a real one is, as a list of events, timed so that match 4 is
// live with its clock running when the page opens. Nothing here is saved.

import { BREAK_MS, HALF_MS } from './match.js';

export const DEMO_TEAMS = [
  'Robo Rangers', 'Mech Mavericks', 'Iron Pulse', 'Voltrix', 'Gear Grinders',
  'Kinetic', 'Team Titans', 'Nova Bots', 'Circuit Breakers', 'Bot Squad',
];
export const DEMO_CODE = 'K7QM-2XRA-9DPF';

const S = 1000;
const MATCH_MS = 12 * 60 * S; // one finished match plus the gap before the next

// Goals are [side, half, seconds into that half].
const PLAYED = [
  [['A', 1, 41], ['B', 1, 150], ['A', 2, 97]], // Robo Rangers 2-1 Mech Mavericks
  [['B', 1, 18], ['B', 1, 112], ['A', 2, 30], ['B', 2, 64], ['B', 2, 171]], // Kinetic 1-4 Team Titans
  [['A', 2, 133]], // Robo Rangers 1-0 Iron Pulse
];
const LIVE_GOALS = [['A', 40], ['B', 71]]; // Voltrix 1-1 Gear Grinders, 1st half
const LIVE_LEFT = 84 * S; // 1:24 on the clock

function playedMatch(t0, goals) {
  const h2 = t0 + HALF_MS + BREAK_MS + 10 * S;
  const evs = [{ type: 'start', at: t0 }];
  for (const [side, half, sec] of goals.filter((g) => g[1] === 1)) evs.push({ type: 'goal', side, at: t0 + sec * S });
  evs.push({ type: 'timeUp', at: t0 + HALF_MS }, { type: 'timeUp', at: t0 + HALF_MS + BREAK_MS }, { type: 'secondHalf', at: h2 });
  for (const [side, half, sec] of goals.filter((g) => g[1] === 2)) evs.push({ type: 'goal', side, at: h2 + sec * S });
  evs.push({ type: 'timeUp', at: h2 + HALF_MS }, { type: 'next', at: h2 + HALF_MS + 60 * S });
  return evs;
}

export function demoEvents(now = Date.now()) {
  const liveStart = now - (HALF_MS - LIVE_LEFT);
  const first = liveStart - PLAYED.length * MATCH_MS;
  const events = [{ type: 'draw', names: DEMO_TEAMS, code: DEMO_CODE, at: first - 5 * 60 * S }];
  PLAYED.forEach((goals, k) => events.push(...playedMatch(first + k * MATCH_MS, goals)));
  events.push({ type: 'start', at: liveStart });
  for (const [side, sec] of LIVE_GOALS) events.push({ type: 'goal', side, at: liveStart + sec * S });
  return events;
}
