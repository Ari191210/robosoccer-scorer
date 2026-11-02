const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function resultsCsv(history, timeZone) {
  const time = (at) => new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone });
  const rows = [['Match', 'Stage', 'White team', 'Black team', 'White goals', 'Black goals', 'Winner', 'Decided by', 'Finished']];
  for (const h of history) {
    rows.push([h.num ?? '', h.stage, h.names.A, h.names.B, h.score.A, h.score.B, h.winner, h.how, time(h.at)]);
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
}
