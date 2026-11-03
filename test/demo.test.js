import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remaining } from '../src/clock.js';
import { demoEvents } from '../src/demo.js';
import { replay } from '../src/tournament.js';

test('the demo replays to a quarter-final in progress at 1:24', () => {
  const now = Date.UTC(2026, 9, 31, 10, 0);
  const s = replay(demoEvents(now));
  assert.deepEqual(
    s.history.map((h) => `${h.names.A} ${h.score.A}-${h.score.B} ${h.names.B}`),
    ['Robo Rangers 2-1 Mech Mavericks', 'Kinetic 1-4 Team Titans', 'Robo Rangers 1-0 Iron Pulse'],
  );
  const m = s.match;
  assert.equal(m.fixture.num, 4);
  assert.equal(m.phase, 'h1');
  assert.deepEqual(m.names, { A: 'Voltrix', B: 'Gear Grinders' });
  assert.deepEqual(m.score, { A: 1, B: 1 });
  assert.equal(remaining(m.clock, now), 84_000);
});
