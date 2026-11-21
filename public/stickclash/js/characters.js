/* STICK CLASH — the 4 playable fighters. Single source of character data (types: src/game/characters.ts).
   Every stat is a MULTIPLIER on the base values in CONFIG.FIGHTER; game logic never hard-codes per-character numbers. */
var CHARACTERS = (function () {
  /** @type {import('../../../src/game/characters').CharacterDef[]} */
  var LIST = [
    { id: 'striker', name: 'STRIKER', role: 'Balanced', tag: 'Balanced all-rounder', accentColor: '#00E5FF', altTint: '#7FF2FF', accessory: 'headband',
      stats: { moveSpeed: 1.0, jump: 1.0, attackSpeed: 1.0, damage: 1.0, knockback: 1.0, maxHP: 1.0, range: 1.0, receivedKnockback: 1.0, lineWidth: 1.0 },
      bars: { speed: 3, power: 3, range: 3 } },
    { id: 'brute', name: 'BRUTE', role: 'Heavy', tag: 'Slow, crushing hits', accentColor: '#FF3B5C', altTint: '#FF8A9E', accessory: 'shoulderPads',
      stats: { moveSpeed: 0.85, jump: 0.9, attackSpeed: 0.8, damage: 1.3, knockback: 1.35, maxHP: 1.15, range: 1.0, receivedKnockback: 0.8, lineWidth: 1.6 },
      bars: { speed: 2, power: 5, range: 3 } },
    { id: 'shadow', name: 'SHADOW', role: 'Agile', tag: 'Fast flurries, fragile', accentColor: '#B388FF', altTint: '#D9C4FF', accessory: 'scarf',
      stats: { moveSpeed: 1.2, jump: 1.2, attackSpeed: 1.3, damage: 0.85, knockback: 0.9, maxHP: 0.9, range: 0.95, receivedKnockback: 1.0, lineWidth: 1.0 },
      bars: { speed: 5, power: 2, range: 2 } },
    { id: 'reach', name: 'REACH', role: 'Zoner', tag: 'Controls space at range', accentColor: '#FFB300', altTint: '#FFD666', accessory: 'staff',
      stats: { moveSpeed: 0.95, jump: 1.0, attackSpeed: 0.95, damage: 1.0, knockback: 1.05, maxHP: 1.0, range: 1.45, receivedKnockback: 1.0, lineWidth: 1.0 },
      bars: { speed: 3, power: 3, range: 5 } }
  ];
  var DEFAULT = 'striker';
  // Hard bots counter-pick with weighted randomness ("other" share is split over the remaining fighters).
  var COUNTERS = {
    brute: { reach: 0.6, shadow: 0.3 },
    shadow: { brute: 0.6, reach: 0.25 },
    reach: { shadow: 0.6, striker: 0.25 },
    striker: { reach: 0.4, brute: 0.35, shadow: 0.25 }
  };
  var COUNTER_LEVELS = ['hard', 'insane'];
  var ROULETTE = { time: 0.6, step: 0.075, land: 0.45 };

  function get(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function valid(id) { return !!get(id); }
  function orDefault(id) { return valid(id) ? id : DEFAULT; }
  function weights(difficulty, playerId) {
    var w = {}, i;
    if (COUNTER_LEVELS.indexOf(difficulty) < 0 || !COUNTERS[playerId]) { for (i = 0; i < LIST.length; i++) w[LIST[i].id] = 1 / LIST.length; return w; }
    var c = COUNTERS[playerId], used = 0, rest = [];
    for (i = 0; i < LIST.length; i++) { var id = LIST[i].id; if (c[id] !== undefined) { w[id] = c[id]; used += c[id]; } else rest.push(id); }
    for (i = 0; i < rest.length; i++) w[rest[i]] = Math.max(0, 1 - used) / rest.length;
    return w;
  }
  function roll(w, exclude, rng) {
    var keys = Object.keys(w).filter(function (id) { return id !== exclude; }).sort(function (a, b) { return w[b] - w[a]; }); // strongest counter first
    var total = 0, i, k;
    for (i = 0; i < keys.length; i++) total += w[keys[i]];
    var r = rng() * total;
    for (i = 0; i < keys.length; i++) { r -= w[keys[i]]; if (r <= 0) return keys[i]; }
    for (k in w) if (k !== exclude && w[k] > 0) return k;
    return DEFAULT;
  }
  /** Bot pick: random on easy/medium, weighted counter-pick on hard; never the same fighter 3 matches in a row. */
  function pickForBot(difficulty, playerId, history, rng) {
    rng = rng || Math.random; history = history || [];
    var w = weights(difficulty, playerId), n = history.length;
    var repeat = n >= 2 && history[n - 1] === history[n - 2] ? history[n - 1] : null;
    return roll(w, repeat, rng);
  }
  return { list: LIST, get: get, valid: valid, orDefault: orDefault, DEFAULT: DEFAULT, COUNTERS: COUNTERS, weights: weights, pickForBot: pickForBot, ROULETTE: ROULETTE };
})();
