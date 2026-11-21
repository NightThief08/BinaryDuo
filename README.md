# STICK CLASH

**Instant couch-multiplayer stickman fighting on ONE device: no installs, accounts, downloads or internet.**

Two friends share one laptop or phone and play a 2-minute match in under 30 seconds of setup. Open the page, tap a mode, fight the bot or a friend.

---

## Architecture plan

**Goal:** a static website (plain HTML + CSS + JS + Canvas, no build step, no network) that works from `file://` and from any static host.

**Files**

- `index.html`: the DOM shell. Menus, overlays, touch-zone markup, and the classic `<script>` tags in dependency order.
- `css/style.css`: layout, touch-zone sizing, rotate prompt, safe-area insets.
- `js/config.js`: every tunable value (physics, timers, damage, bot tuning, key defaults, colours). Nothing else hard-codes a number that a designer would want to tune.
- `js/storage.js`: `Store`, all `localStorage` access wrapped in `try/catch`, with an in-memory fallback.
- `js/audio.js`: `SFX`, every sound generated with WebAudio. Unlocks on the first gesture (iOS rule). Mute.
- `js/input.js`: `Input`, the **input abstraction** (see below).
- `js/physics.js`: `Physics`, one-way platforms, landing, step-up, pushing fighters apart.
- `js/stickman.js`: `Fighter` (movement, jump, attacks, knockback, drawing) and `Combat` (the single hit-resolution path).
- `js/ai.js`: `AI`, the bot. Uses the same `Input` pipeline as a human.
- `js/modes/toyDrop.js`, `js/modes/crumblingFloor.js`, `js/modes/giantTiny.js`: one module per mode, all with the same interface.
- `js/engine.js`: `Engine`, fixed-step loop (60 Hz), canvas letterboxing, DPR cap 2, hit-stop, shake, particles.
- `js/ui.js`: `UI`, screens, banners, toasts, settings, stats, key rebinding.
- `js/main.js`: `Game`, the **state machine** and match flow (rounds, KO, sudden death, results, stats).

**Input abstraction.** Every source writes into one per-player record: `{dir, fall}` for held state and `{jump, hit}` for press edges.

- Keyboard: `event.code` mapped through the player's bindings.
- Mouse: left-click is P1 hit.
- Touch: each button belongs to a zone (`data-slot`). A touch is bound to the button it started on, by touch identifier.
- Gamepad: first pad is P1, second is P2. Left stick or D-pad move, A jumps, X hits.
- Bot: calls `Input.setBotHeld` and `Input.botTap`, exactly like a human.

The simulation only ever calls `Input.state(slot)` and `Input.consume(slot)`, so bot and human go through identical game logic.

**Game state machine (main.js).**

```
menu -> (solo) diff -> modes -> [tutorial once] -> hint(3s) ----+
menu -> (2P)   modes -> ready(both press HIT) -> readyGo ------+
                                                               v
countdown(3-2-1) -> fight -> ko(slow-mo on final KO) -> banner -+--> countdown (next round)
                                                               |
                          paused <--(Esc / P / tab hidden)-----+
                                                               v
                                                     over -> results -> rematch | change mode | home
```

---

## Features

- **Solo vs bot** (Easy / Medium / Hard) and **2 players on one device** (shared keyboard, or shared touchscreen on phones and tablets).
- **3 modes**, each best of 3 rounds, each always producing a winner:
  - **Random Toy Drop**: bridge over water, parachute items every 8 s, HP bars, 60 s rounds.
  - **Crumbling Floor Duel**: 10 glass tiles; cracks on first landing, shatters on second; guaranteed finish.
  - **Giant vs Tiny Swap**: roles swap every 10 s with a 1-second warning, HP bars, 60 s rounds.
- Sudden death on a draw or a timeout tie: the first landed hit wins, with a 30 s coin-flip safety net.
- Ready screen teaches the controls: each side presses HIT, then a 3-2-1 starts the match.
- Solo flow: 3 taps from the home screen to a fight (Play vs Bot → difficulty → mode).
- Key rebinding for both players (saved to `localStorage`), with duplicate and reserved-key checks.
- Settings: sound, vibration, screen shake, colour-blind mode (orange + shape markers), bot difficulty, player names.
- Stats (local only): wins and losses per mode vs bot, longest win streak, 2P head-to-head.
- Pause menu (resume / restart / quit), auto-pause when the tab is hidden or the window loses focus.
- One-time tutorial per mode (skippable). Debug overlay at `?debug=1`.
- Optional gamepad support with a "🎮 controller connected" toast.
- Rotate-your-phone prompt in portrait on phones.

---

## Modes

| Mode | Arena | Win condition | Notes |
|---|---|---|---|
| 🎁 Random Toy Drop | Bridge over water | HP to 0, or knock the opponent off | Items: 🥊 glove (2× damage, 8 s), 🤸 trampoline (placed where grabbed, 10 s), 🎳 bowling ball (HIT throws it), 🔴 laser (HIT → opponent chases the dot for 2 s), ☂️ umbrella (6 s slow fall). Hold max 1 item (bowling or laser). |
| 🧊 Crumbling Floor Duel | 10 glass tiles | Opponent falls | Auto-shatter starts after 20 s, one tile every 2 s, highlighted 1 s before. |
| 🐘 Giant vs Tiny Swap | Stage + 2 floating planks | HP to 0, or knock the opponent off | Giant: 3× size, 2× mass, 1.5× damage, 0.6× speed, stomps. Tiny: 0.4× size, 1.8× speed, double jump, 0.6× damage. |

---

## Controls

| Action | Solo (desktop) | P1 (desktop) | P2 (desktop) | Touch |
|---|---|---|---|---|
| Move left / right | A / D | A / D | ← / → | ◀ ▶ buttons (own zone) |
| Jump | W or Space | W | ↑ | JUMP |
| Hit (punch / kick alternating) | Left-click or F | F or Left-click | Right Shift | HIT |
| Fast-fall | S | S | ↓ | (not on touch) |
| Pause | Esc or P | Esc or P | Esc or P | ⏸ button |

- Hit is **Right Shift** for P2 (not Enter). Rebind in **Settings → Controls**.
- Esc and P are reserved for pause.

---

## How to run

**(a)** Double-click `index.html`. The game runs from `file://` with no network.

**(b)** Or serve the folder and open the address:

```bash
npx serve .
```

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

---

## How to deploy to GitHub Pages

1. Push this folder to a GitHub repository. Keep `index.html` at the repository root.
2. Make sure the `.nojekyll` file is in the root (it is included).
3. Open the repository on GitHub and go to **Settings**.
4. In the left sidebar, choose **Pages**.
5. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
6. Set the branch to **main** and the folder to **/ (root)**, then click **Save**.
7. Wait about a minute, then open the URL GitHub shows (`https://<user>.github.io/<repo>/`).

---

## Architecture overview

```
 index.html ──loads──> config ─ storage ─ audio ─ input ─ physics ─ stickman ─ ai
                                                          │
                          modes/toyDrop · crumblingFloor · giantTiny
                                                          │
                       engine (60 Hz loop, canvas) ── ui (DOM) ── main (Game state machine)

 per fixed step (60 Hz):

   Input.state(i) + Input.consume(i)  <── keyboard | mouse | touch zones | gamepad | AI.tick
            │
            ▼
   Fighter.update(dt, intent, presses, mode.solids(), env)   ← Physics.integrate (one-way platforms)
            │
            ▼
   Combat.resolve(a, b)  ── damage / knockback / hit-stop / FX
   Physics.pushApart(a, b)
   mode.update(...)     ── items, balls, tiles, swap timer
            │
            ▼
   ring-out / HP KO check ──> endRound ──> ko (slow-mo) ──> banner ──> countdown | over
```

---

## Known limitations

- **Keyboard ghosting:** some cheap keyboards cannot register three or more keys at once (for example move + jump + hit for both players). Use a keyboard with anti-ghosting, or play with a gamepad.
- **2-player on small phones is cramped.** A tip is shown under 700 px wide. Tablets and laptops are much better.
- **Browser and device behaviour:** audio and vibration depend on the browser and OS. iOS needs the first tap before any sound plays.
- **Crumbling Floor endgame:** once every empty tile has gone and only the two fighters' tiles remain, one tile must break for the round to finish. Whoever stands on it falls. Warned tiles are skipped while an empty tile is still available, so a fighter is never dropped by a tile that was empty when it was picked.
- **Bot strength:** the bot is tuned for fun, not for expert play. Hard is aggressive and fast. Easy is beatable by a beginner.
- **Stats** are stored per browser (`localStorage`). Clearing site data resets them.
- **Gamepad** support was written against the standard mapping but was not tested with a physical controller.

---

## 90-second demo video script

| Time | Shot | Voice-over / on-screen text |
|---|---|---|
| 0–10 s | Close-up of two fingers tapping one phone, then a laptop screen. | "Two friends. One device. No app, no login, no internet." |
| 10–30 s | Browser window, type the link (or open the file). Tap **PLAY vs BOT**, pick **Medium**, pick **Toy Drop**, skip the hint. The fight starts. | "Three taps and you're fighting. Hit to punch, jump, grab the parachute items." |
| 30–55 s | Laptop, two people. Ready screen: P1 presses F, P2 presses Right Shift, the 3-2-1 starts. Show A/D/W/F for P1 and arrows/Right Shift for P2 at the same time. | "Same keyboard, two players. Blue on the left, red on the right. Shared keys, no ghosting tricks." |
| 55–75 s | Phone or tablet in landscape, two people. Show the split screen and the touch clusters. Show the Crumbling Floor tiles cracking. | "Same touchscreen. Each thumb only drives its own side." |
| 75–85 s | Quick cuts: Toy Drop bowling ball, Crumbling Floor shatter, Giant stomp, the final KO slow-motion, the results screen. | "Three modes. Best of three. Always a winner." |
| 85–90 s | Address bar with the link on screen. | "Play it right now: `<your-username>.github.io/stick-clash`. Free, offline, no account." |

---

## License

MIT. See [LICENSE](LICENSE).
