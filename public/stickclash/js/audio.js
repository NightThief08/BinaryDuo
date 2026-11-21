/* All sound effects synthesised with WebAudio. Audio only starts after the first user gesture (iOS). */
var Sfx = (function () {
  var ctx = null, master = null, noiseBuf = null, enabled = true;
  function unlock() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        var len = ctx.sampleRate * 0.5;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }
  function ready() { return enabled && ctx && ctx.state === 'running'; }
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ready()) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q, delay) {
    if (!ready()) return;
    var t = ctx.currentTime + (delay || 0);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  var api = {
    unlock: unlock,
    setEnabled: function (on) { enabled = !!on; },
    isEnabled: function () { return enabled; },
    click: function () { tone(660, 0.06, 'square', 0.12); },
    jump: function () { tone(300, 0.12, 'square', 0.1, 620); },
    whoosh: function () { noise(0.12, 0.12, 2400, 0.8); },
    hit: function (big) {
      noise(big ? 0.18 : 0.1, big ? 0.5 : 0.35, big ? 600 : 1100, 0.9);
      tone(big ? 140 : 200, big ? 0.2 : 0.12, 'sine', 0.35, 50);
    },
    crack: function () { noise(0.08, 0.3, 3500, 4); tone(1800, 0.05, 'triangle', 0.08, 900); },
    shatter: function () { for (var i = 0; i < 5; i++) tone(1500 + Math.random() * 2500, 0.15, 'triangle', 0.06, 600, i * 0.03); noise(0.3, 0.3, 4000, 1); },
    pickup: function () { tone(520, 0.08, 'square', 0.12); tone(780, 0.1, 'square', 0.12, null, 0.07); },
    bounce: function () { tone(180, 0.25, 'sine', 0.3, 700); },
    swap: function () { tone(220, 0.35, 'sawtooth', 0.15, 880); tone(880, 0.35, 'sawtooth', 0.12, 220); },
    laser: function () { tone(1400, 0.2, 'sine', 0.08, 1500); },
    roll: function () { noise(0.4, 0.2, 200, 1); },
    beep: function (hi) { tone(hi ? 880 : 440, hi ? 0.35 : 0.15, 'square', 0.15); },
    ko: function () {
      noise(0.28, 0.45, 240, 0.7); tone(160, 0.4, 'sine', 0.4, 35);
      tone(392, 0.18, 'square', 0.16, 196, 0.04);
      tone(196, 0.48, 'sawtooth', 0.14, 49, 0.22);
    },
    gameOver: function () {
      [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.22, null, i * 0.14); });
      tone(262, 0.9, 'sine', 0.22, null, 0.42);
      tone(784, 0.65, 'square', 0.09, null, 0.65);
    },
    fall: function () { tone(700, 0.7, 'triangle', 0.15, 90); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.18, 'square', 0.13, null, i * 0.12); }); },
    warn: function () { tone(330, 0.1, 'square', 0.12); }
  };
  return api;
})();
