/* Mode 3: CRUMBLING FLOOR DUEL — 10 ice tiles; landing cracks, second landing shatters. Auto-collapse after 20s. */
function CrumbleMode() { this.id = 'crumble'; this.usesHP = false; this.roundTime = 0; this.sdHint = 'The floor is collapsing!'; this.t = 0; }
CrumbleMode.prototype.createFighters = function () { return [new Fighter(0, 450, 500, 1), new Fighter(1, 1470, 500, -1)]; };
CrumbleMode.prototype.buildTiles = function (keep) {
  var C = CONFIG.CRUMBLE, total = C.tiles * C.tileW + (C.tiles - 1) * C.gap, x0 = (CONFIG.WORLD.W - total) / 2;
  var tiles = [];
  for (var i = 0; i < C.tiles; i++) {
    var raised = (i === 3 || i === 6);
    var t = { x: x0 + i * (C.tileW + C.gap), y: C.y - (raised ? C.raised : 0), w: C.tileW, h: C.tileH + (raised ? C.raised : 0), solid: true, sides: raised, tile: true, idx: i,
      state: 0, warn: 0, fall: 0, fallY: 0, rot: 0, cracks: [] };
    for (var c = 0; c < 4; c++) { // pre-generated crack polylines
      var pts = [], px = t.w * (0.2 + Math.random() * 0.6), py = 2;
      for (var k = 0; k < 4; k++) { pts.push([px, py]); px += (Math.random() - 0.5) * 30; py += 6 + Math.random() * 5; }
      t.cracks.push(pts);
    }
    if (keep && keep.indexOf(i) < 0) { t.solid = false; t.state = 3; }
    tiles.push(t);
  }
  return tiles;
};
CrumbleMode.prototype.setupRound = function (match, keep) {
  this.tiles = this.buildTiles(keep);
  match.platforms = this.tiles;
  var a = keep ? 3 : 1, b = keep ? 6 : 8;
  this.place(match.fighters[0], this.tiles[a], 1);
  this.place(match.fighters[1], this.tiles[b], -1);
  this.time = keep ? CONFIG.CRUMBLE.collapseAfter : 0;
  this.collapseT = keep ? 1 : 0;
};
CrumbleMode.prototype.place = function (f, tile, facing) {
  f.reset(tile.x + tile.w / 2, tile.y, facing);
  f.onGround = true; f.ground = tile;
};
CrumbleMode.prototype.crack = function (t) {
  if (!t.solid) return;
  if (t.state === 0) { t.state = 1; Sfx.crack(); FX.burst(t.x + t.w / 2, t.y, '#e0f2fe', 6, 120); }
  else this.shatter(t);
};
CrumbleMode.prototype.shatter = function (t) {
  if (!t.solid) return;
  t.solid = false; t.state = 2; t.warn = 0; t.fall = 0;
  FX.shards(t.x, t.y, t.w, '#bae6fd', 16); FX.shards(t.x, t.y, t.w, '#ffffff', 8);
  Sfx.shatter(); FX.shake(6);
};
CrumbleMode.prototype.onLand = function (f, tile) { if (tile.tile) this.crack(tile); };
CrumbleMode.prototype.modifyHit = function (att, vic, info) { info.kx *= CONFIG.CRUMBLE.knockMul; info.ky *= 1.15; };
CrumbleMode.prototype.idleUpdate = function (dt) {
  this.t += dt;
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i];
    if (t.state === 2) { t.fall += dt; t.fallY += (200 + t.fall * 900) * dt; t.rot += dt * (i % 2 ? 1.5 : -1.5); if (t.fall > 1.5) t.state = 3; }
  }
};
CrumbleMode.prototype.update = function (dt, match) {
  var C = CONFIG.CRUMBLE;
  this.idleUpdate(dt);
  ModeUtil.separate(match, dt);
  this.time += dt;
  if (this.time >= C.collapseAfter) {
    this.collapseT -= dt;
    if (this.collapseT <= 0) {
      this.collapseT = C.collapseEvery;
      var cands = this.tiles.filter(function (t) { return t.solid && t.warn <= 0; });
      if (cands.length) { var pick = cands[Math.floor(Math.random() * cands.length)]; pick.warn = C.warn; Sfx.warn(); }
    }
  }
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i];
    if (t.warn > 0) { t.warn -= dt; if (t.warn <= 0) this.shatter(t); }
  }
};
CrumbleMode.prototype.checkEnd = function (match) { return ModeUtil.ringOutCheck(match); };
CrumbleMode.prototype.suddenDeath = function (match) { this.setupRound(match, [3, 4, 5, 6]); };
CrumbleMode.prototype.hudTimer = function (match) {
  var left = CONFIG.CRUMBLE.collapseAfter - this.time;
  if (left > 0) return { text: String(Math.ceil(left)), color: left <= 5 ? '#fbbf24' : '#fff' };
  return { text: 'COLLAPSE', color: '#f87171', small: true };
};
CrumbleMode.prototype.drawBackground = function (ctx) {
  ModeUtil.cachedBg(ctx, 'crumble', function (g) {
    skyGradient(g, '#0b1026', '#3b0764');
    ModeUtil.drawStaticStars(g);
    g.fillStyle = 'rgba(253,224,71,0.9)'; g.beginPath(); g.arc(1040, 120, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b1026'; g.beginPath(); g.arc(1058, 108, 40, 0, Math.PI * 2); g.fill();
    ModeUtil.drawHills(g, '#1e1b4b', 640, 120, 1);
    ModeUtil.drawHills(g, '#170f3a', 720, 70, 4);
    var gr = g.createLinearGradient(0, 700, 0, 1020); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000');
    g.fillStyle = gr; g.fillRect(-400, 700, 2080, 320);
  });
};
CrumbleMode.prototype.drawWorld = function (ctx) {
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i];
    if (t.state === 3) continue;
    ctx.save();
    if (t.state === 2) { ctx.translate(t.x + t.w / 2, t.y + t.fallY); ctx.rotate(t.rot); ctx.translate(-t.w / 2, 0); ctx.globalAlpha = Math.max(0, 1 - t.fall / 1.5); }
    else ctx.translate(t.x, t.y);
    var g = ctx.createLinearGradient(0, 0, 0, t.h);
    g.addColorStop(0, t.state === 0 ? '#e0f2fe' : '#bae6fd'); g.addColorStop(1, t.state === 0 ? '#38bdf8' : '#0ea5e9');
    ctx.fillStyle = g; roundRect(ctx, 0, 0, t.w, t.h, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(6, 3, t.w - 12, 4);
    ctx.strokeStyle = 'rgba(12,74,110,0.6)'; ctx.lineWidth = 2; roundRect(ctx, 0, 0, t.w, t.h, 6); ctx.stroke();
    if (t.state >= 1) {
      ctx.strokeStyle = '#0c4a6e'; ctx.lineWidth = 2;
      for (var c = 0; c < t.cracks.length; c++) { var pts = t.cracks[c]; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], Math.min(t.h - 2, pts[k][1])); ctx.stroke(); }
    }
    if (t.warn > 0 && Math.floor(t.warn * 10) % 2 === 0) { ctx.fillStyle = 'rgba(239,68,68,0.65)'; roundRect(ctx, 0, 0, t.w, t.h, 6); ctx.fill(); }
    ctx.restore();
  }
};
Modes.register('crumble', CrumbleMode);
