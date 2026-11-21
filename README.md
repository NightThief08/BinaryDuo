# STICK CLASH 🥊

**Instant couch-multiplayer fun on ONE device: no installs, accounts, downloads or internet.**
A stickman fighting website you can play against a bot or a friend on the same laptop keyboard, phone or tablet, with 4 wild game modes.

---

## 1. Architecture plan

The game is a **plain static website** in [`public/stickclash/`](public/stickclash): HTML + CSS + JavaScript + one `<canvas>`.
It uses classic `<script>` tags (no ES modules, no build step, no libraries, no network requests), so it runs by **double-clicking `index.html`** and on any static host.

> This repo is a Lovable project (TanStack Start). The Lovable app at `/` only forwards to `/stickclash/index.html`.
> None of the game depends on React or Vite. The folder `public/stickclash/` is the complete website.

```
public/stickclash/
├── index.html            screens (DOM menus) + one <canvas id="game">
├── css/style.css         chunky comic UI, safe-area insets, touch-action:none
├── js/config.js          CONFIG: every tunable value + default key bindings
├── js/storage.js         Store: localStorage in try/catch (settings, keys, stats)
├── js/audio.js           Sfx: WebAudio-synthesised sounds (unlocked on first tap)
├── js/input.js           Input: keyboard / mouse / touch zones / gamepad / bot -> same state
├── js/physics.js         verlet points & sticks, rect collision, helpers
├── js/engine.js          Engine (scaling, letterbox), FX (particles, shake, hit-stop), Match (rounds), Modes registry
├── js/stickman.js        Fighter (platformer stickman)
├── js/modes/toyDrop.js  js/modes/crumblingFloor.js  js/modes/giantTiny.js
├── js/ai.js              Bot: per-mode plans, difficulty, stuck detector; presses virtual buttons
├── js/ui.js              menus, ready screen, results, settings, rebinding, stats, how-to
├── js/main.js            App state machine + fixed-timestep loop
├── LICENSE (MIT)  .nojekyll
```

### Input abstraction
Every source writes the same per-player state. Game logic only reads `Input.poll()[player]`:

```
 Keyboard (event.code) ─┐
 Touch zones (by id) ───┼──► Input.poll() ──► [{left,right,jump,hit,down,jumpPressed,hitPressed} ×2] ──► Match ──► Fighters
 Gamepads ──────────────┤
 Bot.output ────────────┘   (the bot "presses buttons" exactly like a human)
```
* Fast taps are latched between ticks, so a press shorter than 16 ms is never lost.
* Each touch belongs forever to the zone/player where it **started** (tracked by `touch.identifier`).
* `blur` / tab hidden → all inputs cleared + auto-pause (no stuck keys).

### Game-state machine
```
 menu ─► difficulty ─► modes ─► tutorial (first time) ─┬─► hint 3s (solo) ─┐
          (solo only)                                   └─► READY (2P) ─────┴─► playing ◄──► paused
                                                                                   │
 Match:  intro 3-2-1 ─► fight ─► roundOver ─► (next round | matchOver) ─────────────┴─► results ─► rematch / change mode / home
             tie ─► SUDDEN DEATH ─► tie again ─► most hits ─► coin flip   (a winner is guaranteed)
```
* Fixed 60 Hz simulation decoupled from rendering, logical resolution 1280×720 letterboxed to any screen, devicePixelRatio capped at 2 and lowered automatically if the device can't hold ~50 fps.

---

## 2. Features
* **Home → fight in 3 taps:** PLAY vs BOT → difficulty → mode. A 3-second control hint plays, then the fight starts.
* **2 PLAYERS on one device:** shared keyboard with non-overlapping key sets, or a split touchscreen with full multi-touch (up to 8 touches).
* **READY screen** teaches each player their controls ("Press HIT when ready"). The match starts once both players have pressed.
* **3 modes**, first to 3 round wins, every round always ends with a winner.
* **Bot AI** for each mode, with Easy / Medium / Hard (450 / 250 / 120 ms reaction time, plus different error rates and aggression).
* Juice: hit-stop (50 ms), screen shake, star particles, slow-motion final KO, synthesised sounds, optional vibration.
* Settings: sound, vibration, screen shake, bot level, colour-blind mode (red → orange + shape markers), player names, **key rebinding per player** (saved).
* Local stats: wins/losses per mode vs bot, current & longest streak, head-to-head scoreboard by player names (reset button).
* Pause menu (resume / restart / quit), auto-pause on tab hide, rotate-your-phone screen, safe-area (notch) support.
* First-time animated tutorial per mode (skippable, shown once). Gamepad support with a "controller connected" toast.
* `?debug=1` overlay: fps, bodies, particles, active touches.

## 3. The 3 modes
| | Mode | Rules |
|---|---|---|
| 🎁 | **Random Toy Drop** | A bridge over water, 100 HP each. Every 8 s a toy parachutes down with a shadow marker. Walk over it to grab it (max 1): 🥊 Giant Glove (8 s, 2× damage, huge knockback) · Trampoline (placed on the spot for 10 s, super bounce) · 🎳 Bowling Ball (HIT to roll it) · 🔴 Laser Pointer (HIT: the opponent chases the dot for 2 s with a "!?" bubble) · ☂️ Tiny Umbrella (6 s slow float, JUMP to flap back). Win by KO, ring-out or higher HP at 60 s. A tie goes to sudden death. |
| 🧊 | **Crumbling Floor Duel** | 10 ice tiles (2 raised). The first landing on a tile cracks it and the second shatters it. After 20 s, one random tile is highlighted and breaks every 2 s. Last stickman standing wins. |
| 🦖 | **Giant vs Tiny Swap** | A stage with 2 floating platforms, HP and ring-outs, 60 s rounds. Every 3 s (with a 1 s warning) the roles swap. GIANT: 3× size, 2× mass, 1.5× damage, 0.6× speed, can stomp. TINY: 0.4× size, 1.8× speed, double jump, 0.6× damage. |

## 4. Controls
| | Desktop | Touch |
|---|---|---|
| **Solo** | A / D move · W or Space jump · F hit · S fast-fall · Esc pause | drag-to-move thumb pad bottom-left · big JUMP + HIT bottom-right |
| **Player 1 (blue, left)** | A / D move · W jump · F hit · S fast-fall | Left half: thumb pad on the outer edge, JUMP + HIT toward the centre |
| **Player 2 (red, right)** | ← / → move · ↑ jump · Shift hit · ↓ fast-fall | Right half: mirrored cluster |
| **Pause** | Esc or P | ⏸ button |
| **Gamepad** | Left stick / D-pad move · A jump · X hit · Start pause (1st pad = P1, 2nd = P2) | |

Keys are rebindable in **Settings → Controls** and saved in localStorage. Keys use `event.code` (physical position), so the layout works on AZERTY, QWERTZ and other keyboards too.

## 5. How to run
**(a) Offline:** open `public/stickclash/index.html` with a double-click. That's it.

**(b) Local server:**
```sh
cd public/stickclash
npx serve .            # or: python -m http.server 8000
# open http://localhost:8000
```
**(c) This Lovable project:** `npm i && npm run dev`, then open the app root. It forwards to the game.

Test harness (handy for demos and QA): `index.html?mode=crumble&bvb=1&speed=8&loop=1&debug=1` (modes: `toydrop`, `crumble`, `giant`; add `&duo=1` for 2P, `&diff=hard`).
Automated rule tests (headless bot-vs-bot matches in every mode): `npx vitest run src/test/stickclash-rules.test.ts`.

## 6. Deploy to GitHub Pages
Option A: **this repo** (the game folder is published by the included workflow):
1. Push the repo to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` (or run the "Deploy STICK CLASH to GitHub Pages" workflow by hand).
5. Open `https://<user>.github.io/<repo>/`.

Option B: **a game-only repo** (the classic "deploy from branch"):
1. Create a new repo and copy the *contents* of `public/stickclash/` to its root (`index.html`, `css/`, `js/`, `.nojekyll`, `LICENSE`).
2. Push to `main`.
3. Open **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Pick **main** and **/ (root)**, then Save.
5. After about a minute, open `https://<user>.github.io/<repo>/`.

All paths are relative, so the game works in any sub-folder.

## 7. Known limitations
* Some cheap keyboards can't register many keys at once ("ghosting"). The default 2P keys (WASD+F vs arrows+Shift) are chosen to reduce this, and you can rebind keys if needed.
* 2-player on a small phone is cramped (a one-time tip suggests a tablet or laptop).
* Vibration isn't supported on iOS Safari (it's silently skipped).
* Emoji icons in menus use the device's emoji font, so they look slightly different per OS.

## 8. 90-second demo video script
| Time | Shot | Voice-over / on-screen text |
|---|---|---|
| 0–10 s | Fast montage: a giant stomps a tiny stickman, a bowling ball STRIKE!, ice tiles shatter. | "Two friends. One device. Zero setup." |
| 10–30 s | Screen recording: paste the link → home screen → **PLAY vs BOT** → **Easy** → **Crumbling Floor** → the 3 s hint → fighting. A timer overlay shows 0:00 → 0:18. | "Open the link and you're fighting a bot in under 30 seconds. No install, no account, no download." |
| 30–55 s | Over-the-shoulder: two siblings on one laptop. **2 PLAYERS** → **Random Toy Drop** → READY screen (each presses their HIT key) → the glove, laser "!?" and trampoline. | "Same keyboard, two key sets. The ready screen teaches the controls in seconds." |
| 55–75 s | Two people holding one tablet/phone sideways, thumbs on their own corner buttons. Cut to Crumbling Floor: tiles shatter under them. | "On a phone or tablet the screen splits in two. Full multi-touch, and your thumbs never control the wrong player." |
| 75–85 s | Quick 2 s cuts of all 3 mode cards → gameplay of each. | "Three modes. First to three. Every match ends with a winner." |
| 85–90 s | Results screen with the trophy → the URL big on screen. | "STICK CLASH. Works offline, on any device. Play now: <your link>" |

## 9. Test checklist results (Nov 2026)
| Check | Result |
|---|---|
| Double-click `index.html` (file://), network blocked | ✅ Menus + full matches play from `file://` with every network request blocked (0 requests made). |
| Solo: each mode → finishes → Results → Rematch → Home | ✅ Full manual flow verified for Crumbling Floor (Home → Bot → Easy → mode → tutorial → hint → fight → Results → Rematch → Pause → Quit → Home). Every mode finishes in automated bot-vs-bot runs on Easy / Medium / Hard and in the headless rule tests. No console errors. |
| 2P keyboard simultaneous keys, no page scroll | ✅ D+W+F and ←+↑+Shift held at once all register for the right players. Arrows/Space never scroll (scrollY stays 0). |
| 2P touch multi-touch, no wrong-player touches | ✅ 4 simultaneous touches (P1 ▶ + HIT, P2 ◀ + JUMP) all register correctly. A finger sliding from P1's zone into P2's buttons stays P1. |
| Ragdoll Flip W vs ↑ / left vs right half | ✅ A left-half tap flips only P1 and a right-half tap flips only P2 (verified with touch events). Keys are mapped the same way. |
| Bot never stuck | ✅ Stuck detector (1.5 s) plus edge-safety reflex. Hundreds of bot-vs-bot rounds over all modes and levels always finished. |
| Always a winner | ✅ Tie → sudden death → most hits → coin flip. Unit tests cover the simultaneous ring-out and HP time-out cases. |
| Alt-tab / hidden tab | ✅ `blur` / `visibilitychange` → auto-pause, all inputs cleared (a held key reads as released afterwards). |
| Key rebinding survives reload | ✅ Rebinding P2 HIT to G persists after reload and works in a 2P match. Reset to default works. |
| Mobile: no scroll/zoom, rotate prompt, notch | ✅ The rotate prompt shows in portrait and hides in landscape. `touch-action:none`, no zoom, `viewport-fit=cover` + safe-area insets. |
| 60 fps, phone viewport, 4× CPU throttling | ✅ About 58–60 fps after adaptive resolution kicks in (it starts around 40 fps at DPR 2 with headless software rendering, then drops to DPR 1). |
| GitHub Pages | ⚠️ Workflow and relative paths are in place, but it wasn't deployed from here. Needs a push to a GitHub repo. |

**Not verified on real hardware:** iOS Safari, Samsung Internet, Firefox and real gamepads. Testing was done in headless Chromium with emulated touch.
