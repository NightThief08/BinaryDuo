/*
 * Bot AI. The bot only "presses buttons": it writes { left, right, jump, hit, down } into this.output,
 * which the Input layer reads exactly like a keyboard or touch player. Game logic is identical for bot and human.
 * Difficulty = reaction delay + error rate + aggression (CONFIG.BOT).
 */
function Bot(idx, difficulty) {
  this.idx = idx;
  this.diff = CONFIG.BOT[difficulty] ? difficulty : 'easy';
  this.p = CONFIG.BOT[this.diff];
  this.output = { left: false, right: false, jump: false, hit: false, down: false };
  this.reset();
}
Bot.prototype.reset = function () {
  this.planT = 0.3 + Math.random() * 0.3;
  this.plan = { move: 0, jump: false, hit: false, down: false, gapJump: false };
  this.anchorX = null; this.stuckT = 0; this.forceT = 0; this.forceDir = 0; this.sincePress = 0;
  this.output.left = this.output.right = this.output.jump = this.output.hit = this.output.down = false;
};
Bot.prototype.think = function (dt, match) {
  var me = match.fighters[this.idx], opp = match.opponentOf(me), o = this.output, mode = match.mode;
  // Buttons are released every tick so the next press registers as a fresh press.
  var jumpWasDown = o.jump, hitWasDown = o.hit;
  o.jump = false; o.hit = false;
  this.sincePress += dt;
  if (me.out) { o.left = o.right = o.down = false; return; }

  this.planT -= dt;
  if (this.planT <= 0) {
    this.planT = this.p.reaction * (0.7 + Math.random() * 0.6);
    var plan = (BotPlans[mode.id] || BotPlans.generic)(this, me, opp, match);
    if (Math.random() < this.p.error) { plan.move = [-1, 0, 1][Math.floor(Math.random() * 3)]; plan.hit = Math.random() < 0.3; plan.jump = false; }
    if (Math.random() < this.p.idle) { plan.move = 0; plan.hit = false; plan.jump = false; }
    this.plan = plan;
  }
  var move = this.plan.move;

  {
    // Edge safety reflex: never walk into the void unless deliberately jumping a gap
    if (me.onGround && move && !this.plan.gapJump && BotUtil.dangerAhead(me, move, match)) move = 0;
    // Recovery: off the ground with nothing below -> steer back, use double jump / umbrella flap
    if (!me.onGround && !Physics.groundAt(match.platforms, me.x, me.y)) {
      var tgt = BotUtil.nearestGroundX(me, match);
      if (tgt !== null) { move = tgt > me.x ? 1 : -1; if (me.vy > 0 && (me.airJumps > 0 || me.umbrella > 0) && !jumpWasDown) this.plan.jump = true; }
    }
  }
  // Stuck detector: wanted to move for 1.5s without getting anywhere -> forced jump + move
  if (this.forceT > 0) { this.forceT -= dt; move = this.forceDir; }
  else if (move !== 0) {
    if (this.anchorX === null) this.anchorX = me.x;
    this.stuckT += dt;
    if (this.stuckT >= CONFIG.BOT.stuckTime) {
      if (Math.abs(me.x - this.anchorX) < CONFIG.BOT.stuckDist) {
        this.forceT = 0.45; this.forceDir = me.x < CONFIG.WORLD.W / 2 ? 1 : -1; this.plan.jump = true; move = this.forceDir;
      }
      this.stuckT = 0; this.anchorX = me.x;
    }
  } else { this.stuckT = 0; this.anchorX = me.x; }

  o.left = move < 0; o.right = move > 0; o.down = !!this.plan.down;
  if (this.plan.jump && !jumpWasDown) { o.jump = true; this.plan.jump = false; this.plan.gapJump = false; this.sincePress = 0; }
  if (this.plan.hit && !hitWasDown) { o.hit = true; this.plan.hit = false; }
};

var BotUtil = {
  dangerAhead: function (me, dir, match) {
    var look = 26 * me.scale + 18 + Math.abs(me.vx) * 0.12;
    var g = Physics.groundAt(match.platforms, me.x + dir * look, me.y);
    if (!g) return true;
    // stepping down onto a cracked tile = a landing that would shatter it
    if (g.tile && g !== me.ground && g.state >= 1 && Math.abs(g.y - me.y) > 2) return true;
    return false;
  },
  groundBeyond: function (me, dir, match, maxDist) {
    for (var d = 50; d <= maxDist; d += 20) { var g = Physics.groundAt(match.platforms, me.x + dir * d, me.y - 60); if (g) return g; }
    return null;
  },
  nearestGroundX: function (me, match) {
    var best = null, bd = 1e9;
    for (var i = 0; i < match.platforms.length; i++) {
      var p = match.platforms[i];
      if (!p.solid || p.y < me.y - 140) continue;
      var x = Physics.clamp(me.x, p.x + 20, p.x + p.w - 20), d = Math.abs(x - me.x);
      if (d < bd) { bd = d; best = x; }
    }
    return best;
  },
  inRange: function (me, opp) {
    var range = me.reach() * me.scale + opp.halfW() + 6;
    return Math.abs(opp.x - me.x) < range && Math.abs(opp.centerY() - me.centerY()) < (me.height() + opp.height()) * 0.5;
  },
  // Walking toward target x; jumps gaps / raised tiles when there is ground on the other side.
  walkTo: function (bot, me, tx, match, plan) {
    var dx = tx - me.x;
    plan.move = Math.abs(dx) < 10 ? 0 : (dx > 0 ? 1 : -1);
    if (plan.move && me.onGround && BotUtil.dangerAhead(me, plan.move, match)) {
      var gb = BotUtil.groundBeyond(me, plan.move, match, 170);
      var risky = gb && gb.tile && gb.state >= 1 && me.ground && me.ground.state === 0 && !(me.ground.warn > 0);
      if (gb && !risky) { plan.jump = true; plan.gapJump = true; }
    }
    return plan;
  }
};

var BotPlans = {
  generic: function (bot, me, opp, match) {
    var plan = { move: 0, jump: false, hit: false, down: false, gapJump: false };
    if (opp.out) return BotUtil.walkTo(bot, me, CONFIG.WORLD.W / 2, match, plan);
    var dx = opp.x - me.x;
    var want = me.reach() * me.scale * 0.75 + opp.halfW();
    if (Math.abs(dx) > want) BotUtil.walkTo(bot, me, opp.x - Math.sign(dx) * want * 0.8, match, plan);
    if (BotUtil.inRange(me, opp) && Math.random() < bot.p.aggression + 0.15) plan.hit = true;
    if (opp.y < me.y - 90 && Math.abs(dx) < 220 && me.onGround && Math.random() < 0.5) plan.jump = true;
    // cornered near an edge with the opponent close -> try to jump over them
    var away = dx > 0 ? -1 : 1;
    if (me.onGround && Math.abs(dx) < 110 && !Physics.groundAt(match.platforms, me.x + away * 90, me.y) && Math.random() < 0.25 + bot.p.aggression * 0.3) { plan.jump = true; plan.move = dx > 0 ? 1 : -1; plan.gapJump = true; }
    return plan;
  },

  crumble: function (bot, me, opp, match) {
    var mode = match.mode, tiles = mode.tiles, plan = BotPlans.generic(bot, me, opp, match);
    var g = me.ground;
    // Stand on safe tiles: get off cracked or warned tiles first
    if (g && g.tile && (g.state === 1 || g.warn > 0)) {
      var best = null, bd = 1e9;
      for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        if (!t.solid || t.state !== 0 || t.warn > 0 || t === g) continue;
        var d = Math.abs(t.x + t.w / 2 - me.x) + (t.sides ? 60 : 0);
        if (d < bd) { bd = d; best = t; }
      }
      if (best && (g.warn > 0 || Math.random() < 0.7)) { plan.hit = plan.hit && g.warn <= 0; return BotUtil.walkTo(bot, me, best.x + best.w / 2, match, plan); }
    }
    // Push the opponent outward / onto cracked tiles: approach from the centre side
    if (!opp.out) {
      var outward = opp.x < CONFIG.WORLD.W / 2 ? -1 : 1;
      var og = opp.ground;
      if (og && og.tile) { var nb = tiles[og.idx + 1], pb = tiles[og.idx - 1]; if (nb && nb.state === 1) outward = 1; else if (pb && pb.state === 1) outward = -1; }
      var spot = opp.x - outward * (me.reach() * 0.8 + 6);
      if (Math.abs(spot - me.x) > 16 && Math.random() < 0.6) BotUtil.walkTo(bot, me, spot, match, plan);
    }
    if (plan.jump && !plan.gapJump) plan.jump = false; // jumping cracks tiles: only jump to cross gaps
    return plan;
  },

  toydrop: function (bot, me, opp, match) {
    var mode = match.mode, plan = { move: 0, jump: false, hit: false, down: false, gapJump: false };
    var dx = opp.x - me.x, facingOpp = (dx > 0 ? 1 : -1) === me.facing;
    if (me.item === 'bowling') {
      if (Math.abs(dx) > 110 && Math.abs(opp.y - me.y) < 40 && facingOpp && opp.onGround) plan.hit = true;
      else BotUtil.walkTo(bot, me, opp.x - Math.sign(dx || 1) * 260, match, plan);
      return plan;
    }
    if (me.item === 'laser') {
      if (Math.abs(dx) > 90) plan.hit = true; else BotUtil.walkTo(bot, me, me.x - Math.sign(dx || 1) * 120, match, plan);
      return plan;
    }
    // Go for items when it makes sense
    if (me.slotFree() && mode.items.length) {
      var best = null, bd = 1e9;
      for (var i = 0; i < mode.items.length; i++) { var it = mode.items[i], d = Math.abs(it.x - me.x); if (d < bd) { bd = d; best = it; } }
      if (best && (bd < Math.abs(best.x - opp.x) + 40 || Math.random() > bot.p.aggression)) {
        BotUtil.walkTo(bot, me, best.x, match, plan);
        if (BotUtil.inRange(me, opp) && Math.random() < bot.p.aggression) plan.hit = true;
        return plan;
      }
    }
    // avoid laser dots? (not needed) — avoid fighting right at the edge
    plan = BotPlans.generic(bot, me, opp, match);
    if (opp.glove > 0 && me.glove <= 0 && Math.abs(dx) < 200 && Math.random() < 0.5) BotUtil.walkTo(bot, me, me.x - Math.sign(dx || 1) * 150, match, plan);
    return plan;
  },

  giant: function (bot, me, opp, match) {
    var plan = { move: 0, jump: false, hit: false, down: false, gapJump: false };
    var dx = opp.x - me.x, adx = Math.abs(dx);
    if (me.role === 'giant') {
      plan = BotPlans.generic(bot, me, opp, match);
      if (!me.onGround && adx < me.halfW() + 20 && opp.y > me.y) plan.down = true; // stomp
      if (me.onGround && adx < 140 && adx > 40 && Math.random() < bot.p.aggression * 0.35) plan.jump = true;
      return plan;
    }
    // TINY: run away, poke when safe
    if (BotUtil.inRange(me, opp) && opp.attackT < 0 && Math.random() < bot.p.aggression * 0.7) plan.hit = true;
    if (adx < 260) {
      var away = dx > 0 ? -1 : 1;
      var edgeClose = !Physics.groundAt(match.platforms, me.x + away * 120, me.y);
      if (edgeClose) {
        // cornered: hop over the giant toward the open side (double jump helps)
        plan.move = -away; if (me.onGround) { plan.jump = true; plan.gapJump = true; }
        else if (me.airJumps > 0 && me.vy > -100) plan.jump = true;
      } else {
        plan.move = away;
        if (match.mode.left && me.onGround && Math.random() < 0.15) plan.jump = true; // escape to a floating platform
      }
    } else if (adx > 380) BotUtil.walkTo(bot, me, opp.x - Math.sign(dx) * 300, match, plan);
    return plan;
  }
};
