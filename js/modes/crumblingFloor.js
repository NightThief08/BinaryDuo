/* Mode: CRUMBLING FLOOR DUEL. 10 glass tiles. First landing cracks a tile, second landing shatters it.
   After 20 s one random tile shatters every 2 s (highlighted 1 s before), so a finish is guaranteed. */
(function () {
  'use strict';

  var CFG = window.CONFIG.MODES.crumblingFloor;

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

  function makeTile(i, x, y) {
    var tile = {
      idx: i, x: x, y: y, w: CFG.tileW, h: CFG.tileH,
      state: 'intact', active: true, warn: false, botAvoid: false,
      fallY: 0, fallV: 0, fading: 0, cracks: null, name: 'tile' + i
    };
    tile.onLand = function (f, env) {
      if (!tile.active) return;
      if (tile.state === 'intact') {
        tile.state = 'cracked';
        tile.botAvoid = true;
        tile.cracks = makeCracks(tile.w, tile.h);
        window.SFX.play('crack');
        if (window.Engine) {
          window.Engine.burst(f.x, tile.y, '#e6fbff', 6, 140, 3);
          window.Engine.shake(window.Store.getSettings().shake ? 3 : 0);
        }
      } else if (tile.state === 'cracked') {
        Mode.shatter(tile);
      }
    };
    return tile;
  }

  function makeCracks(w, h) {
    var lines = [];
    var n = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var sx = rnd(w * 0.2, w * 0.8), sy = rnd(h * 0.1, h * 0.9);
      var pts = [[sx, sy]];
      var len = 3 + Math.floor(Math.random() * 3);
      for (var k = 0; k < len; k++) {
        var last = pts[pts.length - 1];
        pts.push([last[0] + rnd(-22, 22), last[1] + rnd(-14, 14)]);
      }
      lines.push(pts);
    }
    return lines;
  }

  var Mode = {
    id: 'crumblingFloor',
    name: CFG.name,
    time: CFG.time,
    usesHP: false,
    hp: 0,
    killY: CFG.killY,
    tiles: [],
    autoNext: CFG.autoStart,
    pending: [],
    _solids: [],

    setup: function (fighters) {
      var n = CFG.tileCount;
      var total = n * CFG.tileW + (n - 1) * CFG.tileGap;
      var x0 = (window.CONFIG.W - total) / 2;
      this.tiles = [];
      // Two random raised tiles (not the spawn tiles), for variety.
      var raised = {};
      var pool = [];
      for (var p = 0; p < n; p++) if (CFG.spawnTiles.indexOf(p) === -1) pool.push(p);
      for (var r = 0; r < CFG.raisedCount && pool.length; r++) {
        var pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        raised[pick] = true;
      }
      for (var i = 0; i < n; i++) {
        var y = CFG.tileY - (raised[i] ? CFG.raiseBy : 0);
        this.tiles.push(makeTile(i, x0 + i * (CFG.tileW + CFG.tileGap), y));
      }
      this.autoNext = CFG.autoStart;
      this.pending = [];
      this.clock = 0;
      for (var f = 0; f < fighters.length; f++) {
        var t = this.tiles[CFG.spawnTiles[f]];
        fighters[f].reset(t.x + t.w / 2, t.y, f === 0 ? 1 : -1);
        fighters[f].hp = 0;
        fighters[f].maxHp = 0;
        fighters[f].setRole({ kbMult: CFG.kbMult });
      }
    },

    isOccupied: function (tile, fighters) {
      for (var k = 0; k < fighters.length; k++) {
        if (fighters[k].onGround && fighters[k].landedOn === tile) return true;
      }
      return false;
    },

    hasEmptyTile: function (fighters, except) {
      for (var i = 0; i < this.tiles.length; i++) {
        var t = this.tiles[i];
        if (t !== except && t.active && !t.warn && !this.isOccupied(t, fighters)) return true;
      }
      return false;
    },

    solids: function () {
      var out = [];
      for (var i = 0; i < this.tiles.length; i++) {
        var t = this.tiles[i];
        t.botAvoid = t.state !== 'intact' || t.warn;
        if (t.active) out.push(t);
      }
      return out;
    },

    env: function () { return { glove: null, usesHP: false, umbrella: null }; },

    shatter: function (tile) {
      if (!tile.active) return;
      tile.active = false;
      tile.state = 'shatter';
      tile.warn = false;
      tile.fallV = 0;
      tile.fading = 1.4;
      window.SFX.play('shatter');
      if (window.Engine) {
        window.Engine.burst(tile.x + tile.w / 2, tile.y + 4, '#bfefff', 34, 320, 5);
        window.Engine.shake(window.Store.getSettings().shake ? window.CONFIG.SHAKE_HIT : 0);
      }
    },

    update: function (dt, fighters, env, roundT) {
      var i;
      this.clock += dt;
      var t = this.clock;

      // Guaranteed finish: after autoStart, one random remaining tile is highlighted, then shatters 1 s later.
      if (t >= this.autoNext) {
        var pool = [];
        var fallback = [];
        for (i = 0; i < this.tiles.length; i++) {
          var tt = this.tiles[i];
          if (!tt.active || tt.warn) continue;
          fallback.push(tt);
          if (!this.isOccupied(tt, fighters)) pool.push(tt);
        }
        if (!pool.length) pool = fallback;   // finish is still guaranteed when only occupied tiles remain
        if (pool.length) {
          var pick = pool[Math.floor(Math.random() * pool.length)];
          pick.warn = true;
          this.pending.push({ tile: pick, at: t + CFG.warn });
        }
        this.autoNext += CFG.autoEvery;
      }
      for (i = this.pending.length - 1; i >= 0; i--) {
        if (t >= this.pending[i].at) {
          var p = this.pending[i];
          this.pending.splice(i, 1);
          // Someone stepped onto the warned tile: skip it while other empty tiles exist,
          // so nobody is dropped by the floor without warning. Finish is still guaranteed.
          if (this.isOccupied(p.tile, fighters) && this.hasEmptyTile(fighters, p.tile)) {
            p.tile.warn = false;
            continue;
          }
          this.shatter(p.tile);
        }
      }

      // Shattered tiles fall away visually.
      for (i = 0; i < this.tiles.length; i++) {
        var q = this.tiles[i];
        if (q.state === 'shatter') {
          q.fallV += window.CONFIG.GRAVITY * 0.6 * dt;
          q.fallY += q.fallV * dt;
          q.fading = Math.max(0, q.fading - dt);
        }
      }
    },

    onHitPress: function () { return false; },

    draw: function (ctx, t) {
      var W = window.CONFIG.W, H = window.CONFIG.H;
      // Ice-cave background
      var bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#1b2e44');
      bg.addColorStop(0.6, '#2a4c6e');
      bg.addColorStop(1, '#0b1624');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // Crystal shards in the background
      ctx.fillStyle = 'rgba(160,220,255,0.08)';
      for (var s = 0; s < 14; s++) {
        var sx = (s * 97) % W, sy = 60 + ((s * 53) % 260);
        ctx.beginPath();
        ctx.moveTo(sx, sy); ctx.lineTo(sx + 40, sy + 70); ctx.lineTo(sx - 10, sy + 110); ctx.closePath();
        ctx.fill();
      }
      // Void glow beneath the floor
      var vg = ctx.createRadialGradient(W / 2, H, 40, W / 2, H, 700);
      vg.addColorStop(0, 'rgba(90,40,140,0.5)');
      vg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 380, W, H - 380);

      for (var i = 0; i < this.tiles.length; i++) {
        var tile = this.tiles[i];
        if (tile.state === 'shatter') {
          if (tile.fading <= 0) continue;
          ctx.globalAlpha = Math.min(1, tile.fading / 0.6);
          ctx.save();
          ctx.translate(0, tile.fallY);
          this.drawTile(ctx, tile, t, true);
          ctx.restore();
          ctx.globalAlpha = 1;
        } else {
          this.drawTile(ctx, tile, t, false);
        }
      }
    },

    drawTile: function (ctx, tile, t, shard) {
      var x = tile.x, y = tile.y, w = tile.w, h = tile.h;
      // Glass body
      var grad = ctx.createLinearGradient(0, y, 0, y + h);
      if (tile.state === 'cracked') {
        grad.addColorStop(0, '#d8f4ff');
        grad.addColorStop(1, '#7fc3e8');
      } else {
        grad.addColorStop(0, '#f2fbff');
        grad.addColorStop(1, '#9ad8f2');
      }
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, w, h, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Gloss
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + 6, y + 3, w - 12, 3);
      // Cracks
      if (tile.cracks && !shard) {
        ctx.strokeStyle = 'rgba(30,60,90,0.85)';
        ctx.lineWidth = 2;
        for (var c = 0; c < tile.cracks.length; c++) {
          var pts = tile.cracks[c];
          ctx.beginPath();
          ctx.moveTo(x + pts[0][0], y + pts[0][1]);
          for (var k = 1; k < pts.length; k++) ctx.lineTo(x + pts[k][0], y + pts[k][1]);
          ctx.stroke();
        }
      }
      // Warning highlight (1 s before auto-shatter)
      if (tile.warn && !shard) {
        var pulse = 0.5 + 0.5 * Math.sin(t * 18);
        ctx.strokeStyle = 'rgba(255,' + Math.round(60 + 80 * pulse) + ',60,1)';
        ctx.lineWidth = 5;
        roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 7);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,60,60,' + (0.2 + 0.25 * pulse) + ')';
        roundRect(ctx, x, y, w, h, 5);
        ctx.fill();
      }
    },

    drawFore: function () {
      // Nothing extra: the tiles are the whole arena.
    }
  };

  window.Modes = window.Modes || {};
  window.Modes.crumblingFloor = Mode;
})();
