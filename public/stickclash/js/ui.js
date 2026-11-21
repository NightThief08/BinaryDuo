/* DOM menus: screens, mode cards, ready screen, results, settings, rebinding, stats, how-to. */
var UI = (function () {
  var current = 'home', history = [];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function show(id, noHistory) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.add('hidden');
    if (id) {
      if (!noHistory && current && current !== id) history.push(current);
      $(id).classList.remove('hidden');
    }
    current = id;
  }
  function back() {
    var prev = history.pop();
    while (prev && ['tutorial', 'hint', 'ready', 'pause', 'results'].indexOf(prev) >= 0) prev = history.pop();
    show(prev || 'home', true);
    return prev || 'home';
  }
  function resetHistory() { history = []; }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 2600);
  }

  // ----- control pictures -----
  function kc(code, label) { return '<span class="kc"><kbd>' + esc(Input.keyName(code)) + '</kbd>' + esc(label) + '</span>'; }
  function tb(icon, label) { return '<span class="kc"><span class="tb">' + icon + '</span>' + esc(label) + '</span>'; }
  function controlsHTML(player, duo, oneButton, touch) {
    var b = Input.bindings(), set = duo ? (player === 0 ? b.p1 : b.p2) : b.solo;
    if (touch) {
      if (oneButton) return '<div class="keys">' + tb('👆', duo ? (player === 0 ? 'Tap LEFT half' : 'Tap RIGHT half') : 'Tap anywhere') + '</div>';
      return '<div class="keys">' + tb('👆', 'Drag to move') + tb('⬆', 'Jump') + tb('✊', 'Hit') + '</div>';
    }
    if (oneButton) {
      var extra = !duo ? kc('Space', 'or') : '';
      return '<div class="keys">' + kc(set.jump[0], 'Flip!') + extra + '</div>';
    }
    var hitExtra = '';
    return '<div class="keys">' + kc(set.left[0], 'Left') + kc(set.right[0], 'Right') + kc(set.jump[0], 'Jump') + kc(set.hit[0], 'Hit') + hitExtra + kc(set.down[0], 'Fall') + '</div>';
  }

  // ----- mode cards -----
  function syncDifficulty() {
    var buttons = document.querySelectorAll('[data-level]');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute('data-level') === SETTINGS.difficulty;
      buttons[i].classList.toggle('on', on); buttons[i].setAttribute('aria-pressed', String(on));
    }
  }
  function difficultyControl(id, onChange) {
    var el = document.createElement('div'); el.id = id; el.className = 'difficulty-control';
    el.innerHTML = '<span>BOT LEVEL</span><div class="seg" role="group" aria-label="Bot difficulty">' + ['easy', 'medium', 'hard'].map(function (d) {
      return '<button data-level="' + d + '">' + d.charAt(0).toUpperCase() + d.slice(1) + '</button>';
    }).join('') + '</div>';
    var buttons = el.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].onclick = function (e) { onChange(e.currentTarget.getAttribute('data-level')); };
    return el;
  }
  function renderPause(duo, onDifficulty, onMode) {
    var panel = $('pause').querySelector('.panel'), old = $('pauseDifficulty');
    if (old) old.remove();
    if (!duo) panel.insertBefore(difficultyControl('pauseDifficulty', onDifficulty), $('btnResume'));
    var mode = $('btnPauseMode');
    if (!mode) { mode = document.createElement('button'); mode.id = 'btnPauseMode'; mode.className = 'btn'; mode.textContent = '🎮 Change Mode'; panel.insertBefore(mode, $('btnQuit')); }
    mode.onclick = onMode; syncDifficulty();
  }
  function buildModes(onPick, duo, onDifficulty) {
    var wrap = $('modeCards'); wrap.innerHTML = '';
    var old = $('modeDifficulty'); if (old) old.remove();
    if (!duo && onDifficulty) wrap.parentNode.insertBefore(difficultyControl('modeDifficulty', onDifficulty), wrap);
    syncDifficulty();
    var stats = Store.stats();
    $('modesTitle').textContent = duo ? '2 Players · pick a mode' : 'Pick a mode';
    $('modesSub').textContent = 'First to ' + CONFIG.ROUNDS_TO_WIN + ' round wins takes the match';
    CONFIG.MODES.forEach(function (m, i) {
      var b = document.createElement('button');
      b.className = 'mode-card';
      b.style.background = 'linear-gradient(180deg,' + m.color + ', ' + shade(m.color) + ')';
      b.style.animationDelay = (i * 0.06) + 's';
      var rec = '';
      if (!duo && stats.bot[m.id]) rec = '<span class="rec">W ' + stats.bot[m.id].w + ' · L ' + stats.bot[m.id].l + '</span>';
      b.innerHTML = '<span class="mnum">' + (i + 1) + '</span><span class="mi">' + m.icon + '</span><b>' + esc(m.name) + '</b><p>' + esc(m.desc) + '</p>' + rec + '<span class="hintline">' + esc(m.hint) + '</span>';
      b.addEventListener('click', function () { Sfx.click(); onPick(m.id); });
      wrap.appendChild(b);
    });
  }
  function shade(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) * 0.7, g = ((n >> 8) & 255) * 0.7, bl = (n & 255) * 0.7;
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ')';
  }

  var TUTORIALS = {
    toydrop: [['🎁', 'A toy drops every 8 seconds'], ['🚶', 'Walk over it to grab it'], ['✊', 'HIT throws ball / fires laser'], ['❤️', 'Empty their HP or splash them']],
    crumble: [['🧊', 'Landing on a tile cracks it'], ['💥', 'Second landing shatters it'], ['⏱️', 'After 20s tiles break alone'], ['🕳️', 'Last stickman standing wins']],
    giant: [['🔄', 'Sizes swap every 3 seconds'], ['🦖', 'Giant: huge hits + stomps'], ['🐭', 'Tiny: fast + double jump'], ['❤️', 'Empty their HP or ring out']]
  };
  var GOALS = { toydrop: 'Grab toys · empty their HP', crumble: 'Make them fall through!', giant: 'Giant chases · Tiny runs' };

  function renderTutorial(modeId) {
    var m = Modes.info(modeId);
    $('tutHead').innerHTML = '<span>' + m.icon + '</span>' + esc(m.name);
    $('tutSteps').innerHTML = TUTORIALS[modeId].map(function (s, i) { return '<li style="animation-delay:' + (0.15 + i * 0.7) + 's"><em>' + s[0] + '</em> ' + esc(s[1]) + '</li>'; }).join('');
  }
  function renderHint(modeId, oneButton) {
    var m = Modes.info(modeId), touch = Input.showTouch();
    $('hintBody').innerHTML = '<div class="hint-head"><span>' + m.icon + '</span>' + esc(m.name) + '</div>' +
      '<div class="goal">🎯 ' + esc(GOALS[modeId]) + '</div>' + controlsHTML(0, false, oneButton, touch) +
      '<div class="progress"><div class="bar" id="hintBar"></div></div><p class="muted small">Tap to start now</p>';
  }
  function renderReady(modeId, names, oneButton, flags) {
    var touch = Input.showTouch(), m = Modes.info(modeId);
    for (var i = 0; i < 2; i++) {
      var el = $(i === 0 ? 'readyP1' : 'readyP2');
      var press = oneButton ? 'Press your button' : 'Press HIT when ready';
      if (touch) press = oneButton ? 'Tap here when ready' : 'Tap here when ready';
      el.className = 'ready-half ' + (i === 0 ? 'p1' : 'p2') + (flags[i] ? ' isready' : '');
      el.innerHTML = '<div class="who">' + esc(names[i]) + '</div>' + '<div class="' + (i === 1 ? 'p2c' : '') + '">' + controlsHTML(i, true, oneButton, touch) + '</div>' +
        '<div class="press">' + (flags[i] ? 'READY ✓' : esc(press)) + '</div>';
    }
    $('readyMode').textContent = m.icon + ' ' + m.name + ' · first to ' + CONFIG.ROUNDS_TO_WIN + ' wins';
  }
  function setReady(i, on) {
    var el = $(i === 0 ? 'readyP1' : 'readyP2');
    el.classList.toggle('isready', on);
    var p = el.querySelector('.press'); if (p && on) p.textContent = 'READY ✓';
  }

  function renderResults(res, handlers) {
    var w = res.winner, m = Modes.info(res.modeId);
    var title = res.duo ? res.names[w] + ' WINS!' : (w === 0 ? 'YOU WIN!' : 'BOT WINS!');
    var crown = res.duo || w === 0 ? '🏆' : '🤖';
    var n0 = res.duo ? res.names[0] : 'You', n1 = res.duo ? res.names[1] : 'Bot';
    var s = res.stats;
    var html = '<div class="game-over">GAME OVER</div><div class="crown">' + crown + '</div><div class="winner" style="color:' + res.colors[w] + '">' + esc(title) + '</div>' +
      '<div class="score">' + m.icon + ' ' + esc(m.name) + ' · ' + res.roundWins[0] + ' – ' + res.roundWins[1] + '</div>' +
      (res.characters ? '<div class="score"><span style="color:' + res.colors[0] + ';-webkit-text-stroke:1px #0f172a">' + esc(CHARACTERS.get(res.characters[0]).name) + '</span> vs <span style="color:' + res.colors[1] + ';-webkit-text-stroke:1px #0f172a">' + esc(CHARACTERS.get(res.characters[1]).name) + '</span></div>' : '') +
      '<table class="stat-table"><tr><th></th><th style="color:' + res.colors[0] + '">' + esc(n0) + '</th><th style="color:' + res.colors[1] + '">' + esc(n1) + '</th></tr>' +
      '<tr><td>👊 Hits landed</td><td>' + s[0].hits + '</td><td>' + s[1].hits + '</td></tr>' +
      '<tr><td>🎁 Items used</td><td>' + s[0].items + '</td><td>' + s[1].items + '</td></tr>' +
      '<tr><td>💥 KOs</td><td>' + s[0].kos + '</td><td>' + s[1].kos + '</td></tr></table>' +
      '<button class="btn primary" id="btnRematch">↻ Rematch</button><div class="btn-row"><button class="btn" id="btnChangeFighter">🥋 Change Fighter</button><button class="btn" id="btnChangeMode">🎮 Change Mode</button><button class="btn" id="btnHome">⌂ Home</button></div>';
    $('resultsBody').innerHTML = html;
    if (!res.duo) $('resultsBody').insertBefore(difficultyControl('resultsDifficulty', handlers.difficulty), $('btnRematch'));
    syncDifficulty();
    $('btnRematch').onclick = handlers.rematch; $('btnChangeFighter').onclick = handlers.fighter; $('btnChangeMode').onclick = handlers.change; $('btnHome').onclick = handlers.home;
  }

  // ----- choose your fighter -----
  var FS = null; // { duo, picks, onChange, onFight, previews, raf, busy }
  function pickColor(player, id) {
    var c = CHARACTERS.get(id);
    return player === 1 && FS && FS.duo && FS.picks[0] === id ? c.altTint : c.accentColor;
  }
  function cardHTML(player, c) {
    var bar = function (label, v) { var p = ''; for (var i = 1; i <= 5; i++) p += '<span' + (i <= v ? ' class="f"' : '') + '></span>'; return '<div class="bar-row"><span>' + label + '</span><div class="pips">' + p + '</div></div>'; };
    return '<button class="fcard" data-player="' + player + '" data-char="' + c.id + '" aria-pressed="false" aria-label="' + esc(c.name + ', ' + c.tag) + '">' +
      '<canvas width="192" height="192" aria-hidden="true"></canvas><div class="finfo"><b><i></i>' + esc(c.name) + '</b><small>' + esc(c.tag) + '</small>' +
      '<div class="bars">' + bar('Speed', c.bars.speed) + bar('Power', c.bars.power) + bar('Range', c.bars.range) + '</div></div></button>';
  }
  function renderFighters(opts) {
    stopPreviews();
    FS = { duo: opts.duo, picks: opts.picks.slice(), onChange: opts.onChange, onFight: opts.onFight, previews: [], raf: 0, busy: false };
    var b = Input.bindings(), k = function (list) { return list.map(Input.keyName).join('/'); };
    var sides = opts.duo ? [0, 1] : [0], html = '';
    sides.forEach(function (p) {
      var cls = opts.duo ? (p === 0 ? 'p1' : 'p2') : 'solo';
      var keys = opts.duo ? (p === 0 ? k([b.p1.left[0], b.p1.right[0], b.p1.jump[0], b.p1.down[0]]) : k([b.p2.left[0], b.p2.right[0], b.p2.jump[0], b.p2.down[0]])) : 'Arrows to move · Enter to fight';
      html += '<div class="pick-side ' + cls + '">' + (opts.duo ? '<h3><span class="pk">' + esc(opts.names[p]) + '</span><span class="keys-hint">' + esc(keys) + '</span></h3>' : '') +
        '<div class="fgrid" role="group" aria-label="' + esc(opts.duo ? opts.names[p] + ' fighter' : 'Your fighter') + '">' + CHARACTERS.list.map(function (c) { return cardHTML(p, c); }).join('') + '</div></div>';
    });
    $('pickSides').innerHTML = html;
    $('fightersSub').textContent = opts.duo ? 'Each player picks a fighter · Enter to fight' : 'The bot picks after you';
    $('botStatus').classList.add('hidden');
    var cards = $('pickSides').querySelectorAll('.fcard');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var player = +card.getAttribute('data-player'), id = card.getAttribute('data-char');
        card.addEventListener('click', function () { if (!FS.busy) setPick(player, id); });
        var f = new Fighter(player, 60, 112, player === 1 ? -1 : 1);
        f.onGround = true;
        FS.previews.push({ card: card, canvas: card.querySelector('canvas'), f: f, player: player, id: id, next: 0.6 + Math.random() * 1.5 });
      })(cards[i]);
    }
    $('btnFight').onclick = function () { if (!FS.busy) FS.onFight(FS.picks.slice()); };
    syncFighters();
    startPreviews();
  }
  function setPick(player, id) {
    if (!FS || !CHARACTERS.valid(id)) return;
    FS.picks[player] = id; Sfx.click();
    if (FS.onChange) FS.onChange(player, id);
    syncFighters();
  }
  function syncFighters() {
    var ready = true;
    FS.previews.forEach(function (pv) {
      var on = FS.picks[pv.player] === pv.id, col = pickColor(pv.player, pv.id);
      pv.card.classList.toggle('on', on); pv.card.setAttribute('aria-pressed', String(on));
      pv.card.style.setProperty('--acc', col);
      pv.f.setCharacter(pv.id, col !== CHARACTERS.get(pv.id).accentColor);
    });
    for (var p = 0; p < (FS.duo ? 2 : 1); p++) if (!CHARACTERS.valid(FS.picks[p])) ready = false;
    $('btnFight').disabled = !ready || FS.busy;
  }
  function gridCols(player) {
    var side = $('pickSides').querySelectorAll('.fgrid')[FS.duo ? player : 0];
    var cols = side ? getComputedStyle(side).gridTemplateColumns.split(' ').filter(Boolean).length : 4;
    return cols || 4;
  }
  function moveCursor(player, dx, dy) {
    var ids = CHARACTERS.list.map(function (c) { return c.id; }), n = ids.length, cols = gridCols(player);
    var i = Math.max(0, ids.indexOf(FS.picks[player]));
    i = dy ? (i + dy * cols + n) % n : (i + dx + n) % n;
    setPick(player, ids[i]);
    var card = $('pickSides').querySelector('.fcard[data-player="' + player + '"][data-char="' + ids[i] + '"]');
    if (card) card.focus({ preventScroll: true });
  }
  function onFighterKey(e) {
    if (current !== 'fighters' || !FS || FS.busy || Input.capturing && Input.capturing()) return;
    var code = e.code, b = Input.bindings(), has = function (list) { return list.indexOf(code) >= 0; };
    var handled = true;
    if (code === 'Enter' || code === 'NumpadEnter' || (!FS.duo && code === 'Space')) { if (!$('btnFight').disabled) FS.onFight(FS.picks.slice()); }
    else if (FS.duo) {
      if (has(b.p1.left)) moveCursor(0, -1, 0); else if (has(b.p1.right)) moveCursor(0, 1, 0);
      else if (has(b.p1.jump)) moveCursor(0, 0, -1); else if (has(b.p1.down)) moveCursor(0, 0, 1);
      else if (has(b.p2.left)) moveCursor(1, -1, 0); else if (has(b.p2.right)) moveCursor(1, 1, 0);
      else if (has(b.p2.jump)) moveCursor(1, 0, -1); else if (has(b.p2.down)) moveCursor(1, 0, 1);
      else handled = false;
    } else {
      if (code === 'ArrowLeft' || has(b.solo.left)) moveCursor(0, -1, 0); else if (code === 'ArrowRight' || has(b.solo.right)) moveCursor(0, 1, 0);
      else if (code === 'ArrowUp' || has(b.solo.jump)) moveCursor(0, 0, -1); else if (code === 'ArrowDown' || has(b.solo.down)) moveCursor(0, 0, 1);
      else handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  document.addEventListener('keydown', onFighterKey, true);
  function startPreviews() {
    var last = 0;
    function loop(ts) {
      if (!FS || current !== 'fighters') { FS && (FS.raf = 0); return; }
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      FS.previews.forEach(function (pv) {
        var f = pv.f, g = pv.canvas.getContext('2d');
        f.t += dt;
        if (f.attackT >= 0) { f.attackT += dt; if (f.attackT > f.tm.cd) f.attackT = -1; }
        else if ((pv.next -= dt) <= 0) { pv.next = 1 + Math.random() * 1.6; f.attackType = f.attackType === 'punch' ? 'kick' : 'punch'; f.attackT = 0; }
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 192, 192);
        g.setTransform(1.6, 0, 0, 1.6, f.char.accessory === 'staff' ? -8 : 0, 0);
        f.draw(g);
      });
      FS.raf = requestAnimationFrame(loop);
    }
    FS.raf = requestAnimationFrame(loop);
  }
  function stopPreviews() { if (FS && FS.raf) cancelAnimationFrame(FS.raf); }
  // Bot roulette: cycles a BOT highlight across the 4 cards, lands on the bot's pick, then calls done.
  function botRoulette(botId, done) {
    if (!FS) { done(); return; }
    var R = CHARACTERS.ROULETTE, cards = FS.previews.filter(function (pv) { return pv.player === 0; }), t = 0, i = 0;
    FS.busy = true; syncFighters();
    var st = $('botStatus'); st.classList.remove('hidden'); st.textContent = '🤖 Bot picking…';
    var target = 0; cards.forEach(function (pv, k) { if (pv.id === botId) target = k; });
    var steps = Math.max(4, Math.round(R.time / R.step)); steps += (target - steps % cards.length + cards.length) % cards.length; // land exactly on target
    var stepMs = (R.time / steps) * 1000;
    function hi(k) { cards.forEach(function (pv, j) { pv.card.classList.toggle('bot-hi', j === k); }); }
    var timer = setInterval(function () {
      i++; hi(i % cards.length); if (i % cards.length !== target || i < steps) Sfx.click();
      if (i >= steps) {
        clearInterval(timer);
        var c = cards[target], ch = CHARACTERS.get(botId);
        c.card.classList.add('bot-land'); hi(target);
        st.innerHTML = '🤖 Bot picks <span style="color:' + (FS.picks[0] === botId ? ch.altTint : ch.accentColor) + ';-webkit-text-stroke:1px #0f172a">' + esc(ch.name) + '</span>!';
        Sfx.pickup();
        setTimeout(function () { if (FS) FS.busy = false; done(); }, R.land * 1000);
      }
    }, stepMs);
    hi(0); t = 0;
  }

  // ----- settings -----
  function renderSettings() {
    var s = SETTINGS;
    var boxes = document.querySelectorAll('[data-setting]');
    for (var i = 0; i < boxes.length; i++) boxes[i].checked = !!s[boxes[i].getAttribute('data-setting')];
    var segs = document.querySelectorAll('[data-sdiff]');
    for (var j = 0; j < segs.length; j++) segs[j].classList.toggle('on', segs[j].getAttribute('data-sdiff') === s.difficulty);
    $('nameP1').value = s.p1Name; $('nameP2').value = s.p2Name;
  }

  // ----- key rebinding -----
  var ACTION_LABELS = { left: '◀ Left', right: '▶ Right', jump: '⬆ Jump', hit: '✊ Hit', down: '⬇ Fast-fall' };
  function renderControls() {
    var b = Input.bindings(), grid = $('bindGrid');
    var cols = [['solo', '🤖 Solo'], ['p1', '🔵 Player 1'], ['p2', SETTINGS.colorblind ? '🟠 Player 2' : '🔴 Player 2']];
    grid.innerHTML = cols.map(function (c) {
      return '<div class="bind-col"><h3>' + c[1] + '</h3>' + Object.keys(ACTION_LABELS).map(function (a) {
        return '<div class="bind-row"><span>' + ACTION_LABELS[a] + '</span><button data-bind="' + c[0] + '.' + a + '">' + esc(b[c[0]][a].map(Input.keyName).join(' / ')) + '</button></div>';
      }).join('') + '</div>';
    }).join('');
    var btns = grid.querySelectorAll('[data-bind]');
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', onBindClick);
  }
  function onBindClick(e) {
    var btn = e.currentTarget, parts = btn.getAttribute('data-bind').split('.');
    var all = document.querySelectorAll('[data-bind]');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('listening');
    btn.classList.add('listening'); btn.textContent = 'Press a key…';
    Input.capture(function (code) {
      if (code !== 'Escape' && CONFIG.KEYS.pause.indexOf(code) < 0) {
        var b = Input.bindings();
        // keep the two 2-player key sets from overlapping: steal the key from the other player
        if (parts[0] !== 'solo') {
          var other = parts[0] === 'p1' ? 'p2' : 'p1';
          for (var a in b[other]) { b[other][a] = b[other][a].filter(function (c) { return c !== code; }); if (!b[other][a].length) b[other][a] = CONFIG.KEYS[other][a].filter(function (c) { return c !== code; }).slice(0, 1); }
        }
        for (var a2 in b[parts[0]]) if (a2 !== parts[1]) b[parts[0]][a2] = b[parts[0]][a2].filter(function (c) { return c !== code; });
        b[parts[0]][parts[1]] = [code];
        for (var a3 in b[parts[0]]) if (!b[parts[0]][a3].length) b[parts[0]][a3] = CONFIG.KEYS[parts[0]][a3].slice(0, 1);
        Store.saveKeys(b);
        Input.reloadBindings();
        toast('Saved: ' + ACTION_LABELS[parts[1]] + ' = ' + Input.keyName(code), 1500);
      }
      renderControls();
    });
  }

  // ----- stats -----
  function renderStats() {
    var s = Store.stats(), html = '<div class="stats-h">🤖 vs Bot</div><table class="stat-table"><tr><th>Mode</th><th>Wins</th><th>Losses</th></tr>';
    CONFIG.MODES.forEach(function (m) { var r = s.bot[m.id] || { w: 0, l: 0 }; html += '<tr><td>' + m.icon + ' ' + esc(m.name) + '</td><td>' + r.w + '</td><td>' + r.l + '</td></tr>'; });
    html += '</table><div class="row"><span>🔥 Current streak</span><b>' + s.streak + '</b></div><div class="row"><span>🏅 Longest streak</span><b>' + s.bestStreak + '</b></div>';
    html += '<div class="stats-h">👥 Head-to-head</div>';
    var keys = Object.keys(s.h2h);
    if (!keys.length) html += '<p class="muted small">Play a 2-player match to start a rivalry!</p>';
    else { html += '<table class="stat-table">'; keys.forEach(function (k) { var r = s.h2h[k], names = Object.keys(r); html += '<tr><td>' + esc(names[0]) + ' <b>' + r[names[0]] + '</b></td><td>–</td><td><b>' + (r[names[1]] || 0) + '</b> ' + esc(names[1] || '') + '</td></tr>'; }); html += '</table>'; }
    $('statsBody').innerHTML = html;
  }

  function renderHowto() {
    var html = '<div class="howto-grid">' + CONFIG.MODES.map(function (m) { return '<div><b>' + m.icon + ' ' + esc(m.name) + '</b><br>' + esc(m.desc) + '<br><span class="muted">' + esc(GOALS[m.id]) + '</span></div>'; }).join('') + '</div>';
    var b = Input.bindings(), k = function (list) { return list.map(Input.keyName).join(' / '); };
    html += '<table class="ctrl-table"><tr><th></th><th>Desktop</th><th>Touch</th></tr>' +
      '<tr><td><b>Solo</b></td><td>' + k(b.solo.left) + ' ' + k(b.solo.right) + ' move · ' + k(b.solo.jump) + ' jump · Click/' + k(b.solo.hit) + ' hit · ' + k(b.solo.down) + ' fall</td><td>◀ ▶ bottom-left · JUMP + HIT bottom-right</td></tr>' +
      '<tr><td><b>P1</b></td><td>' + k(b.p1.left) + ' ' + k(b.p1.right) + ' move · ' + k(b.p1.jump) + ' jump · ' + k(b.p1.hit) + '/Click hit · ' + k(b.p1.down) + ' fall</td><td>Left half buttons</td></tr>' +
      '<tr><td><b>P2</b></td><td>' + k(b.p2.left) + ' ' + k(b.p2.right) + ' move · ' + k(b.p2.jump) + ' jump · ' + k(b.p2.hit) + ' hit · ' + k(b.p2.down) + ' fall</td><td>Right half buttons</td></tr>' +
      '<tr><td><b>Pause</b></td><td>Esc / P</td><td>⏸ button</td></tr></table><p class="muted small">🎮 Gamepads: stick/D-pad move · A jump · X hit · Start pause</p>';
    $('howtoBody').innerHTML = html;
  }

  return { show: show, back: back, resetHistory: resetHistory, current: function () { return current; }, toast: toast, $: $,
    buildModes: buildModes, renderPause: renderPause, syncDifficulty: syncDifficulty, renderTutorial: renderTutorial, renderHint: renderHint, renderReady: renderReady, setReady: setReady,
    renderFighters: renderFighters, botRoulette: botRoulette, renderResults: renderResults, renderSettings: renderSettings, renderControls: renderControls, renderStats: renderStats, renderHowto: renderHowto, controlsHTML: controlsHTML };
})();
