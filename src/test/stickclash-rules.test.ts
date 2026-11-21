import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CharacterDef, CharacterId, CharactersApi } from "../game/characters";

// Loads the plain-JS game (classic scripts) into one function scope and runs headless bot-vs-bot matches.
const ROOT = path.resolve(__dirname, "../../public/stickclash/js");
const FILES = [
  "config.js",
  "characters.js",
  "storage.js",
  "audio.js",
  "physics.js",
  "engine.js",
  "stickman.js",
  "modes/toyDrop.js",
  "modes/crumblingFloor.js",
  "modes/giantTiny.js",
  "ai.js",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function loadGame(): Any {
  const code = FILES.map((f) => readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const prelude =
    "var SETTINGS = { sound: false, vibration: false, shake: true, colorblind: false, difficulty: 'medium' }; window.SETTINGS = SETTINGS;\n";
  const factory = new Function(
    "window",
    "document",
    prelude + code + "\nreturn { CONFIG: CONFIG, CHARACTERS: CHARACTERS, Match: Match, Modes: Modes, Store: Store, Sfx: Sfx };",
  );
  return factory(window, document);
}

function botInputs(match: Any, prev: Any[]) {
  return [0, 1].map((i) => {
    const o = match.bots[i].output;
    const s = { ...o, jumpPressed: o.jump && !prev[i].jump, hitPressed: o.hit && !prev[i].hit };
    prev[i] = { jump: o.jump, hit: o.hit };
    return s;
  });
}

function playMatch(game: Any, modeId: string, difficulty: string) {
  const match = new game.Match({ modeId, duo: false, difficulty, names: ["You", "Bot"], bvb: true });
  let result: Any = null;
  match.onEnd = (r: Any) => {
    result = r;
  };
  const prev = [{}, {}] as Any[];
  const dt = game.CONFIG.TICK;
  for (let t = 0; t < 60 * 60 * 8 && !result; t++) match.update(dt, botInputs(match, prev));
  return result;
}

describe("STICK CLASH rules", () => {
  const game = loadGame();
  const C = game.CONFIG;

  it("uses the requested round lengths and intervals", () => {
    expect(C.TOYDROP.roundTime).toBe(60);
    expect(C.TOYDROP.itemEvery).toBe(8);
    expect(C.TOYDROP.hp).toBe(100);
    expect(C.CRUMBLE.tiles).toBe(10);
    expect(C.CRUMBLE.collapseAfter).toBe(20);
    expect(C.CRUMBLE.collapseEvery).toBe(2);
    expect(C.GIANTTINY.swapEvery).toBe(3);
    expect(C.GIANTTINY.roundTime).toBe(60);
  });

  it("matches are first to 3 round wins", () => {
    expect(C.ROUNDS_TO_WIN).toBe(3);
  });

  it("giant and tiny get the requested multipliers", () => {
    expect(C.GIANTTINY.giant).toMatchObject({ size: 3, mass: 2, dmg: 1.5, speed: 0.6 });
    expect(C.GIANTTINY.tiny).toMatchObject({ size: 0.4, dmg: 0.6, speed: 1.8 });
  });

  it("bot reaction delays are 450 / 250 / 120 ms", () => {
    expect(C.BOT.easy.reaction).toBe(0.45);
    expect(C.BOT.medium.reaction).toBe(0.25);
    expect(C.BOT.hard.reaction).toBe(0.12);
    expect(C.BOT.stuckTime).toBe(1.5);
  });

  it("2-player key sets never share a key", () => {
    const p1 = Object.values(C.KEYS.p1).flat();
    const p2 = Object.values(C.KEYS.p2).flat();
    expect(p1.filter((k) => p2.includes(k))).toEqual([]);
  });

  for (const mode of ["toydrop", "crumble", "giant"]) {
    it(`${mode}: a bot-vs-bot match always finishes with a winner`, () => {
      const r = playMatch(game, mode, "medium");
      expect(r).not.toBeNull();
      expect([0, 1]).toContain(r.winner);
      expect(Math.max(r.roundWins[0], r.roundWins[1])).toBe(3);
    });
  }

  it("a simultaneous ring-out goes to sudden death, and repeated ties still produce a winner", () => {
    const match = new game.Match({ modeId: "crumble", duo: false, difficulty: "easy", names: ["A", "B"], bvb: true });
    match.state = "fight";
    match.fighters[0].out = true;
    match.fighters[1].out = true;
    match.resolve(match.mode.checkEnd(match));
    expect(match.state).toBe("sd");
    match.suddenDeath = 2;
    match.fighters[0].out = true;
    match.fighters[1].out = true;
    match.resolve(match.mode.checkEnd(match));
    expect(match.state).toBe("roundOver");
    expect(match.roundWins[0] + match.roundWins[1]).toBe(1);
  });

  it("time-out in an HP mode gives the round to the higher HP", () => {
    const match = new game.Match({ modeId: "toydrop", duo: false, difficulty: "easy", names: ["A", "B"], bvb: true });
    match.timeLeft = 0;
    match.fighters[0].hp = 40;
    match.fighters[1].hp = 70;
    expect(match.mode.checkEnd(match)).toMatchObject({ winner: 1, reason: "TIME!" });
    match.fighters[0].hp = 70;
    expect(match.mode.checkEnd(match)).toMatchObject({ tie: true });
  });

  function hitLands(modeId: string, gap: number, scales: [number, number]) {
    const match = new game.Match({ modeId, duo: false, difficulty: "easy", names: ["A", "B"], bvb: true });
    match.state = "fight";
    const [a, b] = match.fighters;
    a.out = b.out = false;
    a.x = 600; b.x = 600 + gap; a.y = b.y = 500; a.facing = 1;
    a.setScale(scales[0], true); b.setScale(scales[1], true);
    a.invuln = b.invuln = 0;
    const before = b.hp;
    a.attackType = "kick"; a.attackT = C.FIGHTER.hitActiveStart + 0.01; a.hitDone = false;
    a.checkHit(b, match);
    return b.hp < before;
  }

  it("hits land when fighters are right next to (or overlapping) each other", () => {
    for (const gap of [0, 5, 15, 30]) expect(hitLands("toydrop", gap, [1, 1])).toBe(true);
  });

  it("giant hits tiny and tiny hits giant at close range", () => {
    expect(hitLands("giant", 20, [C.GIANTTINY.giant.size, C.GIANTTINY.tiny.size])).toBe(true);
    expect(hitLands("giant", 20, [C.GIANTTINY.tiny.size, C.GIANTTINY.giant.size])).toBe(true);
  });

  it("countdown says 1, 2, 3 then Let the chaos begin", () => {
    expect(C.COUNTDOWN.words).toEqual(["1", "2", "3"]);
    expect(C.COUNTDOWN.go).toBe("LET THE CHAOS BEGIN!");
  });

  it("red player hits with Shift, not Enter", () => {
    expect(C.KEYS.p2.hit).toContain("ShiftRight");
    expect(C.KEYS.p2.hit).not.toContain("Enter");
  });

  it("changing bot difficulty applies immediately without replacing input's bot reference", () => {
    const match = new game.Match({ modeId: "giant", duo: false, difficulty: "easy", names: ["You", "Bot"] });
    const bot = match.bots[1];
    for (const difficulty of ["hard", "medium", "easy"]) {
      expect(match.setDifficulty(difficulty)).toBe(true);
      expect(match.bots[1]).toBe(bot);
      expect(bot.diff).toBe(difficulty);
      expect(bot.p).toBe(C.BOT[difficulty]);
      expect(match.opts.difficulty).toBe(difficulty);
    }
    expect(match.setDifficulty("unknown")).toBe(false);
    expect(bot.diff).toBe("easy");
  });

  it("2-player matches cannot gain a bot by changing difficulty", () => {
    const match = new game.Match({ modeId: "giant", duo: true, difficulty: "easy", names: ["A", "B"] });
    expect(match.setDifficulty("hard")).toBe(false);
    expect(match.bots).toEqual([null, null]);
  });

  it("each knockout triggers one sound, including non-final rounds and ring-outs", () => {
    const cue = vi.spyOn(game.Sfx, "ko");
    try {
      const match = new game.Match({ modeId: "toydrop", duo: false, difficulty: "easy", names: ["A", "B"] });
      match.fighters[1].hp = 0;
      match.checkKnockouts(); match.checkKnockouts();
      expect(cue).toHaveBeenCalledTimes(1);
      match.winRound(0, "K.O.!");
      expect(cue).toHaveBeenCalledTimes(1);
      match.startRound(); match.fighters[0].out = true;
      match.checkKnockouts(); match.checkKnockouts();
      expect(cue).toHaveBeenCalledTimes(2);
    } finally { cue.mockRestore(); }
  });

  it("timeouts do not play a death cue", () => {
    const cue = vi.spyOn(game.Sfx, "ko");
    try {
      const match = new game.Match({ modeId: "toydrop", duo: false, difficulty: "easy", names: ["A", "B"] });
      match.timeLeft = 0; match.fighters[0].hp = 40; match.fighters[1].hp = 70;
      match.checkKnockouts(); match.resolve(match.mode.checkEnd(match));
      expect(cue).not.toHaveBeenCalled();
    } finally { cue.mockRestore(); }
  });

  describe("characters", () => {
    const CH: CharactersApi = game.CHARACTERS;
    const mk = (chars: CharacterId[], modeId = "toydrop", difficulty = "easy") =>
      new game.Match({ modeId, duo: false, difficulty, names: ["A", "B"], characters: chars });
    const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length] as number; };

    it("defines the 4 fighters with the requested multipliers", () => {
      const ids = CH.list.map((c: CharacterDef) => c.id);
      expect(ids).toEqual(["striker", "brute", "shadow", "reach"]);
      expect(CH.get("brute")?.stats).toMatchObject({ moveSpeed: 0.85, jump: 0.9, attackSpeed: 0.8, damage: 1.3, knockback: 1.35, maxHP: 1.15, receivedKnockback: 0.8 });
      expect(CH.get("shadow")?.stats).toMatchObject({ moveSpeed: 1.2, jump: 1.2, attackSpeed: 1.3, damage: 0.85, maxHP: 0.9, range: 0.95 });
      expect(CH.get("reach")?.stats.range).toBe(1.45);
      expect(CH.orDefault("nope")).toBe("striker");
    });

    it("max HP follows the character (Brute +15%, Shadow -10%)", () => {
      const m = mk(["brute", "shadow"]);
      expect(m.fighters[0].maxHp).toBeCloseTo(115);
      expect(m.fighters[0].hp).toBeCloseTo(115);
      expect(m.fighters[1].maxHp).toBeCloseTo(90);
    });

    it("Brute hits harder than Striker and Reach hits from further away", () => {
      const hitFrom = (attacker: CharacterId, gap: number) => {
        const m = mk([attacker, "striker"]);
        m.state = "fight";
        const [a, v] = m.fighters;
        a.x = 900; v.x = 900 + gap; a.facing = 1; a.attackType = "punch"; a.attackT = a.tm.s + 0.001; a.hitDone = false;
        a.checkHit(v, m);
        return v.maxHp - v.hp;
      };
      expect(hitFrom("brute", 30)).toBeCloseTo(12 * 1.3);
      expect(hitFrom("striker", 30)).toBeCloseTo(12);
      expect(hitFrom("striker", 105)).toBe(0);
      expect(hitFrom("reach", 105)).toBeGreaterThan(0);
    });

    it("mirror matches give the second fighter the alt tint", () => {
      const m = mk(["shadow", "shadow"]);
      expect(m.fighters[0].color).toBe("#B388FF");
      expect(m.fighters[1].color).toBe("#D9C4FF");
    });

    it("hard bots counter-pick with the requested weights", () => {
      expect(CH.weights("hard", "brute")).toMatchObject({ reach: 0.6, shadow: 0.3 });
      const w = CH.weights("hard", "brute");
      expect(w.striker + w.brute).toBeCloseTo(0.1);
      expect(CH.pickForBot("hard", "brute", [], () => 0.1)).toBe("reach");
      expect(CH.pickForBot("hard", "shadow", [], () => 0.1)).toBe("brute");
      expect(CH.pickForBot("hard", "reach", [], () => 0.1)).toBe("shadow");
      expect(CH.weights("easy", "brute").reach).toBe(0.25);
    });

    it("bots never pick the same fighter 3 matches in a row", () => {
      const hist: CharacterId[] = [];
      const rng = seq([0.05, 0.1, 0.2]);
      for (let i = 0; i < 40; i++) {
        hist.push(CH.pickForBot("hard", "brute", hist, rng));
        const n = hist.length;
        if (n >= 3) expect(hist[n - 1] === hist[n - 2] && hist[n - 2] === hist[n - 3]).toBe(false);
      }
    });

    it("arena is 1.5x wider and bot matches still finish with every character", () => {
      expect(C.WORLD.W).toBe(1920);
      expect(C.WORLD.H).toBe(864);
      const ids: CharacterId[] = ["striker", "brute", "shadow", "reach"];
      for (const modeId of ["toydrop", "crumble", "giant"]) {
        const m = new game.Match({ modeId, duo: false, difficulty: "hard", names: ["A", "B"], bvb: true, characters: [ids[modeId.length % 4], ids[(modeId.length + 1) % 4]] });
        let res: Any = null; m.onEnd = (r: Any) => { res = r; };
        const prev = [{}, {}] as Any[];
        for (let t = 0; t < 60 * 60 * 8 && !res; t++) m.update(C.TICK, botInputs(m, prev));
        expect(res?.winner === 0 || res?.winner === 1).toBe(true);
        expect(m.cam.z).toBeGreaterThanOrEqual(C.CAMERA.minZoom - 1e-6);
        expect(m.cam.z).toBeLessThanOrEqual(C.CAMERA.maxZoom + 1e-6);
      }
    });
  });
});
