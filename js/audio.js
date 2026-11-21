/* WebAudio sound effects (all generated in code, no files).
   Audio only starts after the first user gesture (iOS Safari rule). */
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var muted = false;
  var unlocked = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : window.CONFIG.MASTER_VOLUME;
      master.connect(ctx.destination);
      // 1s white-noise buffer reused for impacts
      var len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, endFreq, dur, type, vol, delay) {
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (endFreq && endFreq !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, filterFreq, delay) {
    if (!ctx || !noiseBuf) return;
    var t = ctx.currentTime + (delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq || 1200;
    f.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  var SOUNDS = {
    hit: function () { noise(0.12, 0.55, 900); tone(220, 90, 0.14, 'square', 0.18); },
    kick: function () { noise(0.16, 0.6, 600); tone(180, 60, 0.18, 'sawtooth', 0.2); },
    jump: function () { tone(330, 720, 0.16, 'sine', 0.22); },
    land: function () { tone(160, 70, 0.1, 'sine', 0.25); },
    crack: function () { noise(0.07, 0.5, 2600); tone(1400, 500, 0.06, 'square', 0.06); },
    shatter: function () { noise(0.5, 0.7, 1800); tone(500, 80, 0.4, 'triangle', 0.2); },
    pickup: function () { tone(523, 523, 0.09, 'triangle', 0.25); tone(784, 784, 0.12, 'triangle', 0.25, 0.08); },
    swap: function () { tone(200, 900, 0.45, 'sawtooth', 0.12); noise(0.4, 0.3, 500); },
    ko: function () { tone(520, 60, 0.7, 'sawtooth', 0.22); noise(0.35, 0.4, 400); },
    beep: function () { tone(660, 660, 0.12, 'square', 0.12); },
    go: function () { tone(990, 990, 0.25, 'square', 0.14); tone(660, 660, 0.25, 'triangle', 0.1); },
    click: function () { tone(900, 700, 0.05, 'triangle', 0.12); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, f, 0.22, 'triangle', 0.22, i * 0.11); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, f, 0.26, 'sine', 0.2, i * 0.16); }); },
    throw: function () { tone(260, 620, 0.22, 'sine', 0.2); noise(0.2, 0.2, 800); },
    laser: function () { tone(1800, 1200, 0.25, 'square', 0.07); },
    boing: function () { tone(180, 640, 0.35, 'sine', 0.3); },
    thud: function () { noise(0.22, 0.6, 300); tone(120, 40, 0.25, 'sine', 0.3); },
    stomp: function () { noise(0.3, 0.8, 250); tone(90, 30, 0.35, 'sine', 0.4); },
    tick: function () { tone(440, 440, 0.04, 'square', 0.06); }
  };

  window.SFX = {
    unlock: function () {
      var c = ensure();
      if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { /* ignore */ } }
      unlocked = true;
    },
    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : window.CONFIG.MASTER_VOLUME;
    },
    isMuted: function () { return muted; },
    play: function (name) {
      if (muted || !unlocked) return;
      if (!ctx) ensure();
      if (!ctx || !SOUNDS[name]) return;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { return; } }
      try { SOUNDS[name](); } catch (e) { /* never let audio break the game */ }
    },
    vibrate: function (ms) {
      try {
        if (window.Store.getSettings().vibration && navigator.vibrate) navigator.vibrate(ms);
      } catch (e) { /* ignore */ }
    }
  };
})();
