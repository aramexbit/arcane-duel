// ARCANE DUEL — static data: heroes, weapons, skills, arenas.
// All art, names and characters are original. No external assets.
// v3: W/H = SCREEN size (canvas 1280x720); WORLD_W = arena width.
// The camera scrolls across the wider world.
export const W = 1280, H = 720;
export const WORLD_W = 2048;     // v3 — wider map (was 1280, 1.6x wider)
export const GRAVITY = 700;          // px/s^2
export const TURN_TIME = 15;         // v3 — seconds per turn (was 30)
export const MAX_HP = 100;
// v3 — power is now a 0–100 scale (user spec). Initial speed v = power * POWER_VEL.
// Power 100 -> 950 px/s, exactly the old max, so the AI solver and physics
// stay identical under the hood.
export const POWER_VEL = 9.5;
export const FULL_POWER = 100;      // v3 — POW at power 100 (was 950)
// v3.1 P0 (B5) — ONE character hit radius, shared by the live loop, the
// preview simulator and the blast damage test (was 34 in the preview,
// 36 live — a 2px mismatch in the "same physics" claim).
export const CHAR_HIT_R = 36;

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
  // v3 — ENEMY-ONLY monsters (Perjuangan Semut-inspired: beetle, shadow
  // scorpion, wasp). They can never be picked by a player (enemyOnly) —
  // they only appear as campaign opponents. Skills reuse existing
  // mechanics under new names, so no new skill code paths are needed.
  kumbang: {
    id: 'kumbang', name: 'KUMBANG', title: 'Rhino Beetle', element: 'Earth', enemyOnly: true,
    color: '#c75b28', dark: '#7a2a10', light: '#e89a6a',
    desc: 'Armored rhino beetle from the Mist Forest. Slow, heavy, hits like a boulder.',
    hp: 120, muzzle: { x: 106, y: 64 },
    basic: { id: 'horn', name: 'Horn Cannon' },
    skill1: { id: 'crash', name: 'Horn Crash', cost: 40, cd: 2, desc: 'A huge horned boulder with a massive crater.' },
    skill2: { id: 'wall', name: 'Shell Wall', cost: 60, cd: 3, desc: 'Raise a shell wall in front of you.' },
    ult: { id: 'quake', name: 'Beetle Quake', cost: 100, desc: 'The earth itself rises against the foe.' },
  },
  momok: {
    id: 'momok', name: 'MOMOK', title: 'Shadow Scorpion', element: 'Arcane', enemyOnly: true,
    color: '#a06bff', dark: '#5b2ea6', light: '#d9b8ff',
    desc: 'Shadow scorpion of the Mist Forest. Its sting pierces straight through the ground.',
    hp: 90, muzzle: { x: 108, y: 60 },
    basic: { id: 'sting', name: 'Sting Bolt' },
    skill1: { id: 'lunar', name: 'Venom Wave', cost: 40, cd: 2, desc: 'Arcane wave. Marks the ground — fire hitting it triggers a COMBO.' },
    skill2: { id: 'astral', name: 'Sting Rain', cost: 60, cd: 3, desc: 'Five venom bolts fall from the sky.' },
    ult: { id: 'celestial', name: 'Shadow Storm', cost: 100, desc: 'A storm of stings and arcane zones.' },
  },
  tawon: {
    id: 'tawon', name: 'TAWON', title: 'Storm Wasp', element: 'Air', enemyOnly: true,
    color: '#f2c230', dark: '#8a6d10', light: '#ffe08a',
    desc: 'Storm wasp, fast and light. Its darts ride the wind — and fear it.',
    hp: 80, muzzle: { x: 104, y: 58 },
    basic: { id: 'dart', name: 'Sting Dart' },
    skill1: { id: 'meteor', name: 'Fire Sting', cost: 40, cd: 2, desc: 'A blazing sting crashes down. Fire element.' },
    skill2: { id: 'barrage', name: 'Sting Barrage', cost: 60, cd: 3, desc: 'Three stings rain on the foe.' },
    ult: { id: 'dragon', name: 'Swarm Inferno', cost: 100, desc: 'Five stings + a colossal explosion.' },
  },
};

// Weapons: shared inventory. dmg = direct-hit damage, radius = explosion radius.
// kind: 'ball' (ballistic) | 'homing' | 'pierce' (ignores terrain) | 'beam' (no gravity) | 'shield' (buff)
// v3 — per-weapon physics: weight = gravity multiplier (heavy falls faster),
// windRes = wind resistance 0..1 (1 = wind cannot push it at all).
export const WEAPONS = {
  cannon:  { id: 'cannon',  name: 'Standard Cannon', kind: 'ball',   dmg: 28, radius: 55, ammo: Infinity, speed: 1.0, weight: 1.0, windRes: 0.2, desc: 'Reliable standard shot.' },
  triple:  { id: 'triple',  name: 'Triple Shot',     kind: 'triple', dmg: 14, radius: 34, ammo: 3, speed: 1.0, weight: 0.9, windRes: 0.3, desc: 'Three projectiles, spread out.' },
  meteor:  { id: 'meteor',  name: 'Meteor Blast',    kind: 'ball',   dmg: 46, radius: 78, ammo: 2, speed: 1.05, weight: 1.2, windRes: 0.5, elem: 'fire', desc: 'Huge fire explosion.' },
  homing:  { id: 'homing',  name: 'Homing Orb',      kind: 'homing', dmg: 22, radius: 46, ammo: 2, speed: 0.85, weight: 0.8, windRes: 0.4, desc: 'Chases the target.' },
  pierce:  { id: 'pierce',  name: 'Piercing Bolt',   kind: 'pierce', dmg: 30, radius: 30, ammo: 2, speed: 1.35, weight: 0.7, windRes: 0.6, desc: 'Flies through terrain.' },
  cluster: { id: 'cluster', name: 'Explosive Cluster', kind: 'cluster', dmg: 13, radius: 40, ammo: 2, speed: 0.95, weight: 1.0, windRes: 0.3, desc: 'Splits into 5 bomblets.' },
  beam:    { id: 'beam',    name: 'Elemental Beam',  kind: 'beam',   dmg: 34, radius: 28, ammo: 2, speed: 1.6, weight: 0, windRes: 1.0, desc: 'Straight, gravity-free beam.' },
  shield:  { id: 'shield',  name: 'Defensive Shield', kind: 'shield', dmg: 0, radius: 0, ammo: 2, speed: 0, weight: 0, windRes: 1.0, desc: 'Block 40 damage next hit.' },
  // v3 — hero basics + monster weapons (not in the player shop; see below).
  moon:    { id: 'moon',    name: 'Moon Bolt',       kind: 'ball',   dmg: 26, radius: 50, ammo: Infinity, speed: 1.0, weight: 0.9, windRes: 0.3, elem: 'arcane', desc: "Nyx's crescent shot." },
  boulder: { id: 'boulder', name: 'Boulder Shot',    kind: 'boulder', dmg: 32, radius: 60, ammo: Infinity, speed: 0.95, weight: 1.4, windRes: 0.7, elem: 'earth', desc: "Bront's mortar shell." },
  horn:    { id: 'horn',    name: 'Horn Cannon',     kind: 'ball',   dmg: 34, radius: 62, ammo: Infinity, speed: 0.9, weight: 1.5, windRes: 0.8, elem: 'earth', desc: "Kumbang's heavy horn shell." },
  sting:   { id: 'sting',   name: 'Sting Bolt',      kind: 'pierce', dmg: 28, radius: 30, ammo: Infinity, speed: 1.35, weight: 0.8, windRes: 0.5, elem: 'arcane', desc: "Momok's piercing sting." },
  dart:    { id: 'dart',    name: 'Sting Dart',      kind: 'triple', dmg: 12, radius: 32, ammo: Infinity, speed: 1.1, weight: 0.6, windRes: 0.1, desc: "Tawon's light wind-blown darts." },
};
export const WEAPON_ORDER = ['cannon', 'triple', 'meteor', 'homing', 'pierce', 'cluster', 'beam', 'shield'];

// v3 — FULL POWER moves: firing at power 100 unleashes a DIFFERENT special
// per weapon (not the old generic +50%/+30%). `effect` drives _fireWeapon:
// 'blast' = one huge explosion, 'rain' = N projectiles fall on the foe,
// 'swarm' = N extra projectiles from the muzzle, 'quake' = local earthquake.
export const FULL_POWER_MOVES = {
  cannon:  { name: 'Inferno Blast',  effect: 'blast', dmg: 48, radius: 110, elem: 'fire', desc: 'A colossal fireball engulfs the field.' },
  triple:  { name: 'Spread Inferno', effect: 'swarm', count: 5, spread: 8, dmg: 16, radius: 38, desc: 'Five fireballs fan out at once.' },
  meteor:  { name: 'Meteor Storm',   effect: 'rain',  count: 3, dmg: 46, radius: 78, elem: 'fire', desc: 'Three meteors crash down.' },
  homing:  { name: 'Seeker Swarm',   effect: 'swarm', count: 3, spread: 10, dmg: 22, radius: 46, desc: 'Three homing orbs hunt the foe.' },
  pierce:  { name: 'Lance of Light', effect: 'blast', dmg: 52, radius: 55, elem: 'arcane', desc: 'A piercing lance of pure light.' },
  cluster: { name: 'Cluster Storm',  effect: 'rain',  count: 3, dmg: 20, radius: 48, desc: 'Three clusters split into bomblets.' },
  beam:    { name: 'Prism Beam',     effect: 'blast', dmg: 56, radius: 60, elem: 'arcane', desc: 'A blinding prism beam.' },
  moon:    { name: 'Moonfall',       effect: 'rain',  count: 3, dmg: 34, radius: 60, elem: 'arcane', desc: 'Three moons fall from the sky.' },
  boulder: { name: 'Quake Slam',     effect: 'quake', dmg: 55, radius: 110, elem: 'earth', desc: 'The ground itself erupts.' },
  horn:    { name: 'Horn Quake',     effect: 'quake', dmg: 55, radius: 110, elem: 'earth', desc: 'The beetle slams the earth apart.' },
  sting:   { name: 'Venom Lance',    effect: 'blast', dmg: 50, radius: 55, elem: 'arcane', desc: 'A venom lance pierces everything.' },
  dart:    { name: 'Dart Storm',     effect: 'swarm', count: 5, spread: 9, dmg: 14, radius: 36, desc: 'Five stings ride the wind.' },
};

// v3 — weapon shop (credits = Duel Coins, the currency that already exists).
// cannon + triple are free; the rest are bought once, owned forever.
export const SHOP_PRICES = { meteor: 150, homing: 120, pierce: 150, cluster: 180, beam: 200, shield: 100 };
export const FREE_WEAPONS = ['cannon', 'triple'];
export const WIN_CREDITS = { campaign: 100, versus: 50, training: 0, survival: 25, challenge: 50 };

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
  // Android v2 Tahap A — Expert sits above hard, below elite (elite stays
  // boss-only). Aim error is small but NEVER zero: the AI must not be perfect.
  expert: { id: 'expert', name: 'Expert',     aimErr: 0.01, angErr: 0.5, react: 700, skillUse: 0.65 },
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
export const ELITE_HP = 150;        // elite final-boss HP
export const ELITE_DMG_MUL = 1.25;  // elite damage multiplier
// v3 — AI shop ownership by difficulty (which shop weapons the AI may use).
export const AI_SHOP_OWNED = { easy: [], normal: ['homing'], hard: ['homing', 'meteor', 'pierce'], expert: ['homing', 'meteor', 'pierce', 'cluster'], elite: ['homing', 'meteor', 'pierce', 'cluster', 'beam', 'shield'] };

// Android v2 Tahap B — Survival: endless waves, one foe per wave.
// The roster rotates through the 5 non-boss foes; every 5th wave is the
// Elite boss. HP +10/wave, damage +5%/wave, AI difficulty climbs
// easy -> normal -> hard -> expert -> elite (stays elite after wave 5).
export const SURVIVAL_ROSTER = ['kumbang', 'nyx', 'tawon', 'momok', 'bront'];
export const SURVIVAL_DIFFS = ['easy', 'normal', 'hard', 'expert', 'elite'];
export const SURVIVAL_ARENAS = ['valley', 'canyon', 'temple'];
export const SURVIVAL_HP_PER_WAVE = 10;
export const SURVIVAL_DMG_PER_WAVE = 0.05;
export const SURVIVAL_WIN_COINS = 25;

// Android v2 Tahap B — Challenges: fixed duels vs a normal AI with a
// special win condition. 'turns' counts the PLAYER's own turns only.
export const CHALLENGES = {
  oneshot: { id: 'oneshot', name: 'One-Shot', icon: '🎯', desc: 'Defeat the enemy with a single shot. One miss and the challenge is lost.' },
  nomiss: { id: 'nomiss', name: 'No Miss', icon: '💯', desc: 'Win the duel without a single MISS — every shot must hurt someone.' },
  speedrun: { id: 'speedrun', name: 'Speed Run', icon: '⏱️', desc: 'Win within 6 of your own turns. Slow and steady loses this one.' },
};
export const CHALLENGE_ORDER = ['oneshot', 'nomiss', 'speedrun'];
export const SPEEDRUN_MAX_TURNS = 6;

// Android v2 Tahap B — graphics quality: particle caps + weather + shake.
export const QUALITY = {
  low: { name: 'Low', particles: 40, weather: 0, shakeMax: 4 },
  medium: { name: 'Medium', particles: 120, weather: 1, shakeMax: 10 },
  high: { name: 'High', particles: 250, weather: 2, shakeMax: 20 },
};

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
