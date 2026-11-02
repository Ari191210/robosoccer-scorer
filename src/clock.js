export const SECOND = 1000;

export function clock(ms) {
  return { left: ms, running: false, since: 0 };
}

export function remaining(c, now) {
  return c.running ? Math.max(0, c.left - (now - c.since)) : c.left;
}

export function start(c, now) {
  if (!c.running && c.left > 0) {
    c.running = true;
    c.since = now;
  }
}

export function stop(c, now) {
  if (c.running) {
    c.left = remaining(c, now);
    c.running = false;
  }
}

// The moment a running clock reaches zero. Used as the timestamp of the
// timeUp event so a replayed log ends each half at exactly the same time.
export function zeroAt(c) {
  return c.since + c.left;
}

// Countdown display rounds up, so 0:00 only shows once time is really up.
export function countdown(ms) {
  const s = Math.ceil(ms / SECOND);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function elapsed(ms) {
  const s = Math.floor(ms / SECOND);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
