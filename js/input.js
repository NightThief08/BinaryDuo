/* Unified input layer.
   Every source — keyboard, mouse, touch zones, gamepad, bot — writes into the same
   per-slot state. Slot 0 = P1 (or the human in Solo), slot 1 = P2.
     Input.state(slot)   -> { dir: -1|0|1, fall: bool }      (held state, read each tick)
     Input.consume(slot) -> { jump: bool, hit: bool }        (press edges, cleared on read)
   Keys are matched with event.code (physical keys) so any keyboard layout works. */
(function () {
  'use strict';

  var ACTIONS = ['left', 'right', 'jump', 'hit', 'fall'];
  var EDGE_ACTIONS = { jump: true, hit: true };

  var layout = 'solo';
  var bindings = null;          // effective {p1:{}, p2:{}}
  var keyMap = {};              // code -> [{slot, action}]
  var kbDown = {};              // code -> true while held
  var capture = null;           // callback for "rebind next key"

  var pressQ = [newQ(), newQ()];
  var touchCount = [newCount(), newCount()];
  var touchById = {};           // identifier -> {slot, action, el}
  var padHeld = [newHeld(), newHeld()];
  var padPrev = [newHeld(), newHeld()];
  var botHeld = [newHeld(), newHeld()];
  var padSlot = {};             // gamepad index -> slot
  var canvasEl = null;

  function newQ() { return { jump: false, hit: false }; }
  function newCount() { return { left: 0, right: 0, jump: 0, hit: 0, fall: 0 }; }
  function newHeld() { return { left: false, right: false, jump: false, hit: false, fall: false }; }

  function cloneDefaults() {
    var d = window.CONFIG.KEYS;
    return {
      p1: JSON.parse(JSON.stringify(d.p1)),
      p2: JSON.parse(JSON.stringify(d.p2))
    };
  }

  function loadBindings() {
    var def = cloneDefaults();
    var saved = null;
    try { saved = window.Store.getBindings(); } catch (e) { saved = null; }
    if (saved && saved.p1 && saved.p2) {
      ['p1', 'p2'].forEach(function (p) {
        ACTIONS.forEach(function (a) {
          if (typeof saved[p][a] === 'string' && saved[p][a]) def[p][a] = saved[p][a];
        });
      });
    }
    bindings = def;
    rebuildMap();
  }

  function rebuildMap() {
    keyMap = {};
    function add(code, slot, action) {
      if (!code) return;
      if (!keyMap[code]) keyMap[code] = [];
      keyMap[code].push({ slot: slot, action: action });
    }
    ACTIONS.forEach(function (a) {
      add(bindings.p1[a], 0, a);
      if (layout === 'versus') add(bindings.p2[a], 1, a);
    });
    if (layout === 'solo') {
      window.CONFIG.SOLO_EXTRA_KEYS.jump.forEach(function (c) { add(c, 0, 'jump'); });
    }
  }

  function boundCodes() {
    var out = {};
    ['p1', 'p2'].forEach(function (p) {
      ACTIONS.forEach(function (a) { if (bindings[p][a]) out[bindings[p][a]] = true; });
    });
    window.CONFIG.SOLO_EXTRA_KEYS.jump.forEach(function (c) { out[c] = true; });
    return out;
  }

  function press(slot, action) {
    if (!EDGE_ACTIONS[action]) return;
    if (slot < 0 || slot > 1) return;
    pressQ[slot][action] = true;
    if (typeof Input.onPress === 'function') {
      try { Input.onPress(slot, action); } catch (e) { /* UI errors must not break input */ }
    }
  }

  function onKeyDown(e) {
    var code = e.code;
    if (capture) {
      if (e.repeat) return;
      e.preventDefault();
      if (code === 'Escape') { capture = null; return; }
      var cb = capture; capture = null;
      cb(code);
      return;
    }
    var bound = boundCodes();
    if (bound[code] || code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown' ||
        code === 'ArrowLeft' || code === 'ArrowRight') {
      e.preventDefault();
    }
    if (window.CONFIG.PAUSE_KEYS.indexOf(code) !== -1) {
      if (!e.repeat && typeof Input.onSystemKey === 'function') Input.onSystemKey(code);
      return;
    }
    kbDown[code] = true;
    if (e.repeat) return;   // key auto-repeat never counts as a new press
    var list = keyMap[code];
    if (!list) return;
    for (var i = 0; i < list.length; i++) press(list[i].slot, list[i].action);
  }

  function onKeyUp(e) {
    delete kbDown[e.code];
  }

  function onBlur() { Input.clearAll(); }

  function onMouseDown(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (capture) return;
    press(0, 'hit');
  }

  function touchTargetEl(t) {
    var el = t.target;
    if (!el || !el.closest) return null;
    return el.closest('[data-action]');
  }

  function touchStart(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var el = touchTargetEl(t);
      if (!el) continue;
      var slot = parseInt(el.getAttribute('data-slot'), 10) || 0;
      var action = el.getAttribute('data-action');
      if (ACTIONS.indexOf(action) === -1) continue;
      touchById[t.identifier] = { slot: slot, action: action, el: el };
      touchCount[slot][action] += 1;
      el._n = (el._n || 0) + 1;
      el.classList.add('on');
      press(slot, action);
    }
  }

  function touchEnd(e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var rec = touchById[t.identifier];
      if (!rec) continue;
      delete touchById[t.identifier];
      touchCount[rec.slot][rec.action] = Math.max(0, touchCount[rec.slot][rec.action] - 1);
      rec.el._n = Math.max(0, (rec.el._n || 1) - 1);
      if (rec.el._n === 0) rec.el.classList.remove('on');
    }
  }

  // ---- Gamepad ----
  function pollGamepads() {
    var pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    var list = [];
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) list.push(pads[i]);
    var maxSlots = layout === 'versus' ? 2 : 1;
    for (var s = 0; s < 2; s++) {
      var pad = list[s];
      if (!pad || s >= maxSlots) {
        padHeld[s] = newHeld();
        padPrev[s] = newHeld();
        continue;
      }
      var ax = pad.axes || [];
      var bt = pad.buttons || [];
      function btn(n) { return !!(bt[n] && bt[n].pressed); }
      var h = {
        left: (ax[0] || 0) < -0.4 || btn(14),
        right: (ax[0] || 0) > 0.4 || btn(15),
        fall: (ax[1] || 0) > 0.55 || btn(13),
        jump: btn(0),
        hit: btn(2)
      };
      if (h.jump && !padPrev[s].jump) press(s, 'jump');
      if (h.hit && !padPrev[s].hit) press(s, 'hit');
      padHeld[s] = h;
      padPrev[s] = { left: h.left, right: h.right, fall: h.fall, jump: h.jump, hit: h.hit };
    }
  }

  var Input = {
    onPress: null,          // fn(slot, action) — UI hook (ready screen, menus)
    onSystemKey: null,      // fn(code) — Escape / P
    onGamepad: null,        // fn(slot, connected)

    init: function (opts) {
      opts = opts || {};
      loadBindings();
      canvasEl = opts.canvas || null;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      if (canvasEl) canvasEl.addEventListener('pointerdown', onMouseDown);
      if (opts.touchLayer) {
        opts.touchLayer.addEventListener('touchstart', touchStart, { passive: false });
        opts.touchLayer.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
        opts.touchLayer.addEventListener('touchend', touchEnd, { passive: false });
        opts.touchLayer.addEventListener('touchcancel', touchEnd, { passive: false });
      }
      window.addEventListener('gamepadconnected', function (e) {
        var idx = e.gamepad ? e.gamepad.index : -1;
        var slot = idx === -1 ? 0 : Math.min(1, Object.keys(padSlot).length);
        padSlot[idx] = slot;
        if (typeof Input.onGamepad === 'function') Input.onGamepad(slot, true);
      });
      window.addEventListener('gamepaddisconnected', function (e) {
        var idx = e.gamepad ? e.gamepad.index : -1;
        var slot = padSlot[idx];
        delete padSlot[idx];
        if (typeof Input.onGamepad === 'function' && slot !== undefined) Input.onGamepad(slot, false);
      });
    },

    setLayout: function (name) {
      layout = name === 'versus' ? 'versus' : 'solo';
      rebuildMap();
      Input.clearAll();
    },

    reloadBindings: function () { loadBindings(); },

    getBindings: function () { return JSON.parse(JSON.stringify(bindings)); },

    // Rebind one action. Returns {ok:true} or {ok:false, reason}.
    setBinding: function (player, action, code) {
      var p = player === 'p2' ? 'p2' : 'p1';
      var all = ['p1', 'p2'];
      for (var i = 0; i < all.length; i++) {
        var q = all[i];
        for (var j = 0; j < ACTIONS.length; j++) {
          var a = ACTIONS[j];
          if (q === p && a === action) continue;
          if (bindings[q][a] === code) return { ok: false, reason: 'Key already used' };
        }
      }
      if (window.CONFIG.RESERVED_KEYS.indexOf(code) !== -1 && code !== bindings[p][action]) {
        return { ok: false, reason: 'Reserved key' };
      }
      bindings[p][action] = code;
      rebuildMap();
      try { window.Store.saveBindings(bindings); } catch (e) { /* ignore */ }
      return { ok: true };
    },

    resetBindings: function () {
      bindings = cloneDefaults();
      rebuildMap();
      window.Store.clearBindings();
    },

    capture: function (cb) { capture = cb; },
    cancelCapture: function () { capture = null; },
    isCapturing: function () { return !!capture; },

    // Held state for movement + fast-fall. Read once per fixed tick.
    state: function (slot) {
      var pk = slot === 0 ? padHeld[0] : padHeld[1];
      var bh = botHeld[slot];
      var tc = touchCount[slot];
      var left = bh.left || pk.left || tc.left > 0 || kbHeldDir(slot, 'left');
      var right = bh.right || pk.right || tc.right > 0 || kbHeldDir(slot, 'right');
      var fall = bh.fall || pk.fall || tc.fall > 0 || kbHeldDir(slot, 'fall');
      var dir = (right ? 1 : 0) - (left ? 1 : 0);
      return { dir: dir, fall: !!fall };
    },

    // Press edges for jump / hit. Cleared on read.
    consume: function (slot) {
      var q = pressQ[slot];
      var out = { jump: !!q.jump, hit: !!q.hit };
      q.jump = false;
      q.hit = false;
      return out;
    },

    clearPresses: function () {
      pressQ = [newQ(), newQ()];
    },

    // Called when the game pauses / loses focus / changes state.
    clearAll: function () {
      kbDown = {};
      touchById = {};
      touchCount = [newCount(), newCount()];
      pressQ = [newQ(), newQ()];
      padPrev = [newHeld(), newHeld()];
      if (typeof document !== 'undefined') {
        var on = document.querySelectorAll('[data-action].on');
        for (var i = 0; i < on.length; i++) { on[i].classList.remove('on'); on[i]._n = 0; }
      }
    },

    // Bot writes its held state here; same pipeline as a human.
    setBotHeld: function (slot, h) {
      botHeld[slot] = { left: !!h.left, right: !!h.right, fall: !!h.fall, jump: false, hit: false };
    },
    clearBot: function (slot) { botHeld[slot] = newHeld(); },
    botTap: function (slot, action) {
      if (EDGE_ACTIONS[action]) pressQ[slot][action] = true;
    },

    poll: function () { pollGamepads(); },

    activeTouchCount: function () { return Object.keys(touchById).length; },

    keyLabel: function (code) {
      if (!code) return '—';
      var map = {
        ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
        ShiftRight: 'R-Shift', ShiftLeft: 'L-Shift', Space: 'Space',
        ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
        Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Escape: 'Esc',
        Numpad0: 'Num 0', NumpadEnter: 'Num Enter'
      };
      if (map[code]) return map[code];
      if (/^Key[A-Z]$/.test(code)) return code.slice(3);
      if (/^Digit[0-9]$/.test(code)) return code.slice(5);
      return code;
    }
  };

  function kbHeldDir(slot, action) {
    var p = slot === 0 ? 'p1' : 'p2';
    var code = bindings[p][action];
    if (code && kbDown[code]) return true;
    return false;
  }

  window.Input = Input;
})();
