/* Main: game state machine + match flow (menus → ready/hint → countdown → fight → KO → banner → results).
   Phases:
     menu | hint (solo, no sim) | ready (2P, no sim) | countdown | fight | ko | banner | over | paused */
(function () {
  'use strict';

  var C = window.CONFIG;

  var G = {
    phase: 'menu',
    prev: null,
    modeId: null,
    mode: null,
    layout: 'solo',
    diff: 'medium',
    names: ['YOU', 'BOT'],
    fighters: [null, null],
    brains: [null, null],
    match: null,
    simT: 0,
    realT: 0,
    roundT: 0,
    countdown: 0,
    lastCount: 0,
    koT: 0,
    bannerT: 0,
    roundDone: false,
    sdPhase: false,
    sdT: 0,
    finalKO: false,
    roundWinner: -1,
    lastReason: '',
    ready: [false, false],
    readyGoT: 0,
    debugOn: false,
    debugT: 0
  };

  function env() {
    var base = G.mode.env();
    base.now = G.simT;
    base.kbMult = 1;
    base.onHit = onHit;
    return base;
  }

  function colorsFor(st) {
    return {
      p1: C.COLORS.p1,
      p2: st.colorBlind ? C.COLORS.p2ColorBlind : C.COLORS.p2
    };
  }

  function newMatch(modeId, layout, diff) {
    var st = window.Store.getSettings();
    var cols = colorsFor(st);
    G.modeId = modeId;
    G.mode = window.Modes[modeId];
    G.layout = layout;
    G.diff = diff;
    var f0 = new window.Fighter(0);
    var f1 = new window.Fighter(1);
    f0.color = cols.p1;
    f1.color = cols.p2;
    f0.marker = 'circle';
    f1.marker = 'triangle';
    if (layout === 'solo') {
      f0.label = 'YOU';
      f1.label = 'BOT';
      f1.isBot = true;
      G.names = ['YOU', 'BOT'];
      G.brains = [null, window.AI.create(diff)];
    } else {
      f0.label = 'P1';
      f1.label = 'P2';
      G.names = [st.names[0] || 'Player 1', st.names[1] || 'Player 2'];
      G.brains = [null, null];
    }
    G.fighters = [f0, f1];
    G.match = {
      rounds: [0, 0],
      roundNo: 0,
      drawNext: false,
      stats: [{ hits: 0, dmg: 0, items: 0, kos: 0 }, { hits: 0, dmg: 0, items: 0, kos: 0 }],
      winner: -1
    };
    G.roundDone = false;
    G.sdPhase = false;
    G.sdT = 0;
    G.finalKO = false;
    G.ready = [false, false];
    window.Input.setLayout(layout);
  }

  function buildLabelOpts(i) {
    var st = window.Store.getSettings();
    var f = G.fighters[i];
    return { label: f.label, marker: st.colorBlind ? f.marker : null };
  }

  function startRound() {
    var m = G.match;
    m.roundNo += 1;
    G.mode.setup(G.fighters);
    G.roundT = 0;
    G.roundDone = false;
    G.sdPhase = m.drawNext;
    m.drawNext = false;
    G.sdT = 0;
    G.roundWinner = -1;
    G.finalKO = false;
    if (G.brains[1]) window.AI.reset(G.brains[1], G.fighters[1]);
    window.Input.clearAll();
    window.Engine.timeScale = 1;
    window.Engine.clearFX();
    G.phase = 'countdown';
    G.countdown = C.COUNTDOWN_SECONDS;
    G.lastCount = 0;
    syncChrome();
  }

  function buildEnv() { return env(); }

  // Step the world. withInput=false → physics only (countdown, KO slow-mo, banners).
  function stepWorld(dt, withInput) {
    var mode = G.mode;
    var f = G.fighters;
    var e = buildEnv();
    var i;

    for (i = 0; i < 2; i++) {
      var me = f[i], foe = f[1 - i];
      var intent = { dir: 0, fall: false };
      var pr = { jump: false, hit: false };
      if (withInput) {
        if (me.isBot && G.brains[i]) window.AI.tick(G.brains[i], dt, me, foe, mode);
        intent = window.Input.state(i);
        pr = window.Input.consume(i);
        if (pr.hit && me.alive && mode.onHitPress(me, foe, e)) pr.hit = false;
      }
      me.update(dt, intent, pr, mode.solids(), e);
    }
    if (!withInput) window.Input.clearPresses();

    if (withInput) {
      window.Combat.resolve(f[0], f[1], e);
      window.Combat.resolve(f[1], f[0], e);
    }
    if (f[0].alive && f[1].alive) window.Physics.pushApart(f[0], f[1]);

    if (withInput || G.phase === 'ko') mode.update(dt, f, e, G.roundT);

    // Ring-outs and HP KOs
    var W = C.W;
    var newly = [];
    for (i = 0; i < 2; i++) {
      var q = f[i];
      if (!q.alive) continue;
      var fell = q.y > mode.killY || q.x < -90 || q.x > W + 90;
      var zeroHp = mode.usesHP && q.hp <= 0;
      if (fell || zeroHp) {
        q.alive = false;
        if (zeroHp && !fell) { q.vy = -520; q.vx = (i === 0 ? -1 : 1) * 260; }
        newly.push(i);
      }
    }
    if (withInput && newly.length) {
      if (newly.length === 2) endRound(-1, 'draw');
      else endRound(1 - newly[0], 'ko');
    }
  }

  function onHit(attacker, defender) {
    // Sudden death: the first landed hit wins the round.
    if (G.phase === 'fight' && G.sdPhase && !G.roundDone) {
      endRound(attacker.id, 'sudden');
    }
  }

  function endRound(winner, reason) {
    if (G.roundDone) return;
    G.roundDone = true;
    var m = G.match;
    G.lastReason = reason;
    G.roundWinner = winner;
    if (winner >= 0) {
      m.rounds[winner] += 1;
      m.stats[winner].kos += 1;
    } else {
      m.drawNext = true;
    }
    G.finalKO = winner >= 0 && m.rounds[winner] >= C.ROUNDS_TO_WIN;
    G.phase = 'ko';
    G.koT = G.finalKO ? C.KO_SLOWMO_SECONDS : 0.9;
    window.Engine.timeScale = G.finalKO ? C.KO_SLOWMO_SCALE : 1;
    window.SFX.play('ko');
    if (window.Store.getSettings().shake) window.Engine.shake(C.SHAKE_KO);
    if (winner >= 0) {
      var loser = G.fighters[1 - winner];
      window.Engine.impact(loser.x, loser.y - loser.h * 0.5, '#ffd23f', 22);
      window.Engine.popText(G.fighters[winner].x, G.fighters[winner].y - G.fighters[winner].h - 30, 'K.O.!', G.fighters[winner].color);
    }
    syncChrome();
  }

  function enterSudden() {
    G.sdPhase = true;
    G.sdT = 0;
    window.UI.banner('SUDDEN DEATH', 'first hit wins', 1.6);
  }

  function fightStep(dt) {
    stepWorld(dt, true);
    if (G.phase !== 'fight') return;
    G.roundT += dt;
    var mode = G.mode;
    if (mode.time > 0 && !G.sdPhase && G.roundT >= mode.time) {
      var a = G.fighters[0].hp, b = G.fighters[1].hp;
      if (mode.usesHP && a !== b) endRound(a > b ? 0 : 1, 'time');
      else enterSudden();
    }
    if (G.sdPhase) {
      G.sdT += dt;
      if (G.sdT >= C.SUDDEN_DEATH_TIMEOUT && G.phase === 'fight') {
        endRound(Math.random() < 0.5 ? 0 : 1, 'coin');   // guaranteed winner after the timeout
      }
    }
  }

  function countdownStep(dt) {
    G.countdown -= dt;
    var n = Math.ceil(G.countdown);
    if (n !== G.lastCount && n > 0) {
      G.lastCount = n;
      window.UI.banner(String(n), '', 0.8);
      window.SFX.play('tick');
    }
    stepWorld(dt, false);
    if (G.countdown <= 0) {
      G.phase = 'fight';
      window.UI.banner('FIGHT!', '', 0.7);
      window.SFX.play('go');
      if (G.sdPhase) window.UI.banner('SUDDEN DEATH', 'first hit wins', 1.6);
      syncChrome();
    }
  }

  function roundBannerText() {
    var m = G.match;
    var r = G.roundWinner;
    var score = m.rounds[0] + ' – ' + m.rounds[1];
    if (r < 0) return { t: 'DRAW!', s: 'Sudden death replay' };
    var who = G.names[r];
    var sub = { ko: 'K.O.!', sudden: 'Sudden death!', time: 'Time!', coin: 'Tie-break!', draw: '' }[G.lastReason] || '';
    return { t: who + ' wins the round', s: (sub ? sub + '  ·  ' : '') + 'Score ' + score };
  }

  function koStep(dt) {
    G.koT -= dt;
    stepWorld(dt, false);
    if (G.koT <= 0) {
      window.Engine.timeScale = 1;
      G.phase = 'banner';
      G.bannerT = C.ROUND_BANNER_SECONDS;
      var txt = roundBannerText();
      window.UI.banner(txt.t, txt.s, C.ROUND_BANNER_SECONDS);
      syncChrome();
    }
  }

  function bannerStep(dt) {
    G.bannerT -= dt;
    if (G.bannerT > 0) return;
    var m = G.match;
    if (m.rounds[0] >= C.ROUNDS_TO_WIN || m.rounds[1] >= C.ROUNDS_TO_WIN) finishMatch();
    else startRound();
  }

  function recordStats(winner) {
    try {
      var s = window.Store.getStats();
      if (G.layout === 'solo') {
        var rec = s.modes[G.modeId] || { w: 0, l: 0 };
        if (winner === 0) { rec.w += 1; s.streak += 1; s.bestStreak = Math.max(s.bestStreak, s.streak); }
        else { rec.l += 1; s.streak = 0; }
        s.modes[G.modeId] = rec;
      } else {
        var names = [G.names[0], G.names[1]];
        if (names[0] === names[1]) { names[0] += ' (P1)'; names[1] += ' (P2)'; }
        var key = names.slice().sort().join(' vs ');
        var h = s.h2h[key] || {};
        h[names[winner]] = (h[names[winner]] || 0) + 1;
        s.h2h[key] = h;
      }
      window.Store.saveStats(s);
    } catch (e) { /* stats must never break a match */ }
  }

  function finishMatch() {
    var m = G.match;
    var winner = m.rounds[0] > m.rounds[1] ? 0 : 1;
    m.winner = winner;
    G.phase = 'over';
    window.Engine.timeScale = 1;
    recordStats(winner);
    window.SFX.play(G.layout === 'solo' ? (winner === 0 ? 'win' : 'lose') : 'win');
    window.UI.hideBanner();
    window.UI.showResults(resultData());
    syncChrome();
  }

  function resultData() {
    var m = G.match;
    var w = m.winner;
    var title;
    if (G.layout === 'solo') title = w === 0 ? 'YOU WIN!' : 'BOT WINS';
    else title = G.names[w] + ' WINS!';
    return {
      title: title,
      winner: w,
      score: m.rounds[0] + ' – ' + m.rounds[1],
      modeName: G.mode.name,
      names: G.names,
      stats: m.stats,
      usesHP: G.mode.usesHP,
      solo: G.layout === 'solo',
      sudden: G.lastReason === 'sudden'
    };
  }

  function update(dt) {
    G.simT += dt;
    switch (G.phase) {
      case 'countdown': countdownStep(dt); break;
      case 'fight': fightStep(dt); break;
      case 'ko': koStep(dt); break;
      case 'banner': bannerStep(dt); break;
      case 'readyGo':
        G.readyGoT -= dt;
        if (G.readyGoT <= 0) startRound();
        break;
      default: break;
    }
  }

  // Shows/hides overlay bits that depend on the phase.
  function syncChrome() {
    var inMatch = ['countdown', 'fight', 'ko', 'banner'].indexOf(G.phase) !== -1;
    var inPlay = inMatch || G.phase === 'ready' || G.phase === 'readyGo';
    window.UI.setPauseVisible(inMatch);
    window.UI.setTouchVisible(inPlay, G.layout);
  }

  function render(ctx, dt) {
    G.realT += dt;
    if (!G.mode) {
      ctx.fillStyle = '#0c1220';
      ctx.fillRect(0, 0, C.W, C.H);
      return;
    }
    G.mode.draw(ctx, G.realT);
    for (var i = 0; i < 2; i++) {
      var f = G.fighters[i];
      f.draw(ctx, buildLabelOpts(i));
    }
    G.mode.drawFore(ctx, G.realT, G.fighters);
    var inMatch = ['countdown', 'fight', 'ko', 'banner', 'paused'].indexOf(G.phase) !== -1;
    if (inMatch) drawHUD(ctx);
    if (G.debugOn) updateDebug(dt);
  }

  function roundTimeText(mode) {
    if (mode.time > 0) {
      var rem = Math.max(0, Math.ceil(mode.time - G.roundT));
      return String(rem);
    }
    var s = Math.floor(G.roundT);
    return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function drawHUD(ctx) {
    var W = C.W;
    var mode = G.mode;
    var m = G.match;
    var cols = colorsFor(window.Store.getSettings());
    ctx.save();
    // Timer
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 46px system-ui, Segoe UI, Arial, sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(10,14,22,0.8)';
    var tt = roundTimeText(mode);
    ctx.strokeText(tt, W / 2, 34);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tt, W / 2, 34);

    // Round dots: best of 3 → two dots per side
    var need = C.ROUNDS_TO_WIN;
    for (var side = 0; side < 2; side++) {
      var color = side === 0 ? cols.p1 : cols.p2;
      for (var d = 0; d < need; d++) {
        var x = side === 0 ? W / 2 - 40 - d * 22 : W / 2 + 40 + d * 22;
        ctx.beginPath();
        ctx.arc(x, 72, 8, 0, Math.PI * 2);
        if (m.rounds[side] > d) { ctx.fillStyle = color; ctx.fill(); }
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    }
    if (G.sdPhase && G.phase !== 'ko' && G.phase !== 'banner') {
      ctx.font = '900 22px system-ui, Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#ffe27a';
      ctx.fillText('SUDDEN DEATH', W / 2, 100);
    }
    if (mode.status && G.phase === 'fight') {
      var st = mode.status();
      if (st) {
        ctx.font = '900 26px system-ui, Segoe UI, Arial, sans-serif';
        ctx.fillStyle = st.color;
        ctx.fillText(st.text, W / 2, 106);
      }
    }

    // Names + HP bars in the top corners (P1 left, P2 right)
    ctx.textBaseline = 'alphabetic';
    for (var s2 = 0; s2 < 2; s2++) {
      var f = G.fighters[s2];
      var left = s2 === 0;
      var bx = left ? 28 : W - 28 - 380;
      var nm = G.names[s2];
      ctx.font = '900 20px system-ui, Segoe UI, Arial, sans-serif';
      ctx.textAlign = left ? 'left' : 'right';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(10,14,22,0.85)';
      ctx.lineWidth = 5;
      var tx = left ? bx : bx + 380;
      ctx.strokeText(nm, tx, 94);
      ctx.fillStyle = s2 === 0 ? cols.p1 : cols.p2;
      ctx.fillText(nm, tx, 94);
      if (mode.usesHP) {
        ctx.fillStyle = 'rgba(10,14,22,0.7)';
        roundRectPath(ctx, bx, 104, 380, 26, 8);
        ctx.fill();
        var frac = Math.max(0, Math.min(1, f.hp / (f.maxHp || 1)));
        ctx.fillStyle = s2 === 0 ? cols.p1 : cols.p2;
        roundRectPath(ctx, bx + 3, 107, Math.max(0, (380 - 6) * frac), 20, 6);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    if (w <= 0) return;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function updateDebug(dt) {
    G.debugT -= dt;
    if (G.debugT > 0) return;
    G.debugT = 0.25;
    var f = G.fighters;
    var txt = 'fps ' + window.Engine.fps() +
      '\nphase ' + G.phase + '  sim ' + G.simT.toFixed(1) + 's' +
      '\nfighters ' + f.map(function (q) { return q.label + (q.alive ? '' : ' (out)') + ' x' + Math.round(q.x) + ' y' + Math.round(q.y); }).join(' | ') +
      '\nsolids ' + (G.mode ? G.mode.solids().length : 0) + '  particles ' + window.Engine.particleCount() +
      '\ntouches ' + window.Input.activeTouchCount() +
      '\nmode ' + (G.modeId || '-') + '  layout ' + G.layout;
    window.UI.debugText(txt);
  }

  // ---------- Public API for the UI ----------
  var Game = {
    startSolo: function (modeId, diff) {
      var st = window.Store.getSettings();
      st.lastMode = modeId;
      st.difficulty = diff;
      window.Store.saveSettings(st);
      newMatch(modeId, 'solo', diff);
      G.mode.setup(G.fighters);
      window.AI.reset(G.brains[1], G.fighters[1]);
      G.phase = 'hint';
      syncChrome();
      var tutKey = C.TUTORIAL_KEY + modeId;
      var show = function () {
        window.UI.showHint(modeId, function () {
          window.Store.setFlag(tutKey + '_hint');
          startRound();
        });
      };
      if (!window.Store.flag(tutKey)) {
        window.Store.setFlag(tutKey);
        window.UI.showTutorial(modeId, show);
      } else {
        show();
      }
    },

    startVersus: function (modeId) {
      newMatch(modeId, 'versus', 'medium');
      G.mode.setup(G.fighters);
      G.phase = 'ready';
      G.ready = [false, false];
      window.UI.showReady(modeId);
      window.UI.readyState(0, false);
      window.UI.readyState(1, false);
      syncChrome();
      if (window.innerWidth < C.TIP_PHONE_WIDTH && !window.Store.flag('sc_tip_phone')) {
        window.Store.setFlag('sc_tip_phone');
        window.UI.toast('Tip: 2-player is comfier on a tablet or laptop.', 4200);
      }
    },

    rematch: function () {
      if (!G.match) return;
      var modeId = G.modeId, layout = G.layout, diff = G.diff;
      if (layout === 'solo') Game.startSolo(modeId, diff);
      else Game.startVersus(modeId);
    },

    restart: function () {
      Game.rematch();
    },

    quit: function () {
      G.phase = 'menu';
      window.Engine.paused = false;
      window.Engine.timeScale = 1;
      window.Engine.clearFX();
      window.Input.clearAll();
      syncChrome();
    },

    pause: function (reason) {
      if (['countdown', 'fight', 'ko', 'banner'].indexOf(G.phase) === -1) return;
      G.prev = G.phase;
      G.phase = 'paused';
      window.Engine.paused = true;
      window.Input.clearAll();
      window.UI.showPause(reason || '');
      syncChrome();
    },

    resume: function () {
      if (G.phase !== 'paused') return;
      G.phase = G.prev || 'fight';
      window.Engine.paused = false;
      window.Input.clearAll();
      window.UI.hidePause();
      syncChrome();
    },

    togglePause: function () {
      if (G.phase === 'paused') Game.resume();
      else Game.pause('');
    },

    isInMatch: function () { return ['countdown', 'fight', 'ko', 'banner', 'paused'].indexOf(G.phase) !== -1; },
    isPaused: function () { return G.phase === 'paused'; },
    phase: function () { return G.phase; },
    layout: function () { return G.layout; },
    modeId: function () { return G.modeId; },
    lastDifficulty: function () { return G.diff; },

    readyPress: function (slot) {
      if (G.phase !== 'ready' || G.ready[slot]) return;
      G.ready[slot] = true;
      window.UI.readyState(slot, true);
      window.SFX.play('click');
      if (G.ready[0] && G.ready[1]) {
        G.phase = 'readyGo';
        G.readyGoT = C.READY_AUTOSTART_DELAY;
        window.UI.readyGo();
        syncChrome();
      }
    },

    debugOn: function (on) {
      G.debugOn = !!on;
      window.UI.debugVisible(G.debugOn);
    }
  };

  window.Game = Game;

  // ---------- Boot ----------
  function boot() {
    var canvas = document.getElementById('game');
    var touchLayer = document.getElementById('touch');
    window.Input.init({ canvas: canvas, touchLayer: touchLayer });
    window.Input.onPress = function (slot, action) {
      if (G.phase === 'ready' && action === 'hit') Game.readyPress(slot);
    };
    window.Input.onSystemKey = function () {
      if (G.phase === 'paused') Game.resume();
      else if (G.phase === 'countdown' || G.phase === 'fight' || G.phase === 'ko' || G.phase === 'banner') Game.pause('');
    };
    window.Input.onGamepad = function (slot, connected) {
      window.UI.toast('🎮 controller ' + (connected ? 'connected' : 'disconnected') + ' (P' + (slot + 1) + ')', 2200);
    };
    window.Engine.onFlash = function (color) { window.UI.flash(color); };
    window.Engine.init({ canvas: canvas, update: update, render: render });
    window.UI.init();

    // Auto-pause when the tab is hidden or the window loses focus (no stuck keys on return).
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        window.Input.clearAll();
        Game.pause('Auto-paused: switched away');
      }
    });
    window.addEventListener('blur', function () {
      window.Input.clearAll();
      if (G.phase === 'fight' || G.phase === 'countdown') Game.pause('Auto-paused: window lost focus');
    });

    // ?debug=1 overlay + read-only test hooks (window.StickClashDebug)
    var params = new URLSearchParams(window.location.search || '');
    if (params.get('debug') === '1') {
      Game.debugOn(true);
      window.StickClashDebug = {
        // Runs N fixed simulation steps synchronously (use with Engine.paused = true).
        step: function (n) { for (var i = 0; i < n; i++) update(C.FIXED_DT); },
        state: function () {
          return {
            phase: G.phase,
            mode: G.modeId,
            layout: G.layout,
            roundT: G.roundT,
            simT: G.simT,
            rounds: G.match ? G.match.rounds.slice() : null,
            roundNo: G.match ? G.match.roundNo : 0,
            winner: G.match ? G.match.winner : -1,
            lastReason: G.lastReason,
            roundWinner: G.roundWinner,
            solids: G.mode ? G.mode.solids().length : 0,
            sudden: G.sdPhase,
            fighters: G.fighters.map(function (f) {
              return { id: f.id, x: f.x, y: f.y, vx: f.vx, vy: f.vy, alive: f.alive, hp: f.hp,
                onGround: f.onGround, stun: f.stun, scale: f.scale, label: f.label, isBot: f.isBot,
                item: f.item, attacking: !!f.attack, lastHitT: f.lastHitT, on: f.landedOn ? (f.landedOn.name + ':' + (f.landedOn.state || 'solid') + (f.landedOn.warn ? ':warn' : '')) : null, stats: { hits: f.stats.hits, items: f.stats.items } };
            })
          };
        },
        // Drive a virtual input into a slot (same path the bot uses).
        held: function (slot, h) { window.Input.setBotHeld(slot, h); },
        tap: function (slot, action) { window.Input.botTap(slot, action); }
      };
    }

    window.UI.showScreen('home');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
