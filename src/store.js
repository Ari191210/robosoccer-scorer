import { applyEvent, replay } from './tournament.js';

const FORMAT = 1;
const DEFAULT_TEAMS = 10;

const isEvent = (ev) => ev && typeof ev === 'object' && typeof ev.type === 'string' && Number.isFinite(ev.at);

export function createStore({ storage = null, key = 'robosoccer-scorer' } = {}) {
  let events = [];
  let setup = { teams: Array(DEFAULT_TEAMS).fill(''), tab: 'match' };

  try {
    const saved = JSON.parse(storage?.getItem(key) ?? 'null');
    if (saved?.format === FORMAT && Array.isArray(saved.events)) {
      events = saved.events.filter(isEvent);
      setup = { ...setup, ...saved.setup };
    }
  } catch {
    // Unreadable save: start clean rather than refuse to open.
  }

  let state;
  try {
    state = replay(events);
  } catch {
    events = [];
    state = replay(events);
  }

  const persist = () => {
    try {
      storage?.setItem(key, JSON.stringify({ format: FORMAT, events, setup }));
    } catch {
      // Storage full or blocked: the app keeps working for this session.
    }
  };

  return {
    get state() {
      return state;
    },
    get events() {
      return events;
    },
    get setup() {
      return setup;
    },

    dispatch(ev) {
      events.push(ev);
      const result = applyEvent(state, ev);
      persist();
      return result;
    },

    // timeUp events are written by the clock, not by a person, so undo steps
    // over them to the last thing someone actually did.
    get canUndo() {
      return events.some((ev) => ev.type !== 'timeUp');
    },
    lastAction() {
      for (let i = events.length - 1; i >= 0; i--) if (events[i].type !== 'timeUp') return events[i];
      return null;
    },
    undo() {
      while (events.length && events[events.length - 1].type === 'timeUp') events.pop();
      events.pop();
      state = replay(events);
      persist();
    },

    saveSetup(patch) {
      setup = { ...setup, ...patch };
      persist();
    },

    exportBackup(now = Date.now()) {
      return JSON.stringify({ app: 'robosoccer-scorer', format: FORMAT, exportedAt: new Date(now).toISOString(), setup, events }, null, 1);
    },

    importBackup(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('That file is not a RoboSoccer Scorer backup.');
      }
      if (data?.app !== 'robosoccer-scorer' || data.format !== FORMAT || !Array.isArray(data.events) || !data.events.every(isEvent)) {
        throw new Error('That file is not a RoboSoccer Scorer backup.');
      }
      const restored = replay(data.events);
      events = data.events;
      setup = { ...setup, ...data.setup };
      state = restored;
      persist();
    },

    reset() {
      events = [];
      state = replay(events);
      persist();
    },
  };
}
