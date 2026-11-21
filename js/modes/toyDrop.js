/* Mode: RANDOM TOY DROP. A bridge over water. Every 8 s a parachute item drops onto the bridge.
   Glove & Umbrella activate on pickup, Trampoline is placed where you grab it,
   Bowling Ball & Laser Pointer are held (max 1) and used with HIT. */
(function () {
  'use strict';

  var CFG = window.CONFIG.MODES.toyDrop;
  var ITEM_KEYS = ['glove', 'trampoline', 'bowling', 'laser', 'umbrella'];

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var Mode = {
    id: 'toyDrop',
    name: CFG.name,
    time: CFG.time,
    usesHP: true,
    hp: CFG.hp,
    killY: CFG.killY,
    items: [],
    pads: [],
    ball: null,
    laser: null,
    spawnClock: 0,
    bridge: null,
    _solids: [],

    setup: function (fighters) {
      var b = CFG.bridge;
      this.bridge = { x: b.x, y: b.y, w: b.w, h: b.h, active: true, bounce: 0, botAvoid: false, name: 'bridge' };
      this.items = [];
      this.pads = [];
      this.ball = null;
      this.laser = null;
      this.spawnClock = 0;
      for (var i = 0; i < fighters.length; i++) {
        var f = fighters[i];
        f.reset(CFG.spawnX[i], b.y, i === 0 ? 1 : -1);
        f.hp = CFG.hp;
        f.maxHp = CFG.hp;
        f.setRole({});
      }
    },

    solids: function () {
      var out = [this.bridge];
      for (var i = 0; i < this.pads.length; i++) if (this.pads[i].active) out.push(this.pads[i]);
      return out;
    },

    env: function () {
      return { umbrella: CFG.umbrella, glove: CFG.glove, usesHP: true };
    },

    // ----- Items -----
    spawnItem: function (fighters) {
      var b = this.bridge;
      var landX = b.x + 60;
      for (var tries = 0; tries < 24; tries++) {
        var x = b.x + 50 + Math.random() * (b.w - 100);
        var ok = true;
        for (var i = 0; i < fighters.length; i++) {
          if (Math.abs(x - fighters[i].x) < 70) ok = false;
        }
        for (var j = 0; j < this.items.length; j++) {
          if (!this.items[j].taken && Math.abs(x - this.items[j].landX) < 60) ok = false;
        }
        if (ok) { landX = x; break; }
        landX = x;
      }
      var type = ITEM_KEYS[Math.floor(Math.random() * ITEM_KEYS.length)];
      this.items.push({
        type: type, x: landX, landX: landX, y: -40, landed: false, taken: false,
        life: CFG.itemLife, age: 0
      });
    },

    // Activate or hold a picked-up item.
    pickup: function (f, it, env) {
      if (it.type === 'glove') {
        f.buffs.glove = CFG.glove.time;
      } else if (it.type === 'umbrella') {
        f.buffs.umbrella = CFG.umbrella.time;
      } else if (it.type === 'trampoline') {
        this.pads.push({
          x: f.x - CFG.trampoline.w / 2, y: this.bridge.y, w: CFG.trampoline.w, h: 12,
          active: true, bounce: CFG.trampoline.bounce, life: CFG.trampoline.life, botAvoid: false, name: 'pad'
        });
      } else {
        if (f.item) return false;     // hold max 1 (held items only)
        f.item = it.type;
      }
      it.taken = true;
      f.stats.items += 1;
      window.SFX.play('pickup');
      if (window.Engine) window.Engine.popText(f.x, f.y - f.h - 40, window.CONFIG.ITEMS[it.type].label, '#ffe27a');
      return true;
    },

    throwBall: function (f) {
      var c = CFG.bowling;
      this.ball = {
        x: f.x + f.facing * 34, y: f.y - 36, vx: f.facing * c.speed, vy: -120,
        w: c.size, h: c.size, life: c.life, owner: f.id, grace: c.ownerGrace, active: true, spin: 0
      };
      f.item = null;
      window.SFX.play('throw');
    },

    shineLaser: function (f, foe) {
      var b = this.bridge;
      var dotX = Math.min(b.x + b.w - 60, Math.max(b.x + 60, foe.x + rnd(-CFG.laser.reach, CFG.laser.reach)));
      foe.buffs.forced = CFG.laser.time;
      foe.buffs.forcedX = dotX;
      this.laser = { x: dotX, t: CFG.laser.time, owner: f.id, max: CFG.laser.time };
      f.item = null;
      window.SFX.play('laser');
    },

    // Returns true when a HIT press was used on an item (so it does not start an attack).
    onHitPress: function (f, foe, env) {
      if (f.item === 'bowling') { this.throwBall(f); return true; }
      if (f.item === 'laser') { this.shineLaser(f, foe); return true; }
      return false;
    },

    update: function (dt, fighters, env, roundT) {
      var b = this.bridge;
      var i, f;

      // Spawn timer: first drop after `itemEvery` seconds, then every `itemEvery` seconds.
      this.spawnClock += dt;
      if (this.spawnClock >= CFG.itemEvery) {
        this.spawnClock -= CFG.itemEvery;
        this.spawnItem(fighters);
      }

      // Items: parachute fall, then rest on the bridge until taken or expired.
      for (i = this.items.length - 1; i >= 0; i--) {
        var it = this.items[i];
        it.age += dt;
        if (!it.landed) {
          it.y += CFG.itemFallSpeed * dt;
          if (it.y >= b.y - 26) { it.y = b.y - 26; it.landed = true; }
          continue;
        }
        if (it.taken) { this.items.splice(i, 1); continue; }
        it.life -= dt;
        if (it.life <= 0) { this.items.splice(i, 1); continue; }
        for (var k = 0; k < fighters.length; k++) {
          f = fighters[k];
          if (!f.alive) continue;
          var fb = window.Physics.box(f);
          var ib = { l: it.x - 20, r: it.x + 20, t: b.y - 44, b: b.y };
          if (window.Physics.overlap(fb, ib)) {
            if (this.pickup(f, it, env)) break;
          }
        }
      }

      // Trampolines: short lifetime.
      for (i = this.pads.length - 1; i >= 0; i--) {
        this.pads[i].life -= dt;
        if (this.pads[i].life <= 0) { this.pads[i].active = false; this.pads.splice(i, 1); }
      }

      // Bowling ball: rolls on the bridge, knocks over the first opponent it touches.
      if (this.ball && this.ball.active) {
        var ball = this.ball;
        ball.life -= dt;
        ball.grace = Math.max(0, ball.grace - dt);
        ball.vy += window.CONFIG.GRAVITY * dt;
        ball.vx *= (1 - 0.25 * dt);
        ball.spin += ball.vx * dt * 0.05;
        window.Physics.integrate(ball, dt, this.solids(), { kind: 'ball' });
        var bb = { l: ball.x - ball.w / 2, r: ball.x + ball.w / 2, t: ball.y - ball.h, b: ball.y };
        for (var m = 0; m < fighters.length; m++) {
          f = fighters[m];
          if (!f.alive || (f.id === ball.owner && ball.grace > 0)) continue;
          if (window.Physics.overlap(bb, window.Physics.box(f))) {
            var owner = fighters[ball.owner];
            var dmg = CFG.bowling.dmg * (owner ? owner.dmgMult : 1);
            f.receiveHit({ dmg: dmg, kb: CFG.bowling.kb, kbUp: 300, stun: 0.5, fromX: ball.x, facing: Math.sign(ball.vx) || 1, kbMult: 1 }, env.now);
            f.lastHitBy = ball.owner;
            if (owner) owner.stats.hits += 1;
            if (env.usesHP) {
              f.hp = Math.max(0, f.hp - dmg);
              if (owner) owner.stats.dmg += dmg;
            }
            if (window.Engine) {
              window.Engine.impact(ball.x, ball.y - 18, '#ffd23f', 18);
              window.Engine.popText(ball.x, ball.y - 60, 'BONK!', '#ffd23f');
              window.Engine.shake(window.Store.getSettings().shake ? window.CONFIG.SHAKE_HIT * 1.4 : 0);
              window.Engine.hitStop(window.CONFIG.HITSTOP);
            }
            window.SFX.play('thud');
            window.SFX.vibrate(window.CONFIG.VIBRATE_HIT_MS);
            if (env.onHit && owner) env.onHit(owner, f, { dmg: dmg, kind: 'ball' });
            ball.active = false;
            break;
          }
        }
        if (ball.life <= 0 || ball.y > window.CONFIG.MODES.toyDrop.killY + 40 || ball.x < b.x - 120 || ball.x > b.x + b.w + 120) {
          ball.active = false;
        }
        if (!ball.active) this.ball = null;
      }

      // Laser dot: a timer for the visual; the forced chase is applied in Fighter.update.
      if (this.laser) {
        this.laser.t -= dt;
        if (this.laser.t <= 0) this.laser = null;
      }
    },

    draw: function (ctx, t) {
      var W = window.CONFIG.W, H = window.CONFIG.H;
      var b = this.bridge;

      // Sky
      var sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#6cc8ff');
      sky.addColorStop(0.6, '#c9efff');
      sky.addColorStop(1, '#eafaff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // Sun
      var sg = ctx.createRadialGradient(1120, 120, 10, 1120, 120, 150);
      sg.addColorStop(0, 'rgba(255,246,190,1)');
      sg.addColorStop(1, 'rgba(255,246,190,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(960, 0, 320, 300);
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath(); ctx.arc(1120, 120, 42, 0, Math.PI * 2); ctx.fill();
      // Clouds drift
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (var c = 0; c < 4; c++) {
        var cx = ((c * 330 + t * (14 + c * 4)) % (W + 300)) - 150;
        var cy = 80 + (c % 2) * 70;
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.arc(cx + 34, cy - 12, 38, 0, Math.PI * 2);
        ctx.arc(cx + 72, cy, 28, 0, Math.PI * 2);
        ctx.fill();
      }
      // Far hills
      ctx.fillStyle = '#86d6b8';
      ctx.beginPath();
      ctx.moveTo(0, 470);
      for (var x = 0; x <= W; x += 40) ctx.lineTo(x, 430 + Math.sin(x * 0.012) * 30);
      ctx.lineTo(W, 500); ctx.lineTo(0, 500); ctx.closePath(); ctx.fill();

      // Water
      var wg = ctx.createLinearGradient(0, b.y + b.h, 0, H);
      wg.addColorStop(0, '#2f9fe6');
      wg.addColorStop(1, '#0d5aa3');
      ctx.fillStyle = wg;
      ctx.fillRect(0, b.y + b.h - 10, W, H - (b.y + b.h - 10));
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      for (var wv = 0; wv < 3; wv++) {
        ctx.beginPath();
        var wy = b.y + b.h + 30 + wv * 36;
        for (var wx = 0; wx <= W; wx += 20) {
          var yy = wy + Math.sin(wx * 0.02 + t * 2 + wv) * 5;
          if (wx === 0) ctx.moveTo(wx, yy); else ctx.lineTo(wx, yy);
        }
        ctx.stroke();
      }

      // Bridge posts & ropes
      ctx.fillStyle = '#6b3d20';
      var posts = [b.x + 10, b.x + b.w / 2, b.x + b.w - 10];
      for (var p = 0; p < posts.length; p++) {
        ctx.fillRect(posts[p] - 7, b.y - 62, 14, 62 + b.h + 30);
      }
      ctx.strokeStyle = '#4a2a14';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(b.x + 10, b.y - 52);
      ctx.quadraticCurveTo(b.x + b.w / 2, b.y - 8, b.x + b.w - 10, b.y - 52);
      ctx.stroke();

      // Planks
      for (var px = b.x; px < b.x + b.w; px += 36) {
        ctx.fillStyle = (Math.floor(px / 36) % 2) ? '#b9753f' : '#a4642f';
        ctx.fillRect(px, b.y, 34, b.h);
        ctx.fillStyle = 'rgba(40,20,10,0.35)';
        ctx.fillRect(px + 33, b.y, 2, b.h);
      }
      ctx.fillStyle = '#7a4522';
      ctx.fillRect(b.x, b.y + b.h - 4, b.w, 4);

      // Trampolines
      for (var q = 0; q < this.pads.length; q++) {
        var pd = this.pads[q];
        var alpha = Math.min(1, pd.life / 1.5);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff5b5b';
        roundRect(ctx, pd.x, pd.y - 8, pd.w, 16, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (var s = 0; s < pd.w; s += 16) ctx.fillRect(pd.x + s + 4, pd.y - 4, 8, 4);
        ctx.globalAlpha = 1;
      }

      // Items on the way down (shadows) and resting on the bridge
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i];
        if (!it.landed) {
          var prog = Math.min(1, (it.y + 40) / (b.y + 14));
          ctx.fillStyle = 'rgba(20,30,40,' + (0.12 + 0.25 * prog) + ')';
          ctx.beginPath();
          ctx.ellipse(it.landX, b.y + 2, 26 * (0.5 + prog * 0.5), 6, 0, 0, Math.PI * 2);
          ctx.fill();
          this.drawParachute(ctx, it, t);
        } else {
          var pulse = 0.5 + 0.5 * Math.sin(t * 6);
          if (it.life < 3 && Math.floor(t * 8) % 2 === 0) continue;
          ctx.fillStyle = 'rgba(255,240,140,' + (0.25 + 0.2 * pulse) + ')';
          ctx.beginPath(); ctx.arc(it.x, it.y, 30 + pulse * 3, 0, Math.PI * 2); ctx.fill();
          ctx.font = '34px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#000';
          ctx.fillText(window.CONFIG.ITEMS[it.type].icon, it.x, it.y);
        }
      }
    },

    drawParachute: function (ctx, it, t) {
      var sway = Math.sin(t * 2 + it.landX) * 6;
      var cx = it.x + sway;
      var cy = it.y - 46;
      ctx.fillStyle = '#ff6fa0';
      ctx.beginPath();
      ctx.arc(cx, cy, 26, Math.PI, 0);
      ctx.lineTo(cx + 26, cy + 4);
      ctx.quadraticCurveTo(cx, cy + 12, cx - 26, cy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,60,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy + 4); ctx.lineTo(it.x - 8, it.y - 12);
      ctx.moveTo(cx + 26, cy + 4); ctx.lineTo(it.x + 8, it.y - 12);
      ctx.stroke();
      ctx.font = '26px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(window.CONFIG.ITEMS[it.type].icon, it.x, it.y);
    },

    drawFore: function (ctx, t, fighters) {
      // Bowling ball
      if (this.ball && this.ball.active) {
        var bl = this.ball;
        ctx.save();
        ctx.translate(bl.x, bl.y - bl.h / 2);
        ctx.rotate(bl.spin);
        ctx.fillStyle = '#1e2a3a';
        ctx.beginPath(); ctx.arc(0, 0, bl.w / 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8eef6';
        ctx.beginPath(); ctx.arc(-5, -6, 2.4, 0, Math.PI * 2); ctx.arc(4, -4, 2.4, 0, Math.PI * 2); ctx.arc(0, 6, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      // Laser dot
      if (this.laser) {
        var L = this.laser;
        var pul = 0.6 + 0.4 * Math.sin(t * 22);
        ctx.fillStyle = 'rgba(255,40,40,0.25)';
        ctx.beginPath(); ctx.arc(L.x, this.bridge.y - 2, 18 * pul, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff2a2a';
        ctx.beginPath(); ctx.arc(L.x, this.bridge.y - 2, 6, 0, Math.PI * 2); ctx.fill();
      }
      // Held item bubbles + forced "!?" bubble
      for (var i = 0; i < fighters.length; i++) {
        var f = fighters[i];
        if (!f.alive) continue;
        var top = f.y - f.h - 46;
        if (f.item) {
          ctx.fillStyle = 'rgba(16,24,36,0.75)';
          ctx.beginPath(); ctx.arc(f.x, top, 17, 0, Math.PI * 2); ctx.fill();
          ctx.font = '20px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(window.CONFIG.ITEMS[f.item].icon, f.x, top);
        }
        if (f.buffs.forced > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '900 26px system-ui, Segoe UI, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = '#ff2a2a';
          ctx.lineWidth = 4;
          var by = f.y - f.h - 66;
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(f.x + 20, by, 18, 0, Math.PI * 2); ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ff2a2a';
          ctx.fillText('!?', f.x + 20, by + 1);
        }
        if (f.buffs.glove > 0) {
          ctx.font = '22px system-ui, "Segoe UI Emoji", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText('🥊', f.x - 26, f.y - f.h - 36);
        }
        if (f.buffs.umbrella > 0) {
          ctx.font = '22px system-ui, "Segoe UI Emoji", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText('☂️', f.x + 26, f.y - f.h - 36);
        }
      }
    }
  };

  window.Modes = window.Modes || {};
  window.Modes.toyDrop = Mode;
})();
