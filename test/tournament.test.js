import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remaining, zeroAt } from '../src/clock.js';
import { champion, newDrawCode } from '../src/draw.js';
import { createStore } from '../src/store.js';
import { replay } from '../src/tournament.js';
import { resultsCsv } from '../src/export.js';

const S = 1000;
const names = ['Iron Pulse', 'Kinetic', 'Voltrix', 'Nova Bots', 'Gear Grinders', 'Bot Squad', 'Team Titans', 'Mech Mavericks', 'Robo Rangers', 'Circuit Breakers'];

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
}

// Plays the current match: White scores once and wins at full time.
function playMatch(store, clock) {
  const send = (type, extra = {}) => store.dispatch({ type, at: clock.now, ...extra });
  const wait = (seconds) => {
    clock.now += seconds * S;
    const c = store.state.match.clock;
    if (c.running && remaining(c, clock.now) === 0) store.dispatch({ type: 'timeUp', at: zeroAt(c) });
  };
  const half = store.state.match.half / S;
  send('start');
  wait(40);
  send('goal', { side: 'A' });
  wait(half - 40 + 1);
  send('secondHalf');
  wait(half + 1);
}

test('a whole 10-team tournament runs from the draw to a champion', () => {
  const store = createStore({ storage: memoryStorage() });
  const clock = { now: Date.UTC(2026, 9, 31, 4, 0) };
  store.dispatch({ type: 'draw', names, code: 'K7QM-2XRA-9DPF', at: clock.now });
  assert.equal(store.state.match.fixture.num, 1, 'match 1 loads straight after the draw');

  for (let played = 0; played < 9; played++) {
    if (played) store.dispatch({ type: 'next', at: clock.now });
    playMatch(store, clock);
    assert.equal(store.state.match.phase, 'done');
  }
  assert.ok(champion(store.state.draw));
  assert.equal(store.state.history.length, 9);
  assert.equal(store.state.moment.title, 'Champions');
});

test('replaying the saved log gives exactly the same tournament', () => {
  const storage = memoryStorage();
  const store = createStore({ storage });
  const clock = { now: 0 };
  store.dispatch({ type: 'draw', names, code: newDrawCode(), at: 0 });
  for (let i = 0; i < 4; i++) {
    if (i) store.dispatch({ type: 'next', at: clock.now });
    playMatch(store, clock);
  }
  const reopened = createStore({ storage });
  assert.deepEqual(reopened.state, store.state);
  assert.deepEqual(replay(store.events), store.state);
});

test('undo steps back one action, skipping clock events', () => {
  const store = createStore();
  store.dispatch({ type: 'start', at: 0 });
  store.dispatch({ type: 'goal', side: 'A', at: 10 * S });
  store.dispatch({ type: 'goal', side: 'B', at: 20 * S });
  store.dispatch({ type: 'timeUp', at: 180 * S });
  assert.equal(store.state.match.phase, 'ht');
  store.undo();
  assert.deepEqual(store.state.match.score, { A: 1, B: 0 });
  assert.equal(store.state.match.phase, 'h1', 'the half is still running until the clock re-fires');
});

test('renaming a team mid-tournament keeps the bracket working', () => {
  const store = createStore();
  store.dispatch({ type: 'draw', names, code: 'K7QM-2XRA-9DPF', at: 0 });
  const old = store.state.match.names.A;
  store.dispatch({ type: 'rename', side: 'A', name: 'Renamed Bots', at: 1 });
  const draw = store.state.draw;
  assert.ok(!draw.rounds.flat().some((f) => f.a === old || f.b === old));
  store.dispatch({ type: 'winner', side: 'A', at: 2 });
  const slot = draw.rounds[store.state.match.fixture.r][store.state.match.fixture.i];
  assert.equal(slot.w, 'a', 'the result is recorded under the new name');
});

test('replaying a match clears its result from the bracket', () => {
  const store = createStore();
  store.dispatch({ type: 'draw', names, code: 'K7QM-2XRA-9DPF', at: 0 });
  store.dispatch({ type: 'winner', side: 'B', at: 1 });
  store.dispatch({ type: 'replay', at: 2 });
  const { r, i } = store.state.match.fixture;
  assert.equal(store.state.draw.rounds[r][i].w, null);
  assert.equal(store.state.history.length, 0);
});

test('a backup restores the tournament, and other files are refused', () => {
  const store = createStore();
  store.dispatch({ type: 'draw', names, code: 'K7QM-2XRA-9DPF', at: 0 });
  store.dispatch({ type: 'winner', side: 'A', at: 1 });
  const backup = store.exportBackup(0);

  const other = createStore();
  other.importBackup(backup);
  assert.deepEqual(other.state, store.state);
  assert.throws(() => other.importBackup('{"hello":1}'), /not a RoboSoccer Scorer backup/);
  assert.throws(() => other.importBackup('not json'), /not a RoboSoccer Scorer backup/);
  assert.deepEqual(other.state, store.state, 'a refused file changes nothing');
});

test('results export as CSV', () => {
  const store = createStore();
  store.dispatch({ type: 'draw', names, code: 'K7QM-2XRA-9DPF', at: 0 });
  store.dispatch({ type: 'winner', side: 'A', at: Date.UTC(2026, 9, 31, 4, 30) });
  const csv = resultsCsv(store.state.history, 'Asia/Kolkata');
  const [header, row] = csv.trim().split('\n');
  assert.equal(header, 'Match,Stage,White team,Black team,White goals,Black goals,Winner,Decided by,Finished');
  assert.match(row, /^1,First round,.+,0,0,.+,Referee decision,10:00 am$/i);
});
