// Rebuilds a bracket from its draw code and team list, so anyone can check
// that the fixtures shown on the day were not changed.
//
//   npm run verify -- K7QM-2XRA-9DPF teams.txt
//
// teams.txt holds one team name per line, in any order.

import { readFile } from 'node:fs/promises';
import { bracketText, makeDraw, normaliseCode } from '../src/draw.js';

const [code, file] = process.argv.slice(2);
if (!code || !file) {
  console.error('Usage: npm run verify -- <draw code> <teams file, one team per line>');
  process.exit(1);
}
if (!normaliseCode(code)) {
  console.error(`"${code}" is not a valid draw code. It has 12 letters and digits, like K7QM-2XRA-9DPF.`);
  process.exit(1);
}

try {
  const names = (await readFile(file, 'utf8')).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  console.log(bracketText(makeDraw(names, code)));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
