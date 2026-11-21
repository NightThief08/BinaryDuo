/* Minimal 2D physics for stickmen, balls and platforms.
   Coordinates: a body has x = centre, y = feet (bottom). Its box spans
   [x - w/2, x + w/2] × [y - h, y].
   Solids are ONE-WAY platforms: a body only lands on the top surface. There are no walls,
   so nothing can get stuck inside a platform after a size change or a knockback. */
(function () {
  'use strict';

  function xOverlap(b, s) {
    return b.x - b.w / 2 < s.x + s.w && b.x + b.w / 2 > s.x;
  }

  // Fighters stand on the platform under their centre (feet), so they cannot hover over a gap.
  function supports(b, s) {
    return b.x >= s.x - 2 && b.x <= s.x + s.w + 2;
  }

  var Physics = {
    box: function (b) {
      return { l: b.x - b.w / 2, r: b.x + b.w / 2, t: b.y - b.h, b: b.y };
    },

    overlap: function (a, b) {
      return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    },

    // Integrate one body for one fixed step. Gravity / velocity changes are done by the caller
    // (vy must already include gravity). Returns the solid landed on this step, if it is new.
    //   opts.step  -> allow stepping up ledges up to CONFIG.STEP_UP (fighters)
    //   opts.kind  -> 'fighter' (bounces on trampolines, fires onLand) or 'ball' (rolls and bounces)
    integrate: function (b, dt, solids, opts) {
      var CFG = window.CONFIG;
      var EPS = CFG.EPS;
      var wasGround = !!b.onGround;
      var prevLanded = b.landedOn || null;
      var kind = (opts && opts.kind) || 'fighter';
      var stepLimit = wasGround && opts && opts.step && b.vx !== 0;

      // ---- Horizontal ----
      b.x += b.vx * dt;

      // Step up a low ledge while walking on the ground.
      if (stepLimit) {
        var step = null;
        for (var i = 0; i < solids.length; i++) {
          var s = solids[i];
          if (!s.active || !xOverlap(b, s)) continue;
          var rise = b.y - s.y;
          if (rise > 0.5 && rise <= CFG.STEP_UP && (kind === 'ball' || supports(b, s))) {
            if (!step || s.y < step.y) step = s;
          }
        }
        if (step) b.y = step.y;
      }

      // ---- Vertical ----
      var prevY = b.y;
      b.y += b.vy * dt;

      var land = null;
      if (b.vy >= 0) {
        for (var j = 0; j < solids.length; j++) {
          var t = solids[j];
          if (!t.active || !(kind === 'ball' ? xOverlap(b, t) : supports(b, t))) continue;
          if (prevY <= t.y + EPS && b.y >= t.y - EPS) {
            if (!land || t.y < land.y - 0.5) {
              land = t;
            } else if (Math.abs(t.y - land.y) <= 0.5) {
              // Same height: prefer springs, then keep the solid we were already standing on
              // (stops a body straddling a tile gap from flip-flopping between two tiles).
              if ((t.bounce && !land.bounce) || (t === prevLanded && land !== prevLanded && !land.bounce)) land = t;
            }
          }
        }
      }

      b.onGround = false;
      b.landedOn = null;
      var fresh = null;

      if (land) {
        b.y = land.y;
        b.landedOn = land;
        b.onGround = true;
        var impact = b.vy;
        if (!wasGround || land !== prevLanded) fresh = land;

        if (kind === 'fighter' && land.bounce && fresh) {
          // Trampoline / spring: launch upward instead of stopping.
          b.vy = -land.bounce;
          b.onGround = false;
          b.landedOn = null;
        } else if (kind === 'ball' && fresh && impact > 140) {
          b.vy = -impact * 0.42;
          b.onGround = false;
          b.landedOn = null;
        } else {
          b.vy = 0;
        }
      }

      return fresh;
    },

    // Push two fighters apart so they cannot overlap horizontally while both are in the same height band.
    pushApart: function (a, b) {
      var A = Physics.box(a), B = Physics.box(b);
      if (!(A.t < B.b && A.b > B.t)) return;
      var dx = a.x - b.x;
      var overlapX = (a.w + b.w) / 2 - Math.abs(dx);
      if (overlapX <= 0) return;
      var dir = dx === 0 ? (a.id === 0 ? -1 : 1) : Math.sign(dx);
      var totalMass = (a.mass || 1) + (b.mass || 1);
      a.x += dir * overlapX * ((b.mass || 1) / totalMass);
      b.x -= dir * overlapX * ((a.mass || 1) / totalMass);
    }
  };

  window.Physics = Physics;
})();
