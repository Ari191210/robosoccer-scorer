// Knockout draw.
//
// A bracket is a pure function of the team list and a 12-character draw code.
// Anyone with both can rebuild it (in the app, or with tools/verify-draw.mjs)
// and confirm nobody changed the pairings after the draw was shown.

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

export function newDrawCode(randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const chars = Array.from(randomBytes(12), (b) => CODE_ALPHABET[b & 31]).join('');
  return formatCode(chars);
}

// Accepts codes typed by hand: any case, any separators, and the usual
// Crockford substitutions (O for 0, I or L for 1). Returns null if invalid.
export function normaliseCode(input) {
  const raw = String(input ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (raw.length !== 12 || [...raw].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return formatCode(raw);
}

function formatCode(chars) {
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

// Sorting first means the order names were typed in cannot affect the draw.
export function canonicalTeams(names) {
  const teams = names.map((n) => String(n).trim()).filter(Boolean);
  const seen = new Set();
  for (const name of teams) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`Two teams are named "${name}". Give each team a different name.`);
    seen.add(key);
  }
  return teams.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// cyrb128 and sfc32 (public domain, bryc/code). Small, fast and identical in
// every JavaScript engine, which is what makes a draw reproducible.
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
}

export function seededRandom(code, teams) {
  const next = sfc32(...cyrb128(`${code}\n${teams.join('\n')}`));
  for (let i = 0; i < 15; i++) next();
  return next;
}

// Uniform integer in [0, n), rejecting the few values that would bias it.
function randomBelow(n, next) {
  const limit = Math.floor(0x100000000 / n) * n;
  for (;;) {
    const x = next();
    if (x < limit) return x % n;
  }
}

export function shuffle(list, next) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1, next);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Bit-reversal order: the first k entries are spread evenly over the bracket,
// so first-round matches are not bunched in one half.
function spreadOrder(n) {
  const bits = Math.round(Math.log2(n));
  return Array.from({ length: n }, (_, i) => {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    return r;
  });
}

const slot = (a = null, b = null) => ({ a, b, w: null, sa: null, sb: null, bye: false, num: 0 });

export const winnerOf = (f) => (f.w === 'a' ? f.a : f.w === 'b' ? f.b : null);

export function makeDraw(names, code) {
  const teams = canonicalTeams(names);
  if (teams.length < 2) throw new Error('A draw needs at least 2 teams.');
  const drawCode = normaliseCode(code);
  if (!drawCode) throw new Error('That draw code is not valid. It has 12 letters and digits, like K7QM-2XRA-9DPF.');

  const order = shuffle(teams, seededRandom(drawCode, teams));
  let size = 2;
  while (size < teams.length) size *= 2;
  const pairs = size / 2;
  const played = teams.length - pairs;
  const real = new Set(spreadOrder(pairs).slice(0, played));

  let p = 0;
  const first = Array.from({ length: pairs }, (_, i) => {
    if (real.has(i)) {
      const a = order[p++];
      const b = order[p++];
      return slot(a, b);
    }
    return { ...slot(order[p++]), w: 'a', bye: true };
  });
  const rounds = [first];
  for (let len = pairs / 2; len >= 1; len /= 2) rounds.push(Array.from({ length: len }, () => slot()));

  let num = 0;
  for (const round of rounds) for (const f of round) if (!f.bye) f.num = ++num;

  const draw = { code: drawCode, teams, size, byes: pairs - played, rounds };
  advance(draw);
  return draw;
}

// Moves winners into the next round. A slot whose teams changed loses its result.
export function advance(draw) {
  for (let r = 1; r < draw.rounds.length; r++) {
    draw.rounds[r].forEach((f, i) => {
      const a = winnerOf(draw.rounds[r - 1][2 * i]);
      const b = winnerOf(draw.rounds[r - 1][2 * i + 1]);
      if (f.a !== a || f.b !== b) Object.assign(f, { a, b, w: null, sa: null, sb: null });
    });
  }
}

export function roundName(draw, r) {
  if (r === 0 && draw.byes) return 'First round';
  const teams = draw.size >> r;
  if (teams === 2) return 'Final';
  if (teams === 4) return 'Semi-finals';
  if (teams === 8) return 'Quarter-finals';
  return `Round of ${teams}`;
}

export function stageName(draw, r) {
  const name = roundName(draw, r);
  return { 'Semi-finals': 'Semi-final', 'Quarter-finals': 'Quarter-final' }[name] ?? name;
}

// Lowest-numbered match whose two teams are known and which has no result.
export function nextUp(draw, skip = null) {
  if (!draw) return null;
  let best = null;
  draw.rounds.forEach((round, r) =>
    round.forEach((f, i) => {
      if (f.bye || f.w || !f.a || !f.b) return;
      if (skip && skip.r === r && skip.i === i) return;
      if (!best || f.num < best.num) best = { r, i, num: f.num, a: f.a, b: f.b };
    }),
  );
  return best;
}

export const champion = (draw) => (draw ? winnerOf(draw.rounds[draw.rounds.length - 1][0]) : null);

export function progress(draw) {
  let played = 0;
  for (const round of draw.rounds) for (const f of round) if (!f.bye && f.w) played++;
  return { played, total: draw.teams.length - 1 };
}

// Plain-text bracket, used by the verify tool and the tests.
export function bracketText(draw) {
  const lines = [`Draw code ${draw.code} · ${draw.teams.length} teams · ${draw.byes} byes`];
  draw.rounds.forEach((round, r) => {
    lines.push('', roundName(draw, r));
    round.forEach((f, i) => {
      const feeder = (k) => `winner of M${draw.rounds[r - 1][2 * i + k].num}`;
      if (f.bye) lines.push(`  bye   ${f.a}`);
      else lines.push(`  M${String(f.num).padEnd(5)}${f.a ?? feeder(0)}  v  ${f.b ?? feeder(1)}`);
    });
  });
  return lines.join('\n');
}
