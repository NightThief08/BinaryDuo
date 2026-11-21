/**
 * Types for STICK CLASH character data.
 * The data itself lives in public/stickclash/js/characters.js (a classic script, so the game
 * keeps running from file:// with no build step); src/test/stickclash-rules.test.ts checks it
 * against these types.
 */
export type CharacterId = "striker" | "brute" | "shadow" | "reach";
export type AccessoryType = "headband" | "shoulderPads" | "scarf" | "staff";
export type StatBar = 1 | 2 | 3 | 4 | 5;

/** Multipliers applied to the base values in CONFIG.FIGHTER (1.0 = unchanged). */
export interface CharacterStats {
  moveSpeed: number;
  jump: number;
  attackSpeed: number;
  damage: number;
  knockback: number;
  maxHP: number;
  range: number;
  receivedKnockback: number;
  /** Limb stroke width multiplier (visual only). */
  lineWidth: number;
}

export interface CharacterBars {
  speed: StatBar;
  power: StatBar;
  range: StatBar;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  role: string;
  tag: string;
  accentColor: string;
  altTint: string;
  accessory: AccessoryType;
  stats: CharacterStats;
  bars: CharacterBars;
}

export type CounterTable = Record<CharacterId, Partial<Record<CharacterId, number>>>;

export interface CharactersApi {
  list: CharacterDef[];
  get(id: string): CharacterDef | null;
  valid(id: string): boolean;
  orDefault(id: string | null | undefined): CharacterId;
  DEFAULT: CharacterId;
  COUNTERS: CounterTable;
  weights(difficulty: string, playerId: CharacterId): Record<CharacterId, number>;
  pickForBot(difficulty: string, playerId: CharacterId, history: CharacterId[], rng?: () => number): CharacterId;
  ROULETTE: { time: number; step: number; land: number };
}
