/* Safe localStorage wrapper: every access in try/catch (private mode, file:// quirks). */
var Store = (function () {
  var PREFIX = 'stickclash.';
  var mem = {};
  function get(key, fallback) {
    try {
      var raw = window.localStorage.getItem(PREFIX + key);
      if (raw === null || raw === undefined) return key in mem ? mem[key] : fallback;
      return JSON.parse(raw);
    } catch (e) { return key in mem ? mem[key] : fallback; }
  }
  function set(key, value) {
    mem[key] = value;
    try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function remove(key) {
    delete mem[key];
    try { window.localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  var DEFAULT_SETTINGS = { sound: true, vibration: true, shake: true, difficulty: 'easy', colorblind: false, p1Name: 'Player 1', p2Name: 'Player 2' };
  function settings() {
    var s = get('settings', {});
    var out = {};
    for (var k in DEFAULT_SETTINGS) out[k] = (s && s[k] !== undefined) ? s[k] : DEFAULT_SETTINGS[k];
    return out;
  }
  function saveSettings(s) { set('settings', s); }

  function keys() {
    var saved = get('keys', null);
    var out = JSON.parse(JSON.stringify(CONFIG.KEYS));
    if (saved && typeof saved === 'object') {
      ['solo', 'p1', 'p2'].forEach(function (p) {
        if (!saved[p]) return;
        ['left', 'right', 'jump', 'hit', 'down'].forEach(function (a) {
          if (Array.isArray(saved[p][a]) && saved[p][a].length) out[p][a] = saved[p][a].slice(0, 3);
        });
      });
    }
    return out;
  }
  function saveKeys(k) { set('keys', { solo: k.solo, p1: k.p1, p2: k.p2 }); }
  function resetKeys() { remove('keys'); }

  function emptyStats() { return { bot: {}, h2h: {}, streak: 0, bestStreak: 0, matches: 0 }; }
  function stats() {
    var s = get('stats', null);
    if (!s || typeof s !== 'object') return emptyStats();
    var e = emptyStats();
    for (var k in e) if (s[k] === undefined) s[k] = e[k];
    return s;
  }
  function recordBotMatch(modeId, won) {
    var s = stats();
    if (!s.bot[modeId]) s.bot[modeId] = { w: 0, l: 0 };
    if (won) { s.bot[modeId].w++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); }
    else { s.bot[modeId].l++; s.streak = 0; }
    s.matches++;
    set('stats', s);
  }
  function recordDuoMatch(nameA, nameB, winnerName) {
    var s = stats();
    var pair = [nameA, nameB].sort();
    var key = pair[0] + ' vs ' + pair[1];
    if (!s.h2h[key]) { s.h2h[key] = {}; s.h2h[key][pair[0]] = 0; s.h2h[key][pair[1]] = 0; }
    s.h2h[key][winnerName] = (s.h2h[key][winnerName] || 0) + 1;
    s.matches++;
    set('stats', s);
  }
  function resetStats() { set('stats', emptyStats()); }

  function seen(flag) { return !!get('seen.' + flag, false); }
  function markSeen(flag) { set('seen.' + flag, true); }

  return { get: get, set: set, settings: settings, saveSettings: saveSettings, keys: keys, saveKeys: saveKeys, resetKeys: resetKeys,
    stats: stats, recordBotMatch: recordBotMatch, recordDuoMatch: recordDuoMatch, resetStats: resetStats, seen: seen, markSeen: markSeen };
})();
