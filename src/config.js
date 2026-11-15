// ARCANE DUEL — static data: heroes, weapons, skills, arenas.
// All art, names and characters are original. No external assets.
export const W = 1280, H = 720;
export const GRAVITY = 700;          // px/s^2
export const TURN_TIME = 30;         // seconds per turn
export const MAX_HP = 100;

export const HEROES = {
  kairo: {
    id: 'kairo', name: 'KAIRO', title: 'Flame Gunner', element: 'Fire',
    color: '#ff7a2f', dark: '#c73e0a', light: '#ffb347',
    desc: 'Wild gunner with a roaring Inferno Cannon. Big blasts, chain explosions.',
    hp: 100, muzzle: { x: 108, y: 62 },
    basic: { id: 'cannon', name: 'Inferno Cannon' },
    skill1: { id: 'meteor', name: 'Meteor Blast', cost: 40, cd: 2, desc: 'A blazing meteor crashes down. Fire element.' },
    skill2: { id: 'barrage', name: 'Flame Barrage', cost: 60, cd: 3, desc: 'Three fireballs rain on the foe.' },
    ult: { id: 'dragon', name: 'Dragon Inferno', cost: 100, desc: 'Five meteors + a colossal explosion.' },
  },
  nyx: {
    id: 'nyx', name: 'NYX', title: 'Arcane Mage', element: 'Arcane',
    color: '#a06bff', dark: '#5b2ea6', light: '#d9b8ff',
    desc: 'Moon mage whose crescent launcher bends starlight into multi-hit waves.',
    hp: 100, muzzle: { x: 104, y: 56 },
    basic: { id: 'moon', name: 'Moon Bolt' },
    skill1: { id: 'lunar', name: 'Lunar Wave', cost: 40, cd: 2, desc: 'Arcane wave. Marks the ground — fire hitting it triggers a COMBO.' },
    skill2: { id: 'astral', name: 'Astral Rain', cost: 60, cd: 3, desc: 'Five star bolts fall from the sky.' },
    ult: { id: 'celestial', name: 'Celestial Storm', cost: 100, desc: 'A storm of moons and arcane zones.' },
  },
  bront: {
    id: 'bront', name: 'BRONT', title: 'Earth Guardian', element: 'Earth',
    color: '#7fb069', dark: '#3e6b2f', light: '#c9e39a',
    desc: 'Mountain of armor. His mortar shatters the very ground beneath you.',
    hp: 100, muzzle: { x: 112, y: 66 },
    basic: { id: 'boulder', name: 'Boulder Shot' },
    skill1: { id: 'crash', name: 'Boulder Crash', cost: 40, cd: 2, desc: 'A huge boulder with a massive crater.' },
    skill2: { id: 'wall', name: 'Stone Wall', cost: 60, cd: 3, desc: 'Raise a stone wall in front of you.' },
    ult: { id: 'quake', name: 'Earthquake Titan', cost: 100, desc: 'The earth itself rises against the foe.' },
  },
};

// Weapons: shared inventory. dmg = direct-hit damage, radius = explosion radius.
// kind: 'ball' (ballistic) | 'homing' | 'pierce' (ignores terrain) | 'beam' (no gravity) | 'shield' (buff)
export const WEAPONS = {
  cannon:  { id: 'cannon',  name: 'Standard Cannon', kind: 'ball',   dmg: 28, radius: 55, ammo: Infinity, speed: 1.0, desc: 'Reliable standard shot.' },
  triple:  { id: 'triple',  name: 'Triple Shot',     kind: 'triple', dmg: 14, radius: 34, ammo: 3, speed: 1.0, desc: 'Three projectiles, spread out.' },
  meteor:  { id: 'meteor',  name: 'Meteor Blast',    kind: 'ball',   dmg: 46, radius: 78, ammo: 2, speed: 1.05, elem: 'fire', desc: 'Huge fire explosion.' },
  homing:  { id: 'homing',  name: 'Homing Orb',      kind: 'homing', dmg: 22, radius: 46, ammo: 2, speed: 0.85, desc: 'Chases the target.' },
  pierce:  { id: 'pierce',  name: 'Piercing Bolt',   kind: 'pierce', dmg: 30, radius: 30, ammo: 2, speed: 1.35, desc: 'Flies through terrain.' },
  cluster: { id: 'cluster', name: 'Explosive Cluster', kind: 'cluster', dmg: 13, radius: 40, ammo: 2, speed: 0.95, desc: 'Splits into 5 bomblets.' },
  beam:    { id: 'beam',    name: 'Elemental Beam',  kind: 'beam',   dmg: 34, radius: 28, ammo: 2, speed: 1.6, desc: 'Straight, gravity-free beam.' },
  shield:  { id: 'shield',  name: 'Defensive Shield', kind: 'shield', dmg: 0, radius: 0, ammo: 2, speed: 0, desc: 'Block 40 damage next hit.' },
};
export const WEAPON_ORDER = ['cannon', 'triple', 'meteor', 'homing', 'pierce', 'cluster', 'beam', 'shield'];

export const ARENAS = {
  valley: {
    id: 'valley', name: 'Crystal Valley', base: 565, amp: 42,
    sky: ['#7ec8f7', '#bfe9ff', '#e8f9ff'], far: '#8fb8d8', ground: '#6f8f5a', groundD: '#4c6b3c', groundL: '#9cc184',
    accent: '#59d6ff', decor: 'crystal', desc: 'Floating islands and glowing crystals.',
  },
  canyon: {
    id: 'canyon', name: 'Ember Canyon', base: 590, amp: 55,
    sky: ['#2b0f1e', '#7a1f16', '#e86a2a'], far: '#5a2a24', ground: '#4a3230', groundD: '#2e1d1c', groundL: '#7a4a3a',
    accent: '#ff8c2f', decor: 'lava', desc: 'Volcanic terrain and rivers of lava.',
  },
  temple: {
    id: 'temple', name: 'Ancient Sky Temple', base: 555, amp: 34,
    sky: ['#3d2a6b', '#7a5fc0', '#c9a7ff'], far: '#6b5a9e', ground: '#8a7a5e', groundD: '#5e5140', groundL: '#b8a67e',
    accent: '#ffd76a', decor: 'temple', desc: 'Floating ruins above magical clouds.',
  },
};
export const ARENA_ORDER = ['valley', 'canyon', 'temple'];

export const DIFFICULTY = {
  easy:   { id: 'easy',   name: 'Apprentice', aimErr: 0.18, angErr: 8,  react: 1400, skillUse: 0.15 },
  normal: { id: 'normal', name: 'Adept',      aimErr: 0.08, angErr: 3,  react: 1100, skillUse: 0.35 },
  hard:   { id: 'hard',   name: 'Archmage',   aimErr: 0.02, angErr: 1,  react: 800,  skillUse: 0.55 },
  elite:  { id: 'elite',  name: 'Elite',      aimErr: 0.01, angErr: 0.5, react: 600, skillUse: 0.70 },
};

// v2 — movement + utility skills (shared by all heroes; Nyx teleports cheaper).
export const MOVE_STEPS = 150;      // px of walking allowed per turn
export const MOVE_SPEED = 95;       // px/s while walking
export const TELEPORT_RANGE = 420;  // max teleport distance (px)
export const TELEPORT_COST = 30;    // energy (Nyx: 20)
export const TRAP_COST = 35;        // energy
export const TRAP_TURNS = 2;        // trap lasts this many turns unless triggered
export const TRAP_RADIUS = 48;      // reflect trigger radius (px)
export const HEAL_COST = 40;        // energy
export const HEAL_AMOUNT = 25;      // HP restored
export const FULL_POWER = 950;      // aim power that unleashes a Full Power shot
export const ELITE_HP = 150;        // elite final-boss HP
export const ELITE_DMG_MUL = 1.25;  // elite damage multiplier

// Deterministic RNG (mulberry32) for terrain + shots staging.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
