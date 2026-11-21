/* STICK CLASH — every tunable value lives here. Plain script, no modules. */
var CONFIG = {
  VERSION: '1.0.0',
  WIDTH: 1280,            // logical resolution
  HEIGHT: 720,
  MAX_DPR: 2,
  TICK: 1 / 60,           // fixed simulation step (60 Hz)
  MAX_STEPS_PER_FRAME: 5,
  ROUNDS_TO_WIN: 3,       // first to 3 round wins (best of 5)
  KILL_Y: 860,            // fall below this = ring-out
  // Battlefield: 1.5x the old 1280 width, 1.2x the old 720 height (extra headroom above).
  // World x runs 0..W, world y runs TOP..TOP+H; the screen view stays 1280x720 logical.
  WORLD: { W: 1920, H: 864, TOP: -144, BACKDROP: 1.5, BACKDROP_ANCHOR_Y: 690 },
  CAMERA: { minZoom: 0.6667, maxZoom: 1.0, marginX: 230, marginY: 170, follow: 5, maxBottom: 790 },

  COLORS: {
    p1: '#3b82f6', p1Dark: '#1d4ed8',
    p2: '#ef4444', p2Dark: '#b91c1c',
    p2CB: '#f59e0b', p2CBDark: '#b45309', // colour-blind alternative for P2
    ink: '#0f172a', sky1: '#1e1b4b', sky2: '#4c1d95'
  },

  FIGHTER: {
    height: 92, width: 26,
    gravity: 2200, fastFallGravity: 4200, maxFall: 1500,
    accel: 3800, airAccel: 2200, friction: 2600,
    speed: 360, jump: 820, doubleJump: 700,
    hitCooldown: 0.34, hitActiveStart: 0.06, hitActiveEnd: 0.16,
    punchRange: 58, kickRange: 66, punchDamage: 12, kickDamage: 14,
    knockX: 430, knockY: 300, hitstun: 0.28
  },

  COUNTDOWN: { step: 0.7, words: ['1', '2', '3'], go: 'LET THE CHAOS BEGIN!', goTime: 1.2 },

  ARENA: { structure: '#18232b', edge: '#91a8ac', light: '#f4f8ec', banner: '#ffd84a', shadow: 'rgba(8,18,24,0.55)', beam: 'rgba(244,248,236,0.12)' },
  ANIMATION: { trailSpeed: 180, trailAlpha: 0.16, airStretch: 0.08, koFallTime: 0.5, victoryRate: 7, swingWidth: 5 },

  HITSTOP: 0.05,          // 50 ms freeze on hit
  SHAKE: { small: 5, big: 14 },
  KO_SLOWMO: 1.1,         // seconds of slow-motion on the final KO

  TOYDROP: {
    roundTime: 60, hp: 100, itemEvery: 8, itemFallSpeed: 110, itemLife: 14,
    bridgeX: 240, bridgeW: 1440, bridgeY: 520,
    glove: { time: 8, dmg: 2, knock: 2.4 },
    trampoline: { time: 10, bounce: 1550, width: 90 },
    bowling: { speed: 620, radius: 20, life: 4 },
    laser: { time: 2 },
    umbrella: { time: 6, maxFall: 120, gravity: 500 }
  },

  CRUMBLE: {
    tiles: 10, tileW: 138, gap: 15, tileH: 22, y: 500, raised: 46,
    collapseAfter: 20, collapseEvery: 2, warn: 1, knockMul: 1.45
  },

  GIANTTINY: {
    roundTime: 60, hp: 100, swapEvery: 3, warn: 1, scaleTime: 0.3,
    giant: { size: 3, mass: 2, dmg: 1.5, speed: 0.6 },
    tiny: { size: 0.4, mass: 0.85, dmg: 0.6, speed: 1.8 },
    stompDamage: 22
  },

  BOT: {
    easy:   { reaction: 0.45, error: 0.32, aggression: 0.28, idle: 0.25 },
    medium: { reaction: 0.25, error: 0.14, aggression: 0.55, idle: 0.08 },
    hard:   { reaction: 0.12, error: 0.04, aggression: 0.85, idle: 0.0 },
    stuckTime: 1.5, stuckDist: 14
  },

  TOUCH: { soloSize: 96, duoSize: 74, tabletDuoSize: 90, stickRadius: 60, stickDead: 14, maxTouches: 8, smallPhone: 700 },

  // Default key bindings (event.code = physical key, layout independent)
  KEYS: {
    solo: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW', 'Space'], hit: ['KeyF'], down: ['KeyS'] },
    p1:   { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], hit: ['KeyF'], down: ['KeyS'] },
    p2:   { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], hit: ['ShiftRight', 'ShiftLeft'], down: ['ArrowDown'] },
    pause: ['Escape', 'KeyP']
  },

  MODES: [
    { id: 'toydrop', name: 'Random Toy Drop', icon: '🎁', color: '#f59e0b', desc: 'Grab wild toys. Use them!', hint: 'Walk over toys · HIT uses' },
    { id: 'crumble', name: 'Crumbling Floor', icon: '🧊', color: '#06b6d4', desc: 'Tiles crack. Last one standing!', hint: 'Every landing cracks tiles' },
    { id: 'giant',   name: 'Giant vs Tiny', icon: '🦖', color: '#22c55e', desc: 'Sizes swap every 3 seconds!', hint: 'Giant chases · Tiny runs' }
  ]
};
