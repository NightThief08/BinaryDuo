/* STICK CLASH — every tunable value lives here.
   Classic script (no modules) so the game also runs from file://. */
(function () {
  'use strict';

  var CONFIG = {
    // ---- Logical resolution & loop ----
    W: 1280,
    H: 720,
    FIXED_DT: 1 / 60,          // simulation step (60 Hz)
    MAX_DPR: 2,                // devicePixelRatio cap
    MAX_FRAME_DT: 0.25,        // clamp for huge frame gaps (tab switch)

    // ---- Physics ----
    GRAVITY: 2200,             // px/s²
    FAST_FALL_MULT: 1.9,       // gravity multiplier while holding fast-fall
    MAX_FALL: 1500,            // terminal velocity px/s
    STEP_UP: 40,               // max platform height a walker can step onto
    EPS: 1.5,                  // landing tolerance px

    // ---- Stickman body ----
    FIGHTER: {
      bodyW: 44,               // collision box width (px at scale 1)
      bodyH: 104,              // collision box height (px at scale 1)
      speed: 330,              // walk speed px/s
      groundAccel: 2600,
      airAccel: 1100,
      knockDecel: 1000,        // deceleration of knockback velocity (ground and air)
      friction: 1800,          // slowdown when no input on ground (stun/knockback)
      airDrag: 260,
      jumpV: 860,              // initial jump velocity
      coyote: 0.09,            // s of grace after leaving a ledge
      jumpBuffer: 0.12,        // s a jump press is remembered
      stunOnHitPunch: 0.22,
      stunOnHitKick: 0.30,
      maxJumps: 1,             // extra air jumps (Tiny gets 1 more)
      invulnAfterKO: 0
    },

    // ---- Attacks (alternating punch / kick on each HIT press) ----
    ATTACK: {
      punch: { reach: 52, dmg: 7, kb: 220, kbUp: 170, active: 0.12, cooldown: 0.34, anim: 0.26, low: false },
      kick:  { reach: 66, dmg: 10, kb: 280, kbUp: 230, active: 0.15, cooldown: 0.46, anim: 0.34, low: true }
    },
    HITSTOP: 0.05,             // s freeze on each landed hit
    SHAKE_HIT: 7,              // px shake amplitude on hit
    SHAKE_KO: 16,              // px shake amplitude on KO
    VIBRATE_HIT_MS: 25,        // vibration on hit (if enabled)

    // ---- Match / rounds ----
    ROUNDS_TO_WIN: 2,          // best of 3
    COUNTDOWN_SECONDS: 3,      // 3-2-1 before each round
    KO_SLOWMO_SECONDS: 1.1,    // slow-motion before the round result
    KO_SLOWMO_SCALE: 0.35,     // time scale during the slow-mo (final KO only)
    ROUND_BANNER_SECONDS: 2.2,
    SUDDEN_DEATH_TIMEOUT: 30,  // s before a sudden-death coin flip (guarantees a winner)
    SOLO_HINT_SECONDS: 3,      // control hint shown before solo fights
    READY_AUTOSTART_DELAY: 0.4,

    // ---- Keys ----
    // Each player's bindings. Solo uses P1 bindings plus Space (jump) and mouse/F (hit).
    KEYS: {
      p1: { left: 'KeyA', right: 'KeyD', jump: 'KeyW', hit: 'KeyF', fall: 'KeyS' },
      p2: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', hit: 'ShiftRight', fall: 'ArrowDown' }
    },
    SOLO_EXTRA_KEYS: { jump: ['Space'], hit: [] },
    PAUSE_KEYS: ['Escape', 'KeyP'],
    RESERVED_KEYS: ['Escape', 'KeyP', 'Tab', 'Enter', 'Space'],

    // ---- Colours ----
    COLORS: {
      p1: '#2f7cff', p2: '#ff3347',
      p2ColorBlind: '#ff8a1f',
      ink: '#14202b'
    },

    // ---- Bot difficulty (reaction delay s, error rate 0..1, aggression 0..1) ----
    BOT: {
      easy:   { delay: 0.45, error: 0.35, aggression: 0.35, label: 'Easy' },
      medium: { delay: 0.25, error: 0.15, aggression: 0.6,  label: 'Medium' },
      hard:   { delay: 0.12, error: 0.05, aggression: 0.9,  label: 'Hard' }
    },
    BOT_STUCK_SECONDS: 1.5,    // no meaningful movement for this long → unstick
    BOT_STUCK_DISTANCE: 14,    // px considered "meaningful movement"

    // ---- Modes ----
    MODES: {
      toyDrop: {
        name: 'Random Toy Drop',
        blurb: 'Parachute power-ups drop on a bridge. Grab, use, win.',
        controls: 'Move · Jump · Hit (uses item)',
        icon: '🎁',
        time: 60,
        usesHP: true,
        hp: 100,
        bridge: { x: 190, y: 470, w: 900, h: 22 },
        spawnX: [380, 900],
        killY: 760,
        itemEvery: 8,
        itemFallSpeed: 150,
        itemLife: 15,
        glove: { time: 8, dmgMult: 2, kbMult: 2 },
        umbrella: { time: 6, fallCap: 150, gravMult: 0.3 },
        trampoline: { life: 10, w: 96, bounce: 1120 },
        bowling: { life: 6, speed: 640, dmg: 12, kb: 720, size: 34, ownerGrace: 0.35 },
        laser: { time: 2, reach: 220 }
      },
      crumblingFloor: {
        name: 'Crumbling Floor Duel',
        blurb: 'Glass tiles crack, then shatter. Last one standing wins.',
        controls: 'Move · Jump · Hit (knocks back)',
        icon: '🧊',
        time: 0,                 // no timer: auto-shatter guarantees a finish
        usesHP: false,
        hp: 0,
        tileCount: 10,
        tileW: 100,
        tileGap: 16,
        tileY: 520,
        tileH: 24,
        raisedCount: 2,
        raiseBy: 36,
        spawnTiles: [2, 7],
        killY: 760,
        autoStart: 20,          // s before auto-shatter begins
        autoEvery: 2,           // s between auto-shatters
        warn: 1,                // s of highlight before a tile shatters
        kbMult: 2.2
      },
      giantTiny: {
        name: 'Giant vs Tiny Swap',
        blurb: 'Roles swap every 10s. Giant stomps, Tiny runs and pokes.',
        controls: 'Move · Jump · Hit (Tiny double-jumps)',
        icon: '🐘',
        time: 60,
        usesHP: true,
        hp: 100,
        stage: { x: 150, y: 540, w: 980, h: 24 },
        floats: [
          { x: 230, y: 380, w: 210, h: 16 },
          { x: 840, y: 380, w: 210, h: 16 }
        ],
        spawnX: [360, 920],
        killY: 760,
        swapEvery: 10,
        warn: 1,
        giant: { scale: 3, mass: 2, speed: 0.6, dmg: 1.5, stompDmg: 22, stompMinVy: 260, extraJumps: 0 },
        tiny:  { scale: 0.4, mass: 1, speed: 1.8, dmg: 0.6, extraJumps: 1 },
        scaleTime: 0.3
      }
    },
    MODE_ORDER: ['toyDrop', 'crumblingFloor', 'giantTiny'],

    // ---- Item drop table for Toy Drop (weights) ----
    ITEMS: {
      glove: { label: 'Boxing Glove', icon: '🥊', weight: 1 },
      trampoline: { label: 'Trampoline', icon: '🤸', weight: 1 },
      bowling: { label: 'Bowling Ball', icon: '🎳', weight: 1 },
      laser: { label: 'Laser Pointer', icon: '🔴', weight: 1 },
      umbrella: { label: 'Tiny Umbrella', icon: '☂️', weight: 1 }
    },

    // ---- Audio ----
    MASTER_VOLUME: 0.5,

    // ---- Misc ----
    TUTORIAL_KEY: 'sc_tut_',
    TIP_PHONE_WIDTH: 700,
    TOUCH_BTN_MIN_PHONE: 72,      // solo touch button min px (phone)
    TOUCH_BTN_MIN_PAIR_PHONE: 56, // 2P touch button min px (phone)
    TOUCH_BTN_MIN_TABLET: 84
  };

  window.CONFIG = CONFIG;
})();
