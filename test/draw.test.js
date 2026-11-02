import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advance, bracketText, champion, makeDraw, newDrawCode, nextUp, normaliseCode, progress, roundName,
} from '../src/draw.js';

const teams = (n) => Array.from({ length: n }, (_, i) => `Team ${String(i + 1).padStart(2, '0')}`);

test('draw codes are 12 Crockford characters and survive sloppy typing', () => {
  const code = newDrawCode();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(normaliseCode('k7qm 2xra 9dpf'), 'K7QM-2XRA-9DPF');
  assert.equal(normaliseCode('K7QM-2XRA-9DPO'), 'K7QM-2XRA-9DP0');
  assert.equal(normaliseCode('L7QM-2XRA-9DPF'), '17QM-2XRA-9DPF');
  assert.equal(normaliseCode('too short'), null);
  assert.equal(normaliseCode('UUUU-UUUU-UUUU'), null);
});

test('the same code and teams always give the same bracket', () => {
  const a = makeDraw(teams(10), 'K7QM-2XRA-9DPF');
  const b = makeDraw(teams(10), 'k7qm2xra9dpf');
  assert.deepEqual(a, b);
});

test('the order teams were typed in does not change the bracket', () => {
  const names = teams(10);
  const reversed = names.slice().reverse();
  assert.equal(bracketText(makeDraw(names, 'K7QM-2XRA-9DPF')), bracketText(makeDraw(reversed, 'K7QM-2XRA-9DPF')));
});

test('a different code gives a different bracket', () => {
  const a = bracketText(makeDraw(teams(10), 'K7QM-2XRA-9DPF'));
  const b = bracketText(makeDraw(teams(10), 'K7QM-2XRA-9DPG'));
  assert.notEqual(a, b);
});

test('duplicate names and bad codes are refused with a readable message', () => {
  assert.throws(() => makeDraw(['Alpha', 'alpha', 'Beta'], newDrawCode()), /Two teams are named/);
  assert.throws(() => makeDraw(['Alpha', 'Beta'], 'nope'), /draw code is not valid/);
  assert.throws(() => makeDraw(['Alpha'], newDrawCode()), /at least 2 teams/);
});

test('every size from 2 to 32 plays n-1 matches, numbered 1 to n-1, to one champion', () => {
  for (let n = 2; n <= 32; n++) {
    const draw = makeDraw(teams(n), newDrawCode());
    const firstRound = draw.rounds[0].flatMap((f) => [f.a, f.b]).filter(Boolean);
    assert.equal(new Set(firstRound).size, n, `all ${n} teams placed once`);

    let played = 0;
    for (let next = nextUp(draw); next; next = nextUp(draw)) {
      draw.rounds[next.r][next.i].w = played % 2 ? 'a' : 'b';
      advance(draw);
      played++;
    }
    assert.equal(played, n - 1);
    assert.ok(champion(draw));
    assert.deepEqual(progress(draw), { played: n - 1, total: n - 1 });
    const nums = draw.rounds.flat().filter((f) => !f.bye).map((f) => f.num).sort((x, y) => x - y);
    assert.deepEqual(nums, Array.from({ length: n - 1 }, (_, i) => i + 1));
  }
});

test('10 teams: 6 byes, 2 first-round matches, then quarter-finals', () => {
  const draw = makeDraw(teams(10), 'K7QM-2XRA-9DPF');
  assert.equal(draw.byes, 6);
  assert.equal(draw.rounds[0].filter((f) => !f.bye).length, 2);
  assert.equal(roundName(draw, 0), 'First round');
  assert.equal(roundName(draw, 1), 'Quarter-finals');
  assert.equal(roundName(draw, 3), 'Final');
});

test('over many random codes, every team is equally likely to get a bye', () => {
  const runs = 20000;
  const names = teams(10);
  const byes = Object.fromEntries(names.map((n) => [n, 0]));
  for (let k = 0; k < runs; k++) {
    for (const f of makeDraw(names, newDrawCode()).rounds[0]) if (f.bye) byes[f.a]++;
  }
  for (const [name, count] of Object.entries(byes)) {
    const rate = count / runs;
    assert.ok(Math.abs(rate - 0.6) < 0.02, `${name} got a bye ${(rate * 100).toFixed(1)}% of the time`);
  }
});
