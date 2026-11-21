/* UI: DOM screens, banners, toasts, touch-layer visibility, settings and stats screens.
   All buttons call into window.Game (main.js) or window.Store / window.Input. */
(function () {
  'use strict';

  var C = window.CONFIG;

  function $(id) { return document.getElementById(id); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var state = {
    layout: 'solo',
    diff: 'medium',
    touch: false,
    bannerTimer: null,
    bannerToken: 0,
    toastTimer: null,
    hintTimer: null,
    captureTimer: null,
    resetArmed: false,
    resetTimer: null
  };

  var TUT = {
    toyDrop: {
      icon: '🎁',
      steps: ['A parachute drops an item every 8 seconds.', 'Walk over it to grab it.', 'Bowling ball & laser: press HIT to use them.']
    },
    crumblingFloor: {
      icon: '🧊',
      steps: ['Glass tiles crack on the first landing.', 'A second landing shatters them.', 'Last one standing wins. The floor breaks on its own too.']
    },
    giantTiny: {
      icon: '🐘',
      steps: ['Giant: 3× size, heavy, stomps.', 'Tiny: fast, double jump, runs.', 'Roles swap every 10 seconds.']
    }
  };

  function showScreen(name) {
    qsa('.screen').forEach(function (el) {
      el.classList.toggle('active', !!name && el.getAttribute('data-screen') === name);
    });
    document.body.setAttribute('data-screen', name || 'game');
    if (name === 'settings') refreshSettings();
    if (name === 'stats') refreshStats();
    if (name === 'modes') renderModes();
  }

  // ---------- Helpers for keys ----------
  function keyLabel(code) { return window.Input.keyLabel(code); }

  function chips(list) {
    return list.map(function (item) {
      return '<span class="kbd">' + item[0] + '</span><span class="kdesc">' + item[1] + '</span>';
    }).join('');
  }

  function desktopKeyList(p) {
    var b = window.Input.getBindings()[p];
    return [
      [keyLabel(b.left) + ' ' + keyLabel(b.right), 'move'],
      [keyLabel(b.jump), 'jump'],
      [keyLabel(b.hit), 'hit'],
      [keyLabel(b.fall), 'fall']
    ];
  }

  function touchKeyList() {
    return [['◀ ▶', 'move'], ['JUMP', 'jump'], ['HIT', 'hit']];
  }

  // ---------- Banner / toast / flash ----------
  function banner(text, sub, secs) {
    var token = ++state.bannerToken;
    var el = $('banner');
    $('banner-text').textContent = text || '';
    $('banner-sub').textContent = sub || '';
    el.hidden = false;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    clearTimeout(state.bannerTimer);
    if (secs) {
      state.bannerTimer = setTimeout(function () {
        if (token === state.bannerToken) hideBanner();
      }, secs * 1000);
    }
  }

  function hideBanner() { $('banner').hidden = true; }

  function toast(text, ms) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.hidden = true; }, ms || 2400);
  }

  function flash(color) {
    var el = $('flash');
    el.style.background = color || '#fff';
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  // ---------- Modes ----------
  function renderModes() {
    var box = $('mode-cards');
    $('modes-title').textContent = state.layout === 'solo' ? 'Pick a mode · vs BOT' : 'Pick a mode · 2 players';
    box.innerHTML = '';
    C.MODE_ORDER.forEach(function (id) {
      var m = C.MODES[id];
      var b = document.createElement('button');
      b.className = 'mode-card mode-' + id;
      b.setAttribute('data-mode', id);
      b.innerHTML = '<div class="mc-icon">' + m.icon + '</div>' +
        '<div class="mc-name">' + m.name + '</div>' +
        '<div class="mc-blurb">' + m.blurb + '</div>' +
        '<div class="mc-ctrl">' + m.controls + '</div>';
      b.addEventListener('click', function () {
        showScreen(null);
        if (state.layout === 'solo') window.Game.startSolo(id, state.diff);
        else window.Game.startVersus(id);
      });
      box.appendChild(b);
    });
  }

  // ---------- Solo hint & tutorial ----------
  function showTutorial(modeId, onDone) {
    var t = TUT[modeId] || TUT.toyDrop;
    var done = false;
    function finish() { if (done) return; done = true; showScreen(null); onDone(); }
    $('tut-title').textContent = C.MODES[modeId].name;
    $('tut-anim').textContent = t.icon;
    var ul = $('tut-steps');
    ul.innerHTML = '';
    t.steps.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s;
      ul.appendChild(li);
    });
    $('tut-skip').onclick = finish;
    $('tut-ok').onclick = finish;
    showScreen('tutorial');
  }

  function showHint(modeId, onDone) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(state.hintTimer);
      showScreen(null);
      onDone();
    }
    $('hint-mode').textContent = C.MODES[modeId].name;
    var keys = state.touch
      ? chips(touchKeyList())
      : chips(desktopKeyList('p1').concat([['Click / F', 'hit']]));
    $('hint-keys').innerHTML = keys;
    var fill = $('hint-fill');
    fill.style.transition = 'none';
    fill.style.width = '0%';
    showScreen('hint');
    void fill.offsetWidth;
    fill.style.transition = 'width ' + C.SOLO_HINT_SECONDS + 's linear';
    fill.style.width = '100%';
    $('hint-tap').onclick = finish;
    state.hintTimer = setTimeout(finish, C.SOLO_HINT_SECONDS * 1000);
  }

  // ---------- 2P ready ----------
  function showReady(modeId) {
    var st = window.Store.getSettings();
    $('ready-mode').textContent = C.MODES[modeId].name;
    $('ready-name-0').textContent = st.names[0] || 'Player 1';
    $('ready-name-1').textContent = st.names[1] || 'Player 2';
    if (state.touch) {
      $('ready-keys-0').innerHTML = chips(touchKeyList());
      $('ready-keys-1').innerHTML = chips(touchKeyList());
      $('ready-mark-0').textContent = 'Tap HIT when ready';
      $('ready-mark-1').textContent = 'Tap HIT when ready';
    } else {
      $('ready-keys-0').innerHTML = chips(desktopKeyList('p1'));
      $('ready-keys-1').innerHTML = chips(desktopKeyList('p2'));
      $('ready-mark-0').textContent = 'Press ' + keyLabel(window.Input.getBindings().p1.hit) + ' when ready';
      $('ready-mark-1').textContent = 'Press ' + keyLabel(window.Input.getBindings().p2.hit) + ' when ready';
    }
    $('ready-sub').textContent = 'Both ready → 3-2-1';
    showScreen('ready');
  }

  function readyState(slot, ready) {
    var half = $('ready-p' + (slot + 1));
    half.classList.toggle('done', !!ready);
    if (ready) $('ready-mark-' + slot).textContent = '✅ Ready!';
  }

  function readyGo() {
    $('ready-sub').textContent = 'Get ready…';
    showScreen(null);
  }

  // ---------- Pause / results ----------
  function showPause(reason) {
    $('pause-reason').textContent = reason || '';
    showScreen('pause');
  }

  function hidePause() { showScreen(null); }

  function showResults(d) {
    $('res-title').textContent = d.title;
    $('res-score').textContent = (d.modeName || '') + '  ·  match score ' + d.score + (d.sudden ? '  ·  decided by sudden death' : '');
    var names = d.names;
    var rows = [
      ['Hits landed', function (s) { return s.hits; }],
      ['Damage dealt', function (s) { return d.usesHP ? Math.round(s.dmg) : '—'; }],
      ['Items grabbed', function (s) { return s.items; }],
      ['KOs', function (s) { return s.kos; }]
    ];
    var html = '<tr><th></th><th class="c0">' + escapeHtml(names[0]) + (d.winner === 0 ? ' 🏆' : '') + '</th>' +
      '<th class="c1">' + escapeHtml(names[1]) + (d.winner === 1 ? ' 🏆' : '') + '</th></tr>';
    rows.forEach(function (r) {
      html += '<tr><td>' + r[0] + '</td><td>' + r[1](d.stats[0]) + '</td><td>' + r[1](d.stats[1]) + '</td></tr>';
    });
    $('res-table').innerHTML = html;
    showScreen('results');
    window.SFX.play(d.solo ? (d.winner === 0 ? 'win' : 'lose') : 'win');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- Touch layer ----------
  function setTouchVisible(visible, layout) {
    var el = $('touch');
    var show = !!visible && state.touch;
    el.hidden = !show;
    document.body.classList.toggle('layout-solo', layout !== 'versus');
    document.body.classList.toggle('layout-versus', layout === 'versus');
    if (!show) window.Input.clearAll();
  }

  function setPauseVisible(v) { $('btn-pause').hidden = !v; }

  function debugText(txt) { $('debug').textContent = txt; }
  function debugVisible(v) { $('debug').hidden = !v; }

  // ---------- Settings ----------
  function refreshSettings() {
    var st = window.Store.getSettings();
    setToggle('set-sound', st.sound);
    setToggle('set-vib', st.vibration);
    setToggle('set-shake', st.shake);
    setToggle('set-cb', st.colorBlind);
    qsa('#set-diff button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-diff') === st.difficulty);
    });
    $('set-name0').value = st.names[0];
    $('set-name1').value = st.names[1];
    refreshBindingLabels();
  }

  function setToggle(id, on) {
    var el = $(id);
    el.classList.toggle('on', !!on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function refreshBindingLabels() {
    var b = window.Input.getBindings();
    var grid = $('bind-grid');
    var names = { left: 'Move left', right: 'Move right', jump: 'Jump', hit: 'Hit', fall: 'Fast-fall' };
    var html = '';
    ['p1', 'p2'].forEach(function (p) {
      html += '<div class="bind-col"><div class="bind-title ' + p + '">' + (p === 'p1' ? 'P1 (blue)' : 'P2 (red)') + '</div>';
      Object.keys(names).forEach(function (a) {
        html += '<div class="bind-row"><span>' + names[a] + '</span>' +
          '<button class="bind" data-p="' + p + '" data-a="' + a + '">' + escapeHtml(keyLabel(b[p][a])) + '</button></div>';
      });
      html += '</div>';
    });
    grid.innerHTML = html;
    qsa('#bind-grid .bind').forEach(function (btn) {
      btn.onclick = function () { startCapture(btn); };
    });
  }

  function startCapture(btn) {
    var p = btn.getAttribute('data-p');
    var a = btn.getAttribute('data-a');
    qsa('#bind-grid .bind').forEach(function (x) { x.classList.remove('listening'); });
    btn.textContent = 'Press a key…';
    btn.classList.add('listening');
    window.Input.capture(function (code) {
      var r = window.Input.setBinding(p, a, code);
      if (!r.ok) toast(r.reason, 1800);
      else toast('Saved: ' + keyLabel(code), 1200);
      clearTimeout(state.captureTimer);
      refreshBindingLabels();
    });
    clearTimeout(state.captureTimer);
    state.captureTimer = setTimeout(function () {
      window.Input.cancelCapture();
      refreshBindingLabels();
    }, 8000);
  }

  // ---------- Stats ----------
  function refreshStats() {
    var s = window.Store.getStats();
    var html = '<tr><th>Mode (vs bot)</th><th>Wins</th><th>Losses</th></tr>';
    C.MODE_ORDER.forEach(function (id) {
      var r = s.modes[id] || { w: 0, l: 0 };
      html += '<tr><td>' + C.MODES[id].icon + ' ' + C.MODES[id].name + '</td><td>' + r.w + '</td><td>' + r.l + '</td></tr>';
    });
    $('stats-modes').innerHTML = html;
    $('stats-streak').textContent = 'Current win streak: ' + s.streak + '   ·   Longest streak: ' + s.bestStreak;
    var keys = Object.keys(s.h2h || {});
    if (!keys.length) {
      $('stats-h2h').textContent = 'No 2-player matches yet.';
    } else {
      $('stats-h2h').innerHTML = keys.map(function (k) {
        var w = s.h2h[k];
        return '<div class="h2h-row">' + escapeHtml(k) + ': ' +
          Object.keys(w).map(function (n) { return escapeHtml(n) + ' ' + w[n]; }).join(' · ') + '</div>';
      }).join('');
    }
    $('stats-reset').textContent = 'Reset stats';
    state.resetArmed = false;
  }

  // ---------- Init ----------
  function init() {
    state.touch = (navigator.maxTouchPoints || 0) > 0 || ('ontouchstart' in window);
    document.body.classList.toggle('touch', state.touch);

    var st = window.Store.getSettings();
    state.diff = st.difficulty;
    window.SFX.setMuted(!st.sound);
    document.body.classList.toggle('colorblind', !!st.colorBlind);
    setMuteIcon();

    // Home
    $('btn-solo').onclick = function () { state.layout = 'solo'; showScreen('diff'); };
    $('btn-2p').onclick = function () { state.layout = 'versus'; showScreen('modes'); };
    $('btn-howto').onclick = function () { showScreen('howto'); };
    $('btn-stats').onclick = function () { showScreen('stats'); };
    $('btn-settings').onclick = function () { showScreen('settings'); };

    // Difficulty
    qsa('.diff-card').forEach(function (b) {
      b.onclick = function () {
        state.diff = b.getAttribute('data-diff');
        var s = window.Store.getSettings();
        s.difficulty = state.diff;
        window.Store.saveSettings(s);
        showScreen('modes');
      };
    });

    // Back buttons
    qsa('[data-back]').forEach(function (b) {
      b.onclick = function () { showScreen(b.getAttribute('data-back')); };
    });

    // Mute & pause
    $('btn-mute').onclick = function () {
      var s = window.Store.getSettings();
      s.sound = !s.sound;
      window.Store.saveSettings(s);
      window.SFX.setMuted(!s.sound);
      setMuteIcon();
    };
    $('btn-pause').onclick = function () { window.Game.togglePause(); };

    // Pause menu
    $('pause-resume').onclick = function () { window.Game.resume(); };
    $('pause-restart').onclick = function () { showScreen(null); window.Game.restart(); };
    $('pause-quit').onclick = function () { window.Game.quit(); showScreen('home'); };

    // Results
    $('res-rematch').onclick = function () { showScreen(null); window.Game.rematch(); };
    $('res-change').onclick = function () {
      state.layout = window.Game.layout();
      window.Game.quit();
      showScreen('modes');
    };
    $('res-home').onclick = function () { window.Game.quit(); showScreen('home'); };

    // Settings toggles
    $('set-sound').onclick = function () {
      var s = window.Store.getSettings(); s.sound = !s.sound; window.Store.saveSettings(s);
      window.SFX.setMuted(!s.sound); setToggle('set-sound', s.sound); setMuteIcon();
    };
    $('set-vib').onclick = function () {
      var s = window.Store.getSettings(); s.vibration = !s.vibration; window.Store.saveSettings(s); setToggle('set-vib', s.vibration);
    };
    $('set-shake').onclick = function () {
      var s = window.Store.getSettings(); s.shake = !s.shake; window.Store.saveSettings(s); setToggle('set-shake', s.shake);
    };
    $('set-cb').onclick = function () {
      var s = window.Store.getSettings(); s.colorBlind = !s.colorBlind; window.Store.saveSettings(s);
      setToggle('set-cb', s.colorBlind);
      document.body.classList.toggle('colorblind', s.colorBlind);
    };
    qsa('#set-diff button').forEach(function (b) {
      b.onclick = function () {
        var s = window.Store.getSettings(); s.difficulty = b.getAttribute('data-diff');
        state.diff = s.difficulty; window.Store.saveSettings(s); refreshSettings();
      };
    });
    function saveNames() {
      var s = window.Store.getSettings();
      s.names = [($('set-name0').value || '').trim().slice(0, 14) || 'Player 1', ($('set-name1').value || '').trim().slice(0, 14) || 'Player 2'];
      window.Store.saveSettings(s);
    }
    $('set-name0').onchange = saveNames;
    $('set-name1').onchange = saveNames;
    $('set-reset-keys').onclick = function () {
      window.Input.resetBindings();
      refreshBindingLabels();
      toast('Keys reset to default', 1600);
    };

    // Stats reset (tap twice)
    $('stats-reset').onclick = function () {
      if (!state.resetArmed) {
        state.resetArmed = true;
        $('stats-reset').textContent = 'Tap again to confirm';
        clearTimeout(state.resetTimer);
        state.resetTimer = setTimeout(function () { state.resetArmed = false; $('stats-reset').textContent = 'Reset stats'; }, 3000);
        return;
      }
      window.Store.resetStats();
      refreshStats();
      toast('Stats cleared', 1400);
    };

    // Sounds on every button press; audio unlocks on the first gesture (iOS rule).
    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('button')) window.SFX.play('click');
    }, true);
    var unlock = function () { window.SFX.unlock(); };
    ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    });

    // Block context menus, text selection and pinch zoom.
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('selectstart', function (e) {
      if (!(e.target && e.target.closest && e.target.closest('input'))) e.preventDefault();
    });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); });

    // Prevent Space/Enter from re-clicking focused menu buttons during play.
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && e.target && e.target.tagName === 'BUTTON') e.preventDefault();
    });

    // Opening the mode picker resets the layout (set by the chosen flow)
    renderModes();
    refreshSettings();
    showReadyNames();
  }

  function showReadyNames() {
    var st = window.Store.getSettings();
    $('ready-name-0').textContent = st.names[0];
    $('ready-name-1').textContent = st.names[1];
  }

  function setMuteIcon() {
    var st = window.Store.getSettings();
    $('btn-mute').textContent = st.sound ? '🔊' : '🔇';
  }

  window.UI = {
    init: init,
    showScreen: showScreen,
    banner: banner,
    hideBanner: hideBanner,
    toast: toast,
    flash: flash,
    showHint: showHint,
    showTutorial: showTutorial,
    showReady: showReady,
    readyState: readyState,
    readyGo: readyGo,
    showPause: showPause,
    hidePause: hidePause,
    showResults: showResults,
    setTouchVisible: setTouchVisible,
    setPauseVisible: setPauseVisible,
    debugText: debugText,
    debugVisible: debugVisible
  };
})();
