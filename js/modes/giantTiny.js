/* Mode: GIANT vs TINY SWAP. Flat stage plus two floating planks, HP bars, 60 s rounds.
   Every 10 s the roles swap (warning countdown at 9 s). Giant: 3x size, 2x mass, 1.5x damage,
   0.6x speed, stomps. Tiny: 0.4x size, 1.8x speed, double jump, 0.6x damage. */
(function () {
  'use strict';

  var CFG = window.CONFIG.MODES.giantTiny;

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
    id: 'giantTiny',
    name: CFG.name,
    time: CFG.time,
    usesHP: true,
    hp: CFG.hp,
    killY: CFG.killY,
    giantIdx: 0,
    swapClock: 0,
    nextSwap: CFG.swapEvery,
    swapFlashT: 0,
    swapCount: 0,
    stage: null,
    floats: [],
    _solids: [],

    setup: function (fighters) {
      var s = CFG.stage;
      this.stage = { x: s.x, y: s.y, w: s.w, h: s.h, active: true, bounce: 0, botAvoid: false, name: 'stage' };
      this.floats = [];
      for (var i = 0; i < CFG.floats.length; i++) {
        var fl = CFG.floats[i];
        this.floats.push({ x: fl.x, y: fl.y, w: fl.w, h: fl.h, active: true, bounce: 0, botAvoid: false, name: 'float' + i });
      }
      // First assignment is random.
      this.giantIdx = Math.random() < 0.5 ? 0 : 1;
      this.swapClock = 0;
      this.nextSwap = CFG.swapEvery;
      this.swapFlashT = 0;
      this.swapCount = 0;
      for (var f = 0; f < fighters.length; f++) {
        fighters[f].reset(CFG.spawnX[f], s.y, f === 0 ? 1 : -1);
        fighters[f].hp = CFG.hp;
        fighters[f].maxHp = CFG.hp;
      }
      this.applyRoles(fighters, 0);
    },

    applyRoles: function (fighters, time) {
      for (var i = 0; i < fighters.length; i++) {
        var f = fighters[i];
        if (i === this.giantIdx) {
          f.setRole({ mass: CFG.giant.mass, speed: CFG.giant.speed, dmg: CFG.giant.dmg, kbMult: 1, extraJumps: CFG.giant.extraJumps });
          f.setScale(CFG.giant.scale, time || 0.01);
        } else {
          f.setRole({ mass: CFG.tiny.mass, speed: CFG.tiny.speed, dmg: CFG.tiny.dmg, kbMult: 1, extraJumps: CFG.tiny.extraJumps });
          f.setScale(CFG.tiny.scale, time || 0.01);
        }
      }
    },

    solids: function () {
      var out = [this.stage];
      for (var i = 0; i < this.floats.length; i++) out.push(this.floats[i]);
      return out;
    },

    env: function () { return { usesHP: true, glove: null, umbrella: null }; },

    // Returns a banner/status for the HUD, e.g. the 1-second countdown before a swap.
    status: function () {
      var left = this.nextSwap - this.swapClock;
      if (left <= CFG.warn && left > 0) return { text: 'SWAP IN ' + Math.ceil(left), color: '#ffe27a' };
      return null;
    },

    onHitPress: function () { return false; },

    update: function (dt, fighters, env, roundT) {
      this.swapClock += dt;
      this.swapFlashT = Math.max(0, this.swapFlashT - dt);
      var warnStart = this.nextSwap - CFG.warn;
      if (this.swapClock >= this.nextSwap) {
        this.giantIdx = 1 - this.giantIdx;
        this.nextSwap += CFG.swapEvery;
        this.swapCount += 1;
        this.applyRoles(fighters, CFG.scaleTime);
        this.swapFlashT = 1.2;
        window.SFX.play('swap');
        if (window.Engine) {
          window.Engine.flash('#ffffff');
          window.Engine.popText(window.CONFIG.W / 2, 220, 'SWAP!', '#ffe27a');
          window.Engine.shake(window.Store.getSettings().shake ? 6 : 0);
        }
      } else if (this.swapClock >= warnStart && !this._warned && this.swapClock < this.nextSwap) {
        this._warned = true;
        window.SFX.play('beep');
      }
      if (this.swapClock < warnStart) this._warned = false;

      // Giant stomps Tiny.
      var g = fighters[this.giantIdx], t = fighters[1 - this.giantIdx];
      if (g && t) window.Combat.stomp(g, t, env);
    },

    draw: function (ctx, t) {
      var W = window.CONFIG.W, H = window.CONFIG.H;
      // Dusk sky
      var sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#ff9a5a');
      sky.addColorStop(0.45, '#a25a8f');
      sky.addColorStop(1, '#2b2350');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // Moon
      ctx.fillStyle = '#fff0cf';
      ctx.beginPath(); ctx.arc(1120, 110, 46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,207,0.12)';
      ctx.beginPath(); ctx.arc(1120, 110, 110, 0, Math.PI * 2); ctx.fill();
      // Distant mountains
      ctx.fillStyle = '#4a3a6e';
      ctx.beginPath();
      ctx.moveTo(0, 520);
      for (var x = 0; x <= W; x += 60) ctx.lineTo(x, 430 + Math.sin(x * 0.009) * 50 + Math.cos(x * 0.02) * 20);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

      // Lanterns
      for (var l = 0; l < 6; l++) {
        var lx = 120 + l * 200;
        ctx.strokeStyle = 'rgba(40,20,20,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(lx, 120); ctx.lineTo(lx, 170); ctx.stroke();
        ctx.fillStyle = 'rgba(255,190,80,0.9)';
        roundRect(ctx, lx - 12, 170, 24, 30, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,200,90,0.18)';
        ctx.beginPath(); ctx.arc(lx, 185, 46, 0, Math.PI * 2); ctx.fill();
      }

      // Floating planks
      for (var i = 0; i < this.floats.length; i++) this.drawPlank(ctx, this.floats[i], false);

      // Main stage
      var s = this.stage;
      ctx.fillStyle = '#6b3d1f';
      ctx.fillRect(s.x, s.y + s.h, s.w, H - (s.y + s.h));
      this.drawPlank(ctx, s, true);

      // Swap flash overlay
      if (this.swapFlashT > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * this.swapFlashT / 1.2) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    },

    drawPlank: function (ctx, p, main) {
      ctx.fillStyle = main ? '#a86b3a' : '#c9925a';
      roundRect(ctx, p.x, p.y, p.w, p.h, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,30,12,0.45)';
      ctx.lineWidth = 2;
      for (var gx = p.x + 40; gx < p.x + p.w; gx += 60) {
        ctx.beginPath(); ctx.moveTo(gx, p.y + 3); ctx.lineTo(gx, p.y + p.h - 3); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(p.x + 4, p.y + 2, p.w - 8, 3);
    },

    drawFore: function (ctx, t, fighters) {
      // Role icons above each fighter.
      for (var i = 0; i < fighters.length; i++) {
        var f = fighters[i];
        if (!f.alive) continue;
        var isGiant = i === this.giantIdx;
        var icon = isGiant ? '🐘' : '🐭';
        var hint = isGiant ? 'CHASE!' : 'RUN!';
        var bx = f.x;
        // Sit above the name pill (same height rule as Fighter.draw).
        var by = f.y - f.h - 18 * Math.max(1, f.scale * 0.8) - 40;
        ctx.save();
        ctx.font = '900 ' + Math.round(isGiant ? 20 : 16) + 'px system-ui, Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var label = icon + ' ' + hint;
        var tw = ctx.measureText(label).width;
        ctx.fillStyle = isGiant ? 'rgba(255,120,60,0.92)' : 'rgba(80,190,255,0.92)';
        roundRect(ctx, bx - tw / 2 - 10, by - 14, tw + 20, 28, 12);
        ctx.fill();
        ctx.fillStyle = '#0c1220';
        ctx.fillText(label, bx, by + 1);
        ctx.restore();
      }
    }
  };

  window.Modes = window.Modes || {};
  window.Modes.giantTiny = Mode;
})();
