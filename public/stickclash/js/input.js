/*
 * Unified INPUT layer.
 * Keyboard, touch zones, gamepads and bots all produce the same per-player state:
 *   { left, right, jump, hit, down, jumpPressed, hitPressed }
 * Game logic only ever reads Input.state[0] / Input.state[1] — it never knows who is "pressing".
 */
var Input = (function () {
  var ACTIONS = ['left', 'right', 'jump', 'hit', 'down'];
  var keysDown = {};          // event.code -> true
  var keyLatch = {};          // event.code -> pressed since last poll (catches very fast taps)
  var touches = {};           // touch identifier -> { player, action, x, y }
  var touchLatch = [{}, {}];  // player -> action -> true
  var padPrev = {};           // gamepad index -> previous button state
  var bindings = Store.keys();
  var captureCb = null;

  var cfg = { duo: false, oneButton: false, bots: [null, null], active: false };
  var state = [blank(), blank()];
  var prevHeld = [blank(), blank()];
  var touchButtons = [];
  var touchCapable = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var touchUsed = false;
  var listeners = { pause: null, padConnect: null };

  function blank() { return { left: false, right: false, jump: false, hit: false, down: false, jumpPressed: false, hitPressed: false }; }

  function isTextField(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  var BLOCK = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1 };

  function onKeyDown(e) {
    if (captureCb) {
      e.preventDefault();
      var cb = captureCb; captureCb = null;
      cb(e.code);
      return;
    }
    if (isTextField(e.target)) return;
    if (BLOCK[e.code]) e.preventDefault();
    if (CONFIG.KEYS.pause.indexOf(e.code) >= 0 && !e.repeat) {
      if (listeners.pause) listeners.pause();
    }
    if (cfg.active && isGameKey(e.code)) e.preventDefault();
    if (!e.repeat) keyLatch[e.code] = true;
    keysDown[e.code] = true;
  }
  function onKeyUp(e) { keysDown[e.code] = false; }
  function isGameKey(code) {
    var sets = [bindings.p1, bindings.p2, bindings.solo];
    for (var i = 0; i < sets.length; i++) for (var a in sets[i]) if (sets[i][a].indexOf(code) >= 0) return true;
    return false;
  }

  function clearAll() {
    keysDown = {}; keyLatch = {};
    touches = {}; touchLatch = [{}, {}];
    for (var i = 0; i < 2; i++) { var b = blank(); for (var k in b) state[i][k] = b[k]; }
    prevHeld = [blank(), blank()];
  }

  // ---------- Touch ----------
  function insets() {
    var el = document.getElementById('safeProbe');
    if (!el) return { t: 0, r: 0, b: 0, l: 0 };
    var cs = getComputedStyle(el);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  // Compute button rectangles in CSS pixels (screen space) for the current layout.
  function layoutTouch() {
    touchButtons = [];
    if (cfg.oneButton) return touchButtons;
    var W = window.innerWidth, H = window.innerHeight, ins = insets();
    var tablet = Math.min(W, H) >= 600, T = CONFIG.TOUCH;
    if (!cfg.duo) {
      var r = T.soloSize * (tablet ? 1.2 : 1) / 2, m = 22, by = H - ins.b - m - r;
      touchButtons.push({ player: 0, action: 'hit', x: W - ins.r - m - r, y: by, r: r * 1.1, icon: '✊', label: 'HIT' });
      touchButtons.push({ player: 0, action: 'jump', x: W - ins.r - m - r * 3.3, y: by - r * 0.55, r: r, icon: '⬆', label: 'JUMP' });
      stickHome[0] = { x: ins.l + m + T.stickRadius * 1.4, y: H - ins.b - m - T.stickRadius * 1.4 };
    } else {
      var r2 = Math.max(32, (tablet ? T.tabletDuoSize : T.duoSize) / 2), m2 = 14, g = 10;
      var y2 = H - ins.b - m2 - r2;
      // P1 stick on the outer left edge, buttons toward the centre; P2 mirrored
      var ix = W / 2 - m2 - r2 - 16;
      touchButtons.push({ player: 0, action: 'hit', x: ix, y: y2, r: r2, icon: '✊', label: 'HIT' });
      touchButtons.push({ player: 0, action: 'jump', x: ix - r2 * 2 - g, y: y2 - r2 * 0.6, r: r2, icon: '⬆', label: 'JUMP' });
      var jx = W / 2 + m2 + r2 + 16;
      touchButtons.push({ player: 1, action: 'hit', x: jx, y: y2, r: r2, icon: '✊', label: 'HIT' });
      touchButtons.push({ player: 1, action: 'jump', x: jx + r2 * 2 + g, y: y2 - r2 * 0.6, r: r2, icon: '⬆', label: 'JUMP' });
      var sr = T.stickRadius * 0.85;
      stickHome[0] = { x: ins.l + m2 + sr * 1.3, y: H - ins.b - m2 - sr * 1.3 };
      stickHome[1] = { x: W - ins.r - m2 - sr * 1.3, y: H - ins.b - m2 - sr * 1.3 };
    }
    return touchButtons;
  }
  var stickHome = [null, null];
  // Movement area: the outer part of each player's zone (anything not on a button).
  function inStickArea(player, x) {
    var W = window.innerWidth;
    if (!cfg.duo) return x < W * 0.5;
    return player === 0 ? x < W * 0.27 : x > W * 0.73;
  }
  function stickDir(t) {
    var T = CONFIG.TOUCH, dx = t.x - t.ox, dy = t.y - t.oy, R = T.stickRadius;
    // drag the base along so reversing direction is instant
    var d = Math.hypot(dx, dy);
    if (d > R) { t.ox = t.x - dx / d * R; t.oy = t.y - dy / d * R; dx = t.x - t.ox; dy = t.y - t.oy; }
    return { left: dx < -T.stickDead, right: dx > T.stickDead, down: dy > R * 0.6 && Math.abs(dy) > Math.abs(dx) };
  }
  function zoneOf(x) { return cfg.duo ? (x < window.innerWidth / 2 ? 0 : 1) : 0; }
  function findButton(player, x, y, onlyMove) {
    var best = null, bd = 1e9;
    for (var i = 0; i < touchButtons.length; i++) {
      var b = touchButtons[i];
      if (b.player !== player) continue;
      if (onlyMove && b.action !== 'left' && b.action !== 'right') continue;
      var d = Math.hypot(b.x - x, b.y - y);
      if (d < b.r * 1.5 && d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function onTouchStart(e) {
    if (!cfg.active) return;
    e.preventDefault();
    touchUsed = true;
    Sfx.unlock();
    var ct = e.changedTouches;
    for (var i = 0; i < ct.length; i++) {
      if (Object.keys(touches).length >= CONFIG.TOUCH.maxTouches) break;
      var t = ct[i];
      var player = zoneOf(t.clientX);           // zone where the touch STARTED owns it forever
      var action = null;
      var stick = false;
      if (cfg.oneButton) action = 'jump';
      else { var b = findButton(player, t.clientX, t.clientY, false); if (b) action = b.action; else if (inStickArea(player, t.clientX)) stick = true; }
      touches[t.identifier] = { player: player, action: action, x: t.clientX, y: t.clientY, stick: stick, ox: t.clientX, oy: t.clientY };
      if (action) touchLatch[player][action] = true;
    }
  }
  function onTouchMove(e) {
    if (!cfg.active) return;
    e.preventDefault();
    var ct = e.changedTouches;
    for (var i = 0; i < ct.length; i++) {
      var tt = touches[ct[i].identifier];
      if (!tt) continue;
      tt.x = ct[i].clientX; tt.y = ct[i].clientY;
      // Sliding between the arrow buttons is allowed — but only among THIS player's buttons.
      if (!cfg.oneButton && !tt.stick && tt.action === null) {
        var b = findButton(tt.player, tt.x, tt.y, tt.action !== null);
        if (b && b.action !== tt.action) { tt.action = b.action; touchLatch[tt.player][b.action] = true; }
      }
    }
  }
  function onTouchEnd(e) {
    var ct = e.changedTouches;
    for (var i = 0; i < ct.length; i++) delete touches[ct[i].identifier];
    if (cfg.active) e.preventDefault();
  }

  // ---------- Gamepad ----------
  function pollPads(out) {
    if (!navigator.getGamepads) return;
    var pads;
    try { pads = navigator.getGamepads(); } catch (e) { return; }
    var slot = 0;
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (!p || !p.connected) continue;
      var player = cfg.duo ? slot : 0;
      slot++;
      if (player > 1) continue;
      var bt = function (n) { return !!(p.buttons[n] && p.buttons[n].pressed); };
      var ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      var cur = { left: bt(14) || ax < -0.45, right: bt(15) || ax > 0.45, jump: bt(0) || bt(12), hit: bt(2) || bt(1), down: bt(13) || ay > 0.6, start: bt(9) };
      var prev = padPrev[p.index] || {};
      if (cur.start && !prev.start && listeners.pause) listeners.pause();
      for (var k = 0; k < ACTIONS.length; k++) if (cur[ACTIONS[k]]) out[player][ACTIONS[k]] = true;
      padPrev[p.index] = cur;
    }
  }

  function anyCode(list) { for (var i = 0; i < list.length; i++) if (keysDown[list[i]]) return true; return false; }
  function anyLatch(list) { for (var i = 0; i < list.length; i++) if (keyLatch[list[i]]) return true; return false; }

  // Called once per fixed tick by the game loop.
  function poll() {
    var held = [blank(), blank()], latched = [blank(), blank()];
    var sets = cfg.duo ? [bindings.p1, bindings.p2] : [bindings.solo, null];
    for (var p = 0; p < 2; p++) {
      var b = sets[p];
      if (!b || cfg.bots[p]) continue;
      for (var a = 0; a < ACTIONS.length; a++) {
        var act = ACTIONS[a];
        if (anyCode(b[act])) held[p][act] = true;
        if (anyLatch(b[act])) latched[p][act] = true;
      }
    }
    // Solo convenience: arrows + Enter also drive the player (P2 is the bot anyway).
    if (!cfg.duo && !cfg.bots[0]) {
      var alt = bindings.p2;
      for (var a2 = 0; a2 < ACTIONS.length; a2++) {
        if (anyCode(alt[ACTIONS[a2]])) held[0][ACTIONS[a2]] = true;
        if (anyLatch(alt[ACTIONS[a2]])) latched[0][ACTIONS[a2]] = true;
      }
    }
    // Touch
    for (var id in touches) {
      var t = touches[id];
      if (cfg.bots[t.player]) continue;
      if (t.action) held[t.player][t.action] = true;
      if (t.stick) { var sd = stickDir(t); if (sd.left) held[t.player].left = true; if (sd.right) held[t.player].right = true; if (sd.down) held[t.player].down = true; }
    }
    for (var q = 0; q < 2; q++) for (var k in touchLatch[q]) if (!cfg.bots[q]) latched[q][k] = true;
    // Gamepads
    var padHeld = [blank(), blank()];
    pollPads(padHeld);
    for (var r = 0; r < 2; r++) if (!cfg.bots[r]) for (var a3 = 0; a3 < ACTIONS.length; a3++) if (padHeld[r][ACTIONS[a3]]) held[r][ACTIONS[a3]] = true;
    // Bots press the very same virtual buttons
    for (var s = 0; s < 2; s++) {
      var bot = cfg.bots[s];
      if (bot) { var o = bot.output; for (var a4 = 0; a4 < ACTIONS.length; a4++) held[s][ACTIONS[a4]] = !!o[ACTIONS[a4]]; }
    }
    for (var i = 0; i < 2; i++) {
      var st = state[i], h = held[i];
      for (var a5 = 0; a5 < ACTIONS.length; a5++) st[ACTIONS[a5]] = h[ACTIONS[a5]];
      st.jumpPressed = latched[i].jump || (h.jump && !prevHeld[i].jump);
      st.hitPressed = latched[i].hit || (h.hit && !prevHeld[i].hit);
      if (cfg.oneButton) {
        var solo = !cfg.duo && i === 0;
        st.jumpPressed = st.jumpPressed || (solo && st.hitPressed);
        st.jump = st.jump || (solo && st.hit);
      }
      prevHeld[i] = { left: h.left, right: h.right, jump: h.jump, hit: h.hit, down: h.down };
    }
    keyLatch = {}; touchLatch = [{}, {}];
    return state;
  }

  function init() {
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    var c = document.getElementById('game');
    c.addEventListener('touchstart', onTouchStart, { passive: false });
    c.addEventListener('touchmove', onTouchMove, { passive: false });
    c.addEventListener('touchend', onTouchEnd, { passive: false });
    c.addEventListener('touchcancel', onTouchEnd, { passive: false });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('blur', clearAll);
    window.addEventListener('gamepadconnected', function (e) { if (listeners.padConnect) listeners.padConnect(e.gamepad); });
  }

  return {
    init: init, poll: poll, clearAll: clearAll, state: state,
    configure: function (o) {
      cfg.duo = !!o.duo; cfg.oneButton = !!o.oneButton; cfg.bots = o.bots || [null, null];
      clearAll(); layoutTouch();
    },
    setActive: function (on) { cfg.active = !!on; if (!on) touches = {}; },
    isActive: function () { return cfg.active; },
    layoutTouch: layoutTouch,
    getTouchButtons: function () { return touchButtons; },
    getTouches: function () { return touches; },
    getStickHome: function () { return stickHome; },
    heldAction: function (player, action) {
      for (var id in touches) if (touches[id].player === player && touches[id].action === action) return true;
      return false;
    },
    showTouch: function () { return touchUsed || (touchCapable && window.matchMedia && window.matchMedia('(pointer: coarse)').matches); },
    touchCapable: function () { return touchCapable; },
    config: function () { return cfg; },
    bindings: function () { return bindings; },
    reloadBindings: function () { bindings = Store.keys(); },
    capture: function (cb) { captureCb = cb; },
    cancelCapture: function () { captureCb = null; },
    on: function (name, fn) { listeners[name] = fn; },
    keyName: function (code) {
      if (!code) return '—';
      var map = { Space: 'Space', Enter: 'Enter', NumpadEnter: 'Num Enter', Numpad0: 'Num 0', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl' };
      if (map[code]) return map[code];
      if (code.indexOf('Key') === 0) return code.slice(3);
      if (code.indexOf('Digit') === 0) return code.slice(5);
      if (code.indexOf('Numpad') === 0) return 'Num ' + code.slice(6);
      return code;
    }
  };
})();
