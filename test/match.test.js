import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remaining, zeroAt } from '../src/clock.js';
import { applyMatchEvent, newMatch } from '../src/match.js';

const S = 1000;

// Drives one match with explicit timestamps, the way the app's clock does.
function play() {
  const m = newMatch({ id: 't', names: { A: 'Alpha', B: 'Bravo' } });
  let at = 0;
  const api = {
    m,
    after(seconds) {
      at += seconds * S;
      while (m.clock.running && remaining(m.clock, at) === 0) applyMatchEvent(m, { type: 'timeUp', at: zeroAt(m.clock) });
      return api;
    },
    do(type, extra = {}) {
      applyMatchEvent(m, { type, at, ...extra });
      return api;
    },
  };
  return api;
}

test('two halves with a break, decided at full time', () => {
  const p = play().do('start').after(60).do('goal', { side: 'A' });
  assert.equal(p.m.goals[0].t, 60 * S);
  p.after(121);
  assert.equal(p.m.phase, 'ht');
  assert.ok(p.m.clock.running, 'the break clock runs on its own');
  p.after(61);
  assert.equal(p.m.phase, 'ht', 'the 2nd half waits for the referee');
  p.do('secondHalf').after(30).do('goal', { side: 'B' }).do('goal', { side: 'B' }).after(200);
  assert.equal(p.m.phase, 'done');
  assert.deepEqual(p.m.result.winner, 'B');
  assert.equal(p.m.result.how, 'Full time');
  assert.equal(p.m.goals[1].t, 3 * 60 * S + 30 * S, 'second-half goals count from the first kick-off');
});

test('a draw goes to golden goal, then penalties', () => {
  const p = play().do('start').after(181).do('secondHalf').after(181);
  assert.equal(p.m.phase, 'tied');
  p.do('goldenGoal').after(61);
  assert.equal(p.m.phase, 'pens');
  p.do('winner', { side: 'A' });
  assert.equal(p.m.result.how, 'Penalties');
});

test('the first golden goal ends the match', () => {
  const p = play().do('start').after(181).do('secondHalf').do('goal', { side: 'A' }).do('goal', { side: 'B' }).after(181);
  p.do('goldenGoal').after(12).do('goal', { side: 'B' });
  assert.equal(p.m.phase, 'done');
  assert.equal(p.m.result.how, 'Golden goal');
});

test('a paused clock holds, and goals can still be added while paused', () => {
  const p = play().do('start').after(30).do('pause').after(500);
  assert.equal(p.m.clock.left, 150 * S);
  p.do('goal', { side: 'A' });
  assert.equal(p.m.score.A, 1);
  p.do('resume').after(151);
  assert.equal(p.m.phase, 'ht');
});

test('remove a goal takes away the last goal by that team', () => {
  const p = play().do('start').after(10).do('goal', { side: 'A' }).after(10).do('goal', { side: 'B' }).after(10).do('goal', { side: 'A' });
  p.do('removeGoal', { side: 'A' });
  assert.deepEqual(p.m.score, { A: 1, B: 1 });
  assert.deepEqual(p.m.goals.map((g) => g.t), [10 * S, 20 * S]);
});

test('the final runs 4-minute halves', () => {
  const m = newMatch({ id: 'f', stage: 'Final' });
  applyMatchEvent(m, { type: 'start', at: 0 });
  applyMatchEvent(m, { type: 'timeUp', at: 180 * S });
  assert.equal(m.phase, 'h1');
  applyMatchEvent(m, { type: 'timeUp', at: 240 * S });
  assert.equal(m.phase, 'ht');
});

test('events that do not fit the phase are ignored', () => {
  const p = play();
  p.do('goal', { side: 'A' }).do('secondHalf').do('goldenGoal');
  assert.equal(p.m.phase, 'pre');
  assert.deepEqual(p.m.score, { A: 0, B: 0 });
  p.do('rename', { side: 'A', name: '   ' });
  assert.equal(p.m.names.A, 'Alpha', 'a blank rename is ignored');
});
