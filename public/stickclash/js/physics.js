/* Tiny physics toolkit: platform helpers. */
var Physics = (function () {
  function Point(x, y, r, m) { this.x = x; this.y = y; this.px = x; this.py = y; this.r = r || 4; this.m = m || 1; this.ground = false; }
  Point.prototype.vel = function (dt) { return { x: (this.x - this.px) / dt, y: (this.y - this.py) / dt }; };
  Point.prototype.addVel = function (vx, vy, dt) { this.px -= vx * dt; this.py -= vy * dt; };

  function Stick(a, b, stiff) { this.a = a; this.b = b; this.len = Math.hypot(a.x - b.x, a.y - b.y); this.stiff = stiff === undefined ? 1 : stiff; }

  function integrate(points, gravity, dt, damping) {
    var d = damping === undefined ? 0.995 : damping;
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var vx = (p.x - p.px) * d, vy = (p.y - p.py) * d;
      // velocity cap keeps the sim stable on slow devices
      var sp = Math.hypot(vx, vy), max = 45;
      if (sp > max) { vx *= max / sp; vy *= max / sp; }
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + gravity * dt * dt;
      p.ground = false;
    }
  }
  function solveSticks(sticks, iterations) {
    for (var k = 0; k < iterations; k++) {
      for (var i = 0; i < sticks.length; i++) {
        var s = sticks[i], a = s.a, b = s.b;
        var dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        var diff = (dist - s.len) / dist * s.stiff;
        var wa = b.m / (a.m + b.m), wb = a.m / (a.m + b.m);
        a.x += dx * diff * wa; a.y += dy * diff * wa;
        b.x -= dx * diff * wb; b.y -= dy * diff * wb;
      }
    }
  }
  // Push a point out of an axis-aligned rectangle; friction on the top surface.
  function collideRect(p, rect, friction) {
    if (!rect || rect.w <= 0) return false;
    var l = rect.x - p.r, r = rect.x + rect.w + p.r, t = rect.y - p.r, b = rect.y + rect.h + p.r;
    if (p.x <= l || p.x >= r || p.y <= t || p.y >= b) return false;
    var dl = p.x - l, dr = r - p.x, dt = p.y - t, db = b - p.y;
    var m = Math.min(dl, dr, dt, db);
    if (m === dt) { p.y = t; p.ground = true; var f = friction === undefined ? 0.25 : friction; p.px = p.x - (p.x - p.px) * (1 - f); if (p.py < p.y) p.py = p.y + (p.y - p.py) * 0.0; }
    else if (m === db) p.y = b;
    else if (m === dl) p.x = l;
    else p.x = r;
    return true;
  }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 0.0001;
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    var cx = ax + dx * t, cy = ay + dy * t;
    return { d: Math.hypot(px - cx, py - cy), x: cx, y: cy };
  }
  // Highest solid platform whose top is at/below y and spans x.
  function groundAt(platforms, x, y, margin) {
    var best = null;
    var m = margin || 0;
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (!p.solid) continue;
      if (x >= p.x - m && x <= p.x + p.w + m && p.y >= y - 6) { if (!best || p.y < best.y) best = p; }
    }
    return best;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  return { Point: Point, Stick: Stick, integrate: integrate, solveSticks: solveSticks, collideRect: collideRect, segDist: segDist, groundAt: groundAt, clamp: clamp, lerp: lerp, rand: rand };
})();
