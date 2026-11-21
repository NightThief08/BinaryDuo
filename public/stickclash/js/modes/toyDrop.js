/* Mode 2: RANDOM TOY DROP — bridge over water, HP bars, a random toy parachutes in every 8 seconds. */
var ITEM_TYPES = ['glove', 'trampoline', 'bowling', 'laser', 'umbrella'];
var ITEM_NAMES = { glove: 'BIG GLOVE!', trampoline: 'TRAMPOLINE!', bowling: 'BOWLING BALL!', laser: 'LASER!', umbrella: 'UMBRELLA!' };

function drawItemIcon(ctx, type, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 40, s / 40);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (type === 'glove') {
    ctx.fillStyle = '#ef4444'; ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(2, -3, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-11, -1, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(-9, 10, 20, 8); ctx.strokeRect(-9, 10, 20, 8);
  } else if (type === 'trampoline') {
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-16, 4); ctx.lineTo(-12, 16); ctx.moveTo(16, 4); ctx.lineTo(12, 16); ctx.stroke();
    ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.ellipse(0, 2, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.ellipse(0, 1, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'bowling') {
    ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#64748b'; ctx.beginPath(); ctx.arc(-4, -6, 2.6, 0, Math.PI * 2); ctx.arc(3, -7, 2.6, 0, Math.PI * 2); ctx.arc(-1, 0, 2.6, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'laser') {
    ctx.save(); ctx.rotate(-0.5);
    ctx.fillStyle = '#94a3b8'; roundRect(ctx, -16, -4, 28, 8, 3); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.fillRect(-4, -2, 6, 4);
    ctx.restore();
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(14, -12, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(239,68,68,0.35)'; ctx.beginPath(); ctx.arc(14, -12, 9, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'umbrella') {
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 14); ctx.arc(-4, 14, 4, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.moveTo(-18, -2); ctx.quadraticCurveTo(0, -30, 18, -2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function ToyDropMode() { this.id = 'toydrop'; this.usesHP = true; this.roundTime = CONFIG.TOYDROP.roundTime; this.sdHint = '1 HP each · next hit wins'; this.t = 0; }
ToyDropMode.prototype.createFighters = function () { return [new Fighter(0, 600, 520, 1), new Fighter(1, 1320, 520, -1)]; };
ToyDropMode.prototype.setupRound = function (match) {
  var T = CONFIG.TOYDROP;
  this.bridge = { x: T.bridgeX, y: T.bridgeY, w: T.bridgeW, h: 26, solid: true };
  match.platforms = [this.bridge];
  this.items = []; this.tramps = []; this.balls = []; this.dots = [];
  this.spawnT = 3;
  var f = match.fighters;
  f[0].reset(this.bridge.x + 360, this.bridge.y, 1); f[1].reset(this.bridge.x + this.bridge.w - 360, this.bridge.y, -1);
  for (var i = 0; i < 2; i++) { f[i].onGround = true; f[i].ground = this.bridge; f[i].setMaxHp(T.hp); f[i].splashed = false; }
};
ToyDropMode.prototype.spawnItem = function (match) {
  var b = this.bridge, f = match.fighters, best = null, bestD = -1;
  for (var tries = 0; tries < 24; tries++) {
    var x = b.x + 60 + Math.random() * (b.w - 120);
    var d = Math.min(Math.abs(x - f[0].x), Math.abs(x - f[1].x));
    for (var k = 0; k < this.items.length; k++) d = Math.min(d, Math.abs(x - this.items[k].x) * 1.5);
    if (d > bestD) { bestD = d; best = x; }
    if (d > 140) break;
  }
  var type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
  this.items.push({ type: type, x: best, y: -40, landed: false, life: CONFIG.TOYDROP.itemLife, sway: Math.random() * 6 });
};
ToyDropMode.prototype.pickup = function (f, it, match) {
  var T = CONFIG.TOYDROP, opp = match.opponentOf(f);
  Sfx.pickup();
  FX.text(f.x, f.headTop() - 30, ITEM_NAMES[it.type], '#fde047');
  if (it.type === 'glove') { f.glove = T.glove.time; f.stats.items++; }
  else if (it.type === 'umbrella') { f.umbrella = T.umbrella.time; f.stats.items++; }
  else if (it.type === 'trampoline') {
    var x = Physics.clamp(f.x, this.bridge.x + 50, this.bridge.x + this.bridge.w - 50);
    this.tramps.push({ x: x, w: T.trampoline.width, t: T.trampoline.time, squish: 0 });
    f.stats.items++;
  } else f.item = it.type; // bowling / laser: held, used with HIT
};
ToyDropMode.prototype.onAttack = function (f, match) {
  if (!f.item) return false;
  var T = CONFIG.TOYDROP, opp = match.opponentOf(f);
  if (f.item === 'bowling') {
    this.balls.push({ x: f.x + f.facing * 30, y: f.y - T.bowling.radius, vx: f.facing * T.bowling.speed, vy: 0, owner: f, rot: 0, life: T.bowling.life, onBridge: f.onGround });
    Sfx.roll();
  } else if (f.item === 'laser') {
    var dot = { x: opp.x + (Math.random() < 0.5 ? -60 : 60), tx: 0, t: T.laser.time, victim: opp };
    dot.tx = this.randomDotTarget();
    this.dots.push(dot);
    opp.chase = T.laser.time; opp.chaseDot = dot;
    Sfx.laser();
  }
  f.item = null; f.stats.items++;
  return true;
};
ToyDropMode.prototype.randomDotTarget = function () { return this.bridge.x + 60 + Math.random() * (this.bridge.w - 120); };
ToyDropMode.prototype.onLand = function (f, p, impact) {
  for (var i = 0; i < this.tramps.length; i++) {
    var tr = this.tramps[i];
    if (Math.abs(f.x - tr.x) < tr.w / 2 + 4) {
      f.vy = -CONFIG.TOYDROP.trampoline.bounce; f.onGround = false; f.ground = null; tr.squish = 0.3;
      Sfx.bounce(); FX.text(f.x, f.y - 40, 'BOING!', '#93c5fd');
      return;
    }
  }
};
ToyDropMode.prototype.idleUpdate = function (dt, match) {
  this.t += dt;
  var f = match.fighters;
  for (var i = 0; i < 2; i++) if (f[i].y > 690 && !f[i].splashed) { f[i].splashed = true; FX.splash(f[i].x, 690); Sfx.fall(); }
};
ToyDropMode.prototype.update = function (dt, match) {
  var T = CONFIG.TOYDROP, b = this.bridge, f = match.fighters, i, j;
  this.idleUpdate(dt, match);
  ModeUtil.separate(match, dt);
  this.spawnT -= dt;
  if (this.spawnT <= 0) { this.spawnT = T.itemEvery; if (this.items.length < 2) this.spawnItem(match); }
  // items: parachute down, then wait to be picked up
  for (i = this.items.length - 1; i >= 0; i--) {
    var it = this.items[i];
    if (!it.landed) { it.y += T.itemFallSpeed * dt; it.sway += dt * 2; if (it.y >= b.y) { it.y = b.y; it.landed = true; FX.burst(it.x, b.y, '#fff', 5, 80); } }
    else { it.life -= dt; if (it.life <= 0) { this.items.splice(i, 1); continue; } }
    for (j = 0; j < 2; j++) {
      var fi = f[j];
      if (fi.out || !fi.slotFree() || fi.hp <= 0) continue;
      if (Math.abs(fi.x - it.x) < fi.halfW() + 22 && it.y > fi.y - fi.height() - 20 && it.y < fi.y + 20) { this.pickup(fi, it, match); this.items.splice(i, 1); break; }
    }
  }
  for (i = this.tramps.length - 1; i >= 0; i--) { var tr = this.tramps[i]; tr.t -= dt; tr.squish = Math.max(0, tr.squish - dt); if (tr.t <= 0) this.tramps.splice(i, 1); }
  // bowling balls roll and knock over whoever they touch (except the thrower)
  for (i = this.balls.length - 1; i >= 0; i--) {
    var bl = this.balls[i], r = T.bowling.radius;
    bl.life -= dt;
    bl.x += bl.vx * dt; bl.rot += bl.vx * dt / r;
    var over = bl.x > b.x && bl.x < b.x + b.w;
    if (over && bl.y >= b.y - r - 2 && bl.vy >= 0) { bl.y = b.y - r; bl.vy = 0; }
    else { bl.vy += 2000 * dt; bl.y += bl.vy * dt; }
    var victim = match.opponentOf(bl.owner);
    if (!victim.out && victim.overlapsCircle({ x: bl.x, y: bl.y, r: r })) {
      victim.takeHit(bl.owner, { dmg: 16, kx: 720, ky: 520, stun: 0.9, x: bl.x, y: bl.y - 10, big: true }, match);
      FX.text(bl.x, bl.y - 60, 'STRIKE!', '#fde047');
      this.balls.splice(i, 1); continue;
    }
    if (bl.life <= 0 || bl.y > CONFIG.KILL_Y) this.balls.splice(i, 1);
  }
  // laser dots wander; the victim chases them
  for (i = this.dots.length - 1; i >= 0; i--) {
    var d = this.dots[i];
    d.t -= dt;
    var dir = d.tx > d.x ? 1 : -1;
    d.x += dir * Math.min(Math.abs(d.tx - d.x), 340 * dt);
    if (Math.abs(d.tx - d.x) < 4) d.tx = this.randomDotTarget();
    if (d.t <= 0) this.dots.splice(i, 1);
  }
};
ToyDropMode.prototype.checkEnd = function (match) { return ModeUtil.hpCheck(match); };
ToyDropMode.prototype.suddenDeath = function (match) {
  this.setupRound(match);
  match.fighters[0].hp = 1; match.fighters[1].hp = 1;
  match.timeLeft = 15;
};
ToyDropMode.prototype.drawBackground = function (ctx) {
  ModeUtil.cachedBg(ctx, 'toydrop', function (g) {
    skyGradient(g, '#38bdf8', '#e0f2fe');
    ModeUtil.drawHills(g, '#86efac', 600, 90, 2);
    ModeUtil.drawHills(g, '#4ade80', 660, 60, 5);
    var gr = g.createLinearGradient(0, 680, 0, 1000); gr.addColorStop(0, '#0284c7'); gr.addColorStop(1, '#0c4a6e');
    g.fillStyle = gr; g.fillRect(-400, 690, 2080, 330);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (var i = 0; i < 5; i++) { var cx = ((i * 330 + this.t * 12) % 1900) - 300, cy = 90 + (i % 3) * 60; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 7); ctx.arc(cx + 34, cy - 12, 38, 0, 7); ctx.arc(cx + 72, cy, 28, 0, 7); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
  for (var w = 0; w < 3; w++) { ctx.beginPath(); for (var x = -400; x < 1700; x += 40) ctx.lineTo(x, 700 + w * 26 + Math.sin(x * 0.03 + this.t * 2 + w) * 4); ctx.stroke(); }
};
ToyDropMode.prototype.drawWorld = function (ctx) {
  var b = this.bridge;
  // pillars + planks
  ctx.fillStyle = '#78350f';
  ctx.fillRect(b.x + 40, b.y + 20, 26, 200); ctx.fillRect(b.x + b.w - 66, b.y + 20, 26, 200); ctx.fillRect(b.x + b.w / 2 - 13, b.y + 20, 26, 200);
  ctx.fillStyle = '#b45309'; roundRect(ctx, b.x, b.y, b.w, b.h, 6); ctx.fill();
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2;
  for (var x = b.x + 40; x < b.x + b.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, b.y + 2); ctx.lineTo(x, b.y + b.h - 2); ctx.stroke(); }
  ctx.fillStyle = '#fbbf24'; ctx.fillRect(b.x, b.y, b.w, 5);
  // trampolines
  for (var i = 0; i < this.tramps.length; i++) {
    var tr = this.tramps[i], sq = tr.squish * 20;
    if (tr.t < 2 && Math.floor(tr.t * 8) % 2 === 0) continue;
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(tr.x - tr.w / 2 + 6, b.y); ctx.lineTo(tr.x - tr.w / 2 + 10, b.y - 18); ctx.moveTo(tr.x + tr.w / 2 - 6, b.y); ctx.lineTo(tr.x + tr.w / 2 - 10, b.y - 18); ctx.stroke();
    ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.ellipse(tr.x, b.y - 18 + sq * 0.3, tr.w / 2, 8 - sq * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.ellipse(tr.x, b.y - 19 + sq * 0.5, tr.w / 2 - 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  // items + shadows + parachutes
  for (var j = 0; j < this.items.length; j++) {
    var it = this.items[j];
    if (!it.landed) {
      var k = Math.max(0.2, Math.min(1, (it.y + 40) / (b.y + 40)));
      ctx.fillStyle = 'rgba(0,0,0,' + (0.15 + k * 0.25) + ')'; ctx.beginPath(); ctx.ellipse(it.x, b.y + 2, 26 * k, 6 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(it.x, b.y - 4); ctx.lineTo(it.x, it.y + 20); ctx.stroke(); ctx.setLineDash([]);
      var sx = it.x + Math.sin(it.sway) * 6;
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx - 30, it.y - 62); ctx.lineTo(it.x, it.y - 18); ctx.lineTo(sx + 30, it.y - 62); ctx.stroke();
      ctx.fillStyle = j % 2 ? '#f97316' : '#e11d48';
      ctx.beginPath(); ctx.moveTo(sx - 34, it.y - 60); ctx.quadraticCurveTo(sx, it.y - 104, sx + 34, it.y - 60); ctx.closePath(); ctx.fill();
    } else if (it.life < 3 && Math.floor(it.life * 8) % 2 === 0) continue;
    var bob = it.landed ? Math.sin(this.t * 4 + j) * 3 : 0;
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(it.x, it.y - 22 + bob, 21, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3; ctx.stroke();
    drawItemIcon(ctx, it.type, it.x, it.y - 22 + bob, 30);
  }
  // bowling balls
  for (var m = 0; m < this.balls.length; m++) {
    var bl = this.balls[m];
    ctx.save(); ctx.translate(bl.x, bl.y); ctx.rotate(bl.rot); drawItemIcon(ctx, 'bowling', 0, 0, 40); ctx.restore();
  }
  // laser dots
  for (var n = 0; n < this.dots.length; n++) {
    var d = this.dots[n], pulse = 6 + Math.sin(this.t * 30) * 2;
    ctx.fillStyle = 'rgba(239,68,68,0.35)'; ctx.beginPath(); ctx.arc(d.x, b.y - 3, pulse * 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(d.x, b.y - 3, pulse * 0.8, 0, 7); ctx.fill();
  }
};
ToyDropMode.prototype.drawTagExtra = function (ctx, f, x, y) {
  if (f.chase > 0) bigText(ctx, '!?', x + 34, y - 18, 30, '#fde047');
};
ToyDropMode.prototype.drawHudExtra = function (ctx, f, i, x, y, left) {
  var type = f.item || (f.glove > 0 ? 'glove' : f.umbrella > 0 ? 'umbrella' : null);
  var bx = left ? x + 24 : x - 24;
  ctx.fillStyle = 'rgba(15,23,42,0.6)'; ctx.beginPath(); ctx.arc(bx, y + 22, 22, 0, 7); ctx.fill();
  ctx.strokeStyle = type ? '#fde047' : 'rgba(255,255,255,0.3)'; ctx.lineWidth = 3; ctx.stroke();
  if (type) {
    drawItemIcon(ctx, type, bx, y + 22, 28);
    var timer = type === 'glove' ? f.glove / CONFIG.TOYDROP.glove.time : type === 'umbrella' ? f.umbrella / CONFIG.TOYDROP.umbrella.time : 1;
    if (timer < 1) { ctx.strokeStyle = '#fde047'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bx, y + 22, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timer); ctx.stroke(); }
    if (f.item) { ctx.font = font(13); ctx.fillStyle = '#fff'; ctx.textAlign = left ? 'left' : 'right'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = '#0f172a'; var tx = left ? bx + 30 : bx - 30; ctx.strokeText('HIT to use', tx, y + 22); ctx.fillText('HIT to use', tx, y + 22); }
  }
};
Modes.register('toydrop', ToyDropMode);
