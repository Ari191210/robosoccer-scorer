// The whole tournament is rebuilt from a list of events. Every tap in the app
// becomes one event with a timestamp, so the state can always be replayed,
// undone, backed up and checked afterwards.

import { advance, champion, makeDraw, nextUp, stageName } from './draw.js';
import { applyMatchEvent, inProgress, newMatch, teamName } from './match.js';
import { finishMoment, goalMoment } from './records.js';

export function initialState() {
  return { draw: null, draws: 0, match: newMatch({ id: 'm0' }), matches: 0, history: [], moment: null };
}

function nextMatchId(s) {
  s.matches += 1;
  return `m${s.matches}`;
}

// The bracket slot the current match came from, if its teams still match it.
export function fixtureSlot(s, m = s.match) {
  const fx = m.fixture;
  const f = s.draw && fx ? s.draw.rounds[fx.r]?.[fx.i] : null;
  return f && f.a === m.names.A && f.b === m.names.B ? f : null;
}

function loadFixture(s, r, i) {
  const f = s.draw.rounds[r][i];
  s.match = newMatch({
    id: nextMatchId(s),
    names: { A: f.a, B: f.b },
    stage: stageName(s.draw, r),
    fixture: { r, i, num: f.num },
  });
  s.moment = null;
}

function recordResult(s, m, at) {
  const f = fixtureSlot(s, m);
  if (f) {
    f.w = m.result.winner === 'A' ? 'a' : 'b';
    f.sa = m.score.A;
    f.sb = m.score.B;
    advance(s.draw);
  }
  const isChampion = Boolean(f) && m.fixture.r === s.draw.rounds.length - 1 && Boolean(champion(s.draw));
  const past = s.history.filter((h) => h.id !== m.id);
  s.moment = finishMoment(past, m, isChampion, at) ?? s.moment;
  s.history = [
    ...past,
    {
      id: m.id,
      num: m.fixture?.num ?? null,
      stage: m.stage,
      names: { A: teamName(m, 'A'), B: teamName(m, 'B') },
      score: { ...m.score },
      goals: m.goals.slice(),
      winner: teamName(m, m.result.winner),
      how: m.result.how,
      at,
    },
  ];
}

// Renaming a team mid-tournament renames it everywhere in the bracket, so the
// winner still moves on.
function renameInDraw(s, m, side, name) {
  const f = fixtureSlot(s, m);
  const next = String(name ?? '').trim().slice(0, 40);
  const old = f && (side === 'A' ? f.a : f.b);
  if (!old || !next || old === next) return;
  for (const round of s.draw.rounds) {
    for (const slot of round) {
      if (slot.a === old) slot.a = next;
      if (slot.b === old) slot.b = next;
    }
  }
}

export function applyEvent(s, ev) {
  switch (ev.type) {
    case 'draw':
      s.draw = makeDraw(ev.names, ev.code);
      s.draw.at = ev.at;
      s.draws += 1;
      s.history = [];
      s.moment = null;
      if (!inProgress(s.match)) {
        const nx = nextUp(s.draw);
        if (nx) loadFixture(s, nx.r, nx.i);
      }
      return 'drawn';

    case 'load': {
      const f = s.draw?.rounds[ev.r]?.[ev.i];
      if (!f || f.bye || f.w || !f.a || !f.b) return null;
      loadFixture(s, ev.r, ev.i);
      return 'loaded';
    }

    case 'next': {
      const nx = nextUp(s.draw);
      if (nx) loadFixture(s, nx.r, nx.i);
      else {
        s.match = newMatch({ id: nextMatchId(s) });
        s.moment = null;
      }
      return 'loaded';
    }

    case 'replay': {
      const m = s.match;
      const f = fixtureSlot(s, m);
      if (f && f.w) {
        f.w = null;
        f.sa = f.sb = null;
        advance(s.draw);
      }
      s.history = s.history.filter((h) => h.id !== m.id);
      s.match = newMatch({ id: nextMatchId(s), names: m.names, stage: m.stage, fixture: m.fixture });
      s.moment = null;
      return 'loaded';
    }

    default: {
      const m = s.match;
      if (ev.type === 'rename') renameInDraw(s, m, ev.side, ev.name);
      const result = applyMatchEvent(m, ev);
      if (result === 'goal' || (result === 'finished' && ev.type === 'goal')) {
        const g = m.goals[m.goals.length - 1];
        s.moment = goalMoment(s.history, m, g.side, g.t, ev.at) ?? s.moment;
      }
      if (result === 'removed') s.moment = null;
      if (result === 'finished') recordResult(s, m, ev.at);
      return result;
    }
  }
}

export function replay(events) {
  const s = initialState();
  for (const ev of events) applyEvent(s, ev);
  return s;
}
