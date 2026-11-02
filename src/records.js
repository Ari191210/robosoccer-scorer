import { elapsed } from './clock.js';
import { teamName } from './match.js';

const margin = (r) => Math.abs(r.score.A - r.score.B);
const total = (r) => r.score.A + r.score.B;

// A short announcement for the screen when a goal sets or breaks a record.
export function goalMoment(history, match, side, t, at) {
  const earlier = history.filter((h) => h.id !== match.id).flatMap((h) => h.goals);
  const who = teamName(match, side);
  if (!earlier.length && match.goals.length === 1) {
    return { at, kicker: 'Robotics at Exun 2026', title: 'First goal of the tournament', sub: `${who} · ${elapsed(t)} after kick-off` };
  }
  if (match.goals.length === 1 && earlier.length && t < Math.min(...earlier.map((g) => g.t))) {
    return { at, kicker: 'New record', title: 'Fastest goal so far', sub: `${who} · ${elapsed(t)} after kick-off` };
  }
  if (match.goals.filter((g) => g.side === side).length === 3) {
    return { at, kicker: 'Three in one match', title: 'Hat-trick', sub: who };
  }
  return null;
}

export function finishMoment(history, match, isChampion, at) {
  const winner = teamName(match, match.result.winner);
  if (isChampion) return { at, kicker: 'Exun 2026 RoboSoccer', title: 'Champions', sub: winner, logo: true };
  const past = history.filter((h) => h.id !== match.id);
  if (!past.length) return null;
  if (margin(match) >= 2 && margin(match) > Math.max(...past.map(margin))) {
    return { at, kicker: 'New record', title: 'Biggest win so far', sub: `${winner} · ${match.score.A}–${match.score.B}` };
  }
  if (total(match) >= 3 && total(match) > Math.max(...past.map(total))) {
    return { at, kicker: 'New record', title: 'Most goals in a match', sub: `${total(match)} goals · ${teamName(match, 'A')} vs ${teamName(match, 'B')}` };
  }
  return null;
}

export function summary(history, match) {
  const done = history.filter((h) => h.id !== match.id);
  const goals = [
    ...done.flatMap((h) => h.goals.map((g) => ({ t: g.t, who: h.names[g.side] }))),
    ...match.goals.map((g) => ({ t: g.t, who: teamName(match, g.side) })),
  ];
  if (!goals.length) return null;
  return {
    goals: goals.length,
    finished: done.length,
    fastest: goals.reduce((a, g) => (g.t < a.t ? g : a)),
    biggest: done.length ? done.reduce((a, h) => (margin(h) > margin(a) ? h : a)) : null,
    most: done.length ? done.reduce((a, h) => (total(h) > total(a) ? h : a)) : null,
  };
}
