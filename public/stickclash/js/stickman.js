/* Stickman fighters: a platformer Fighter (Toy Drop, Crumbling Floor, Giant vs Tiny). */
var NO_INPUT = { left: false, right: false, jump: false, hit: false, down: false, jumpPressed: false, hitPressed: false };

function newStats() { return { hits: 0, items: 0, kos: 0 }; }

function playerColors(idx) {
  var C = CONFIG.COLORS, cb = window.SETTINGS && SETTINGS.colorblind;
  if (idx === 0) return { main: C.p1, dark: C.p1Dark };
  return cb ? { main: C.p2CB, dark: C.p2CBDark } : { main: C.p2, dark: C.p2Dark };
}

// =====================================================================
// Platformer fighter
// =====================================================================
function Fighter(idx, x, y, facing) {
  this.idx = idx;
  var col = playerColors(idx);
  this.color = col.main; this.dark = col.dark;
  this.stats = newStats();
  this.hp = 100; this.maxHp = 100;
  this.legacy = true; // menu decoration: classic blue/red look until a character is assigned
  this.applyCharacter(CHARACTERS.DEFAULT);
  this.ghosts = []; this.ghostT = 0;
  this.reset(x, y, facing);
}
function shadeHex(hex, k) {
  var n = parseInt(hex.slice(1), 16);
  return 'rgb(' + (((n >> 16) * k) | 0) + ',' + ((((n >> 8) & 255) * k) | 0) + ',' + (((n & 255) * k) | 0) + ')';
}
// Character multipliers + derived attack timing (base values stay in CONFIG.FIGHTER).
Fighter.prototype.applyCharacter = function (id) {
  var F = CONFIG.FIGHTER;
  this.char = CHARACTERS.get(CHARACTERS.orDefault(id));
  this.cm = this.char.stats;
  var as = this.cm.attackSpeed;
  this.tm = { cd: F.hitCooldown / as, s: F.hitActiveStart / as, e: F.hitActiveEnd / as };
};
// Assign a playable character. alt = mirror match: use the alternate tint everywhere.
Fighter.prototype.setCharacter = function (id, alt) {
  this.applyCharacter(id);
  this.legacy = false; this.alt = !!alt;
  this.color = alt ? this.char.altTint : this.char.accentColor;
  this.trim = alt ? this.char.accentColor : this.char.altTint; // accessory contrast colour
  this.dark = shadeHex(this.color, 0.55);
};
Fighter.prototype.setMaxHp = function (base) { this.maxHp = base * this.cm.maxHP; this.hp = this.maxHp; };
Fighter.prototype.reach = function () { return CONFIG.FIGHTER.punchRange * this.cm.range; };
Fighter.prototype.reset = function (x, y, facing) {
  var F = CONFIG.FIGHTER;
  this.x = x; this.y = y; this.vx = 0; this.vy = 0;
  this.facing = facing || 1;
  this.onGround = false; this.ground = null; this.dropFrom = null; this.dropT = 0;
  this.scale = 1; this.scaleFrom = 1; this.scaleTo = 1; this.scaleT = 1;
  this.mass = 1; this.dmgMul = 1; this.speedMul = 1; this.jumpMul = 1; this.canDouble = false; this.airJumps = 0;
  this.attackT = -1; this.attackType = 'kick'; this.attackCD = 0; this.hitDone = false;
  this.stun = 0; this.invuln = 0; this.out = false;
  this.glove = 0; this.umbrella = 0; this.umbFlap = 0; this.chase = 0; this.chaseDot = null; this.item = null;
  this.runPhase = 0; this.t = Math.random() * 10; this.squash = 0; this.role = null;
  this.w = CONFIG.FIGHTER.width; this.h = CONFIG.FIGHTER.height;
  this.lastLandVy = 0;
};
Fighter.prototype.setScale = function (target, instant) {
  if (instant) { this.scale = this.scaleFrom = this.scaleTo = target; this.scaleT = 1; return; }
  this.scaleFrom = this.scale; this.scaleTo = target; this.scaleT = 0;
};
Fighter.prototype.halfW = function () { return this.w * this.scale * 0.5; };
Fighter.prototype.height = function () { return this.h * this.scale; };
Fighter.prototype.headTop = function () { return this.y - this.height() - 6 * this.scale; };
Fighter.prototype.slotFree = function () { return !this.item && this.glove <= 0 && this.umbrella <= 0; };
Fighter.prototype.centerY = function () { return this.y - this.height() * 0.5; };

Fighter.prototype.update = function (dt, input, match) {
  if (this.out) return;
  var F = CONFIG.FIGHTER, mode = match.mode;
  this.t += dt;
  this.attackCD -= dt; this.stun -= dt; this.invuln -= dt; this.dropT -= dt; this.umbFlap -= dt;
  if (this.glove > 0) this.glove -= dt;
  if (this.umbrella > 0) this.umbrella -= dt;
  if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 3);
  if (this.scaleT < 1) {
    this.scaleT = Math.min(1, this.scaleT + dt / CONFIG.GIANTTINY.scaleTime);
    var e = 1 - Math.pow(1 - this.scaleT, 3);
    this.scale = this.scaleFrom + (this.scaleTo - this.scaleFrom) * e;
  }
  var inp = input || NO_INPUT;
  // Laser pointer: the cat-brain takes over and chases the dot
  if (this.chase > 0) {
    this.chase -= dt;
    var dot = this.chaseDot;
    inp = { left: false, right: false, jump: false, hit: false, down: false, jumpPressed: false, hitPressed: false };
    if (dot) { if (dot.x < this.x - 8) inp.left = true; else if (dot.x > this.x + 8) inp.right = true; }
    if (this.chase <= 0) this.chaseDot = null;
  }
  if (this.stun > 0) inp = NO_INPUT;

  var move = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  var attacking = this.attackT >= 0;
  var opp = match.opponentOf(this);
  if (!attacking) {
    if (move) this.facing = move;
    else if (opp && !opp.out && Math.abs(opp.x - this.x) > 4) this.facing = opp.x > this.x ? 1 : -1;
  }
  var cm = this.cm, tm = this.tm;
  var target = move * F.speed * this.speedMul * cm.moveSpeed * (attacking && this.onGround ? 0.35 : 1);
  if (this.stun > 0) target = this.vx; // keep knockback momentum
  var acc = (this.onGround ? F.accel : F.airAccel) * this.speedMul * cm.moveSpeed;
  if (move === 0 && this.onGround && this.stun <= 0) acc = F.friction;
  if (this.vx < target) this.vx = Math.min(target, this.vx + acc * dt);
  else if (this.vx > target) this.vx = Math.max(target, this.vx - acc * dt);

  // Jump / double jump / umbrella flap
  if (inp.jumpPressed) {
    if (this.onGround) {
      this.vy = -F.jump * this.jumpMul * cm.jump; this.onGround = false; this.ground = null;
      this.airJumps = this.canDouble ? 1 : 0; Sfx.jump();
    } else if (this.airJumps > 0) {
      this.airJumps--; this.vy = -F.doubleJump * this.jumpMul * cm.jump; Sfx.jump();
      FX.burst(this.x, this.y, '#ffffff', 6, 120);
    } else if (this.umbrella > 0 && this.umbFlap <= 0) {
      this.vy = -520; this.umbFlap = 0.7; Sfx.whoosh();
    }
  }
  // Drop through one-way platforms
  if (inp.down && this.onGround && this.ground && this.ground.oneWay) {
    this.dropFrom = this.ground; this.dropT = 0.3; this.onGround = false; this.ground = null; this.y += 2;
  }
  // Attack (or use held item)
  if (inp.hitPressed && this.attackCD <= 0 && this.stun <= 0) {
    var used = mode.onAttack ? mode.onAttack(this, match) : false;
    if (!used) {
      this.attackType = this.attackType === 'punch' ? 'kick' : 'punch';
      this.attackT = 0; this.hitDone = false; this.attackCD = tm.cd;
      Sfx.whoosh();
    } else this.attackCD = tm.cd;
  }
  if (this.attackT >= 0) { this.attackT += dt; if (this.attackT > tm.cd) this.attackT = -1; }

  // Gravity
  if (!this.onGround) {
    var g = inp.down ? F.fastFallGravity : F.gravity, maxFall = F.maxFall;
    if (this.umbrella > 0 && this.vy > 0 && !inp.down) { g = CONFIG.TOYDROP.umbrella.gravity; maxFall = CONFIG.TOYDROP.umbrella.maxFall; }
    this.vy = Math.min(maxFall, this.vy + g * dt);
  }
  var prevY = this.y;
  this.x += this.vx * dt;
  this.y += this.vy * dt;

  // Ground / platforms
  var plats = match.platforms, hw = this.halfW(), i, p;
  if (this.onGround) {
    p = this.ground;
    if (!p || !p.solid || this.x < p.x - hw || this.x > p.x + p.w + hw) {
      var next = null;
      for (i = 0; i < plats.length; i++) {
        var q = plats[i];
        if (q !== p && q.solid && Math.abs(q.y - this.y) < 3 && this.x >= q.x - hw && this.x <= q.x + q.w + hw) { next = q; break; }
      }
      if (next) this.ground = next; else { this.onGround = false; this.ground = null; }
    } else { this.y = p.y; this.vy = 0; }
  }
  if (!this.onGround && this.vy >= 0) {
    for (i = 0; i < plats.length; i++) {
      p = plats[i];
      if (!p.solid || (p === this.dropFrom && this.dropT > 0)) continue;
      if (prevY <= p.y + 1 && this.y >= p.y && this.x >= p.x - hw && this.x <= p.x + p.w + hw) {
        var impact = this.vy;
        this.y = p.y; this.vy = 0; this.onGround = true; this.ground = p;
        this.airJumps = this.canDouble ? 1 : 0;
        this.lastLandVy = impact;
        if (impact > 500) { FX.burst(this.x, this.y, 'rgba(255,255,255,0.8)', 5, 90); this.squash = Math.min(0.25, impact / 5000); }
        if (mode.onLand) mode.onLand(this, p, impact, match);
        break;
      }
    }
  }
  // Solid sides (raised tiles): never walk through them
  for (i = 0; i < plats.length; i++) {
    p = plats[i];
    if (!p.solid || !p.sides || p === this.ground) continue;
    var top = this.y - this.height();
    if (this.y > p.y + 3 && top < p.y + p.h && this.x > p.x - hw && this.x < p.x + p.w + hw) {
      if (this.x < p.x + p.w / 2) this.x = p.x - hw; else this.x = p.x + p.w + hw;
      this.vx = 0;
    }
  }

  // Shadow afterimages: a tiny ring buffer of past positions (render-only)
  if (this.char.accessory === 'scarf' && !this.legacy) {
    for (var gi = this.ghosts.length - 1; gi >= 0; gi--) { this.ghosts[gi].life -= dt; if (this.ghosts[gi].life <= 0) this.ghosts.splice(gi, 1); }
    this.ghostT -= dt;
    if (this.ghostT <= 0 && (Math.abs(this.vx) > 200 || Math.abs(this.vy) > 500)) { this.ghostT = 0.045; this.ghosts.push({ x: this.x, y: this.y, f: this.facing, s: this.scale, life: 0.2 }); if (this.ghosts.length > 4) this.ghosts.shift(); }
  }
  if (this.onGround && Math.abs(this.vx) > 20) this.runPhase += Math.abs(this.vx) * dt * 0.045;
  if (this.y > CONFIG.KILL_Y) { this.out = true; Sfx.fall(); }
};

Fighter.prototype.attackPoint = function () {
  var F = CONFIG.FIGHTER, s = this.scale, rs = Math.max(0.75, s);
  var punch = this.attackType === 'punch';
  return { x: this.x + this.facing * (punch ? F.punchRange : F.kickRange) * this.cm.range * rs, y: this.y - (punch ? 68 : 40) * s, r: Math.max(14, 20 * s) };
};
// Attack hitbox: a box sweeping from the attacker's chest to the fist/foot tip, so a
// target standing right on top of (or inside) the attacker still gets hit, and a giant's
// swing reaches down to a tiny fighter's height.
Fighter.prototype.attackBox = function () {
  var c = this.attackPoint(), hw = this.halfW();
  var x1 = this.x - this.facing * hw * 0.6, x2 = c.x + this.facing * c.r;
  return { l: Math.min(x1, x2), r: Math.max(x1, x2), t: Math.min(c.y - c.r, this.headTop()), b: this.y + 4, cx: c.x, cy: c.y };
};
Fighter.prototype.overlapsCircle = function (c) {
  var hw = this.halfW() + 4, top = this.y - this.height();
  var cx = Math.max(this.x - hw, Math.min(c.x, this.x + hw));
  var cy = Math.max(top, Math.min(c.y, this.y));
  return Math.hypot(c.x - cx, c.y - cy) <= c.r;
};
Fighter.prototype.overlapsBox = function (b) {
  var hw = Math.max(this.halfW(), 9) + 4, top = this.y - Math.max(this.height(), 30);
  return this.x + hw >= b.l && this.x - hw <= b.r && this.y >= b.t && top <= b.b;
};
Fighter.prototype.checkHit = function (victim, match) {
  var F = CONFIG.FIGHTER;
  if (this.out || victim.out || this.attackT < this.tm.s || this.attackT > this.tm.e || this.hitDone) return;
  var box = this.attackBox();
  if (!victim.overlapsBox(box)) return;
  var c = { x: Physics.clamp(box.cx, victim.x - victim.halfW(), victim.x + victim.halfW()), y: Math.max(box.cy, victim.y - victim.height()) };
  this.hitDone = true;
  var kick = this.attackType === 'kick';
  var cm = this.cm;
  var info = { dmg: (kick ? F.kickDamage : F.punchDamage) * this.dmgMul * cm.damage, kx: F.knockX * (kick ? 1.15 : 1) * cm.knockback, ky: F.knockY * cm.knockback, stun: F.hitstun, x: c.x, y: c.y, big: false };
  if (this.glove > 0) { info.dmg *= CONFIG.TOYDROP.glove.dmg; info.kx *= CONFIG.TOYDROP.glove.knock; info.ky *= 1.6; info.big = true; }
  if (match.mode.modifyHit) match.mode.modifyHit(this, victim, info, match);
  victim.takeHit(this, info, match);
};
Fighter.prototype.takeHit = function (att, info, match) {
  if (this.invuln > 0 || this.out) return;
  var dir = att.x === this.x ? att.facing : (this.x > att.x ? 1 : -1);
  if (match.mode.usesHP) this.hp = Math.max(0, this.hp - info.dmg);
  var rk = this.cm.receivedKnockback;
  this.vx = dir * info.kx * rk / this.mass;
  this.vy = -info.ky * rk / Math.sqrt(this.mass);
  this.onGround = false; this.ground = null;
  this.stun = info.stun; this.invuln = 0.12;
  this.attackT = -1;
  att.stats.hits++;
  var big = info.big || info.dmg >= 14 || info.kx > 650;
  FX.stars(info.x, info.y, big ? 14 : 8);
  FX.text(info.x, info.y - 20, match.mode.usesHP ? '-' + Math.round(info.dmg) : (big ? 'POW!' : 'BAM!'), big ? '#fde047' : '#ffffff');
  FX.shake(big ? CONFIG.SHAKE.big : CONFIG.SHAKE.small);
  FX.hitstop(CONFIG.HITSTOP);
  Sfx.hit(big);
  FX.vibrate(big ? 40 : 20);
};

// ---------- Drawing ----------
function limb(ctx, x, y, a, len, f) { var nx = x + Math.sin(a) * f * len, ny = y + Math.cos(a) * len; ctx.lineTo(nx, ny); return { x: nx, y: ny }; }

Fighter.prototype.pose = function (match) {
  var F = CONFIG.FIGHTER, t = this.t;
  var P = { torso: 0.05, bob: Math.sin(t * 3) * 1.2, th: [0.2, -0.2], sh: [-0.05, -0.05], ua: [0.55, 0.25], fa: [1.7, 1.9] };
  if (match && match.state === 'roundOver' && match.banner && !this.out && this.hp > 0 && match.roundWins[this.idx] > 0 && (match.fighters[1 - this.idx].out || match.fighters[1 - this.idx].hp <= 0)) {
    P.ua = [2.8 + Math.sin(t * CONFIG.ANIMATION.victoryRate) * 0.12, -2.8]; P.fa = [0.2, -0.2];
    P.bob = -Math.abs(Math.sin(t * CONFIG.ANIMATION.victoryRate)) * 3; return P;
  }
  if (this.stun > 0) {
    P.torso = -0.45 + Math.sin(t * 25) * 0.1; P.ua = [2.6 + Math.sin(t * 20) * 0.4, 2.2 + Math.cos(t * 18) * 0.4]; P.fa = [0.4, 0.4]; P.th = [0.6, -0.4]; P.sh = [-0.6, -0.2];
    return P;
  }
  if (!this.onGround) {
    P.th = [0.9, -0.25]; P.sh = [-1.3, -0.6]; P.torso = 0.1; P.bob = 0;
    P.ua = this.vy > 0 ? [2.5, 2.1] : [2.6, -0.5]; P.fa = [0.3, 0.5];
  } else if (Math.abs(this.vx) > 30) {
    var ph = this.runPhase;
    P.th = [Math.sin(ph) * 0.8, -Math.sin(ph) * 0.8];
    P.sh = [-0.2 - 0.9 * Math.max(0, Math.cos(ph)), -0.2 - 0.9 * Math.max(0, -Math.cos(ph))];
    P.ua = [-Math.sin(ph) * 0.8, Math.sin(ph) * 0.8]; P.fa = [1.1, 1.1]; P.torso = 0.2; P.bob = -Math.abs(Math.sin(ph)) * 3;
  }
  if (this.attackT >= 0) {
    var a = this.attackT, ext;
    var tm = this.tm;
    if (a < tm.s) ext = -0.18 * Math.sin(a / tm.s * Math.PI);
    else if (a < tm.e) ext = Math.sin(Math.min(1, (a - tm.s) / (tm.e - tm.s) * 3) * Math.PI / 2);
    else { var recovery = Math.max(0, 1 - (a - tm.e) / (tm.cd - tm.e)); ext = recovery * recovery; }
    P.ext = ext;
    if (this.attackType === 'punch') {
      P.ua = [0.5 + 1.1 * ext, 0.3]; P.fa = [1.6 * (1 - ext), 1.9]; P.torso = 0.1 + 0.25 * ext;
      if (this.onGround) { P.th = [0.4, -0.35]; P.sh = [-0.2, -0.1]; }
    } else {
      P.th = [0.2 + 1.4 * ext, -0.25]; P.sh = [-1.2 * (1 - ext), 0]; P.torso = -0.35 * ext; P.ua = [-0.5, 1.0]; P.fa = [0.8, 0.8];
    }
  }
  if (this.umbrella > 0) { P.ua[0] = 2.9; P.fa[0] = 0.1; }
  return P;
};
Fighter.prototype.draw = function (ctx, match) {
  if (this.out && this.y > CONFIG.KILL_Y + 300) return;
  var f = this.facing, P = this.pose(match), A = CONFIG.ANIMATION, acc = this.legacy ? null : this.char.accessory;
  if (acc === 'scarf' && this.ghosts.length && !this.out) drawGhosts(ctx, this);
  ctx.save();
  if (!this.out && this.hp > 0 && Math.abs(this.vx) > A.trailSpeed && !this.onGround) {
    ctx.save(); ctx.globalAlpha = A.trailAlpha; ctx.strokeStyle = this.color; ctx.lineWidth = 3 * this.scale;
    for (var tr = 0; tr < 3; tr++) {
      var ty = this.y - this.height() * (0.25 + tr * 0.25);
      ctx.beginPath(); ctx.moveTo(this.x - Math.sign(this.vx) * 12 * this.scale, ty);
      ctx.lineTo(this.x - Math.sign(this.vx) * (24 + tr * 10) * this.scale, ty + this.vy * 0.015); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.translate(this.x, this.y);
  // shadow
  if (this.onGround) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 2, 18 * this.scale, 4 * this.scale, 0, 0, Math.PI * 2); ctx.fill(); }
  if (this.squash > 0) ctx.scale(1 + this.squash, 1 - this.squash);
  else if (!this.onGround && this.hp > 0) { var stretch = Math.min(1, Math.abs(this.vy) / CONFIG.FIGHTER.maxFall) * A.airStretch; ctx.scale(1 - stretch, 1 + stretch); }
  if (this.hp <= 0 && match && match.state === 'roundOver') ctx.rotate(-this.facing * Math.min(1, match.stateT / A.koFallTime) * Math.PI / 2);
  ctx.scale(this.scale, this.scale);
  if (this.attackT >= this.tm.s && this.attackT <= this.tm.e) {
    // swing arc, stretched along the facing direction by the character's range (Reach's staff sweep)
    var rr = this.attackType === 'punch' ? 44 : 52, rx = rr * this.cm.range;
    ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = acc === 'staff' ? this.trim : this.color; ctx.lineWidth = A.swingWidth;
    ctx.beginPath(); ctx.ellipse(0, this.attackType === 'punch' ? -65 : -40, rx, rr, 0, f > 0 ? -0.65 : Math.PI - 0.65, f > 0 ? 0.65 : Math.PI + 0.65); ctx.stroke(); ctx.restore();
  }
  if (this.invuln > 0 && Math.floor(this.t * 30) % 2 === 0) ctx.globalAlpha = 0.6;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  var hip = { x: 0, y: -46 + P.bob };
  var neck = { x: hip.x + Math.sin(P.torso) * f * 30, y: hip.y - Math.cos(P.torso) * 30 };
  var head = { x: neck.x + Math.sin(P.torso) * f * 13, y: neck.y - Math.cos(P.torso) * 13 };
  var shoulder = { x: neck.x * 0.85 + hip.x * 0.15, y: neck.y + 3 };
  var i, lw = this.cm.lineWidth, hands = [];
  // back limbs (darker), then body, then front limbs
  for (var pass = 1; pass >= 0; pass--) {
    ctx.strokeStyle = pass === 1 ? this.dark : this.color;
    ctx.lineWidth = 7 * lw;
    i = pass;
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y);
    var k = limb(ctx, hip.x, hip.y, P.th[i], 24, f); limb(ctx, k.x, k.y, P.th[i] + P.sh[i], 22, f); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y);
    var el = limb(ctx, shoulder.x, shoulder.y, P.ua[i], 18, f); var hand = limb(ctx, el.x, el.y, P.ua[i] + P.fa[i], 17, f); ctx.stroke(); hands[i] = hand;
    if (pass === 0) {
      if (this.glove > 0 && i === 0) { ctx.fillStyle = '#ef4444'; ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hand.x, hand.y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      if (this.umbrella > 0) drawUmbrella(ctx, hand.x, hand.y);
      if (this.item === 'bowling') { ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(shoulder.x - f * 10, hip.y - 6, 10, 0, Math.PI * 2); ctx.fill(); }
      if (this.item === 'laser') { ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(hand.x + f * 12, hand.y - 4); ctx.stroke(); }
    }
    if (pass === 1) {
      ctx.strokeStyle = this.color; ctx.lineWidth = 8 * lw;
      ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(neck.x, neck.y); ctx.stroke();
    }
  }
  // head
  ctx.fillStyle = this.color; ctx.strokeStyle = this.dark; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(head.x, head.y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  if (this.stun > 0) { ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('x  x', head.x + f * 2, head.y + 2); }
  else { ctx.beginPath(); ctx.arc(head.x + f * 5, head.y - 2, 2.4, 0, Math.PI * 2); ctx.arc(head.x + f * 0.5, head.y - 2, 2.4, 0, Math.PI * 2); ctx.fill(); }
  if (!acc) {
    // classic menu fighters: little white headband tail
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(head.x - f * 9, head.y - 5); ctx.lineTo(head.x - f * (18 + Math.sin(this.t * 12) * 2), head.y - 2 + Math.sin(this.t * 9) * 3); ctx.stroke();
  } else drawAccessory(ctx, this, acc, P, head, neck, shoulder, hands);
  ctx.restore();
  if (this.stun > 0) drawDizzy(ctx, this.x + Math.sin(this.t * 0) * 0, this.headTop() - 4, this.t);
};
function drawUmbrella(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 30); ctx.stroke();
  ctx.fillStyle = '#ec4899';
  ctx.beginPath(); ctx.moveTo(x - 34, y - 28); ctx.quadraticCurveTo(x, y - 70, x + 34, y - 28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f9a8d4';
  ctx.beginPath(); ctx.moveTo(x - 12, y - 30); ctx.quadraticCurveTo(x, y - 66, x + 12, y - 30); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawDizzy(ctx, x, y, t) {
  ctx.save(); ctx.fillStyle = '#fde047';
  for (var i = 0; i < 3; i++) {
    var a = t * 6 + i * 2.1;
    drawStar(ctx, x + Math.cos(a) * 16, y + Math.sin(a) * 5, 5);
  }
  ctx.restore();
}
function drawStar(ctx, x, y, r) {
  ctx.beginPath();
  for (var i = 0; i < 10; i++) { var a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

// Character accessories: simple strokes in the character's colours, drawn in local (scaled) space.
function drawAccessory(ctx, ft, acc, P, head, neck, shoulder, hands) {
  var f = ft.facing, t = ft.t, sp = Math.min(1, Math.abs(ft.vx) / 360);
  var back = Math.abs(ft.vx) > 30 ? -Math.sign(ft.vx) : -f; // tails stream away from the movement
  ctx.lineCap = 'round';
  if (acc === 'headband') {
    ctx.strokeStyle = ft.trim; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(head.x, head.y, 11, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.lineWidth = 2.5;
    for (var k = 0; k < 2; k++) {
      var len = 16 + sp * 12 + k * 5, wav = Math.sin(t * (10 + sp * 8) + k * 1.7) * (3 + sp * 2);
      var sx = head.x + back * 8, sy = head.y - 6;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + back * len * 0.55, sy - 2 + wav + k * 3, sx + back * len, sy + 4 - sp * 6 + wav * 1.4 + k * 5); ctx.stroke();
    }
  } else if (acc === 'shoulderPads') {
    ctx.fillStyle = ft.trim; ctx.strokeStyle = ft.dark; ctx.lineWidth = 2.5;
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.ellipse(shoulder.x + s * 7, shoulder.y + 1, 9, 6, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (acc === 'scarf') {
    ctx.strokeStyle = ft.trim; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(neck.x - 5, neck.y + 1); ctx.lineTo(neck.x + 5, neck.y + 1); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(neck.x, neck.y + 1);
    for (var j = 1; j <= 4; j++) ctx.lineTo(neck.x + back * j * (7 + sp * 5), neck.y + 2 + j * (2.5 - sp * 2) + Math.sin(t * 14 - j) * (1.5 + j));
    ctx.stroke();
  } else if (acc === 'staff' && hands[0]) {
    var h = hands[0], ang;
    if (ft.attackT >= 0 && P.ext !== undefined) ang = 0.35 + (Math.PI / 2 - 0.35) * Math.max(0, P.ext); // swings forward to horizontal
    else ang = 0.35 + Math.sin(t * 2) * 0.05;
    var L = 32 * ft.cm.range, dx = Math.sin(ang) * f, dy = -Math.cos(ang);
    ctx.strokeStyle = ft.dark; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(h.x - dx * L * 0.6, h.y - dy * L * 0.6); ctx.lineTo(h.x + dx * L * 1.4, h.y + dy * L * 1.4); ctx.stroke();
    ctx.strokeStyle = ft.trim; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(h.x - dx * L * 0.6, h.y - dy * L * 0.6); ctx.lineTo(h.x + dx * L * 1.4, h.y + dy * L * 1.4); ctx.stroke();
  }
}
// Shadow afterimages: cheap stick silhouettes from a 4-entry buffer.
function drawGhosts(ctx, ft) {
  ctx.save(); ctx.strokeStyle = ft.color; ctx.lineCap = 'round';
  for (var i = 0; i < ft.ghosts.length; i++) {
    var g = ft.ghosts[i], s = g.s;
    ctx.globalAlpha = 0.28 * (g.life / 0.2) * ((i + 1) / ft.ghosts.length);
    ctx.lineWidth = 6 * s;
    var hy = g.y - 46 * s, ny = g.y - 76 * s;
    ctx.beginPath(); ctx.moveTo(g.x - 10 * s, g.y); ctx.lineTo(g.x, hy); ctx.lineTo(g.x + 10 * s, g.y);
    ctx.moveTo(g.x, hy); ctx.lineTo(g.x + g.f * 3 * s, ny); ctx.moveTo(g.x - g.f * 12 * s, ny + 22 * s); ctx.lineTo(g.x + g.f * 3 * s, ny + 4 * s); ctx.lineTo(g.x + g.f * 16 * s, ny + 20 * s); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.x + g.f * 4 * s, ny - 13 * s, 10 * s, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
