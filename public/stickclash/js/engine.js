/* Engine core: canvas scaling (fixed 1280x720 logical, letterboxed), FX (particles, shake, hit-stop), Match state machine. */
var FONT = "900 {s}px 'Arial Black', 'Segoe UI Black', 'Helvetica Neue', Impact, system-ui, sans-serif";
function font(s) { return FONT.replace('{s}', Math.round(s)); }

var Engine = (function () {
  var E = { canvas: null, ctx: null, dpr: 1, scale: 1, ox: 0, oy: 0, cw: 0, ch: 0, timeScale: 1, slowT: 0, dprCap: 4 };
  E.init = function () {
    E.canvas = document.getElementById('game');
    E.ctx = E.canvas.getContext('2d', { alpha: false });
    E.resize();
    window.addEventListener('resize', E.resize);
    window.addEventListener('orientationchange', function () { setTimeout(E.resize, 120); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', E.resize);
  };
  E.resize = function () {
    var w = window.innerWidth, h = window.innerHeight; // innerHeight avoids the iOS 100vh problem
    E.dpr = Math.min(CONFIG.MAX_DPR, E.dprCap, window.devicePixelRatio || 1);
    E.cw = w; E.ch = h;
    E.canvas.width = Math.round(w * E.dpr); E.canvas.height = Math.round(h * E.dpr);
    E.canvas.style.width = w + 'px'; E.canvas.style.height = h + 'px';
    E.scale = Math.min(w / CONFIG.WIDTH, h / CONFIG.HEIGHT);
    E.ox = (w - CONFIG.WIDTH * E.scale) / 2; E.oy = (h - CONFIG.HEIGHT * E.scale) / 2;
    if (typeof Input !== 'undefined') Input.layoutTouch();
    if (E.onResize) E.onResize();
  };
  E.worldTransform = function (shakeX, shakeY) {
    var s = E.scale * E.dpr;
    E.ctx.setTransform(s, 0, 0, s, (E.ox + (shakeX || 0) * E.scale) * E.dpr, (E.oy + (shakeY || 0) * E.scale) * E.dpr);
  };
  // Camera view: world point (cam.x, cam.y) sits at the centre of the 1280x720 logical view, zoomed by cam.z.
  E.cameraTransform = function (cam, shakeX, shakeY) {
    var s = E.scale * E.dpr * cam.z;
    var tx = (E.ox + (CONFIG.WIDTH / 2 + (shakeX || 0) - cam.x * cam.z) * E.scale) * E.dpr;
    var ty = (E.oy + (CONFIG.HEIGHT / 2 + (shakeY || 0) - cam.y * cam.z) * E.scale) * E.dpr;
    E.ctx.setTransform(s, 0, 0, s, tx, ty);
  };
  E.screenTransform = function () { E.ctx.setTransform(E.dpr, 0, 0, E.dpr, 0, 0); };
  E.slowmo = function (realSeconds, scale) { E.slowT = realSeconds; E.timeScale = scale || 0.3; };
  E.updateTime = function (realDt) { if (E.slowT > 0) { E.slowT -= realDt; if (E.slowT <= 0) E.timeScale = 1; } };
  return E;
})();

// ---------------------------------------------------------------------
var FX = (function () {
  var parts = [], texts = [], shakeAmt = 0, shakeX = 0, shakeY = 0, hitstopT = 0, flashT = 0, flashColor = '#fff';
  var MAX = 320;
  function add(p) { if (parts.length >= MAX) parts.shift(); parts.push(p); }
  return {
    clear: function () { parts = []; texts = []; shakeAmt = 0; hitstopT = 0; flashT = 0; },
    burst: function (x, y, color, n, speed) {
      for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random()); add({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.5, max: 0.5, color: color, size: 3 + Math.random() * 3, type: 'dot', g: 300 }); }
    },
    stars: function (x, y, n) {
      var cols = ['#fde047', '#ffffff', '#fb923c', '#a5f3fc'];
      for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, s = 150 + Math.random() * 380; add({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, max: 0.45, color: cols[i % 4], size: 5 + Math.random() * 5, type: 'star', g: 200, rot: Math.random() * 6, vr: 10 }); }
    },
    shards: function (x, y, w, color, n) {
      for (var i = 0; i < n; i++) add({ x: x + Math.random() * w, y: y + Math.random() * 10, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 300, life: 1.1, max: 1.1, color: color, size: 4 + Math.random() * 8, type: 'shard', g: 1200, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20 });
    },
    splash: function (x, y) { for (var i = 0; i < 18; i++) add({ x: x, y: y, vx: (Math.random() - 0.5) * 260, vy: -200 - Math.random() * 380, life: 0.9, max: 0.9, color: '#7dd3fc', size: 3 + Math.random() * 4, type: 'dot', g: 1200 }); },
    text: function (x, y, str, color) { texts.push({ x: x, y: y, str: str, color: color || '#fff', life: 0.8 }); if (texts.length > 12) texts.shift(); },
    shake: function (a) { if (window.SETTINGS && !SETTINGS.shake) return; shakeAmt = Math.max(shakeAmt, a); },
    hitstop: function (t) { hitstopT = Math.max(hitstopT, t); },
    flash: function (t, color) { flashT = t; flashColor = color || '#fff'; },
    vibrate: function (ms) { try { if (window.SETTINGS && SETTINGS.vibration && navigator.vibrate && Input.showTouch()) navigator.vibrate(ms); } catch (e) { /* not supported */ } },
    consumeHitstop: function (dt) { if (hitstopT > 0) { hitstopT -= dt; return true; } return false; },
    update: function (dt) {
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i]; p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.vr) p.rot += p.vr * dt;
      }
      for (var j = texts.length - 1; j >= 0; j--) { texts[j].life -= dt; texts[j].y -= 50 * dt; if (texts[j].life <= 0) texts.splice(j, 1); }
      if (shakeAmt > 0) { shakeAmt = Math.max(0, shakeAmt - dt * 40); shakeX = (Math.random() - 0.5) * 2 * shakeAmt; shakeY = (Math.random() - 0.5) * 2 * shakeAmt; } else { shakeX = shakeY = 0; }
      if (flashT > 0) flashT -= dt;
    },
    offset: function () { return { x: shakeX, y: shakeY }; },
    draw: function (ctx) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        if (p.type === 'star') { drawStar(ctx, p.x, p.y, p.size); }
        else if (p.type === 'shard') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.6); ctx.lineTo(p.size * 0.8, p.size * 0.4); ctx.closePath(); ctx.fill(); ctx.restore(); }
        else { ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var j = 0; j < texts.length; j++) {
        var t = texts[j];
        ctx.globalAlpha = Math.min(1, t.life * 2);
        ctx.font = font(26); ctx.lineWidth = 6; ctx.strokeStyle = '#0f172a'; ctx.strokeText(t.str, t.x, t.y);
        ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    },
    drawFlash: function (ctx) {
      if (flashT <= 0) return;
      ctx.globalAlpha = Math.min(0.8, flashT * 2.5); ctx.fillStyle = flashColor;
      ctx.fillRect(-400, -300, 2080, 1320); ctx.globalAlpha = 1;
    },
    count: function () { return parts.length; }
  };
})();

function bigText(ctx, str, x, y, size, color, stroke) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(size);
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(4, size / 7); ctx.strokeStyle = stroke || '#0f172a';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color || '#fff'; ctx.fillText(str, x, y);
  ctx.restore();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function skyGradient(ctx, c1, c2) {
  var g = ctx.createLinearGradient(0, -300, 0, 1000);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(-400, -300, 2080, 1320);
}

// =====================================================================
// Match: rounds, timers, winners. Always ends with a winner.
// =====================================================================
function Match(opts) {
  this.opts = opts;
  this.duo = !!opts.duo;
  this.mode = Modes.create(opts.modeId);
  this.names = opts.names;
  this.labels = this.duo ? ['P1', 'P2'] : ['YOU', 'BOT'];
  this.fighters = this.mode.createFighters(this);
  for (var i = 0; i < 2; i++) { this.fighters[i].label = this.labels[i]; this.fighters[i].name = this.names[i]; }
  // Characters: P2 (or the bot) uses the alternate tint in a mirror match.
  if (opts.characters) {
    this.characters = [CHARACTERS.orDefault(opts.characters[0]), CHARACTERS.orDefault(opts.characters[1])];
    this.fighters[0].setCharacter(this.characters[0], false);
    this.fighters[1].setCharacter(this.characters[1], this.characters[0] === this.characters[1]);
  }
  this.cam = { x: CONFIG.WORLD.W / 2, y: 400, z: 1 };
  this.bots = [opts.bvb ? new Bot(0, opts.difficulty) : null, this.duo ? null : new Bot(1, opts.difficulty)];
  this.roundWins = [0, 0];
  this.round = 1;
  this.platforms = [];
  this.finished = false;
  this.startRound();
}
Match.prototype.opponentOf = function (f) { return this.fighters[0] === f ? this.fighters[1] : this.fighters[0]; };
Match.prototype.setDifficulty = function (difficulty) {
  if (this.duo || ['easy', 'medium', 'hard'].indexOf(difficulty) < 0) return false;
  this.opts.difficulty = difficulty;
  // Preserve bot identity: Input.configure holds references to these same bots.
  for (var i = 0; i < this.bots.length; i++) if (this.bots[i]) {
    this.bots[i].diff = difficulty; this.bots[i].p = CONFIG.BOT[difficulty]; this.bots[i].reset();
  }
  return true;
};
Match.prototype.checkKnockouts = function () {
  var cue = false;
  for (var i = 0; i < 2; i++) {
    var f = this.fighters[i];
    if (!this.koPlayed[i] && (f.out || (this.mode.usesHP && f.hp <= 0))) {
      this.koPlayed[i] = true; cue = true;
    }
  }
  if (cue) Sfx.ko();
};
Match.prototype.startRound = function () {
  FX.clear();
  this.state = 'intro'; this.stateT = 0; this.banner = null;
  this.timeLeft = this.mode.roundTime || 0;
  this.elapsed = 0;
  this.suddenDeath = 0;
  this.koPlayed = [false, false];
  this.roundHits = [this.fighters[0].stats.hits, this.fighters[1].stats.hits];
  this.mode.setupRound(this);
  for (var i = 0; i < 2; i++) if (this.bots[i]) this.bots[i].reset();
  this.lastCount = -1;
  this.updateCamera(0, true);
};
// Smooth camera: follow both fighters, zoom out to keep them in view (clamped to min/max zoom and the arena).
Match.prototype.cameraTarget = function () {
  var C = CONFIG.CAMERA, Wd = CONFIG.WORLD, f = this.fighters, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
  for (var i = 0; i < 2; i++) {
    var a = f[i];
    if (a.out && this.state === 'fight') continue;
    minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.headTop()); maxY = Math.max(maxY, Math.min(a.y, Wd.TOP + Wd.H)); n++;
  }
  if (!n) return { x: this.cam.x, y: this.cam.y, z: this.cam.z };
  var VW = CONFIG.WIDTH, VH = CONFIG.HEIGHT;
  var z = Math.min(VW / (maxX - minX + C.marginX * 2), VH / (maxY - minY + C.marginY * 2));
  z = Physics.clamp(z, C.minZoom, C.maxZoom);
  var hw = VW / 2 / z, hh = VH / 2 / z;
  var x = (minX + maxX) / 2, y = (minY + maxY) / 2 - 40 / z;
  x = hw * 2 >= Wd.W ? Wd.W / 2 : Physics.clamp(x, hw, Wd.W - hw);
  y = Math.min(y, C.maxBottom - hh);
  if (hh * 2 <= C.maxBottom - Wd.TOP) y = Math.max(y, Wd.TOP + hh);
  return { x: x, y: y, z: z };
};
Match.prototype.updateCamera = function (dt, snap) {
  var t = this.cameraTarget(), k = snap ? 1 : 1 - Math.exp(-CONFIG.CAMERA.follow * dt);
  this.cam.z += (t.z - this.cam.z) * k; this.cam.x += (t.x - this.cam.x) * k; this.cam.y += (t.y - this.cam.y) * k;
};
Match.prototype.label = function (i) { return this.duo ? this.names[i] : (i === 0 ? 'YOU' : 'BOT'); };
Match.prototype.update = function (dt, inputs) {
  this.stateT += dt;
  this.updateCamera(dt);
  if (FX.consumeHitstop(dt)) return;
  FX.update(dt);
  var f = this.fighters, i;
  if (this.state === 'intro') {
    var CD = CONFIG.COUNTDOWN, c = Math.floor(this.stateT / CD.step);
    if (c !== this.lastCount) { this.lastCount = c; if (c < CD.words.length) Sfx.beep(false); }
    for (i = 0; i < 2; i++) f[i].update(dt, NO_INPUT, this);
    if (this.mode.idleUpdate) this.mode.idleUpdate(dt, this);
    if (this.stateT >= CD.step * CD.words.length) { this.state = 'fight'; this.stateT = 0; Sfx.beep(true); FX.shake(CONFIG.SHAKE.small); }
    return;
  }
  if (this.state === 'sd') {
    for (i = 0; i < 2; i++) f[i].update(dt, NO_INPUT, this);
    if (this.stateT >= 1.6) { this.state = 'fight'; this.stateT = 0; }
    return;
  }
  if (this.state === 'fight') {
    for (i = 0; i < 2; i++) if (this.bots[i]) this.bots[i].think(dt, this);
    for (i = 0; i < 2; i++) f[i].update(dt, inputs[i], this);
    f[0].checkHit(f[1], this, dt); f[1].checkHit(f[0], this, dt);
    this.elapsed += dt;
    if (this.mode.roundTime && this.timeLeft > 0) this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.mode.update(dt, this);
    this.checkKnockouts();
    var res = this.mode.checkEnd(this);
    if (res) this.resolve(res);
    return;
  }
  if (this.state === 'roundOver') {
    for (i = 0; i < 2; i++) f[i].update(dt, NO_INPUT, this);
    if (this.mode.idleUpdate) this.mode.idleUpdate(dt, this);
    if (this.stateT >= this.roundOverTime) {
      if (this.matchWinner !== undefined) { this.state = 'matchOver'; this.stateT = 0; }
      else { this.round++; this.startRound(); }
    }
    return;
  }
  if (this.state === 'matchOver' && !this.finished) {
    this.finished = true;
    if (this.onEnd) this.onEnd(this.result());
  }
};
Match.prototype.resolve = function (res) {
  if (res.tie) {
    this.suddenDeath++;
    if (this.suddenDeath > 2) {
      // Still tied after two sudden deaths: most hits this round, then a coin flip. Never hangs.
      var h0 = this.fighters[0].stats.hits - this.roundHits[0], h1 = this.fighters[1].stats.hits - this.roundHits[1];
      var w = h0 === h1 ? (Math.random() < 0.5 ? 0 : 1) : (h0 > h1 ? 0 : 1);
      this.winRound(w, h0 === h1 ? 'COIN FLIP!' : 'MORE HITS!');
      return;
    }
    this.mode.suddenDeath(this);
    this.koPlayed = [false, false];
    this.state = 'sd'; this.stateT = 0;
    this.banner = { text: 'SUDDEN DEATH!', sub: this.mode.sdHint || 'Next knockout wins', color: '#f43f5e' };
    Sfx.warn(); FX.flash(0.3, '#f43f5e');
    return;
  }
  this.winRound(res.winner, res.reason);
};
Match.prototype.winRound = function (w, reason) {
  this.roundWins[w]++;
  this.fighters[w].stats.kos++;
  var final = this.roundWins[w] >= CONFIG.ROUNDS_TO_WIN;
  this.state = 'roundOver'; this.stateT = 0;
  this.roundOverTime = final ? 3.0 : 2.4;
  var who = this.label(w);
  var sub = this.duo ? who + ' wins the round' : (w === 0 ? 'You win the round!' : 'Bot wins the round');
  if (final) { this.matchWinner = w; sub = this.duo ? who + ' WINS!' : (w === 0 ? 'YOU WIN!' : 'BOT WINS!'); Engine.slowmo(CONFIG.KO_SLOWMO, 0.3); }
  if (!this.koPlayed[0] && !this.koPlayed[1]) Sfx.beep(true);
  this.banner = { text: reason || 'K.O.!', sub: sub, color: w === 0 ? this.fighters[0].color : this.fighters[1].color };
  FX.shake(CONFIG.SHAKE.big);
};
Match.prototype.result = function () {
  var f = this.fighters;
  return { winner: this.matchWinner, modeId: this.opts.modeId, duo: this.duo, names: this.names, labels: this.labels, roundWins: this.roundWins.slice(), colors: [f[0].color, f[1].color],
    characters: this.characters ? this.characters.slice() : null,
    stats: [f[0].stats, f[1].stats] };
};

// ---------- Drawing ----------
Match.prototype.draw = function (ctx) {
  var off = FX.offset(), Wd = CONFIG.WORLD;
  Engine.cameraTransform(this.cam, off.x, off.y);
  // Backdrop art is painted for 1280x720; scale it uniformly to span the wider arena, anchored at the waterline.
  ctx.save();
  ctx.translate(0, Wd.BACKDROP_ANCHOR_Y); ctx.scale(Wd.BACKDROP, Wd.BACKDROP); ctx.translate(0, -Wd.BACKDROP_ANCHOR_Y);
  this.mode.drawBackground(ctx, this);
  ModeUtil.drawAmbience(ctx, this);
  ctx.restore();
  this.mode.drawWorld(ctx, this);
  for (var i = 0; i < 2; i++) this.fighters[i].draw(ctx, this);
  for (var j = 0; j < 2; j++) this.drawTag(ctx, this.fighters[j], j);
  FX.draw(ctx);
  Engine.worldTransform(0, 0);
  if (this.mode.drawFront) this.mode.drawFront(ctx, this);
  FX.drawFlash(ctx);
  this.drawHUD(ctx);
  this.drawBanner(ctx);
};
Match.prototype.drawTag = function (ctx, f, i) {
  if (f.out) return;
  var y = Math.max(CONFIG.WORLD.TOP + 30, f.headTop() - 14), x = Physics.clamp(f.x, 30, CONFIG.WORLD.W - 30);
  ctx.save();
  ctx.font = font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  var text = f.label;
  var w = ctx.measureText(text).width + 16;
  ctx.fillStyle = f.color; roundRect(ctx, x - w / 2, y - 13, w, 26, 8); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 6, y + 12); ctx.lineTo(x + 6, y + 12); ctx.lineTo(x, y + 19); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(text, x, y + 1);
  if (SETTINGS.colorblind) { // shape markers: P1 circle, P2 triangle
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
    var mx = x + w / 2 + 12;
    ctx.beginPath();
    if (i === 0) ctx.arc(mx, y, 7, 0, Math.PI * 2); else { ctx.moveTo(mx, y - 8); ctx.lineTo(mx + 8, y + 6); ctx.lineTo(mx - 8, y + 6); ctx.closePath(); }
    ctx.fill(); ctx.stroke();
  }
  if (this.mode.drawTagExtra) this.mode.drawTagExtra(ctx, f, x, y, this);
  ctx.restore();
};
Match.prototype.drawHUD = function (ctx) {
  var W = CONFIG.WIDTH, f = this.fighters, m = this.mode;
  // timer + round dots
  var t = m.hudTimer ? m.hudTimer(this) : { text: String(Math.ceil(this.timeLeft)), color: this.timeLeft <= 5 ? '#f87171' : '#fff' };
  ctx.fillStyle = 'rgba(15,23,42,0.55)'; roundRect(ctx, W / 2 - 74, 10, 148, 86, 18); ctx.fill();
  bigText(ctx, t.text, W / 2, 46, t.small ? 26 : 44, t.color);
  for (var r = 0; r < 2; r++) for (var d = 0; d < CONFIG.ROUNDS_TO_WIN; d++) {
    var cx = r === 0 ? W / 2 - 24 - d * 22 : W / 2 + 24 + d * 22;
    ctx.beginPath(); ctx.arc(cx, 80, 7, 0, Math.PI * 2);
    ctx.fillStyle = this.roundWins[r] > d ? f[r].color : 'rgba(255,255,255,0.18)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
  }
  // names + HP bars (P1 left, P2 right)
  for (var i = 0; i < 2; i++) {
    // HP bar length follows the character's max HP (Brute's bar is 15% longer, Shadow's 10% shorter)
    var left = i === 0, bw = Math.round(380 * (m.usesHP ? f[i].cm.maxHP : 1)), x = left ? 24 : W - 24 - bw, y = 18;
    ctx.save();
    ctx.font = font(20); ctx.textBaseline = 'top'; ctx.textAlign = left ? 'left' : 'right';
    ctx.lineWidth = 5; ctx.strokeStyle = '#0f172a';
    var nm = this.duo ? this.names[i] : (i === 0 ? 'YOU' : 'BOT · ' + this.opts.difficulty.toUpperCase());
    ctx.strokeText(nm, left ? x : x + bw, y); ctx.fillStyle = f[i].color; ctx.fillText(nm, left ? x : x + bw, y);
    if (!f[i].legacy) { // character chip + name beside the player name
      var nw = ctx.measureText(nm).width, cname = f[i].char.name, dir = left ? 1 : -1;
      var cx0 = (left ? x : x + bw) + dir * (nw + 12);
      ctx.fillStyle = f[i].color; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2;
      roundRect(ctx, left ? cx0 : cx0 - 14, y + 3, 14, 14, 4); ctx.fill(); ctx.stroke();
      ctx.font = font(17); ctx.lineWidth = 5; ctx.strokeStyle = '#0f172a';
      var tx = cx0 + dir * 20;
      ctx.strokeText(cname, tx, y + 2); ctx.fillStyle = f[i].color; ctx.fillText(cname, tx, y + 2);
    }
    if (m.usesHP) {
      var hp = Math.max(0, f[i].hp / f[i].maxHp);
      ctx.fillStyle = 'rgba(15,23,42,0.7)'; roundRect(ctx, x, y + 28, bw, 22, 11); ctx.fill();
      var gw = Math.max(0, (bw - 6) * hp);
      ctx.fillStyle = hp > 0.5 ? '#4ade80' : hp > 0.25 ? '#facc15' : '#f87171';
      if (gw > 0) { roundRect(ctx, left ? x + 3 : x + 3 + (bw - 6 - gw), y + 31, gw, 16, 8); ctx.fill(); }
      ctx.font = font(13); ctx.fillStyle = '#fff'; ctx.textAlign = left ? 'left' : 'right';
      ctx.fillText(Math.ceil(f[i].hp) + ' / ' + Math.round(f[i].maxHp) + ' HP', left ? x + 10 : x + bw - 10, y + 33);
    }
    if (m.drawHudExtra) m.drawHudExtra(ctx, f[i], i, left ? x : x + bw, y + (m.usesHP ? 58 : 30), left);
    ctx.restore();
  }
};
Match.prototype.drawBanner = function (ctx) {
  var W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
  if (this.hideBanner) return;
  if (this.state === 'intro') {
    var CD = CONFIG.COUNTDOWN, c = Math.min(CD.words.length - 1, Math.floor(this.stateT / CD.step));
    var k = (this.stateT % CD.step) / CD.step, s = 1.6 - Math.min(1, k * 3) * 0.6;
    var info = this.mode.info || {}, col = info.color || '#fde047';
    var total = CD.step * CD.words.length, t = this.stateT;
    // dim + slide-in round card
    var enter = Math.min(1, t * 6), leave = Math.min(1, (total - t) * 6), a = Math.min(enter, leave);
    ctx.save(); ctx.globalAlpha = 0.45 * a; ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H); ctx.restore();
    var cw = 620, ch = 340, cx = W / 2, cy = H / 2 - 40, pop = 1 + (1 - enter) * 0.12;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(pop, pop);
    ctx.fillStyle = 'rgba(15,23,42,0.88)'; roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 26); ctx.fill();
    ctx.fillStyle = col; roundRect(ctx, -cw / 2, -ch / 2, cw, 14, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 26); ctx.stroke();
    bigText(ctx, (info.icon || '') + ' ' + (info.name || ''), 0, -ch / 2 + 62, 40, col);
    bigText(ctx, 'ROUND ' + this.round, 0, -ch / 2 + 122, 56, '#fde047');
    // round-win pips (first to ROUNDS_TO_WIN)
    var need = CONFIG.ROUNDS_TO_WIN, pw = 22, gap = 10, totW = need * pw + (need - 1) * gap;
    for (var side = 0; side < 2; side++) {
      for (var p = 0; p < need; p++) {
        var px = (side === 0 ? -1 : 1) * (60 + p * (pw + gap)) - (side === 0 ? pw : 0);
        var won = this.roundWins[side] > p;
        ctx.fillStyle = won ? this.fighters[side].color : 'rgba(255,255,255,0.15)';
        roundRect(ctx, px, -ch / 2 + 150, pw, 10, 5); ctx.fill();
      }
    }
    bigText(ctx, this.names[0], -cw / 2 + 90, -ch / 2 + 122, 26, this.fighters[0].color);
    bigText(ctx, this.names[1], cw / 2 - 90, -ch / 2 + 122, 26, this.fighters[1].color);
    if (info.hint) bigText(ctx, info.hint, 0, ch / 2 - 58, 24, 'rgba(255,255,255,0.85)');
    ctx.restore();
    // big countdown number below the card
    ctx.save(); ctx.globalAlpha = a;
    bigText(ctx, CD.words[c], cx, cy + ch / 2 + 110, 140 * s, '#fff');
    ctx.restore();
    return;
  }
  if (this.state === 'fight' && this.round !== this.goShownRound) {
    var CD2 = CONFIG.COUNTDOWN, gt = this.elapsed;
    if (gt >= CD2.goTime) { this.goShownRound = this.round; }
    else {
      var pop = Math.min(1, gt * 6), fade = Math.min(1, (CD2.goTime - gt) * 4);
      ctx.save(); ctx.globalAlpha = fade;
      ctx.translate(W / 2, H / 2); ctx.rotate(-0.05); ctx.scale(0.5 + pop * 0.5, 0.5 + pop * 0.5);
      bigText(ctx, CD2.go, 0, 0, 84, '#fde047');
      ctx.restore();
    }
  }
  if ((this.state === 'roundOver' || this.state === 'sd' || this.state === 'matchOver') && this.banner) {
    var b = this.banner, p = Math.min(1, this.stateT * 4);
    ctx.fillStyle = 'rgba(15,23,42,0.55)'; ctx.fillRect(0, H / 2 - 110, W, 200);
    bigText(ctx, b.text, W / 2, H / 2 - 30, 96 * (0.6 + p * 0.4), b.color);
    bigText(ctx, b.sub, W / 2, H / 2 + 50, 36, '#fff');
  }
};

// =====================================================================
// Mode registry + helpers shared by the 4 game modes
// =====================================================================
var Modes = {
  list: {},
  register: function (id, ctor) { this.list[id] = ctor; },
  create: function (id) { var C = this.list[id]; if (!C) throw new Error('Unknown mode ' + id); return new C(); },
  info: function (id) { for (var i = 0; i < CONFIG.MODES.length; i++) if (CONFIG.MODES[i].id === id) return CONFIG.MODES[i]; return CONFIG.MODES[0]; }
};
var ModeUtil = {
  drawArenaStructure: function (ctx) {
    var A = CONFIG.ARENA, W = CONFIG.WIDTH;
    ctx.save();
    // Open-air tournament gantry, lamps and distant terraces; all behind gameplay.
    ctx.fillStyle = A.shadow;
    for (var row = 0; row < 3; row++) ctx.fillRect(70 - row * 20, 540 + row * 32, W - 140 + row * 40, 22);
    ctx.strokeStyle = A.structure; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(92, 650); ctx.lineTo(92, 140); ctx.lineTo(W - 92, 140); ctx.lineTo(W - 92, 650); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = A.edge;
    for (var x = 100; x < W - 130; x += 54) {
      ctx.beginPath(); ctx.moveTo(x, 130); ctx.lineTo(x + 27, 152); ctx.lineTo(x + 54, 130); ctx.stroke();
    }
    for (var side = 0; side < 2; side++) {
      var px = side === 0 ? 92 : W - 92;
      for (var y = 175; y < 620; y += 70) {
        ctx.beginPath(); ctx.moveTo(px - 8, y); ctx.lineTo(px + 8, y + 35); ctx.lineTo(px - 8, y + 70); ctx.stroke();
      }
      ctx.fillStyle = side === 0 ? CONFIG.COLORS.p1 : (SETTINGS.colorblind ? CONFIG.COLORS.p2CB : CONFIG.COLORS.p2);
      ctx.beginPath(); ctx.moveTo(px - 28, 200); ctx.lineTo(px + 28, 200); ctx.lineTo(px + 28, 302); ctx.lineTo(px, 324); ctx.lineTo(px - 28, 302); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = A.structure; roundRect(ctx, 174, 121, 300, 54, 6); ctx.fill();
    ctx.font = font(26); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = A.banner; ctx.fillText('STICK CLASH', 324, 149);
    for (var lamp = 0; lamp < 6; lamp++) {
      ctx.fillStyle = A.structure; ctx.fillRect(184 + lamp * 180, 151, 30, 18);
      ctx.fillStyle = A.light; ctx.fillRect(188 + lamp * 180, 166, 22, 5);
    }
    ctx.restore();
  },
  // Shared animated arena layer drawn over every mode's sky: swinging spotlights,
  // drifting sparks, a cheering stickman crowd and a soft vignette. Render-only.
  drawAmbience: function (ctx, match) {
    var W = CONFIG.WIDTH, H = CONFIG.HEIGHT, t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    var col = (match.mode.info && match.mode.info.color) || '#fde047';
    ctx.save();
    // spotlights
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      var ox = W * (0.15 + i * 0.35), a = Math.sin(t * 0.6 + i * 2.1) * 0.35;
      ctx.save(); ctx.translate(ox, -20); ctx.rotate(a);
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(150, H); ctx.lineTo(-150, H); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // drifting sparks
    for (var k = 0; k < 28; k++) {
      var sx = (k * 197.3 + t * (12 + (k % 5) * 6)) % (W + 40) - 20;
      var sy = (k * 83.7 - t * (18 + (k % 7) * 5)) % H; if (sy < 0) sy += H;
      var tw = 0.35 + 0.35 * Math.sin(t * 3 + k);
      ctx.fillStyle = 'rgba(255,240,200,' + tw.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, 1.2 + (k % 3), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // crowd silhouettes along the bottom
    var hype = match.state === 'fight' ? 1 : 0.4;
    ctx.fillStyle = 'rgba(8,10,25,0.78)'; ctx.strokeStyle = 'rgba(8,10,25,0.78)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (var c = 0; c < 34; c++) {
      var cx = c * 40 + (c % 2) * 14, base = H - 4 - (c % 3) * 10;
      var bob = Math.abs(Math.sin(t * (4 + (c % 4)) + c)) * 8 * hype;
      var hy = base - 46 - bob;
      ctx.beginPath(); ctx.arc(cx, hy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, hy + 8); ctx.lineTo(cx, base);
      var up = Math.sin(t * 5 + c * 1.7) > 0.2 - hype * 0.3;
      ctx.moveTo(cx, hy + 16); ctx.lineTo(cx - 12, up ? hy - 6 : hy + 30);
      ctx.moveTo(cx, hy + 16); ctx.lineTo(cx + 12, up ? hy - 6 : hy + 30);
      ctx.stroke();
      if (c % 6 === 2 && up) { ctx.save(); ctx.fillStyle = c % 12 === 2 ? CONFIG.COLORS.p1 : CONFIG.COLORS.p2; ctx.fillRect(cx + 10, hy - 26, 22, 14); ctx.restore(); }
    }
    // vignette
    var v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v; ctx.fillRect(-400, -200, W + 800, H + 400);
    ctx.restore();
  },
  // HP + ring-out rules (Toy Drop, Giant vs Tiny). Simultaneous KO/time-out tie => sudden death.
  hpCheck: function (match) {
    var a = match.fighters[0], b = match.fighters[1];
    var aDead = a.out || a.hp <= 0, bDead = b.out || b.hp <= 0;
    if (aDead && bDead) return { tie: true };
    if (aDead) return { winner: 1, reason: a.out ? 'RING OUT!' : 'K.O.!' };
    if (bDead) return { winner: 0, reason: b.out ? 'RING OUT!' : 'K.O.!' };
    if (match.mode.roundTime && match.timeLeft <= 0) {
      if (Math.ceil(a.hp) === Math.ceil(b.hp)) return { tie: true };
      return { winner: a.hp > b.hp ? 0 : 1, reason: 'TIME!' };
    }
    return null;
  },
  ringOutCheck: function (match) {
    var a = match.fighters[0], b = match.fighters[1];
    if (a.out && b.out) return { tie: true };
    if (a.out) return { winner: 1, reason: 'RING OUT!' };
    if (b.out) return { winner: 0, reason: 'RING OUT!' };
    return null;
  },
  // Soft body push so fighters never stay inside each other (also after Giant/Tiny scaling)
  separate: function (match, dt) {
    var a = match.fighters[0], b = match.fighters[1];
    if (a.out || b.out || !a.onGround || !b.onGround) return;
    if (Math.abs(a.y - b.y) > 4) return;
    var min = (a.halfW() + b.halfW()) * 0.8, dx = b.x - a.x;
    if (Math.abs(dx) >= min) return;
    var dir = dx === 0 ? (a.idx === 0 ? 1 : -1) : (dx > 0 ? 1 : -1);
    var push = Math.min(220 * dt, (min - Math.abs(dx)) * 0.5);
    var tm = a.mass + b.mass;
    a.x -= dir * push * (b.mass / tm) * 2; b.x += dir * push * (a.mass / tm) * 2;
  },
  stars: (function () { var s = []; for (var i = 0; i < 90; i++) s.push({ x: Math.random() * 2400 - 560, y: Math.random() * 700 - 200, r: Math.random() * 1.8 + 0.4, p: Math.random() * 6 }); return s; })(),
  drawStars: function (ctx, t) {
    ctx.fillStyle = '#fff';
    for (var i = 0; i < this.stars.length; i++) { var s = this.stars[i]; ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 1.5 + s.p); ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2); }
    ctx.globalAlpha = 1;
  },
  drawHills: function (ctx, color, baseY, amp, seed) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-600, 1400);
    for (var x = -600; x <= 1900; x += 40) ctx.lineTo(x, baseY - Math.abs(Math.sin(x * 0.004 + seed) * amp) - Math.sin(x * 0.011 + seed * 2) * amp * 0.25);
    ctx.lineTo(1900, 1400); ctx.closePath(); ctx.fill();
  },
  time: 0,
  // Static backdrop (sky, hills, stars) is rendered once into an offscreen canvas and blitted each frame.
  _bg: { key: null, s: 0, canvas: null },
  cachedBg: function (ctx, key, fn) {
    var c = this._bg, s = Math.min(1.5, Engine.scale * Engine.dpr);
    var cacheKey = key + (SETTINGS.colorblind ? ':cb' : ':normal');
    if (c.key !== cacheKey || Math.abs(c.s - s) > 0.01 || !c.canvas) {
      c.canvas = c.canvas || document.createElement('canvas');
      c.canvas.width = Math.ceil(2080 * s); c.canvas.height = Math.ceil(1320 * s);
      var g = c.canvas.getContext('2d');
      g.setTransform(s, 0, 0, s, 400 * s, 300 * s);
      fn(g);
      if (key !== 'menu') this.drawArenaStructure(g);
      c.key = cacheKey; c.s = s;
    }
    ctx.drawImage(c.canvas, -400, -300, 2080, 1320);
  },
  drawStaticStars: function (ctx) {
    ctx.fillStyle = '#fff';
    for (var i = 0; i < this.stars.length; i++) { var s = this.stars[i]; ctx.globalAlpha = 0.35 + 0.5 * ((i * 37) % 10) / 10; ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2); }
    ctx.globalAlpha = 1;
  }
};
