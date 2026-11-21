/* Engine: fixed-timestep loop (60 Hz simulation decoupled from rendering), letterboxed
   canvas scaling (fixed 1280x720 logical resolution), hit-stop, shake, particles and text pops. */
(function () {
  'use strict';

  var canvas = null;
  var ctx = null;
  var scale = 1;              // backing-store px per logical px
  var acc = 0;
  var last = 0;
  var stopTimer = 0;         // hit-stop, real seconds
  var shakeAmp = 0;
  var shakeT = 0;
  var shakeDur = 0.2;
  var fxParts = [];
  var pops = [];
  var frames = 0;
  var fpsAcc = 0;
  var fpsValue = 0;
  var updateFn = null;
  var renderFn = null;
  var running = false;
  var lastShake = { x: 0, y: 0 };

  function rnd(a, b) { return a + Math.random() * (b - a); }

  var Engine = {
    timeScale: 1,              // slow-motion factor applied to simulation steps
    paused: false,
    W: 1280,
    H: 720,
    onFlash: null,             // fn(color) — DOM flash supplied by UI

    init: function (opts) {
      canvas = opts.canvas;
      ctx = canvas.getContext('2d');
      updateFn = opts.update;
      renderFn = opts.render;
      Engine.resize();
      window.addEventListener('resize', Engine.resize);
      window.addEventListener('orientationchange', Engine.resize);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', Engine.resize);
      if (!running) {
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
      }
    },

    resize: function () {
      if (!canvas) return;
      var C = window.CONFIG;
      var vw = window.innerWidth, vh = window.innerHeight;
      if (window.visualViewport) { vw = window.visualViewport.width; vh = window.visualViewport.height; }
      var k = Math.max(0.1, Math.min(vw / C.W, vh / C.H));
      var cssW = Math.floor(C.W * k), cssH = Math.floor(C.H * k);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      var dpr = Math.min(window.devicePixelRatio || 1, C.MAX_DPR);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      scale = canvas.width / C.W;
    },

    fps: function () { return fpsValue; },
    particleCount: function () { return fxParts.length; },

    hitStop: function (sec) { stopTimer = Math.max(stopTimer, sec); },
    isHitStopped: function () { return stopTimer > 0; },

    shake: function (amp) {
      if (!amp) return;
      if (amp > shakeAmp || shakeT <= 0) { shakeAmp = amp; shakeT = shakeDur; }
    },

    impact: function (x, y, color, n) {
      var count = Math.min(26, n || 10);
      for (var i = 0; i < count; i++) {
        var a = rnd(0, Math.PI * 2), sp = rnd(120, 420);
        fxParts.push({ kind: 'dot', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
          life: rnd(0.25, 0.5), max: 0.5, c: color, s: rnd(2, 4.5) });
      }
      for (var k = 0; k < 2; k++) {
        fxParts.push({ kind: 'star', x: x, y: y, vx: rnd(-40, 40), vy: rnd(-60, -10),
          life: 0.32, max: 0.32, c: '#ffd23f', s: rnd(12, 18), rot: rnd(0, 1) });
      }
    },

    burst: function (x, y, color, n, speed, size) {
      for (var i = 0; i < n; i++) {
        var a = rnd(0, Math.PI * 2), sp = rnd(40, speed || 260);
        fxParts.push({ kind: 'dot', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          life: rnd(0.4, 0.9), max: 0.9, c: color, s: rnd(2, size || 4) });
      }
    },

    popText: function (x, y, text, color) {
      pops.push({ x: x, y: y, text: text, c: color || '#ffffff', life: 0.7, max: 0.7 });
    },

    flash: function (color) { if (Engine.onFlash) Engine.onFlash(color); },

    // Convert a pointer/client point to logical canvas coordinates.
    toLogical: function (clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left) * (Engine.W / r.width),
        y: (clientY - r.top) * (Engine.H / r.height)
      };
    },

    // Draw particles & pops (called from render, uses real time).
    drawFX: function (c, dt) {
      var i;
      for (i = fxParts.length - 1; i >= 0; i--) {
        var p = fxParts[i];
        p.life -= dt;
        if (p.life <= 0) { fxParts.splice(i, 1); continue; }
        p.vy += 900 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        var a = Math.max(0, p.life / p.max);
        c.globalAlpha = a;
        if (p.kind === 'star') {
          drawStar(c, p.x, p.y, p.s * (0.6 + 0.4 * a), p.c, p.rot + (p.max - p.life) * 12);
        } else {
          c.fillStyle = p.c;
          c.beginPath();
          c.arc(p.x, p.y, p.s, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.globalAlpha = 1;
      for (i = pops.length - 1; i >= 0; i--) {
        var q = pops[i];
        q.life -= dt;
        if (q.life <= 0) { pops.splice(i, 1); continue; }
        q.y -= 60 * dt;
        c.globalAlpha = Math.min(1, q.life / 0.25);
        c.font = '900 26px system-ui, Segoe UI, Arial, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineWidth = 6;
        c.strokeStyle = 'rgba(10,14,22,0.85)';
        c.strokeText(q.text, q.x, q.y);
        c.fillStyle = q.c;
        c.fillText(q.text, q.x, q.y);
      }
      c.globalAlpha = 1;
    },

    clearFX: function () { fxParts = []; pops = []; }
  };

  function drawStar(c, x, y, r, color, rot) {
    c.fillStyle = color;
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 === 0 ? r : r * 0.45;
      var a = rot + i * Math.PI / 5;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var C = window.CONFIG;
    var dt = Math.min(C.MAX_FRAME_DT, Math.max(0, (now - last) / 1000));
    last = now;

    // FPS counter (for ?debug=1)
    frames++;
    fpsAcc += dt;
    if (fpsAcc >= 0.5) { fpsValue = Math.round(frames / fpsAcc); frames = 0; fpsAcc = 0; }

    if (Engine.paused) {
      acc = 0;
    } else {
      acc += dt;
    }

    try { window.Input.poll(); } catch (e) { /* ignore */ }

    var step = C.FIXED_DT;
    var guard = 0;
    while (acc >= step && guard < 8) {
      acc -= step;
      guard++;
      if (Engine.paused) continue;
      if (stopTimer > 0) { stopTimer -= step; continue; }   // hit-stop: freeze simulation only
      if (updateFn) updateFn(step * Engine.timeScale);
    }
    if (guard >= 8) acc = 0;

    // Shake decay (real time)
    if (shakeT > 0) {
      shakeT -= dt;
      var f = Math.max(0, shakeT / shakeDur);
      lastShake = { x: rnd(-1, 1) * shakeAmp * f, y: rnd(-1, 1) * shakeAmp * f };
      if (shakeT <= 0) { shakeAmp = 0; lastShake = { x: 0, y: 0 }; }
    }

    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, lastShake.x * scale, lastShake.y * scale);
    if (renderFn) renderFn(ctx, dt);
    Engine.drawFX(ctx, dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  window.Engine = Engine;
})();
