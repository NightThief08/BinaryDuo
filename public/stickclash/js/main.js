/*
 * STICK CLASH — main controller (game-state machine) + fixed-timestep loop.
 *   menu -> (difficulty) -> modes -> fighters (+ bot roulette) -> tutorial(first time) -> hint(solo) | ready(2P) -> playing <-> paused -> results
 */
var SETTINGS = Store.settings();

var App = (function () {
  var params = {};
  try { location.search.replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); } catch (e) { /* ignore */ }
  var DEBUG = params.debug === '1';
  var SPEED = Math.max(1, Math.min(20, parseInt(params.speed, 10) || 1));
  var BVB = params.bvb === '1';

  var state = 'menu', duo = false, modeId = null, match = null, oneButton = false;
  var readyFlags = [false, false], readyGo = 0, hintT = 0, tutT = 0;
  var menuF = [], menuT = 0;
  var fps = 60, fpsAcc = 0, fpsFrames = 0;
  var results = [];
  var chars = null, botHistory = [];
  var $ = UI.$;

  function applySettings() {
    Sfx.setEnabled(SETTINGS.sound);
    document.body.classList.toggle('cb', !!SETTINGS.colorblind);
    var icons = document.querySelectorAll('.mute-icon');
    for (var i = 0; i < icons.length; i++) icons[i].textContent = SETTINGS.sound ? '🔊' : '🔇';
    menuF = [new Fighter(0, 470, 640, 1), new Fighter(1, 810, 640, -1)];
    menuF.forEach(function (f) { f.onGround = true; });
  }
  function saveSettings() { Store.saveSettings(SETTINGS); applySettings(); }
  function names() { return duo ? [SETTINGS.p1Name || 'Player 1', SETTINGS.p2Name || 'Player 2'] : ['You', 'Bot']; }

  function hud(on) { $('hudBtns').classList.toggle('hidden', !on); }

  // ---------- flow ----------
  function newMatch() {
    match = new Match({ modeId: modeId, duo: duo, difficulty: SETTINGS.difficulty, names: names(), bvb: BVB, characters: chars || defaultChars() });
    match.onEnd = onMatchEnd;
    match.hideBanner = true;
    oneButton = !!match.mode.oneButton;
    Input.configure({ duo: duo, oneButton: oneButton, bots: match.bots });
  }
  // ---------- characters ----------
  function savedPick(i) { return CHARACTERS.orDefault(Store.get(i === 0 ? 'p1Character' : 'p2Character', null)); }
  function botPick(playerId) {
    var id = CHARACTERS.pickForBot(SETTINGS.difficulty, playerId, botHistory);
    botHistory.push(id); if (botHistory.length > 6) botHistory.shift();
    return id;
  }
  function defaultChars() { var p = savedPick(0); return [p, duo ? savedPick(1) : botPick(p)]; }
  function showFighters(opts) {
    opts = opts || {};
    state = 'fighters'; match = null; Input.setActive(false); hud(false);
    UI.show('fighters');
    UI.renderFighters({ duo: duo, names: names(), picks: [savedPick(0), savedPick(1)], onFight: onFighters,
      onChange: function (i, id) { Store.set(i === 0 ? 'p1Character' : 'p2Character', id); } });
    if (opts.rematch) onFighters([savedPick(0), savedPick(1)], true);
  }
  function onFighters(picks, isRematch) {
    if (state !== 'fighters') return;
    Store.set('p1Character', picks[0]); if (duo) Store.set('p2Character', picks[1]);
    if (duo) { chars = [picks[0], picks[1]]; afterFighters(isRematch); return; }
    var bot = botPick(picks[0]);
    state = 'roulette';
    UI.botRoulette(bot, function () { if (state !== 'roulette') return; chars = [picks[0], bot]; afterFighters(isRematch); });
  }
  function afterFighters(isRematch) {
    if (isRematch) { newMatch(); beginFight(); return; }
    startMatchFlow();
  }
  function pickMode(id) { modeId = id; showFighters(); }
  function changeFighter() { Sfx.click(); showFighters(); }
  function startMatchFlow() {
    var id = modeId;
    newMatch();
    Input.setActive(false);
    if (!Store.seen('tut.' + id)) { state = 'tutorial'; tutT = 0; UI.renderTutorial(id); UI.show('tutorial'); }
    else afterTutorial();
  }
  function endTutorial() { if (state !== 'tutorial') return; Store.markSeen('tut.' + modeId); afterTutorial(); }
  function afterTutorial() { if (duo) startReady(); else startHint(); }
  function startHint() { state = 'hint'; hintT = 0; UI.renderHint(modeId, oneButton); UI.show('hint'); }
  function startReady() {
    state = 'ready'; readyFlags = [false, false]; readyGo = 0;
    UI.renderReady(modeId, names(), oneButton, readyFlags);
    UI.show('ready');
    Input.clearAll(); Input.setActive(true);
  }
  function setReady(i) {
    if (state !== 'ready' || readyFlags[i]) return;
    readyFlags[i] = true; Sfx.pickup(); UI.setReady(i, true);
    if (readyFlags[0] && readyFlags[1]) readyGo = 0.5;
  }
  function beginFight() {
    if (!match) return;
    state = 'playing';
    match.hideBanner = false;
    UI.show(null, true);
    hud(true);
    Input.clearAll(); Input.setActive(true); Input.layoutTouch();
  }
  function rematch() { Sfx.click(); if (duo || BVB) { newMatch(); beginFight(); } else showFighters({ rematch: true }); }
  function onMatchEnd(res) {
    res.difficulty = SETTINGS.difficulty;
    results.push(res);
    if (!BVB) {
      if (res.duo) Store.recordDuoMatch(res.names[0], res.names[1], res.names[res.winner]);
      else Store.recordBotMatch(res.modeId, res.winner === 0);
    }
    state = 'results';
    Input.setActive(false); hud(false);
    Sfx.gameOver();
    UI.renderResults(res, { rematch: rematch, fighter: changeFighter, change: changeMode, home: goHome, difficulty: changeDifficulty });
    UI.show('results');
    if (params.loop === '1') setTimeout(function () { if (state === 'results') rematch(); }, 400);
  }
  function changeDifficulty(difficulty) {
    if (['easy', 'medium', 'hard'].indexOf(difficulty) < 0 || duo) return;
    SETTINGS.difficulty = difficulty; Store.saveSettings(SETTINGS);
    if (match && !match.finished) match.setDifficulty(difficulty);
    UI.syncDifficulty(); Input.clearAll();
  }
  function changeMode() { Sfx.click(); match = null; state = 'menu'; Input.setActive(false); hud(false); UI.buildModes(pickMode, duo, changeDifficulty); UI.show('modes', true); }
  function goHome() { state = 'menu'; match = null; Input.setActive(false); hud(false); UI.resetHistory(); UI.show('home', true); }
  function pause() {
    if (state !== 'playing') return;
    state = 'paused'; Input.clearAll(); hud(false); UI.renderPause(duo, changeDifficulty, changeMode); UI.show('pause');
  }
  function resume() {
    if (state !== 'paused') return;
    if (isPortraitPhone()) return;
    state = 'playing'; Input.clearAll(); UI.show(null, true); hud(true);
  }
  function leaveToMenu() { state = 'menu'; match = null; Input.setActive(false); hud(false); }

  function onPauseKey() {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
    else if (state === 'tutorial') endTutorial();
    else if (state === 'hint') beginFight();
    else if (state === 'ready' || state === 'fighters') { leaveToMenu(); UI.back(); }
    else if (state === 'menu' && UI.current() !== 'home') UI.back();
  }

  // ---------- rotate / visibility ----------
  function isPortraitPhone() { return Input.touchCapable() && window.innerHeight > window.innerWidth && window.innerWidth < 760; }
  function checkRotate() {
    var p = isPortraitPhone();
    $('rotate').classList.toggle('hidden', !p);
    if (p) pause();
    var top = Engine.oy + 100 * Engine.scale;
    $('hudBtns').style.top = Math.max(top, 6) + 'px';
  }

  // ---------- wiring ----------
  function wire() {
    $('btnSolo').onclick = function () { duo = false; UI.show('difficulty'); };
    $('btnDuo').onclick = function () {
      duo = true; UI.buildModes(pickMode, true, changeDifficulty); UI.show('modes');
      if (Input.touchCapable() && (window.innerWidth < CONFIG.TOUCH.smallPhone || Math.min(window.innerWidth, window.innerHeight) < 500) && !Store.seen('tip.duoPhone')) {
        Store.markSeen('tip.duoPhone'); UI.toast('Tip: 2-player is comfier on a tablet or laptop.', 3500);
      }
    };
    var diffs = document.querySelectorAll('[data-diff]');
    for (var i = 0; i < diffs.length; i++) diffs[i].onclick = function (e) {
      SETTINGS.difficulty = e.currentTarget.getAttribute('data-diff'); saveSettings();
      UI.buildModes(pickMode, false, changeDifficulty); UI.show('modes');
    };
    var gos = document.querySelectorAll('[data-go]');
    for (var g = 0; g < gos.length; g++) gos[g].onclick = function (e) {
      var id = e.currentTarget.getAttribute('data-go');
      if (id === 'settings') UI.renderSettings();
      if (id === 'controls') UI.renderControls();
      if (id === 'stats') UI.renderStats();
      if (id === 'howto') UI.renderHowto();
      UI.show(id);
    };
    var backs = document.querySelectorAll('[data-back]');
    for (var b = 0; b < backs.length; b++) backs[b].onclick = function () {
      Input.cancelCapture();
      if (state === 'ready' || state === 'tutorial' || state === 'hint' || state === 'fighters' || state === 'roulette') leaveToMenu();
      UI.back();
    };
    var mutes = document.querySelectorAll('[data-action="mute"]');
    for (var m = 0; m < mutes.length; m++) mutes[m].onclick = function () { SETTINGS.sound = !SETTINGS.sound; saveSettings(); Sfx.unlock(); Sfx.click(); };
    $('btnPause').onclick = pause;
    $('btnResume').onclick = resume;
    $('btnRestart').onclick = function () { if (state === 'paused') { newMatch(); beginFight(); } };
    $('btnQuit').onclick = goHome;
    $('btnTutSkip').onclick = endTutorial;
    $('hint').onclick = function () { if (state === 'hint') beginFight(); };
    $('readyP1').addEventListener('pointerdown', function (e) { e.preventDefault(); setReady(0); });
    $('readyP2').addEventListener('pointerdown', function (e) { e.preventDefault(); setReady(1); });
    // settings
    var boxes = document.querySelectorAll('[data-setting]');
    for (var s = 0; s < boxes.length; s++) boxes[s].onchange = function (e) { SETTINGS[e.target.getAttribute('data-setting')] = e.target.checked; saveSettings(); if (SETTINGS.vibration) FX.vibrate(30); };
    var segs = document.querySelectorAll('[data-sdiff]');
    for (var d = 0; d < segs.length; d++) segs[d].onclick = function (e) { var diff = e.currentTarget.getAttribute('data-sdiff'); if (!duo) changeDifficulty(diff); else { SETTINGS.difficulty = diff; Store.saveSettings(SETTINGS); } UI.renderSettings(); };
    function nameChange() {
      var a = $('nameP1').value.trim().slice(0, 12) || 'Player 1', c = $('nameP2').value.trim().slice(0, 12) || 'Player 2';
      if (a.toLowerCase() === c.toLowerCase()) c = c + ' 2';
      SETTINGS.p1Name = a; SETTINGS.p2Name = c; saveSettings();
    }
    $('nameP1').addEventListener('change', nameChange); $('nameP2').addEventListener('change', nameChange);
    $('nameP1').addEventListener('blur', function () { UI.renderSettings(); }); $('nameP2').addEventListener('blur', function () { UI.renderSettings(); });
    $('btnResetKeys').onclick = function () { Store.resetKeys(); Input.reloadBindings(); UI.renderControls(); UI.toast('Keys reset to default', 1500); };
    var confirmReset = false;
    $('btnResetStats').onclick = function (e) {
      if (!confirmReset) { confirmReset = true; e.currentTarget.textContent = 'Tap again to confirm'; setTimeout(function () { confirmReset = false; $('btnResetStats').textContent = 'Reset stats'; }, 2500); return; }
      confirmReset = false; Store.resetStats(); UI.renderStats(); $('btnResetStats').textContent = 'Reset stats'; UI.toast('Stats reset', 1500);
    };

    document.addEventListener('pointerdown', Sfx.unlock, true);
    document.addEventListener('keydown', Sfx.unlock, true);
    document.addEventListener('click', function (e) { var t = e.target; if (t && t.closest && t.closest('button')) Sfx.click(); }, true);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { Input.clearAll(); pause(); } });
    window.addEventListener('blur', function () { Input.clearAll(); pause(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); });
    Input.on('pause', onPauseKey);
    Input.on('padConnect', function () { UI.toast('🎮 Controller connected', 2000); });
    Engine.onResize = checkRotate;
  }

  // ---------- loop ----------
  function tick(dt) {
    ModeUtil.time += dt;
    if (state === 'playing') { match.update(dt, Input.poll()); return; }
    if (state === 'ready') {
      var inp = Input.poll();
      for (var i = 0; i < 2; i++) if (oneButton ? inp[i].jumpPressed : inp[i].hitPressed) setReady(i);
      if (readyGo > 0) { readyGo -= dt; if (readyGo <= 0) beginFight(); }
      if (match && match.mode.idleUpdate) match.mode.idleUpdate(dt, match);
      return;
    }
    if (state === 'hint') { hintT += dt; var hb = $('hintBar'); if (hb) hb.style.width = Math.min(100, hintT / 3 * 100) + '%'; if (hintT >= 3) beginFight(); }
    if (state === 'tutorial') { tutT += dt; $('tutBar').style.width = Math.min(100, tutT / 5 * 100) + '%'; if (tutT >= 5) endTutorial(); }
    if (match && match.mode.idleUpdate && state !== 'menu') match.mode.idleUpdate(dt, match);
    menuT += dt;
    for (var k = 0; k < menuF.length; k++) {
      var f = menuF[k]; f.t += dt;
      if (f.attackT >= 0) { f.attackT += dt; if (f.attackT > CONFIG.FIGHTER.hitCooldown) f.attackT = -1; }
      else if (Math.random() < dt * 0.9) { f.attackType = f.attackType === 'punch' ? 'kick' : 'punch'; f.attackT = 0; }
    }
  }

  function drawMenu(ctx) {
    Engine.worldTransform(0, 0);
    ModeUtil.cachedBg(ctx, 'menu', function (g) { skyGradient(g, '#1e1b4b', '#7c3aed'); ModeUtil.drawStaticStars(g); });
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff';
    ctx.translate(640, 360); ctx.rotate(menuT * 0.1);
    for (var i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1400, -110); ctx.lineTo(1400, 110); ctx.closePath(); if (i % 2) ctx.fill(); }
    ctx.restore();
    ModeUtil.drawHills(ctx, '#312e81', 660, 60, 2);
    ctx.fillStyle = '#1e1b4b'; ctx.fillRect(-400, 640, 2080, 380);
    ctx.fillStyle = '#4c1d95'; ctx.fillRect(-400, 640, 2080, 8);
    for (var k = 0; k < menuF.length; k++) { ctx.save(); menuF[k].draw(ctx); ctx.restore(); }
  }

  function drawTouch(ctx) {
    var cfg = Input.config(), W = Engine.cw, H = Engine.ch;
    Engine.screenTransform();
    if (cfg.duo) {
      ctx.fillStyle = 'rgba(59,130,246,0.05)'; ctx.fillRect(0, 0, W / 2, H);
      ctx.fillStyle = SETTINGS.colorblind ? 'rgba(245,158,11,0.05)' : 'rgba(239,68,68,0.05)'; ctx.fillRect(W / 2, 0, W / 2, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([10, 10]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2, H * 0.25); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
    }
    if (cfg.oneButton) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font(Math.max(14, Math.min(22, W / 40)));
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      if (cfg.duo) { ctx.fillText('👆 P1: TAP LEFT HALF', W * 0.25, H - 30); ctx.fillText('P2: TAP RIGHT HALF 👆', W * 0.75, H - 30); }
      else ctx.fillText('👆 TAP ANYWHERE TO FLIP', W / 2, H - 30);
      return;
    }
    // Floating thumb pads: show where you're dragging, or a ghost pad at the home spot
    var homes = Input.getStickHome(), tch = Input.getTouches(), R = CONFIG.TOUCH.stickRadius * (cfg.duo ? 0.85 : 1);
    for (var p = 0; p < 2; p++) {
      if (!homes[p] || cfg.bots[p]) continue;
      var act = null;
      for (var id in tch) if (tch[id].stick && tch[id].player === p) act = tch[id];
      var bx = act ? act.ox : homes[p].x, by = act ? act.oy : homes[p].y;
      var pc = !cfg.duo ? '255,255,255' : p === 0 ? '59,130,246' : (SETTINGS.colorblind ? '245,158,11' : '239,68,68');
      ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + pc + ',' + (act ? 0.22 : 0.12) + ')'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,' + (act ? 0.7 : 0.4) + ')'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font(R * 0.34);
      ctx.fillText('◀', bx - R * 0.62, by); ctx.fillText('▶', bx + R * 0.62, by); ctx.fillText('▼', bx, by + R * 0.62);
      var kx = act ? act.x : bx, ky = act ? act.y : by;
      ctx.beginPath(); ctx.arc(kx, ky, R * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (act ? 0.75 : 0.35) + ')'; ctx.fill();
      if (!act) { ctx.font = font(Math.max(10, R * 0.22)); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('DRAG TO MOVE', bx, by - R - 14); }
    }
    var btns = Input.getTouchButtons();
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i], held = Input.heldAction(b.player, b.action);
      var col = b.player === 0 ? '59,130,246' : (SETTINGS.colorblind ? '245,158,11' : '239,68,68');
      if (!cfg.duo) col = '255,255,255';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (held ? 0.94 : 1), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + col + ',' + (held ? 0.6 : (cfg.duo ? 0.28 : 0.16)) + ')'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,' + (held ? 0.95 : 0.55) + ')'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = font(b.r * (b.label ? 0.62 : 0.75));
      ctx.fillText(b.icon, b.x, b.y - (b.label ? b.r * 0.14 : 0));
      if (b.label) { ctx.font = font(Math.max(9, b.r * 0.26)); ctx.fillText(b.label, b.x, b.y + b.r * 0.5); }
    }
  }

  function drawDebug(ctx) {
    Engine.screenTransform();
    var t = Input.getTouches(), ids = Object.keys(t);
    var lines = ['FPS ' + fps.toFixed(0) + '  speed x' + SPEED, 'state ' + state + (match ? ' / ' + match.state + ' r' + match.round : ''),
      'bodies ' + (match ? 2 + match.platforms.length : 0) + '  particles ' + FX.count(), 'touches ' + ids.length + ' ' + ids.map(function (k) { return 'P' + (t[k].player + 1) + ':' + (t[k].action || '-'); }).join(' '),
      'dpr ' + Engine.dpr.toFixed(2) + ' scale ' + Engine.scale.toFixed(2)];
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, Engine.ch - 18 * lines.length - 16, 330, 18 * lines.length + 8);
    ctx.fillStyle = '#4ade80'; ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach(function (l, i) { ctx.fillText(l, 14, Engine.ch - 18 * lines.length - 12 + i * 18); });
    for (var k in t) { ctx.strokeStyle = '#fde047'; ctx.beginPath(); ctx.arc(t[k].x, t[k].y, 26, 0, 7); ctx.stroke(); }
  }

  function render() {
    var ctx = Engine.ctx;
    Engine.screenTransform();
    ctx.fillStyle = '#0b1026'; ctx.fillRect(0, 0, Engine.cw, Engine.ch);
    if (match && state !== 'menu') match.draw(ctx); else drawMenu(ctx);
    if (state === 'playing' && Input.showTouch()) drawTouch(ctx);
    if (DEBUG) drawDebug(ctx);
  }

  var last = 0, acc = 0, slowHalfSecs = 0;
  function frame(ts) {
    try {
      if (!last) last = ts;
      var real = Math.min(0.1, Math.max(0, (ts - last) / 1000)); last = ts;
      fpsAcc += real; fpsFrames++;
      if (fpsAcc >= 0.5) {
        fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0;
        // Adaptive resolution: on slow devices drop the render resolution step by step (simulation stays 60 Hz)
        if (state === 'playing' && !document.hidden) {
          slowHalfSecs = fps < 50 ? slowHalfSecs + 1 : 0;
          if (slowHalfSecs >= 4 && Engine.dpr > 0.8) { Engine.dprCap = Math.max(0.75, Engine.dpr - 0.5); Engine.resize(); slowHalfSecs = 0; }
        }
      }
      Engine.updateTime(real);
      acc += real * Engine.timeScale * SPEED;
      var steps = 0, maxSteps = CONFIG.MAX_STEPS_PER_FRAME * SPEED;
      while (acc >= CONFIG.TICK && steps < maxSteps) { tick(CONFIG.TICK); acc -= CONFIG.TICK; steps++; }
      if (steps >= maxSteps) acc = 0;
      render();
    } catch (err) {
      if (window.console) console.error(err);
    }
    requestAnimationFrame(frame);
  }

  function init() {
    Engine.init(); Input.init(); wire(); applySettings(); checkRotate();
    UI.show('home', true);
    // Test harness: ?mode=crumble&bvb=1&speed=8&loop=1&duo=1 jumps straight into a match
    if (params.mode && Modes.list[params.mode]) {
      duo = params.duo === '1';
      if (params.diff && CONFIG.BOT[params.diff]) SETTINGS.difficulty = params.diff;
      modeId = params.mode; newMatch(); beginFight();
    }
    requestAnimationFrame(frame);
  }

  return { init: init, fps: function () { return fps; }, state: function () { return state; }, match: function () { return match; }, results: results, pause: pause, resume: resume };
})();
window.StickClash = App;
App.init();
