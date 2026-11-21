/* Bot AI. The bot only "presses buttons": it writes held directions and tap-presses into the same
   Input layer a human uses, so game logic is identical for bot and player.

   Edge safety (the bot must never walk itself off a platform):
   - Every fixed step the bot checks the spot where it would STOP if it kept moving.
     If that spot is not on a platform it brakes instead (or hops only to a confirmed landing).
   - Walking never steps down off a ledge; it only steps up.
   - Stuck detector: no meaningful movement for 1.5 s → jump in place and steer to the platform centre.
   - Air control steers toward the nearest platform, so a knocked-back bot tries to recover. */
(function () {
  'use strict';

  function rnd() { return Math.random(); }
  function sgn(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }

  // Walkable: a platform the body could stand on at x without stepping down.
  function walkableAt(me, x, solids) {
    var STEP = window.CONFIG.STEP_UP;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (!s.active) continue;
      if (x < s.x + 14 || x > s.x + s.w - 14) continue;
      var diff = me.y - s.y;           // >0 = platform is below the feet (a drop)
      if (diff < -1.5) continue;       // no stepping DOWN off a ledge
      if (diff > STEP + 2) continue;   // too high to step up
      return true;
    }
    return false;
  }

  // A confirmed landing spot ahead (for a deliberate hop across a gap).
  function hopLanding(me, d, solids, maxDist) {
    var best = null;
    for (var i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (!s.active) continue;
      var near = d > 0 ? s.x + 14 - me.x : me.x - (s.x + s.w - 14);
      if (near <= 10 || near > maxDist) continue;
      if (Math.abs(s.y - me.y) > 60) continue;
      if (!best || near < best.near) best = { solid: s, near: near };
    }
    return best ? best.solid : null;
  }

  // Bang-bang steering toward a target: accelerate, or brake early enough to stop on the target.
  function steerDir(dx, vx, accel) {
    if (Math.abs(dx) < 6 && Math.abs(vx) < 30) return 0;
    var stop = (vx * vx) / (2 * accel);
    var s = dx >= 0 ? 1 : -1;
    if (Math.abs(vx) < 1) return s;
    if (sgn(vx) === s) {
      return Math.abs(dx) > stop + 4 ? s : -s;   // keep going, or brake
    }
    return s;                                    // moving away: turn around
  }

  function inReach(me, foe) {
    var C = window.CONFIG;
    var reach = C.ATTACK.punch.reach * (0.6 + 0.4 * me.scale);
    var gap = Math.abs(foe.x - me.x) - (me.w + foe.w) / 2;
    var facingFoe = sgn(foe.x - me.x) === me.facing || Math.abs(foe.x - me.x) < 4;
    return facingFoe && gap <= reach - 4 && Math.abs(foe.y - me.y) < me.h * 0.6 &&
      me.cooldown <= 0 && me.stun <= 0;
  }

  // Strategy per mode. Returns {target, hit, jump}.
  var STRAT = {
    toyDrop: function (brain, me, foe, mode, solids) {
      var out = { target: foe.x, hit: false, jump: false };
      var dx = foe.x - me.x, adx = Math.abs(dx);
      if (me.item === 'bowling') {
        // Throw when the opponent is on the same line in front of us.
        if (adx > 120 && adx < 520 && Math.abs(foe.y - me.y) < 90 && sgn(dx) === me.facing) out.hit = me.cooldown <= 0;
        out.target = me.x;
        return out;
      }
      if (me.item === 'laser') {
        if (adx < 380) out.hit = true;
        out.target = me.x;
        return out;
      }
      // No item: grab the nearest item (parachute landing point or landed item) if it is nearer than the foe.
      var best = null;
      var items = mode.items || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.taken) continue;
        var ix = it.landed ? it.x : it.landX;
        var d = Math.abs(ix - me.x);
        if (d < 360 && (!best || d < best.d)) best = { x: ix, d: d };
      }
      if (best && best.d < adx + 60) {
        out.target = best.x;
      } else if (!brain.aggressive && adx < 170) {
        out.target = me.x + sgn(me.x - foe.x) * 170;   // back off a little when not feeling aggressive
      }
      out.hit = inReach(me, foe) && brain.aggressive;
      if (inReach(me, foe) && !brain.aggressive) out.hit = rnd() < 0.3;
      return out;
    },

    crumblingFloor: function (brain, me, foe, mode, solids) {
      var out = { target: foe.x, hit: false, jump: false };
      var tiles = mode.tiles || [];
      // Push the opponent toward a cracked tile: stand on the far side of them from the crack.
      var crack = null;
      for (var j = 0; j < tiles.length; j++) {
        var c = tiles[j];
        if (!c.active || c.state !== 'cracked') continue;
        var dc = Math.abs(c.x + c.w / 2 - foe.x);
        if (dc < 220 && (!crack || dc < crack.d)) crack = { x: c.x + c.w / 2, d: dc };
      }
      if (crack && foe.onGround) {
        var side = crack.x > foe.x ? 1 : -1;
        out.target = foe.x - side * 40;
      }
      out.hit = inReach(me, foe) && (brain.aggressive || rnd() < 0.5);
      return out;
    },

    giantTiny: function (brain, me, foe, mode, solids) {
      var out = { target: foe.x, hit: false, jump: false };
      var dx = foe.x - me.x, adx = Math.abs(dx);
      var isGiant = me.scale > 1.5;
      if (isGiant) {
        out.target = foe.x;
        out.hit = inReach(me, foe);
        // Jump to reach a foe standing on a float above.
        if (foe.y < me.y - 120 && me.onGround && brain.aggressive) out.jump = true;
        return out;
      }
      // Tiny: run from the giant, poke when there is a gap; double-jump to escape.
      if (adx < 260) {
        out.target = me.x + sgn(me.x - foe.x) * 300;
        if (me.onGround && adx < 150 && rnd() < 0.25) out.jump = true;
      } else {
        out.target = foe.x + (me.x < foe.x ? -110 : 110);
      }
      out.hit = inReach(me, foe) && brain.aggressive;
      return out;
    }
  };

  function decide(brain, me, foe, mode, solids) {
    var s = STRAT[mode.id] ? STRAT[mode.id](brain, me, foe, mode, solids) : STRAT.giantTiny(brain, me, foe, mode, solids);
    // Difficulty error rate: sometimes wander or fumble the attack timing.
    if (rnd() < brain.cfg.error) {
      if (rnd() < 0.5) s.target = me.x + (rnd() * 2 - 1) * 150;
      else s.hit = false;
    }
    return { target: s.target, hit: !!s.hit, jump: !!s.jump };
  }

  // Per-step navigation with edge safety. Returns {dir, jump}.
  function navigate(me, targetX, solids, allowHop) {
    var F = window.CONFIG.FIGHTER;
    var accel = me.onGround ? F.groundAccel : F.airAccel;
    var dir = steerDir(targetX - me.x, me.vx, accel);
    var out = { dir: dir, jump: false, blocked: false };

    if (!me.onGround) return out;   // airborne: air control handled by the caller

    if (dir !== 0) {
      // Where would I stop if I kept this direction? Must still be on a platform.
      var stopDist = (me.vx * me.vx) / (2 * accel) + 14;
      var stopX = me.x + sgn(dir) * stopDist;
      if (!walkableAt(me, stopX, solids)) {
        // Edge ahead. Hop only to a confirmed landing, otherwise brake.
        var landing = allowHop ? hopLanding(me, dir, solids, 150) : null;
        if (landing) {
          out.hop = true;                  // jump now (no cooldown) and steer to the landing
          out.landing = landing;
          out.dir = dir;
        } else {
          out.blocked = true;
          out.dir = me.vx > 6 ? -1 : (me.vx < -6 ? 1 : 0);
          if (out.dir !== 0 && !walkableAt(me, me.x + out.dir * 14, solids)) out.dir = 0;
        }
      }
    }
    return out;
  }

  // Air control: steer toward the best platform (never a stop, just a landing target).
  function airSteer(me, plan, solids, hopTarget) {
    var F = window.CONFIG.FIGHTER;
    var tx = null;
    if (hopTarget !== null && hopTarget !== undefined) {
      tx = hopTarget;
    } else if (plan && plan.target !== undefined && plan.target !== null) {
      // Use the plan target only if a platform sits under it.
      for (var i = 0; i < solids.length; i++) {
        var s = solids[i];
        if (s.active && plan.target > s.x + 6 && plan.target < s.x + s.w - 6) { tx = plan.target; break; }
      }
    }
    if (tx === null) {
      var best = null;
      for (var j = 0; j < solids.length; j++) {
        var p = solids[j];
        if (!p.active) continue;
        var cx = Math.min(Math.max(me.x, p.x + 16), p.x + p.w - 16);
        var score = Math.abs(cx - me.x) + 0.6 * Math.abs(p.y - me.y);
        if (!best || score < best.score) best = { x: cx, score: score, solid: p };
      }
      tx = best ? best.x : me.x;
    }
    var dir = steerDir(tx - me.x, me.vx, F.airAccel);
    return { dir: dir };
  }

  var AI = {
    create: function (difficultyKey) {
      var cfg = window.CONFIG.BOT[difficultyKey] || window.CONFIG.BOT.medium;
      return {
        cfg: cfg,
        think: 0,
        clock: 0,
        plan: { target: null, dir: 0, jumpTap: false, hitTap: false, hop: false },
        anchorX: 0,
        anchorY: 0,
        anchorT: 0,
        aggressive: true,
        moodT: 0,
        hopUntil: 0,
        hopTarget: null
      };
    },

    reset: function (brain, me) {
      brain.think = 0;
      brain.clock = 0;
      brain.anchorX = me.x;
      brain.anchorY = me.y;
      brain.anchorT = 0;
      brain.plan = { target: null, dir: 0, jumpTap: false, hitTap: false, hop: false };
      brain.aggressive = true;
      brain.moodT = 0;
      brain.hopUntil = 0;
      brain.hopTarget = null;
      window.Input.clearBot(me.id);
    },

    // Called once per fixed step, before the fighter reads its input.
    tick: function (brain, dt, me, foe, mode) {
      var C = window.CONFIG;
      var slot = me.id;
      brain.clock += dt;
      brain.think -= dt;
      brain.moodT -= dt;
      if (brain.moodT <= 0) {
        brain.moodT = 1.6 + rnd() * 1.4;
        brain.aggressive = rnd() < brain.cfg.aggression;
      }
      if (!me.alive) {
        window.Input.setBotHeld(slot, { left: false, right: false, fall: false });
        return;
      }

      // Stuck detector: no meaningful movement for 1.5 s → unstick (jump in place, steer to centre).
      var moved = Math.hypot(me.x - brain.anchorX, me.y - brain.anchorY);
      if (moved > C.BOT_STUCK_DISTANCE) {
        brain.anchorX = me.x;
        brain.anchorY = me.y;
        brain.anchorT = brain.clock;
      }
      var stuck = brain.clock - brain.anchorT > C.BOT_STUCK_SECONDS && me.onGround && !me.attack && me.stun <= 0;
      var solids = mode.solids();
      var botSolids = [];
      for (var k = 0; k < solids.length; k++) {
        var s = solids[k];
        if (!s.botAvoid || s === me.landedOn) botSolids.push(s);
      }

      if (brain.think <= 0 || stuck) {
        brain.think = brain.cfg.delay * (0.85 + rnd() * 0.3);
        if (stuck) {
          var p = me.landedOn;
          var canJump = !(p && (p.warn || p.state === 'cracked' || p.state === 'shatter'));
          brain.plan = { target: p ? p.x + p.w / 2 : me.x, dir: 0, jumpTap: canJump, hitTap: false, hop: true, escape: true };
          brain.anchorT = brain.clock;
        } else {
          var d = decide(brain, me, foe, mode, botSolids);
          brain.plan = { target: d.target, dir: 0, jumpTap: d.jump, hitTap: d.hit, hop: true, escape: false };
        }
        if (brain.plan.jumpTap) window.Input.botTap(slot, 'jump');
        if (brain.plan.hitTap) window.Input.botTap(slot, 'hit');
        brain.plan.jumpTap = false;
        brain.plan.hitTap = false;
      }

      // Every step: navigate with edge safety (the plan target may change as things move).
      var plan = brain.plan;
      var held;
      // Never jump in place off a cracked / warned tile: the landing would shatter it.
      var safeToJumpInPlace = !(me.landedOn && (me.landedOn.warn || me.landedOn.state === 'cracked' || me.landedOn.state === 'shatter'));
      if (brain.jumpCool === undefined) brain.jumpCool = -10;
      if (me.onGround && plan.escape && brain.clock - brain.jumpCool > 0.3) {
        // Stuck: hop to the nearest intact tile (either side) rather than sitting still.
        var esc = null;
        for (var e = 0; e < botSolids.length; e++) {
          var q = botSolids[e];
          if (!q.active || q === me.landedOn || q.botAvoid) continue;
          var qc = q.x + q.w / 2;
          var dq = Math.abs(qc - me.x);
          if (dq < 240 && (!esc || dq < esc.d)) esc = { x: qc, d: dq };
        }
        if (esc) {
          window.Input.botTap(slot, 'jump');
          brain.jumpCool = brain.clock;
          brain.hopTarget = esc.x;
          brain.hopUntil = brain.clock + 1.3;
          plan.escape = false;
        }
      }
      if (me.onGround) {
        var nav = navigate(me, plan.target === null ? me.x : plan.target, botSolids, plan.hop);
        if (nav.hop) {
          // Planned hop: jump right now and steer toward the confirmed landing tile.
          window.Input.botTap(slot, 'jump');
          brain.hopTarget = nav.landing.x + nav.landing.w / 2;
          brain.hopUntil = brain.clock + 1.3;
        }
        held = { left: nav.dir < 0, right: nav.dir > 0, fall: false };
        if (nav.blocked && me.stun <= 0 && foe && Math.abs(foe.x - me.x) < 160 && brain.aggressive &&
            safeToJumpInPlace && brain.clock - brain.jumpCool > 0.6) {
          // Cornered while the foe is close: jump instead of standing still on the edge.
          window.Input.botTap(slot, 'jump');
          brain.jumpCool = brain.clock;
        }
      } else {
        var hopTarget = brain.hopUntil > brain.clock ? brain.hopTarget : null;
        var air = airSteer(me, plan, botSolids, hopTarget);
        held = { left: air.dir < 0, right: air.dir > 0, fall: false };
        // Recovery jump when falling far below the stage and an air jump is left.
        if (me.jumpsLeft > 0 && me.vy > 0 && brain.clock - brain.jumpCool > 0.5) {
          var below = botSolids.some(function (q) { return q.active && q.y < me.y - 60; });
          if (below) { window.Input.botTap(slot, 'jump'); brain.jumpCool = brain.clock; }
        }
      }
      window.Input.setBotHeld(slot, held);
    }
  };

  window.AI = AI;
})();
