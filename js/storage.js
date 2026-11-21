/* Persistence: every localStorage access is wrapped in try/catch.
   Falls back to in-memory storage if localStorage is blocked (private mode, file:// quirks). */
(function () {
  'use strict';

  var memory = {};
  var hasLS = true;
  try {
    var probe = '__sc_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch (e) {
    hasLS = false;
  }

  function rawGet(key) {
    if (!hasLS) return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function rawSet(key, value) {
    if (!hasLS) { memory[key] = value; return; }
    try { window.localStorage.setItem(key, value); } catch (e) { memory[key] = value; }
  }
  function rawRemove(key) {
    delete memory[key];
    if (!hasLS) return;
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function readJSON(key, fallback) {
    try {
      var s = rawGet(key);
      if (s == null) return fallback;
      var v = JSON.parse(s);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try { rawSet(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  var DEFAULT_SETTINGS = {
    sound: true,
    vibration: true,
    shake: true,
    colorBlind: false,
    difficulty: 'medium',
    names: ['Player 1', 'Player 2'],
    lastMode: 'toyDrop'
  };

  function emptyStats() {
    var modes = {};
    (window.CONFIG.MODE_ORDER || []).forEach(function (m) { modes[m] = { w: 0, l: 0 }; });
    return { modes: modes, h2h: {}, streak: 0, bestStreak: 0 };
  }

  window.Store = {
    get: function (key, fallback) {
      var v = readJSON(key, undefined);
      return v === undefined ? fallback : v;
    },
    set: function (key, value) { writeJSON(key, value); },
    remove: function (key) { rawRemove(key); },
    flag: function (key) { return rawGet(key) === '1'; },
    setFlag: function (key) { rawSet(key, '1'); },

    getSettings: function () {
      var s = readJSON('sc_settings', {});
      var out = {};
      Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
        out[k] = (s && s[k] !== undefined) ? s[k] : DEFAULT_SETTINGS[k];
      });
      if (!Array.isArray(out.names) || out.names.length !== 2) out.names = DEFAULT_SETTINGS.names.slice();
      return out;
    },
    saveSettings: function (s) { writeJSON('sc_settings', s); },

    getBindings: function () { return readJSON('sc_bindings', null); },
    saveBindings: function (b) { writeJSON('sc_bindings', b); },
    clearBindings: function () { rawRemove('sc_bindings'); },

    getStats: function () {
      var s = readJSON('sc_stats', null);
      var base = emptyStats();
      if (!s || typeof s !== 'object') return base;
      if (s.modes) {
        Object.keys(base.modes).forEach(function (m) {
          if (s.modes[m] && typeof s.modes[m].w === 'number') base.modes[m] = s.modes[m];
        });
      }
      if (s.h2h && typeof s.h2h === 'object') base.h2h = s.h2h;
      if (typeof s.streak === 'number') base.streak = s.streak;
      if (typeof s.bestStreak === 'number') base.bestStreak = s.bestStreak;
      return base;
    },
    saveStats: function (s) { writeJSON('sc_stats', s); },
    resetStats: function () { rawRemove('sc_stats'); }
  };
})();
