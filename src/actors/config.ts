export type Mode = "team" | "ffa";

export interface ModeConfigEntry {
  capacity: number;
  teams: ("red" | "blue" | "ffa")[];
}

export const MODE_CONFIG: Record<Mode, ModeConfigEntry> = {
  team: {
    capacity: 8,
    teams: ["red", "blue"],
  },
  ffa: {
    capacity: 8,
    teams: ["ffa"],
  },
};

export const TICK_MS = 50; // 20 Ticks/sec
export const WORLD_SIZE = 200; // 200x200 arena (centered at 0, 0, so bounds are -100 to 100)

export interface TankStats {
  speed: number;
  hp: number;
  damage: number;
  fireRate: number; // in seconds
  abilityCooldown: number; // in ms
  description: string;
  abilityDescription: string;
  name: string;
}

export const TANK_STATS: Record<string, TankStats> = {
  scout: {
    name: "Scout",
    speed: 12,
    hp: 80,
    damage: 15,
    fireRate: 0.3,
    abilityCooldown: 10000, // 10s
    description: "סייר מהיר וזריז עם קצב ירי גבוה אך שריון נמוך.",
    abilityDescription: "דאש - ספרינט מהיר ל-2 שניות המפחית נזק ב-50%."
  },
  titan: {
    name: "Titan",
    speed: 6,
    hp: 200,
    damage: 25,
    fireRate: 1.0,
    abilityCooldown: 15000, // 15s
    description: "טנק כבד עם כמות חיים עצומה, נע לאט ומכה חזק.",
    abilityDescription: "מגן אנרגיה - חוסם 100% מהנזק למשך 3 שניות."
  },
  destroyer: {
    name: "Destroyer",
    speed: 8,
    hp: 120,
    damage: 45,
    fireRate: 1.5,
    abilityCooldown: 12000, // 12s
    description: "משמיד הרסני בעל כוח אש אדיר וקצב ירי איטי.",
    abilityDescription: "יריית חדירה - יורה פגז עוצמתי החודר דרך מכשולים."
  },
  medic: {
    name: "Medic",
    speed: 10,
    hp: 100,
    damage: 12,
    fireRate: 0.4,
    abilityCooldown: 8000, // 8s
    description: "טנק תמיכה מאוזן המסוגל לרפא את עצמו ואת חבריו.",
    abilityDescription: "ריפוי אזורי - מרפא 40 נקודות חיים לבעלי ברית ברדיוס 15."
  }
};

export const SCORE_LIMIT = 20; // First team/player to 20 kills wins
export const RESPAWN_TIME_MS = 3000; // 3 seconds respawn time
export const TEAM_SWITCH_COOLDOWN_MS = 15000; // 15 seconds cooldown for team switching

export interface Obstacle {
  id: string;
  x: number;
  z: number;
  w: number; // width along X
  d: number; // depth along Z
  h: number; // height
  type: "wall" | "building" | "barrel";
}

// Fixed obstacles for building the map on server and client
export const OBSTACLES: Obstacle[] = [
  // Center structures
  { id: "b1", x: 0, z: 0, w: 20, d: 20, h: 8, type: "building" },
  { id: "w1", x: -30, z: 30, w: 10, d: 10, h: 5, type: "wall" },
  { id: "w2", x: 30, z: -30, w: 10, d: 10, h: 5, type: "wall" },
  // Perimeter walls
  { id: "w3", x: -60, z: 0, w: 5, d: 40, h: 6, type: "wall" },
  { id: "w4", x: 60, z: 0, w: 5, d: 40, h: 6, type: "wall" },
  { id: "w5", x: 0, z: -60, w: 40, d: 5, h: 6, type: "wall" },
  { id: "w6", x: 0, z: 60, w: 40, d: 5, h: 6, type: "wall" },
  // Barrels (destructible/collidable)
  { id: "ba1", x: -15, z: -15, w: 3, d: 3, h: 3, type: "barrel" },
  { id: "ba2", x: 15, z: 15, w: 3, d: 3, h: 3, type: "barrel" },
  { id: "ba3", x: -15, z: 15, w: 3, d: 3, h: 3, type: "barrel" },
  { id: "ba4", x: 15, z: -15, w: 3, d: 3, h: 3, type: "barrel" },
];
