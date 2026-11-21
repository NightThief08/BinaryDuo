/* Mode 4: GIANT vs TINY SWAP — sizes swap every few seconds. Giant chases, Tiny runs. */
function GiantTinyMode() { this.id = 'giant'; this.usesHP = true; this.roundTime = CONFIG.GIANTTINY.roundTime; this.sdHint = '1 HP each · next hit wins'; this.t = 0; this.nextGiant = Math.random() < 0.5 ? 0 : 1; }
GiantTinyMode.prototype.createFighters = function () { return [new Fighter(0, 600, 560, 1), new Fighter(1, 1320, 560, -1)]; };
GiantTinyMode.prototype.setupRound = function (match) {
  var G = CONFIG.GIANTTINY;
  this.stage = { x: 285, y: 560, w: 1350, h: 40, solid: true };
  this.left = { x: 405, y: 390, w: 330, h: 14, solid: true, oneWay: true };
  this.right = { x: 1185, y: 390, w: 330, h: 14, solid: true, oneWay: true };
  match.platforms = [this.stage, this.left, this.right];
  var f = match.fighters;
  f[0].reset(600, 560, 1); f[1].reset(1320, 560, -1);
  for (var i = 0; i < 2; i++) { f[i].onGround = true; f[i].ground = this.stage; f[i].setMaxHp(G.hp); }
  this.swapT = G.swapEvery; this.warned = false; this.swapBanner = 0; this.stompCD = 0;
  this.assign(match, this.nextGiant, true);
};
GiantTinyMode.prototype.applyRole = function (f, role, instant) {
  var R = CONFIG.GIANTTINY[role];
  f.role = role; f.setScale(R.size, instant);
  f.mass = R.mass; f.dmgMul = R.dmg; f.speedMul = R.speed;
  f.canDouble = role === 'tiny'; f.jumpMul = role === 'giant' ? 1.08 : 0.95;
  f.airJumps = f.canDouble && !f.onGround ? 1 : 0;
};
GiantTinyMode.prototype.assign = function (match, giantIdx, instant) {
  this.applyRole(match.fighters[giantIdx], 'giant', instant);
  this.applyRole(match.fighters[1 - giantIdx], 'tiny', instant);
  this.nextGiant = 1 - giantIdx; // roles alternate every swap
};
GiantTinyMode.prototype.idleUpdate = function (dt) { this.t += dt; if (this.swapBanner > 0) this.swapBanner -= dt; };
GiantTinyMode.prototype.update = function (dt, match) {
  var G = CONFIG.GIANTTINY, f = match.fighters;
  this.idleUpdate(dt);
  this.stompCD -= dt;
  this.swapT -= dt;
  if (this.swapT <= G.warn && !this.warned) { this.warned = true; Sfx.warn(); }
  if (this.swapT <= 0) {
    this.swapT = G.swapEvery; this.warned = false; this.swapBanner = 1.1;
    this.assign(match, this.nextGiant, false);
    FX.flash(0.35, '#ffffff'); FX.shake(8); Sfx.swap();
  }
  ModeUtil.separate(match, dt);
  // Giant stomp: land on the tiny one from above
  var g = f[0].role === 'giant' ? f[0] : f[1], t = match.opponentOf(g);
  if (!g.out && !t.out && this.stompCD <= 0 && !g.onGround && g.vy > 250 &&
      Math.abs(g.x - t.x) < g.halfW() + t.halfW() && g.y >= t.y - t.height() - 6 && g.y <= t.y + 12) {
    this.stompCD = 0.7;
    t.takeHit(g, { dmg: G.stompDamage, kx: 520, ky: 380, stun: 0.7, x: t.x, y: t.y - 10, big: true }, match);
    t.squash = 0.6; g.vy = -650;
    FX.text(t.x, t.y - 60, 'STOMP!', '#fde047');
  }
};
GiantTinyMode.prototype.modifyHit = function (att, vic, info) {
  if (att.role === 'giant') { info.kx *= 1.2; info.ky *= 1.15; }
  if (att.role === 'tiny') { info.kx *= 0.8; }
};
GiantTinyMode.prototype.checkEnd = function (match) { return ModeUtil.hpCheck(match); };
GiantTinyMode.prototype.suddenDeath = function (match) {
  var giant = match.fighters[0].role === 'giant' ? 0 : 1;
  this.nextGiant = giant;
  this.setupRound(match);
  match.fighters[0].hp = 1; match.fighters[1].hp = 1;
  match.timeLeft = 15;
};
GiantTinyMode.prototype.drawBackground = function (ctx) {
  ModeUtil.cachedBg(ctx, 'giant', function (g) {
    skyGradient(g, '#f97316', '#fde68a');
    g.fillStyle = 'rgba(254,243,199,0.9)'; g.beginPath(); g.arc(640, 300, 120, 0, 7); g.fill();
    ModeUtil.drawHills(g, '#c2410c', 560, 110, 3);
    ModeUtil.drawHills(g, '#7c2d12', 650, 70, 7);
    var gr = g.createLinearGradient(0, 640, 0, 1020); gr.addColorStop(0, 'rgba(67,20,7,0)'); gr.addColorStop(1, '#1c0a04');
    g.fillStyle = gr; g.fillRect(-400, 640, 2080, 380);
  });
};
GiantTinyMode.prototype.drawWorld = function (ctx) {
  var s = this.stage;
  ctx.fillStyle = '#57534e'; roundRect(ctx, s.x, s.y, s.w, s.h + 60, 10); ctx.fill();
  ctx.fillStyle = '#65a30d'; roundRect(ctx, s.x - 6, s.y, s.w + 12, 16, 8); ctx.fill();
  ctx.fillStyle = '#a3e635'; ctx.fillRect(s.x, s.y, s.w, 4);
  ctx.fillStyle = '#44403c';
  for (var x = s.x + 30; x < s.x + s.w - 20; x += 70) ctx.fillRect(x, s.y + 30, 34, 8);
  [this.left, this.right].forEach(function (p) {
    ctx.fillStyle = '#78716c'; roundRect(ctx, p.x, p.y, p.w, p.h + 6, 7); ctx.fill();
    ctx.fillStyle = '#a3e635'; roundRect(ctx, p.x - 3, p.y, p.w + 6, 7, 4); ctx.fill();
  });
};
GiantTinyMode.prototype.drawFront = function (ctx, match) {
  var W = CONFIG.WIDTH;
  if (match.state === 'fight' && this.swapT <= CONFIG.GIANTTINY.warn) bigText(ctx, 'SWAP IN ' + Math.ceil(this.swapT) + '…', W / 2, 200, 46, '#fde047');
  if (this.swapBanner > 0) bigText(ctx, 'SWAP!', W / 2, 260, 110 * (1 + (1.1 - this.swapBanner) * 0.3), '#ffffff');
};
GiantTinyMode.prototype.drawTagExtra = function (ctx, f, x, y) {
  if (!f.role) return;
  var giant = f.role === 'giant';
  var txt = giant ? '🦖 GIANT · CHASE!' : '🐭 TINY · RUN!';
  ctx.font = font(14); var w = ctx.measureText(txt).width + 14;
  ctx.fillStyle = giant ? 'rgba(127,29,29,0.85)' : 'rgba(20,83,45,0.85)';
  roundRect(ctx, x - w / 2, y - 44, w, 22, 8); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y - 32);
};
GiantTinyMode.prototype.drawHudExtra = function (ctx, f, i, x, y, left) {
  ctx.font = font(13); ctx.textAlign = left ? 'left' : 'right'; ctx.textBaseline = 'top';
  ctx.fillStyle = f.role === 'giant' ? '#fecaca' : '#bbf7d0';
  ctx.lineWidth = 4; ctx.strokeStyle = '#0f172a';
  var t = f.role === 'giant' ? 'GIANT' : 'TINY';
  ctx.strokeText(t, x, y + 2); ctx.fillText(t, x, y + 2);
  if (i === 0) {
    ctx.textAlign = 'left';
    var sw = 'next swap ' + Math.max(0, Math.ceil(this.swapT)) + 's';
    ctx.fillStyle = '#fff'; ctx.strokeText(sw, x + 70, y + 2); ctx.fillText(sw, x + 70, y + 2);
  }
};
Modes.register('giant', GiantTinyMode);
