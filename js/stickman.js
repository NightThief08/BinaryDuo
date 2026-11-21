/* Stickman fighter: movement, jumping, attacks, knockback, size changes and drawing.
   Also holds Combat (attack resolution) so every hit goes through one code path. */
(function () {
  'use strict';

  function approach(v, target, amt) {
    if (v < target) return Math.min(target, v + amt);
    return Math.max(target, v - amt);
  }

  function Fighter(id) {
    this.id = id;
    this.name = '';
    this.color = '#2f7cff';
    this.marker = 'circle';
    this.isBot = false;
    this.label = '';
    this.t = 0;
    this.stats = { hits: 0, dmg: 0, items: 0, kos: 0 };   // per match
    this.reset(0, 0, id === 0 ? 1 : -1);
  }

  var P = Fighter.prototype;

  Object.defineProperty(P, 'w', { get: function () { return window.CONFIG.FIGHTER.bodyW * this.scale; } });
  Object.defineProperty(P, 'h', { get: function () { return window.CONFIG.FIGHTER.bodyH * this.scale; } });

  // Role multipliers. Mode code calls this (Giant/Tiny, or the default for everyone else).
  P.setRole = function (role) {
    this.mass = role.mass || 1;
    this.speedMult = role.speed || 1;
    this.dmgMult = role.dmg || 1;
    this.kbMult = role.kbMult || 1;
    this.maxJumps = role.extraJumps || 0;
    this.jumpMult = role.jumpMult || 1;
    this.jumpsLeft = this.maxJumps;
  };

  // Resize with an animated, feet-anchored transition. Feet never move, so nothing is pushed into the floor.
  P.setScale = function (target, time) {
    this.scaleFrom = this.scale;
    this.targetScale = target;
    this.scaleT = 0;
    this.scaleTime = Math.max(0.01, time || 0.3);
  };

  P.reset = function (x, y, facing) {
    var F = window.CONFIG.FIGHTER;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.onGround = true;
    this.landedOn = null;
    this.alive = true;
    this.hp = window.CONFIG.MODES.toyDrop.hp;
    this.maxHp = this.hp;
    this.stun = 0;
    this.cooldown = 0;
    this.hitBuffer = 0;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.attack = null;
    this.attackAnim = 0;
    this.nextKind = 'punch';
    this.scale = 1;
    this.targetScale = 1;
    this.scaleFrom = 1;
    this.scaleT = 1;
    this.scaleTime = 0.3;
    this.mass = 1;
    this.speedMult = 1;
    this.dmgMult = 1;
    this.kbMult = 1;
    this.maxJumps = 0;
    this.jumpMult = 1;
    this.jumpsLeft = 0;
    this.buffs = { glove: 0, umbrella: 0, forced: 0, forcedX: 0 };
    this.item = null;
    this.flash = 0;
    this.squash = 0;
    this.phase = 0;
    this.t = 0;
    this.lastHitT = -99;
    this.lastHitBy = -1;
    this.ballGrace = 0;
  };

  P.startAttack = function () {
    var kind = this.nextKind;
    var cfg = window.CONFIG.ATTACK[kind];
    this.attack = { kind: kind, t: cfg.active, landed: false };
    this.attackAnim = cfg.anim;
    this.cooldown = cfg.cooldown;
    this.nextKind = kind === 'punch' ? 'kick' : 'punch';
  };

  P.attackBox = function () {
    if (!this.attack) return null;
    var cfg = window.CONFIG.ATTACK[this.attack.kind];
    var h = this.h;
    var reach = cfg.reach * (0.6 + 0.4 * this.scale);
    var f = this.facing;
    var a = this.x + f * (this.w / 2 - 2);
    var b = this.x + f * (this.w / 2 + reach);
    var top, bottom;
    if (this.attack.kind === 'punch') { top = this.y - h * 0.70; bottom = this.y - h * 0.50; }
    else { top = this.y - h * 0.42; bottom = this.y - h * 0.10; }
    return { l: Math.min(a, b), r: Math.max(a, b), t: top, b: bottom };
  };

  P.jump = function () {
    var F = window.CONFIG.FIGHTER;
    this.vy = -F.jumpV * this.jumpMult;
    this.onGround = false;
    this.landedOn = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    window.SFX.play('jump');
  };

  // intent: {dir:-1|0|1, fall:bool}
  // presses: {jump:bool, hit:bool}   (edges)
  // env: {solids, now, umbrella: {gravMult, fallCap}, onLandSound}
  P.update = function (dt, intent, presses, solids, env) {
    var C = window.CONFIG;
    var F = C.FIGHTER;
    this.t += dt;

    // ---- Size animation (feet anchored) ----
    if (this.scale !== this.targetScale) {
      this.scaleT = Math.min(1, this.scaleT + dt / this.scaleTime);
      var e = 1 - Math.pow(1 - this.scaleT, 3);   // ease-out
      this.scale = this.scaleFrom + (this.targetScale - this.scaleFrom) * e;
      if (this.scaleT >= 1) this.scale = this.targetScale;
    }

    // ---- Dead fighters just fall ----
    if (!this.alive) {
      this.vx *= Math.max(0, 1 - dt * 1.5);
      this.vy = Math.min(C.MAX_FALL, this.vy + C.GRAVITY * dt);
      Physics.integrate(this, dt, solids, { kind: 'fighter' });
      return;
    }

    // ---- Timers ----
    this.stun = Math.max(0, this.stun - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.hitBuffer = Math.max(0, this.hitBuffer - dt);
    this.attackAnim = Math.max(0, this.attackAnim - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.squash = Math.max(0, this.squash - dt);
    this.ballGrace = Math.max(0, this.ballGrace - dt);
    if (this.buffs.glove > 0) this.buffs.glove = Math.max(0, this.buffs.glove - dt);
    if (this.buffs.umbrella > 0) this.buffs.umbrella = Math.max(0, this.buffs.umbrella - dt);
    if (this.buffs.forced > 0) this.buffs.forced = Math.max(0, this.buffs.forced - dt);
    if (this.attack) {
      this.attack.t -= dt;
      if (this.attack.t <= 0) this.attack = null;
    }

    // ---- Laser "chase the dot": movement control taken away, no attacks or jumps ----
    var forced = this.buffs.forced > 0;
    var dir = intent.dir;
    var jumpP = presses.jump;
    var hitP = presses.hit;
    if (forced) {
      var dx = this.buffs.forcedX - this.x;
      dir = Math.abs(dx) > 10 ? (dx > 0 ? 1 : -1) : 0;
      jumpP = false;
      hitP = false;
      this.hitBuffer = 0;
      this.jumpBuffer = 0;
    }

    // ---- Attack input with a short buffer (helps rapid taps on phones) ----
    if (hitP) this.hitBuffer = 0.12;
    if (this.hitBuffer > 0 && this.cooldown <= 0 && this.stun <= 0 && !forced) {
      this.startAttack();
      this.hitBuffer = 0;
    }

    // ---- Horizontal control ----
    // While stunned (knockback) the fighter decelerates quickly, on the ground and in the air.
    var stunned = this.stun > 0;
    var target = dir * F.speed * this.speedMult * (stunned ? 0.35 : 1);
    if (this.attackAnim > 0 && this.onGround) target *= 0.5;
    var accel = stunned ? F.knockDecel : (this.onGround ? F.groundAccel : F.airAccel);
    this.vx = approach(this.vx, target, accel * dt);
    if (dir !== 0 && this.attackAnim <= 0 && !stunned) this.facing = dir;

    // ---- Jump (buffered; coyote time on ledges; extra air jumps for some roles) ----
    if (jumpP) this.jumpBuffer = F.jumpBuffer;
    if (this.jumpBuffer > 0) {
      if (this.onGround || this.coyote > 0) {
        this.jump();
      } else if (this.jumpsLeft > 0) {
        this.jumpsLeft -= 1;
        this.jump();
      }
    }

    // ---- Gravity ----
    var g = C.GRAVITY;
    var cap = C.MAX_FALL;
    if (intent.fall && !forced && this.vy > 0) g *= C.FAST_FALL_MULT;
    if (this.buffs.umbrella > 0 && this.vy > 0 && env && env.umbrella) {
      g *= env.umbrella.gravMult;
      cap = env.umbrella.fallCap;
    }
    this.vy += g * dt;
    if (this.vy > cap) this.vy = cap;

    // ---- Integrate + land ----
    var prevVy = this.vy;
    var fresh = Physics.integrate(this, dt, solids, { step: true, kind: 'fighter' });
    if (this.onGround) this.coyote = F.coyote; else this.coyote = Math.max(0, this.coyote - dt);
    if (fresh) {
      this.jumpsLeft = this.maxJumps;
      if (prevVy > 220) {
        this.squash = 0.12;
        window.SFX.play('land');
      }
      if (typeof fresh.onLand === 'function') fresh.onLand(this, env);
    }

    // ---- Walk animation phase ----
    if (this.onGround) this.phase += dt * Math.abs(this.vx) / 90;
  };

  // Knockback + damage taken. Called from Combat.
  P.receiveHit = function (info, now) {
    var dir = Math.sign(this.x - info.fromX) || info.facing || 1;
    var m = this.mass || 1;
    this.vx = dir * info.kb * info.kbMult / m;
    this.vy = -info.kbUp / Math.sqrt(m);
    this.onGround = false;
    this.landedOn = null;
    this.stun = info.stun;
    this.flash = 0.12;
    this.lastHitT = now;
  };

  // ---------------- Drawing ----------------
  function limb(ctx, x0, y0, a1, l1, a2, l2) {
    var x1 = x0 + Math.sin(a1) * l1, y1 = y0 + Math.cos(a1) * l1;
    var x2 = x1 + Math.sin(a2) * l2, y2 = y1 + Math.cos(a2) * l2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  P.draw = function (ctx, opts) {
    opts = opts || {};
    var s = this.scale;
    var h = this.h;
    var f = this.facing;
    var moving = this.onGround && Math.abs(this.vx) > 20;
    var airborne = !this.onGround;
    var ph = this.phase;
    var breathe = Math.sin(this.t * 3) * 0.04;

    ctx.save();
    // squash & stretch on landing
    var sq = this.squash > 0 ? 1 + this.squash * 0.9 : 1;
    ctx.translate(this.x, this.y);
    ctx.scale(sq, 1 / sq);
    ctx.scale(f, 1);     // local +x = facing direction

    var col = this.flash > 0 && Math.floor(this.flash * 40) % 2 === 0 ? '#ffffff' : this.color;
    var lw = Math.max(2.5, 4.2 * Math.sqrt(s));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // pose angles (0 = straight down, +π/2 = forward). Each limb: [upper angle, lower angle]
    var legA, legB, armA, armB, legAFore, legBFore, armAFore, armBFore;
    if (airborne) {
      legA = 0.7; legB = -0.25; armA = -2.4; armB = 2.2;
      legAFore = legA - 1.0; legBFore = legB - 0.9;
      armAFore = armA + 0.5; armBFore = armB - 0.5;
    } else if (moving) {
      var sw = Math.sin(ph);
      legA = sw * 0.75; legB = -sw * 0.75;
      armA = -sw * 0.9 - 0.3; armB = sw * 0.9 + 0.3;
      legAFore = legA * 0.5 - 0.2; legBFore = legB * 0.5 - 0.2;
      armAFore = armA * 0.5 + 0.2; armBFore = armB * 0.5 + 0.2;
    } else {
      legA = 0.06; legB = -0.06; armA = -0.45 + breathe; armB = 0.5 - breathe;
      legAFore = 0; legBFore = 0;
      armAFore = armA * 0.5 + 0.2; armBFore = armB * 0.5 + 0.2;
    }
    if (this.attackAnim > 0 && this.attackLast) {
      if (this.attackLast === 'punch') { armB = 1.5; armBFore = 1.5; armA = -0.5; armAFore = -0.4; }
      else { legB = 1.45; legBFore = 1.45; legA = -0.3; legAFore = -0.6; }
    }

    var hipY = -h * 0.42;
    var shoulderY = -h * 0.72;
    var headR = h * 0.13;
    var thigh = h * 0.23, shin = h * 0.23;
    var upper = h * 0.2, fore = h * 0.18;

    function body(width, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(0, shoulderY); ctx.stroke();
      limb(ctx, 0, hipY, legA, thigh, legAFore, shin);
      limb(ctx, 0, hipY, legB, thigh, legBFore, shin);
      limb(ctx, 0, shoulderY, armA, upper, armAFore, fore);
      limb(ctx, 0, shoulderY, armB, upper, armBFore, fore);
    }

    // outline pass (white) for contrast on any background, then the colour pass
    body(lw + 2.6, 'rgba(255,255,255,0.9)');
    body(lw, col);

    // head
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(0, shoulderY - headR * 1.35, headR * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = col;
    ctx.stroke();

    // face (small eye on facing side)
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(headR * 0.35, shoulderY - headR * 1.45, Math.max(1.4, headR * 0.16), 0, Math.PI * 2);
    ctx.fill();

    // Giant-size blink for mode-specific role outlines is drawn by the mode.
    ctx.restore();

    // Label & marker above head (drawn in world space, not flipped)
    if (opts.label) {
      var topY = this.y - h - 18 * Math.max(1, s * 0.8);
      ctx.save();
      ctx.translate(this.x, topY);
      ctx.font = '900 ' + Math.round(Math.max(14, 16 * Math.min(1.6, s))) + 'px system-ui, Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var tw = ctx.measureText(opts.label).width;
      // pill background
      ctx.fillStyle = 'rgba(16,24,36,0.72)';
      roundRect(ctx, -tw / 2 - 8, -12, tw + 16, 24, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(opts.label, 0, 0);
      if (opts.marker === 'triangle') {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(-6, 18); ctx.lineTo(6, 18); ctx.lineTo(0, 28); ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 22, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------------- Combat ----------------
  var Combat = {
    // Attacker's current attack hits defender once. Applies damage (if the mode uses HP) and knockback.
    // env: { now, usesHP, glove: {dmgMult, kbMult}|null, onHit(attacker, defender, info) }
    resolve: function (a, b, env) {
      if (!a.alive || !b.alive || !a.attack || a.attack.landed) return null;
      var box = a.attackBox();
      if (!box || !Physics.overlap(box, Physics.box(b))) return null;
      a.attack.landed = true;
      var C = window.CONFIG;
      var cfg = C.ATTACK[a.attack.kind];
      var gl = a.buffs.glove > 0 && env.glove ? env.glove : null;
      var dmg = cfg.dmg * a.dmgMult * (gl ? gl.dmgMult : 1);
      var kb = cfg.kb * (gl ? gl.kbMult : 1);
      var stun = a.attack.kind === 'kick' ? C.FIGHTER.stunOnHitKick : C.FIGHTER.stunOnHitPunch;
      var info = {
        dmg: dmg, kb: kb, kbUp: cfg.kbUp, stun: stun,
        fromX: a.x, facing: a.facing,
        kbMult: a.kbMult * (env.kbMult || 1)
      };
      b.receiveHit(info, env.now);
      b.lastHitBy = a.id;
      a.stats.hits += 1;
      if (env.usesHP) {
        b.hp = Math.max(0, b.hp - dmg);
        a.stats.dmg += dmg;
      }
      var hitX = (a.x + b.x) / 2;
      var hitY = Math.min(box.b, b.y - b.h * 0.6);
      if (window.Engine) {
        window.Engine.impact(hitX, hitY, a.attack.kind === 'kick' ? '#ffd23f' : '#ffffff', a.attack.kind === 'kick' ? 16 : 10);
        window.Engine.popText(hitX, hitY - 30, a.attack.kind === 'kick' ? 'KICK!' : 'POW!', a.color);
        window.Engine.shake(window.Store.getSettings().shake ? C.SHAKE_HIT * (a.attack.kind === 'kick' ? 1.3 : 1) : 0);
        window.Engine.hitStop(C.HITSTOP);
      }
      window.SFX.play(a.attack.kind === 'kick' ? 'kick' : 'hit');
      window.SFX.vibrate(C.VIBRATE_HIT_MS);
      if (typeof env.onHit === 'function') env.onHit(a, b, { dmg: dmg, kind: a.attack.kind });
      return { dmg: dmg };
    },

    // Giant falling onto Tiny deals stomp damage and launches the victim.
    stomp: function (giant, tiny, env) {
      if (!giant.alive || !tiny.alive || giant.scale < 1.5) return false;
      if (giant.vy < window.CONFIG.MODES.giantTiny.giant.stompMinVy) return false;
      var g = Physics.box(giant), t = Physics.box(tiny);
      var overlapX = g.l < t.r && g.r > t.l;
      var gap = g.b - t.t;
      if (!overlapX || gap < -6 || gap > 46) return false;
      var cfg = window.CONFIG.MODES.giantTiny.giant;
      tiny.receiveHit({ dmg: cfg.stompDmg * giant.dmgMult, kb: 0, kbUp: 620, stun: 0.6, fromX: giant.x, facing: giant.facing, kbMult: 1 }, env.now);
      tiny.lastHitBy = giant.id;
      giant.vy = -320;
      giant.onGround = false;
      giant.stats.hits += 1;
      if (env.usesHP) {
        tiny.hp = Math.max(0, tiny.hp - cfg.stompDmg * giant.dmgMult);
        giant.stats.dmg += cfg.stompDmg * giant.dmgMult;
      }
      if (window.Engine) {
        window.Engine.impact(tiny.x, tiny.y - tiny.h * 0.5, '#ffd23f', 22);
        window.Engine.popText(tiny.x, tiny.y - tiny.h - 20, 'STOMP!', '#ffd23f');
        window.Engine.shake(window.Store.getSettings().shake ? window.CONFIG.SHAKE_KO : 0);
        window.Engine.hitStop(window.CONFIG.HITSTOP);
      }
      window.SFX.play('stomp');
      window.SFX.vibrate(40);
      if (typeof env.onHit === 'function') env.onHit(giant, tiny, { dmg: cfg.stompDmg * giant.dmgMult, kind: 'stomp' });
      return true;
    }
  };

  // The last used attack kind is remembered so the drawing can show it briefly after the attack ends.
  var origStart = P.startAttack;
  P.startAttack = function () {
    origStart.call(this);
    this.attackLast = this.attack.kind;
  };

  window.Fighter = Fighter;
  window.Combat = Combat;
})();
