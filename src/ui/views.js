// HTML for each part of the screen. Every function takes plain state and
// returns a string; main.js decides when to render.

import { countdown, elapsed, remaining } from '../clock.js';
import { champion, nextUp, progress, roundName, stageName } from '../draw.js';
import { PHASE_LABEL, PLAYING, sideName, teamName } from '../match.js';
import { summary } from '../records.js';

export const FLASH_MS = 3000;
export const MOMENT_MS = 6000;
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 32;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const hhmm = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const active = (m) => (m.fixture && m.phase !== 'done' ? m.fixture : null);
const isFinalMatch = (s) => Boolean(s.match.fixture && s.draw && s.match.fixture.r === s.draw.rounds.length - 1);
const sizeClass = (name) => (name.length > 24 ? ' sm' : name.length > 14 ? ' md' : '');

// Flash and record banners are time-limited; this changes when either expires.
export function transientKey(s, now) {
  const m = s.match;
  return (m.flash && now - m.flash.at < FLASH_MS ? 1 : 0) + (s.moment && now - s.moment.at < MOMENT_MS ? 2 : 0);
}

function button(ui, action, label, { x = '', cls = '', id, off = false, sure } = {}) {
  const bid = id ?? `b-${action}-${x}`.replace(/[^\w-]/g, '');
  const armed = ui.confirm === bid;
  return `<button type="button" id="${bid}" class="btn ${cls}${armed ? ' sure' : ''}" data-a="${action}" data-x="${esc(x)}"${sure ? ' data-confirm="1"' : ''}${off ? ' disabled' : ''}>${armed ? esc(sure) : label}</button>`;
}

function bar(s, ui, logo) {
  const pr = s.draw && progress(s.draw);
  const tab = (id, label) =>
    `<button type="button" role="tab" data-a="tab" data-x="${id}" aria-selected="${ui.tab === id}">${label}</button>`;
  return `<header class="bar">
    <div class="brand"><img class="rk-logo" src="${logo}" alt="RoboKnights" width="204" height="34"><i class="sep" aria-hidden="true"></i>
      <div><strong>RoboSoccer</strong><span>Exun 2026 · DPS R.K. Puram</span></div></div>
    <nav class="tabs" role="tablist" aria-label="Views">${tab('match', 'Match')}${tab('fixtures', 'Fixtures')}</nav>
    <div class="prog">${pr ? `<span>${pr.played} of ${pr.total} matches played</span><span class="meter" aria-hidden="true"><i style="width:${Math.round((pr.played / pr.total) * 100)}%"></i></span>` : ''}</div>
  </header>`;
}

function teamCard(m, side, now) {
  const scored = Boolean(m.flash && m.flash.side === side && now - m.flash.at < FLASH_MS);
  const name = teamName(m, side);
  const canRemove = m.score[side] > 0 && (PLAYING.has(m.phase) || m.phase === 'ht');
  const nameField =
    m.phase === 'done'
      ? `<h2 class="name${sizeClass(name)}">${esc(name)}</h2>`
      : `<input type="text" id="name-${side}" data-rename="${side}" value="${esc(m.names[side])}" placeholder="Team name" maxlength="40" autocomplete="off" aria-label="${sideName(side)} team name">`;
  return `<section class="team ${side}${scored ? ' scored' : ''}" aria-label="${sideName(side)} team">
    <div class="team-top"><span class="kit"><i></i>${sideName(side)}</span>${scored ? '<span class="goal-tag">Goal</span>' : ''}</div>
    ${nameField}
    <div class="score${scored ? ' pop' : ''}">${m.score[side]}</div>
    <button type="button" class="goal" data-a="goal" data-x="${side}"${PLAYING.has(m.phase) ? '' : ' disabled'}>+ Goal</button>
    <button type="button" class="minus" data-a="removeGoal" data-x="${side}"${canRemove ? '' : ' disabled'}>Remove a goal</button>
  </section>`;
}

function middle(s, ui, now, canUndo) {
  const m = s.match;
  const pr = s.draw && m.fixture ? progress(s.draw) : null;
  const stage = `<div class="stage">${m.fixture ? `Match ${m.fixture.num}${pr ? ` of ${pr.total}` : ''} · ` : ''}${esc(m.stage)}</div>`;
  const running = PLAYING.has(m.phase) && m.clock.running;
  const paused = PLAYING.has(m.phase) && !m.clock.running;
  const period = `<div class="period">${running ? '<i class="live" aria-hidden="true"></i>' : ''}${PHASE_LABEL[m.phase]}${paused ? '<span class="tag">Paused</span>' : ''}${m.phase === 'ht' ? '<span class="tag">Break</span>' : ''}</div>`;
  const pick = `<div class="pick">${button(ui, 'winner', esc(teamName(m, 'A')), { x: 'A', cls: 'w' })}${button(ui, 'winner', esc(teamName(m, 'B')), { x: 'B', cls: 'k' })}</div>`;

  let center;
  let actions = '';
  if (m.phase === 'done') {
    const champ = isFinalMatch(s) && champion(s.draw);
    const nx = nextUp(s.draw);
    const winner = teamName(m, m.result.winner);
    center = `<div class="res"><span class="res-k${champ ? ' hot' : ''}">${champ ? 'Champions' : 'Winner'}</span>
      <strong class="res-n${sizeClass(winner)}">${esc(winner)}</strong><span class="res-s">${m.score.A} – ${m.score.B}</span>
      ${m.result.how === 'Full time' ? '' : `<span class="res-h">${esc(m.result.how)}</span>`}</div>`;
    actions = button(ui, 'next', nx ? `Next: Match ${nx.num}` : 'New match', { cls: 'main' }) +
      button(ui, 'replay', 'Replay this match', { cls: 'quiet', sure: 'Tap again to replay' });
  } else if (m.phase === 'pens') {
    center = `<div class="res"><span class="res-k">Still level · ${m.score.A}–${m.score.B}</span><strong class="res-q">Who won the penalties?</strong></div>`;
    actions = pick;
  } else if (m.phase === 'tied') {
    center = `<div class="res"><span class="res-k">Level</span><strong class="res-s big">${m.score.A} – ${m.score.B}</strong><span class="res-h">1 minute of golden goal. First goal wins.</span></div>`;
    actions = button(ui, 'goldenGoal', 'Start golden goal', { cls: 'main' });
  } else {
    center = `<div class="clock${paused ? ' paused' : ''}" data-clock>${countdown(remaining(m.clock, now))}</div>`;
    if (m.phase === 'pre') actions = button(ui, 'start', 'Start match', { cls: 'main' });
    else if (m.phase === 'ht') actions = button(ui, 'secondHalf', 'Start 2nd half', { cls: 'main' });
    else actions = button(ui, m.clock.running ? 'pause' : 'resume', m.clock.running ? 'Pause clock' : 'Resume clock', { cls: 'main' });
  }

  if (m.phase !== 'done' && m.phase !== 'pens') {
    actions += ui.declare
      ? `<p class="note">Forfeit or referee decision. Who wins?</p>${pick}${button(ui, 'declare', 'Cancel', { cls: 'quiet' })}`
      : button(ui, 'declare', 'Declare a winner (forfeit)', { cls: 'quiet' });
    if (m.phase !== 'pre') actions += button(ui, 'replay', 'Restart this match', { cls: 'quiet', sure: 'Tap again to restart' });
  }
  if (canUndo) actions += button(ui, 'undo', 'Undo last action', { cls: 'quiet' });

  return `<section class="mid" aria-label="Match clock">${stage}${period}<div class="pitch">${center}</div><div class="mid-b">${actions}</div></section>`;
}

function upNext(s) {
  if (!s.draw) return '';
  const ch = champion(s.draw);
  if (ch) return `<section class="strip"><span class="strip-h">Exun 2026 RoboSoccer champions</span><div class="nx"><span>${esc(ch)}</span></div></section>`;
  const nx = nextUp(s.draw, active(s.match));
  if (!nx) return `<section class="strip"><span class="strip-h">Up next</span><span class="nx-note">Waiting for this result</span></section>`;
  return `<section class="strip"><span class="strip-h">Up next · <b>Match ${nx.num}</b> · ${esc(stageName(s.draw, nx.r))}</span>
    <div class="nx"><span><i class="dot A"></i>${esc(nx.a)}</span><em>vs</em><span><i class="dot B"></i>${esc(nx.b)}</span></div>
    <span class="nx-note">Teams, please get your robots ready</span></section>`;
}

function recordStrip(s) {
  const r = summary(s.history, s.match);
  if (!r) return `<section class="strip"><span class="strip-h">Tournament records</span><span class="rec-empty">Records start with the first goal of the day.</span></section>`;
  const label = (h) => (h.num ? `Match ${h.num}` : h.stage);
  const items = [`<div class="rec"><small>Fastest goal</small><b>${elapsed(r.fastest.t)}</b><span>${esc(r.fastest.who)}</span></div>`];
  if (r.biggest) items.push(`<div class="rec"><small>Biggest win</small><b>${r.biggest.score.A}–${r.biggest.score.B}</b><span>${esc(label(r.biggest))}</span></div>`);
  if (r.most) items.push(`<div class="rec"><small>Most goals in a match</small><b>${r.most.score.A + r.most.score.B}</b><span>${esc(label(r.most))}</span></div>`);
  items.push(`<div class="rec"><small>Goals today</small><b>${r.goals}</b><span>${r.finished} ${r.finished === 1 ? 'match' : 'matches'} finished</span></div>`);
  return `<section class="strip"><span class="strip-h">Tournament records</span><div class="recs">${items.join('')}</div></section>`;
}

function momentBanner(s, now, logo) {
  const c = s.moment;
  if (!c || now - c.at >= MOMENT_MS) return '';
  return `<div class="callout" role="status">${c.logo ? `<img class="co-logo" src="${logo}" alt="">` : ''}<small>${esc(c.kicker)}</small><strong>${esc(c.title)}</strong><span>${esc(c.sub)}</span></div>`;
}

function bracket(s, ui, now, logo) {
  const d = s.draw;
  const m = s.match;
  const cur = active(m);
  const nx = nextUp(d, cur);
  const rows = d.rounds[0].length;
  const R = d.rounds.length;
  const reveal = now - d.at < 6000;
  let k = 0;
  const anim = () => (reveal ? ` style="--i:${k++}"` : '');

  let out = d.rounds.map((_, r) => `<div class="bk-h" style="grid-column:${r + 1}">${roundName(d, r)}</div>`).join('') +
    `<div class="bk-h" style="grid-column:${R + 1}">Champion</div>`;

  d.rounds.forEach((round, r) => {
    const span = 1 << r;
    round.forEach((f, i) => {
      const pos = `grid-column:${r + 1};grid-row:${2 + i * span} / span ${span}`;
      if (f.bye) {
        out += `<div class="bk-c" style="${pos}"><div class="bye"${anim()}><span title="${esc(f.a)}">${esc(f.a)}</span><small>Bye</small></div></div>`;
        return;
      }
      const isNow = Boolean(cur && cur.r === r && cur.i === i);
      const isNext = !isNow && Boolean(nx && nx.r === r && nx.i === i);
      const tag = isNow ? (m.phase === 'pre' ? 'Ready' : 'Live') : isNext ? 'Next' : '';
      const team = (side) => {
        const name = side === 'a' ? f.a : f.b;
        const feeder = d.rounds[r - 1]?.[2 * i + (side === 'a' ? 0 : 1)];
        const score = f.w ? (side === 'a' ? f.sa : f.sb) : isNow && m.phase !== 'pre' ? m.score[side === 'a' ? 'A' : 'B'] : '';
        const state = f.w ? (f.w === side ? ' won' : ' lost') : '';
        const label = name ? esc(name) : `Winner of match ${feeder ? feeder.num : '?'}`;
        return `<div class="mt${state}"><i class="dot ${side === 'a' ? 'A' : 'B'}"></i><span class="n${name ? '' : ' tbd'}"${name ? ` title="${esc(name)}"` : ''}>${label}</span><span class="s">${score ?? ''}</span></div>`;
      };
      const play = !f.w && f.a && f.b && !isNow
        ? button(ui, 'load', 'Play', { x: `${r}-${i}`, cls: 'play', sure: m.phase !== 'pre' && m.phase !== 'done' ? 'Replace current?' : undefined })
        : '';
      out += `<div class="bk-c${r > 0 ? ' join' : ''}" style="${pos}"><div class="mc${isNow ? ' now' : ''}${isNext ? ' next' : ''}"${anim()}>
        <div class="mc-h"><span>M${f.num}</span>${tag ? `<span class="mc-tag">${tag}</span>` : play}</div>
        <div class="mc-teams">${team('a')}${team('b')}</div></div></div>`;
    });
  });

  const ch = champion(d);
  const last = d.rounds[R - 1][0];
  out += `<div class="bk-c solo" style="grid-column:${R + 1};grid-row:2 / span ${rows}"><div class="champ${ch ? ' won' : ''}"${anim()}>
    ${ch ? `<img class="champ-logo" src="${logo}" alt="">` : ''}<small>Champions</small>${ch ? `<strong>${esc(ch)}</strong>` : `<span>Winner of match ${last.num}</span>`}</div></div>`;
  return `<div class="bk${reveal ? ' reveal' : ''}" style="--cols:${R + 1};--rows:${rows}">${out}</div>`;
}

function dataTools(s, ui) {
  return `<div class="data"><span class="label">Data</span>
    ${button(ui, 'csv', 'Download results (CSV)', { cls: 'sm', off: !s.history.length })}
    ${button(ui, 'backup', 'Save backup', { cls: 'sm' })}
    <label class="btn sm file">Load backup<input type="file" id="restore" accept="application/json,.json"></label>
    ${button(ui, 'reset', 'New tournament', { cls: 'quiet', sure: 'Tap again: this clears every result' })}
    ${ui.dataError ? `<p class="err" role="alert">${esc(ui.dataError)}</p>` : ''}
  </div>`;
}

function fixtures(s, setup, ui, now, logo) {
  const d = s.draw;
  if (d && !ui.editing) {
    const pr = progress(d);
    return `<section class="card">
      <div class="card-h"><div><h2>Knockout fixtures</h2>
        <p class="sub">${d.teams.length} teams · ${d.byes ? `${d.byes} byes · ` : ''}${pr.total} matches · draw code <span class="code">${d.code}</span>${s.draws > 1 ? ` · draw ${s.draws} of the day` : ''}${d.at ? ` · ${hhmm(d.at)}` : ''}</p></div>
        ${button(ui, 'edit', 'Change teams or redraw', { cls: 'quiet' })}</div>
      <div class="bk-wrap">${bracket(s, ui, now, logo)}</div>
      <p class="fine">Anyone can check this draw: the bracket is worked out only from the team names and the draw code above. Enter the same names and code on another copy of this app, or run <span class="code">npm run verify</span>, and the bracket comes out identical.</p>
      ${dataTools(s, ui)}
    </section>`;
  }
  const teams = setup.teams;
  return `<section class="card">
    <div class="card-h"><div><h2>Teams</h2><p class="sub">Enter every team, then make the fixtures. Straight knockout; the draw decides the pairings and the byes.</p></div></div>
    <div class="count-row"><label for="count">Number of teams</label><div class="count">
      ${button(ui, 'count', '−', { x: '-1', off: teams.length <= MIN_TEAMS })}<input type="number" id="count" min="${MIN_TEAMS}" max="${MAX_TEAMS}" value="${teams.length}">${button(ui, 'count', '+', { x: '1', off: teams.length >= MAX_TEAMS })}
    </div></div>
    <div class="names">${teams.map((v, i) => `<label>${i + 1}<input type="text" id="t-${i}" data-team="${i}" value="${esc(v)}" placeholder="Team ${i + 1}" maxlength="40" autocomplete="off"></label>`).join('')}</div>
    <div class="code-field"><label for="draw-code">Draw code</label>
      <input type="text" id="draw-code" value="${esc(ui.code)}" placeholder="Leave empty for a new random draw" maxlength="20" autocomplete="off" spellcheck="false">
      <p class="fine">To rebuild an earlier draw exactly, enter its code and the same teams.</p></div>
    ${ui.drawError ? `<p class="err" role="alert">${esc(ui.drawError)}</p>` : ''}
    <div class="go">${button(ui, 'draw', d ? 'Redraw fixtures' : 'Make fixtures', { cls: 'main', id: 'b-draw', sure: d ? 'Tap again: this replaces the current fixtures' : undefined })}
      ${d ? button(ui, 'keep', 'Keep current fixtures', { cls: 'quiet' }) : ''}</div>
    <p class="fine">Paste a list with one team per line into any box to fill the rest. Making fixtures loads Match 1 into the scorer.</p>
    ${dataTools(s, ui)}
  </section>`;
}

export function view({ state, setup, ui, now, canUndo, logo }) {
  const m = state.match;
  const next = upNext(state);
  const body = ui.tab === 'match'
    ? `<main class="match">${teamCard(m, 'A', now)}${middle(state, ui, now, canUndo)}${teamCard(m, 'B', now)}</main>
       <div class="lower${next ? ' two' : ''}">${next}${recordStrip(state)}</div>${momentBanner(state, now, logo)}`
    : `<main>${fixtures(state, setup, ui, now, logo)}</main>`;
  return bar(state, ui, logo) + body;
}
