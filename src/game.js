// ARCANE DUEL — game state machine, combat, skills, ultimates, AI, combos.
import { W, H, GRAVITY, TURN_TIME, MAX_HP, HEROES, WEAPONS, WEAPON_ORDER, ARENAS, ARENA_ORDER, DIFFICULTY, MOVE_STEPS, MOVE_SPEED, TELEPORT_RANGE, TELEPORT_COST, TRAP_COST, TRAP_TURNS, TRAP_RADIUS, HEAL_COST, HEAL_AMOUNT, FULL_POWER, ELITE_HP, ELITE_DMG_MUL, clamp, rng } from './config.js';
import { Terrain, simulateShot, solveShot } from './engine.js';

const SPRITE_W = 120, SPRITE_H = 150;

export class Game {
  constructor(audio) {
    this.audio = audio;
    this.ui = {}; // assigned by main.js: onGameOver, onBattleWon, onTurn
    this.resetMeta();
    this.state = 'menu'; // menu | combat | pause | over
    this.mode = null;    // campaign | versus | training
    this.battle = null;
    this.particles = []; this.floaters = []; this.zones = [];
    this.banner = null; this.shake = 0; this.cine = null;
    this.time = 0;
    this.stats = { turns: 0, damage: [0, 0], combos: 0 };
    // v2: reflect traps, teleport targeting, AI telegraph, walk meter.
    this.traps = []; this.teleportMode = false; this.moveDir = 0;
    this.aiTelegraph = null; this.aiTelegraphSeen = false; this.aiUtils = 0;
    // v2.1: emote bubble above the active hero (visual only).
    this.emoteBubble = null;
    // Facebook-era flavour, original implementation: Duel Coins persist
    // across sessions; crates/barrels drop into the arena every few turns.
    this.crates = [];
    this.battleCoins = 0;
    try { this.coins = parseInt(localStorage.getItem('arcane-duel-coins') || '0', 10) || 0; }
    catch (e) { this.coins = 0; }
  }
  addCoins(n) {
    this.coins += n; this.battleCoins += n;
    try { localStorage.setItem('arcane-duel-coins', String(this.coins)); } catch (e) { /* ignore */ }
  }
  resetMeta() {
    this.terrain = null; this.players = []; this.projectiles = []; this.pending = [];
    this.turn = 0; this.phase = 'aim'; this.phaseT = 0; this.turnTimer = TURN_TIME;
    this.wind = 0; this.aim = { angle: 55, power: 620 }; this.selectedWeapon = 'cannon';
    this.campaignIndex = 0; this.campaignHero = null; this.campaignDiff = null;
    this.trainingTip = 0; this.winner = null; this.crates = []; this.battleCoins = 0;
    this.traps = []; this.teleportMode = false; this.moveDir = 0;
    this.aiTelegraph = null; this.aiUtils = 0;
    this.emoteBubble = null; // v2.1
  }

  // ------------------------------------------------------------ setup
  startBattle(opts) {
    // opts: {mode, arena, p1Hero, p2Hero, p2AI (null|'easy'|'normal'|'hard'|'dummy'), campaignIndex}
    this.resetMeta();
    this.mode = opts.mode; this.state = 'combat';
    this.campaignIndex = opts.campaignIndex ?? 0;
    this.campaignTotal = opts.campaignTotal || 4; // v2.1: VS header counts battles left
    const seed = (opts.seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
    this.terrain = new Terrain(opts.arena, seed);
    this.arenaId = opts.arena;
    this.players = [this._makePlayer(opts.p1Hero, 220, 1, false, 'Player 1'),
      this._makePlayer(opts.p2Hero, 1060, -1, opts.p2AI || false, opts.p2AI ? (opts.p2AI === 'dummy' ? 'Training Dummy' : (opts.elite ? 'Elite Opponent' : 'AI Opponent')) : 'Player 2')];
    this.players[0].y = this.terrain.groundY(220);
    this.players[1].y = this.terrain.groundY(1060);
    // v2 — elite final boss: 150 HP, harder hits, sharper aim (see DIFFICULTY.elite).
    if (opts.elite) {
      const b = this.players[1];
      b.elite = true; b.maxHp = ELITE_HP; b.hp = ELITE_HP;
      this.campaignDiff = 'elite';
    }
    this.wind = this._rollWind(seed);
    this.aim = { angle: 55, power: 620 };
    this.phase = 'aim'; this.phaseT = 0; this.turnTimer = TURN_TIME;
    this.turn = 0; this.players[0].energy = 30; this.players[1].energy = 30;
    this.setBanner(this.mode === 'training' ? 'TRAINING' : `${ARENAS[opts.arena].name.toUpperCase()}`, this._turnText(), 2.2);
    if (opts.elite) this.setBanner('⚔ FINAL ROUND — ELITE ENEMY!', 'Elite Bront: 150 HP, harder hits, sharper aim!', 3.2, '#ff5a4e');
    this.audio.ensure(); this.audio.turn();
    if (this.ui.onTurn) this.ui.onTurn(this.turn);
  }
  _makePlayer(heroId, x, facing, ai, name) {
    const h = HEROES[heroId];
    const ammo = {}; for (const w of WEAPON_ORDER) ammo[w] = WEAPONS[w].ammo;
    return { hero: h, x, y: 0, vy: 0, falling: false, fallStart: 0, hp: MAX_HP, maxHp: MAX_HP, elite: false,
      energy: 30, shield: 0, facing, ai, name, pose: 'idle', poseT: 0, ammo, cds: {}, alive: true,
      moveSteps: MOVE_STEPS };
  }
  _rollWind(seed) {
    const r = rng((seed ^ 0x9e3779b9) >>> 0);
    return Math.round((r() * 10 - 5));
  }
  _turnText() { const p = this.players[this.turn]; return `${p.name} — ${p.hero.name}'s turn`; }

  active() { return this.players[this.turn]; }
  opponent() { return this.players[1 - this.turn]; }

  // ------------------------------------------------------------ v2.1: PASS + emote + remaining counter
  // PASS (Perjuangan Semut reference): skip the turn without shooting.
  // Ends the turn immediately; the rival plays next.
  passTurn() {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    const p = this.active();
    this.teleportMode = false;
    this.setBanner('⏭ PASS', `${p.name} skips the turn`, 1.4, '#bfe9ff');
    this.audio.click();
    this.nextTurn();
    return true;
  }
  // Emote: a fun bubble above the active hero (visual only — costs nothing,
  // spends no energy, does NOT end the turn).
  emote() {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    const EMOTES = ['😤', '😂', '💪'];
    const emoji = EMOTES[Math.floor(Math.random() * EMOTES.length)];
    this.emoteBubble = { player: this.turn, emoji, t: 0, dur: 2.5 };
    this.audio.emote();
    return true;
  }
  // VS header counter: campaign = battles left (incl. current), versus = 1 rival.
  remainingLabel() {
    if (this.mode === 'campaign') return `Musuh tersisa: ${Math.max(0, (this.campaignTotal || 4) - this.campaignIndex)}`;
    if (this.mode === 'training') return '🎯 Latihan — dummy';
    return '⚔ Duel 1 lawan 1';
  }

  // ------------------------------------------------------------ aiming / firing
  setAim(angle, power) {
    // clamp(NaN) is NaN — a poisoned aim used to kill the game loop (Nov 2026).
    if (Number.isFinite(angle)) this.aim.angle = clamp(angle, 8, 172);
    if (Number.isFinite(power)) this.aim.power = clamp(power, 150, 950);
  }
  nudgeAim(dAngle, dPower) { this.setAim(this.aim.angle + dAngle, this.aim.power + dPower); }
  // v2 — walk left/right (A/D hold). Limited steps per turn, Worms-style.
  // Called every frame by input.js while a move key is held, and by the AI.
  moveStep(dir, dt) {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    const p = this.active();
    if (!p.alive || p.falling) return false;
    if (p.moveSteps <= 0) return false;
    const step = MOVE_SPEED * dt;
    const nx = clamp(p.x + dir * step, 40, W - 40);
    const moved = Math.abs(nx - p.x);
    if (moved < 0.01) return false;
    p.x = nx; p.facing = dir; p.moveSteps = Math.max(0, p.moveSteps - moved);
    p.y = this.terrain.groundY(p.x);
    return true;
  }
  aimFromMouse(mx, my) {
    const p = this.active(), m = this._muzzle(p);
    const dx = (mx - m.x) * p.facing, dy = -(my - m.y);
    if (Math.hypot(dx, dy) < 20) return;
    const ang = clamp(Math.atan2(dy, Math.max(1, dx)) * 180 / Math.PI, 8, 172);
    const pw = clamp(150 + Math.hypot(mx - m.x, my - m.y) * 0.9, 150, 950);
    this.setAim(ang, pw);
  }
  _muzzle(p) {
    const mz = p.hero.muzzle;
    return { x: p.x + (p.facing === 1 ? mz.x - 60 : 60 - mz.x), y: p.y - 140 + mz.y };
  }
  worldAngle() { const p = this.active(); return p.facing === 1 ? this.aim.angle : 180 - this.aim.angle; }
  selectWeapon(id) {
    const p = this.active();
    if (this.phase !== 'aim' || !p.ammo[id] && p.ammo[id] !== Infinity) return false;
    if (p.ammo[id] <= 0) return false;
    this.selectedWeapon = id; this.audio.click(); return true;
  }
  cycleWeapon(dir) {
    const p = this.active();
    let i = WEAPON_ORDER.indexOf(this.selectedWeapon);
    for (let k = 0; k < WEAPON_ORDER.length; k++) {
      i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      const id = WEAPON_ORDER[i];
      if (p.ammo[id] > 0) { this.selectedWeapon = id; return; }
    }
  }
  fire() {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    const p = this.active();
    if (p.ai) return false;
    this.teleportMode = false;
    return this._fireWeapon(this.selectedWeapon);
  }
  _fireWeapon(weaponId, skillDef = null) {
    const p = this.active();
    const w = WEAPONS[weaponId];
    if (!w) return false;
    if (w.kind === 'shield') {
      if (p.ammo.shield <= 0) return false;
      p.ammo.shield--; p.shield = 40;
      this.setBanner('SHIELD UP', `${p.hero.name} blocks 40 damage`, 1.6);
      this.audio.skill(); this._endShot(p);
      return true;
    }
    if (p.ammo[weaponId] !== Infinity) { if (p.ammo[weaponId] <= 0) return false; p.ammo[weaponId]--; }
    const m = this._muzzle(p);
    const ang = this.worldAngle(), pw = this.aim.power * w.speed;
    p.pose = 'fire'; p.poseT = 0.4;
    // v2 — FULL POWER: firing at max power (950) unleashes a bigger, golden
    // shot: +50% damage, +30% blast radius. (Energy still gates ultimates.)
    const full = this.aim.power >= FULL_POWER;
    if (full) {
      this.setBanner('💥 FULL POWER!', `${p.hero.name} fires at maximum power!`, 1.6, '#ffd76a');
      this.audio.fullpower();
    } else this.audio.shoot();
    this._spawnProjectile({ x: m.x, y: m.y, angle: ang, power: pw, kind: w.kind, weapon: weaponId, owner: this.turn, elem: w.elem || null, trail: [], fullPower: full });
    if (w.kind === 'triple') {
      this._spawnProjectile({ x: m.x, y: m.y, angle: ang - 6, power: pw, kind: 'ball', weapon: weaponId, owner: this.turn, elem: null, trail: [], fullPower: full });
      this._spawnProjectile({ x: m.x, y: m.y, angle: ang + 6, power: pw, kind: 'ball', weapon: weaponId, owner: this.turn, elem: null, trail: [], fullPower: full });
    }
    this.phase = 'flying'; this.phaseT = 0;
    return true;
  }
  _spawnProjectile(pr) {
    // A non-finite angle/power poisons velocity and used to kill the loop.
    if (!Number.isFinite(pr.angle)) pr.angle = 55;
    if (!Number.isFinite(pr.power)) pr.power = 600;
    const rad = pr.angle * Math.PI / 180;
    pr.vx = Math.cos(rad) * pr.power; pr.vy = -Math.sin(rad) * pr.power;
    pr.t = 0; pr.dead = false; pr.subSpawned = false; pr.lastX = pr.x; pr.lastY = pr.y;
    this.projectiles.push(pr);
  }

  // ------------------------------------------------------------ v2 utility skills
  // Teleport / Trap / Heal are shared utilities: they cost energy + cooldown
  // but do NOT end the turn, so the hero can still shoot afterwards.
  teleportCost(p) { return p.hero.id === 'nyx' ? 20 : TELEPORT_COST; } // Nyx: signature teleport, cheaper
  utilityReady(p, kind) {
    const cost = kind === 'teleport' ? this.teleportCost(p) : kind === 'trap' ? TRAP_COST : HEAL_COST;
    if (p.energy < cost) return false;
    if ((p.cds[kind] || 0) > 0) return false;
    if (kind === 'heal' && p.hp >= p.maxHp) return false;
    if (kind === 'trap' && this.traps.some(t => t.owner === this.turn)) return false;
    return true;
  }
  useTeleport() {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    const p = this.active();
    if (!this.utilityReady(p, 'teleport')) { this.setBanner('NOT READY', `Teleport needs ${this.teleportCost(p)} energy`, 1.4); return false; }
    this.teleportMode = true;
    this.setBanner('✨ TELEPORT', `Click a spot within ${TELEPORT_RANGE}px — Esc to cancel`, 2.5, '#c9a7ff');
    this.audio.click();
    return true;
  }
  cancelTeleport() { this.teleportMode = false; }
  doTeleport(x, y) {
    if (!this.teleportMode) return false;
    const p = this.active();
    if (!this.utilityReady(p, 'teleport')) { this.teleportMode = false; return false; }
    const cx = clamp(x, 40, W - 40);
    if (Math.abs(cx - p.x) > TELEPORT_RANGE) { this.setBanner('TOO FAR!', `Teleport range is ${TELEPORT_RANGE}px`, 1.4); return false; }
    const gy = this.terrain.groundY(cx);
    this._burst(p.x, p.y - 60, '#a06bff', 18);
    p.energy -= this.teleportCost(p); p.cds.teleport = 3;
    p.x = cx; p.y = gy; p.falling = false; p.vy = 0;
    this._burst(p.x, p.y - 60, '#c9a7ff', 22);
    this._floater(p.x, p.y - 140, '✨ TELEPORT!', '#c9a7ff');
    this.teleportMode = false;
    this.audio.teleport();
    return true;
  }
  placeTrap() {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    const p = this.active();
    if (!this.utilityReady(p, 'trap')) { this.setBanner('NOT READY', 'Trap needs 35 energy — or one is already set', 1.4); return false; }
    const tx = clamp(p.x + p.facing * 120, 60, W - 60);
    this.traps.push({ x: tx, y: this.terrain.groundY(tx), owner: this.turn, turnsLeft: TRAP_TURNS });
    p.energy -= TRAP_COST; p.cds.trap = 3;
    this._burst(tx, this.terrain.groundY(tx) - 40, '#50dcf0', 14);
    this.setBanner('🪞 REFLECT TRAP SET!', 'Enemy shots hitting it bounce back at them!', 1.8, '#50dcf0');
    this.audio.skill();
    return true;
  }
  useHeal() {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    const p = this.active();
    if (!this.utilityReady(p, 'heal')) { this.setBanner('NOT READY', p.hp >= p.maxHp ? 'Already at full HP!' : 'Heal needs 40 energy', 1.4); return false; }
    p.energy -= HEAL_COST; p.cds.heal = 3;
    p.hp = Math.min(p.maxHp, p.hp + HEAL_AMOUNT);
    this._burst(p.x, p.y - 70, '#58d158', 20);
    this._floater(p.x, p.y - 140, `+${HEAL_AMOUNT} HP`, '#58d158');
    this.setBanner('💚 HEALED!', `${p.hero.name} recovers ${HEAL_AMOUNT} HP`, 1.5, '#58d158');
    this.audio.heal();
    return true;
  }

  // ------------------------------------------------------------ skills
  skillAvailable(p, slot) {
    const def = slot === 1 ? p.hero.skill1 : slot === 2 ? p.hero.skill2 : p.hero.ult;
    if (p.energy < def.cost) return false;
    if (slot === 3) return p.energy >= 100;
    if ((p.cds[def.id] || 0) > 0) return false;
    return true;
  }
  useSkill(slot) {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    this.teleportMode = false;
    const p = this.active();
    if (!this.skillAvailable(p, slot)) { this.setBanner('NOT READY', slot === 3 ? 'Ultimate needs FULL energy!' : 'Not enough energy or cooling down', 1.4); return false; }
    const def = slot === 1 ? p.hero.skill1 : slot === 2 ? p.hero.skill2 : p.hero.ult;
    p.energy -= def.cost; p.cds[def.id] = def.cd || 0;
    p.pose = 'fire'; p.poseT = 0.5;
    const foe = this.opponent();
    const m = this._muzzle(p);
    if (slot === 3) return this._ultimate(p, def, foe, m);
    this.audio.skill();
    if (def.id === 'meteor') {
      this.pending.push({ delay: 0.1, kind: 'meteor', x: foe.x + 40, y: 60, owner: this.turn });
      this.phase = 'flying'; this.phaseT = 0;
    } else if (def.id === 'barrage') {
      for (let i = 0; i < 3; i++) this.pending.push({ delay: 0.15 + i * 0.22, kind: 'fireball', x: foe.x - 60 + i * 60, y: 40, owner: this.turn });
      this.phase = 'flying'; this.phaseT = 0;
    } else if (def.id === 'lunar') {
      this._spawnProjectile({ x: m.x, y: m.y, angle: this.worldAngle(), power: this.aim.power, kind: 'arcane', weapon: 'lunar', owner: this.turn, elem: 'arcane', trail: [] });
      this.phase = 'flying'; this.phaseT = 0;
    } else if (def.id === 'astral') {
      for (let i = 0; i < 5; i++) this.pending.push({ delay: 0.1 + i * 0.18, kind: 'starbolt', x: foe.x - 120 + i * 60, y: 30, owner: this.turn });
      this.phase = 'flying'; this.phaseT = 0;
    } else if (def.id === 'crash') {
      this._spawnProjectile({ x: m.x, y: m.y, angle: this.worldAngle(), power: this.aim.power * 1.1, kind: 'boulder', weapon: 'crash', owner: this.turn, elem: 'earth', trail: [] });
      this.phase = 'flying'; this.phaseT = 0;
    } else if (def.id === 'wall') {
      const wx = p.x + p.facing * 130;
      this.terrain.raiseWall(wx, 46, 110);
      this._burst(wx, this.terrain.groundY(wx) - 40, '#8a7a5e', 16);
      this.setBanner('STONE WALL', `${p.hero.name} raises the earth!`, 1.6);
      this._endShot(p);
    }
    return true;
  }
  _ultimate(p, def, foe, m) {
    this.audio.ultimate();
    this.setBanner(def.name.toUpperCase() + '!', `${p.hero.name}'s ultimate attack`, 3.5, '#ffd76a');
    this.shake = 14;
    this.cine = { kind: def.id, t: 0, dur: 2.4, owner: this.turn, foeX: foe.x, foeY: foe.y };
    this.phase = 'cinematic'; this.phaseT = 0;
    return true;
  }
  _cineSpawn(kind) {
    const foe = this.opponent();
    if (kind === 'dragon') {
      for (let i = 0; i < 5; i++) this.pending.push({ delay: 0.25 + i * 0.22, kind: 'meteor', x: foe.x - 120 + i * 60, y: 30, owner: this.turn });
      this.pending.push({ delay: 1.5, kind: 'bigbomb', x: foe.x, y: 60, owner: this.turn });
    } else if (kind === 'celestial') {
      for (let i = 0; i < 8; i++) this.pending.push({ delay: 0.15 + i * 0.15, kind: 'starbolt', x: foe.x - 160 + i * 46, y: 20, owner: this.turn });
      this.pending.push({ delay: 1.4, kind: 'arcane', x: foe.x, y: 60, owner: this.turn, arcaneBig: true });
    } else if (kind === 'quake') {
      const fx = foe.x;
      this.terrain.crater(fx, this.terrain.groundY(fx), 110);
      this._burst(fx, this.terrain.groundY(fx) - 30, '#8a7a5e', 30);
      this.shake = 18;
      this._damagePlayer(1 - this.turn, 55, fx, this.terrain.groundY(fx) - 60, 'earth');
      for (let i = 0; i < 3; i++) this.pending.push({ delay: 0.2 + i * 0.25, kind: 'boulder', x: foe.x - 90 + i * 90, y: 40, owner: this.turn });
    }
  }

  // ------------------------------------------------------------ turn flow
  _endShot(p) {
    this.phase = 'resolving'; this.phaseT = 0;
  }
  nextTurn() {
    if (this.state !== 'combat') return;
    const loser = this.players.find(p => !p.alive);
    if (loser) { this._gameOver(1 - this.players.indexOf(loser)); return; }
    this.turn = 1 - this.turn;
    const p = this.active();
    p.energy = clamp(p.energy + 25, 0, 100);
    p.moveSteps = MOVE_STEPS; // v2: walking refills every turn
    this.teleportMode = false; this.moveDir = 0;
    this.aiTelegraph = null; this.aiUtils = 0;
    for (const k of Object.keys(p.cds)) if (p.cds[k] > 0) p.cds[k]--;
    // v2: traps age one turn each round.
    for (const t of this.traps) t.turnsLeft--;
    this.traps = this.traps.filter(t => t.turnsLeft > 0);
    this.wind = this._rollWind((Math.random() * 1e9) >>> 0);
    // Occasional wind gust: a dramatic, telegraphed weather swing.
    if (Math.random() < 0.12) {
      this.wind = (this.wind >= 0 ? 1 : -1) * (7 + Math.floor(Math.random() * 3));
      this.setBanner('💨 GUST!', `The wind howls at strength ${Math.abs(this.wind)}!`, 1.6, '#7ec8f7');
    }
    this.turnTimer = TURN_TIME;
    this.aim = { angle: 55, power: 620 };
    this.selectedWeapon = p.hero.basic.id === 'cannon' ? 'cannon' : 'cannon';
    this.phase = 'aim'; this.phaseT = 0;
    this.stats.turns++;
    // Supply drop every 3rd turn: a crate (bonus ammo) or a barrel (explosive).
    if (this.stats.turns % 3 === 0 && this.crates.length < 2 && this.mode !== 'training') {
      const kind = Math.random() < 0.55 ? 'crate' : 'barrel';
      const cx = 320 + Math.random() * 640;
      this.crates.push({ x: cx, y: -30, vy: 0, kind, landed: false });
      this.setBanner(kind === 'crate' ? '📦 SUPPLY DROP!' : '💥 DANGER BARREL!', kind === 'crate' ? 'Shoot it open for bonus ammo!' : 'It explodes when hit!', 1.8, '#ffd76a');
    }
    // Arcane zones age.
    for (const z of this.zones) z.turns--;
    this.zones = this.zones.filter(z => z.turns > 0);
    if (this.mode === 'training' && this.turn === 1) {
      // Dummy never shoots: hand the turn straight back with a tip.
      this.trainingTip = (this.trainingTip + 1) % 6;
      this.setBanner('TRAINING', this._trainingTipText(), 2.4);
      this.turn = 0; this.players[0].energy = clamp(this.players[0].energy + 25, 0, 100);
      this.phase = 'aim'; this.phaseT = 0; this.turnTimer = TURN_TIME;
    }
    if (this.ui.onTurn) this.ui.onTurn(this.turn);
    this.audio.turn();
  }
  _trainingTipText() {
    return ['Move the mouse to aim — the dotted line shows the flight path.',
      'Arrow keys fine-tune angle and power. SPACE fires.',
      'Wind pushes every projectile — check the compass before you shoot!',
      'Q / E switch weapons. Number keys 1 / 2 / 3 use skills.',
      'Skills need energy. The ultimate only works at FULL energy.',
      'Fire hitting a purple arcane zone triggers an ELEMENTAL COMBO!',
      'Hold A / D to walk — 150 steps per turn. Reposition before you shoot!',
      'T teleports, R sets a reflect trap, H heals. Fire at POWER 950 for a FULL POWER shot!'][this.trainingTip];
  }

  // ------------------------------------------------------------ damage / explosion
  _damagePlayer(idx, amount, x, y, elem) {
    const p = this.players[idx];
    if (!p.alive) return 0;
    let dmg = Math.round(amount);
    const crit = Math.random() < 0.1;
    if (crit) dmg = Math.round(dmg * 1.5);
    // v2: elite final boss hits 25% harder.
    const attacker = this.players[this.turn];
    if (attacker && attacker.elite && idx !== this.turn) dmg = Math.round(dmg * ELITE_DMG_MUL);
    if (p.shield > 0) { const blocked = Math.min(p.shield, dmg); p.shield -= blocked; dmg -= blocked; this._floater(p.x, p.y - 120, `-${blocked} SHIELD`, '#7ec8f7'); }
    if (dmg <= 0) { this._floater(p.x, p.y - 120, 'BLOCKED!', '#7ec8f7'); return 0; }
    p.hp = Math.max(0, p.hp - dmg);
    p.pose = 'hit'; p.poseT = 0.55;
    // v2.1: floating damage number — bigger + gold on crit.
    this._floater(p.x, p.y - 130, `-${dmg}${crit ? ' CRIT!' : ''}`, crit ? '#ffd76a' : '#ff6a5e', crit ? 26 : 20);
    this.stats.damage[this.turn] += dmg;
    // Duel Coins: the attacker earns coins for damage dealt.
    if (idx !== this.turn) this.addCoins(Math.max(1, Math.floor(dmg / 5)));
    if (attacker && idx !== this.turn) attacker.energy = clamp(attacker.energy + 8, 0, 100);
    if (p.hp <= 0) { p.alive = false; p.pose = 'defeat'; }
    this.audio.hit();
    return dmg;
  }
  explode(x, y, def, ownerIdx, opts = {}) {
    // def: {dmg, radius, elem}
    const R = def.radius;
    this.audio.explosion(R > 70 ? 1.6 : 1);
    this.shake = Math.max(this.shake, R > 70 ? 12 : 7);
    this._burst(x, y, def.elem === 'fire' ? '#ff8c2f' : def.elem === 'arcane' ? '#a06bff' : def.elem === 'earth' ? '#8a7a5e' : '#ffb347', Math.round(R / 2.4));
    this._burst(x, y, '#3a3a3a', Math.round(R / 3), true);
    // Terrain crater (not for beam).
    if (!opts.noCrater) this.terrain.crater(x, y, R * 0.85);
    // Supply crates / barrels caught in the blast.
    for (const c of [...this.crates]) {
      if (Math.hypot(c.x - x, (c.y) - y) < R + 34) {
        this.crates.splice(this.crates.indexOf(c), 1);
        if (c.kind === 'crate') {
          const pool = ['triple', 'meteor', 'homing', 'pierce', 'cluster', 'beam', 'shield'].filter(id => WEAPONS[id].ammo !== Infinity);
          const pick = pool[Math.floor(Math.random() * pool.length)];
          const owner = this.players[ownerIdx];
          if (owner) { owner.ammo[pick] = (owner.ammo[pick] || 0) + 1; }
          this._floater(c.x, c.y - 30, `+1 ${WEAPONS[pick].name}!`, '#ffd76a');
          this._burst(c.x, c.y - 10, '#ffd76a', 14);
          this.addCoins(10);
        } else {
          this._burst(c.x, c.y - 10, '#ff5a1a', 20);
          this.explode(c.x, c.y - 10, { dmg: 25, radius: 62, elem: 'fire' }, ownerIdx, { noCrater: false });
        }
      }
    }
    // Elemental combo: fire blast inside an arcane zone.
    let combo = false;
    if (def.elem === 'fire') {
      for (const z of this.zones) {
        if (Math.hypot(x - z.x, y - z.y) < z.r + 50) {
          combo = true;
          this.zones.splice(this.zones.indexOf(z), 1);
          this.setBanner('ELEMENTAL COMBO!', 'Fire + Arcane = massive blast!', 1.8, '#ff9df5');
          this.stats.combos++;
          this.addCoins(25);
          this._burst(z.x, z.y - 20, '#ff9df5', 26);
          this._damagePlayer(1 - ownerIdx, Math.round(def.dmg * 0.5), z.x, z.y - 40, 'combo');
          this.terrain.crater(z.x, z.y, R * 0.7);
          break;
        }
      }
    }
    // Arcane blasts mark the ground.
    if (def.elem === 'arcane') {
      this.zones.push({ x, y: this.terrain.groundY(x), r: R + 26, turns: 2 });
    }
    // Damage both heroes with falloff.
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      if (!p.alive) continue;
      const d = Math.hypot(p.x - x, (p.y - 40) - y);
      if (d < R * 1.5) {
        const fall = 1 - (d / (R * 1.5)) * 0.75;
        this._damagePlayer(i, def.dmg * fall, x, y, def.elem);
      }
    }
    // Falling heroes: if their ground dropped away, they drop.
    for (const p of this.players) {
      if (!p.alive) continue;
      const gy = this.terrain.groundY(p.x);
      if (gy > p.y + 6) { p.falling = true; p.fallStart = p.y; p.vy = 0; }
    }
    void combo;
  }
  _burst(x, y, color, n, smoke = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * (smoke ? 60 : 260);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (smoke ? 40 : 80),
        life: 0, max: 0.5 + Math.random() * (smoke ? 0.9 : 0.5), color, size: smoke ? 8 + Math.random() * 10 : 3 + Math.random() * 6,
        grav: smoke ? -30 : 320, kind: smoke ? 'smoke' : 'circle' });
    }
  }
  _floater(x, y, text, color, size = 20) { this.floaters.push({ x, y, text, color, size, t: 0, dur: 1.1 }); }
  setBanner(text, sub, dur = 2, color = '#ffd76a') { this.banner = { text, sub, t: 0, dur, color }; }

  // ------------------------------------------------------------ AI
  // v2: the AI telegraphs its shot — it picks a plan, shows its aim line +
  // muzzle flash for ~1s (so the enemy shot is visible coming), then fires.
  // Plans: 'shoot' | 'skill1' | 'ult' | 'heal' | 'trap' | 'teleport' | 'move'.
  _planAi() {
    const p = this.active(), foe = this.opponent();
    const diff = DIFFICULTY[this.campaignDiff || 'normal'];
    if (p.energy >= 100 && Math.random() < 0.6) return { kind: 'ult' };
    if (this.aiUtils < 2) {
      if (p.hp <= 45 && p.energy >= HEAL_COST && Math.random() < 0.5) return { kind: 'heal' };
      if (p.energy >= TRAP_COST && !this.traps.some(t => t.owner === this.turn) && Math.random() < 0.25) return { kind: 'trap' };
      if (p.energy >= this.teleportCost(p) && (p.x < 140 || p.x > 1140) && Math.random() < 0.45) {
        return { kind: 'teleport', x: 350 + Math.random() * 580 };
      }
      // Reposition: walk toward the centre when hugging an edge.
      if ((p.x < 160 || p.x > 1120) && Math.random() < 0.5) {
        return { kind: 'move', dx: p.x < 640 ? 80 : -80 };
      }
    }
    if (p.energy >= 40 && Math.random() < diff.skillUse) return { kind: 'skill1' };
    if (p.hp < 35 && p.ammo.shield > 0 && Math.random() < 0.5) return { kind: 'shield' };
    // v2.1 — rare PASS: the AI occasionally skips a hopeless turn instead of
    // wasting a shot (kept rare — 4% — so it never looks passive).
    if (Math.random() < 0.04) return { kind: 'pass' };
    return { kind: 'shoot' };
  }
  _execAiPlan(plan) {
    const p = this.active(), foe = this.opponent();
    const diff = DIFFICULTY[this.campaignDiff || 'normal'];
    if (plan.kind === 'pass') { this.passTurn(); return; } // v2.1
    if (plan.kind === 'ult') { this.useSkill(3); return; }
    if (plan.kind === 'skill1') { if (this.useSkill(1)) return; }
    if (plan.kind === 'shield') { this._fireWeapon('shield'); return; }
    if (plan.kind === 'heal') { if (this.useHeal()) { this.aiUtils++; this.aiTelegraph = null; return; } }
    if (plan.kind === 'trap') { if (this.placeTrap()) { this.aiUtils++; this.aiTelegraph = null; return; } }
    if (plan.kind === 'teleport') {
      if (this.useTeleport()) {
        const tx = clamp(plan.x, p.x - TELEPORT_RANGE + 20, p.x + TELEPORT_RANGE - 20);
        if (!this.doTeleport(tx, 0)) this.cancelTeleport();
        this.aiUtils++; this.aiTelegraph = null; return;
      }
    }
    if (plan.kind === 'move') {
      // Slide toward a better spot (consumes walk steps, then re-plans).
      const dir = plan.dx > 0 ? 1 : -1;
      let left = Math.abs(plan.dx);
      while (left > 0 && p.moveSteps > 0) { const moved = this.moveStep(dir, 0.5); if (!moved) break; left -= MOVE_SPEED * 0.5; }
      this.aiUtils++; this.aiTelegraph = null; return;
    }
    // Shoot: pick a weapon, solve the ballistic, fire.
    let wid = 'cannon';
    const specials = ['meteor', 'homing', 'cluster', 'triple'].filter(id => p.ammo[id] > 0);
    if (specials.length && Math.random() < 0.3) wid = specials[Math.floor(Math.random() * specials.length)];
    this.selectedWeapon = wid;
    // Reuse the aim solved during the telegraph (what the player saw).
    const sol = plan.aim || solveShot({ x: p.x, y: p.y }, { x: foe.x, y: foe.y }, this.wind * 10, this.terrain, diff);
    this.setAim(sol.angle, sol.power);
    this._fireWeapon(wid);
  }

  // ------------------------------------------------------------ game over
  _gameOver(winnerIdx) {
    this.phase = 'over'; this.winner = winnerIdx;
    this.banner = null; // clear any arena/turn banner behind the result screen
    this.players[winnerIdx].pose = 'victory';
    this.players[1 - winnerIdx].pose = 'defeat';
    const won = this.mode === 'versus' ? true : winnerIdx === 0;
    if (won) this.audio.victory(); else this.audio.defeat();
    if (winnerIdx === 0) this.addCoins(50); // victory bonus for the human side
    this.state = 'over';
    if (this.ui.onGameOver) this.ui.onGameOver({
      winnerIdx, won, mode: this.mode,
      campaignIndex: this.campaignIndex,
      stats: { turns: this.stats.turns, damage: [...this.stats.damage], combos: this.stats.combos },
      winnerName: this.players[winnerIdx].name,
      winnerHero: this.players[winnerIdx].hero,
    });
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    // v2.1: emote bubble lifetime.
    if (this.emoteBubble) { this.emoteBubble.t += dt; if (this.emoteBubble.t > this.emoteBubble.dur) this.emoteBubble = null; }
    this.shake = Math.max(0, this.shake - dt * 26);
    for (const pt of this.particles) { pt.life += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += pt.grav * dt; }
    this.particles = this.particles.filter(p => p.life < p.max);
    for (const f of this.floaters) { f.t += dt; f.y -= 34 * dt; }
    this.floaters = this.floaters.filter(f => f.t < f.dur);
    for (const p of this.players) { if (p.poseT > 0) { p.poseT -= dt; if (p.poseT <= 0 && p.alive) p.pose = this.phase === 'aim' && this.players[this.turn] === p ? 'aim' : 'idle'; } }
    if (this.state !== 'combat') return;
    // Falling heroes.
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.falling) {
        p.vy += GRAVITY * dt; p.y += p.vy * dt;
        const gy = this.terrain.groundY(p.x);
        if (p.y >= gy) {
          const drop = p.y - p.fallStart;
          p.y = gy; p.falling = false; p.vy = 0;
          if (drop > 130) this._damagePlayer(this.players.indexOf(p), 10, p.x, p.y - 40, 'fall');
        }
      }
    }
    // Falling supply crates / barrels.
    for (const c of this.crates) {
      if (c.landed) continue;
      c.vy += GRAVITY * 0.6 * dt; c.y += c.vy * dt;
      const gy = this.terrain.groundY(c.x);
      if (c.y >= gy - 24) { c.y = gy - 24; c.landed = true; this._burst(c.x, gy - 20, '#caa96a', 8); }
    }
    if (this.phase === 'aim') {
      this.turnTimer -= dt;
      if (this.turnTimer <= 0) { this.setBanner('TIME UP!', `${this.active().name} loses the turn`, 1.4); this.nextTurn(); return; }
      const p = this.active();
      // v2 — walking: held A/D moves the active hero (input.js sets moveDir).
      if (this.moveDir !== 0 && !p.ai) this.moveStep(this.moveDir, dt);
      if (p.ai && p.ai !== 'dummy') {
        const diff = DIFFICULTY[this.campaignDiff || 'normal'];
        if (!this.aiTelegraph) {
          // v2 telegraph: plan the shot, show the aim line + muzzle flash
          // for ~1s so the enemy shot is clearly visible coming.
          this.phaseT += dt;
          if (this.phaseT * 1000 > diff.react) {
            const plan = this._planAi();
            this.aiTelegraph = { t: 0, plan };
            this.aiTelegraphSeen = true;
            if (plan.kind === 'shoot' || plan.kind === 'skill1' || plan.kind === 'ult') {
              const sol = plan.kind === 'shoot'
                ? solveShot({ x: p.x, y: p.y }, { x: this.opponent().x, y: this.opponent().y }, this.wind * 10, this.terrain, diff)
                : null;
              if (sol) { plan.aim = sol; this.setAim(sol.angle, sol.power); }
              const m = this._muzzle(p);
              this._burst(m.x, m.y, '#ffd76a', 10);
              this.setBanner('⚠ ENEMY AIMING…', `${p.hero.name} is lining up a shot!`, 1.1, '#ff9d5e');
            }
          }
        } else {
          this.aiTelegraph.t += dt;
          if (this.aiTelegraph.t > 1.0) {
            const plan = this.aiTelegraph.plan;
            this.aiTelegraph = null; this.phaseT = 0;
            this._execAiPlan(plan);
          }
        }
      }
    } else if (this.phase === 'cinematic') {
      this.phaseT += dt;
      // Pending ultimate projectiles tick down during the cinematic so the
      // meteor rain starts the instant the camera releases.
      for (const pd of this.pending) pd.delay -= dt;
      if (this.cine) {
        this.cine.t += dt;
        if (!this.cine.spawned && this.cine.t > 0.55) { this.cine.spawned = true; this._cineSpawn(this.cine.kind); }
        if (this.cine.t > this.cine.dur) {
          this.cine = null;
          this.phase = this.projectiles.length || this.pending.length ? 'flying' : 'resolving';
          this.phaseT = 0;
        }
      }
    } else if (this.phase === 'flying' || this.phase === 'resolving') {
      // Spawn pending projectiles (multi-shot skills / ultimates).
      for (const pd of this.pending) pd.delay -= dt;
      const ready = this.pending.filter(pd => pd.delay <= 0);
      this.pending = this.pending.filter(pd => pd.delay > 0);
      for (const pd of ready) this._spawnPending(pd);
      // Move projectiles.
      const windAcc = this.wind * 10 * 1.2;
      for (const pr of this.projectiles) {
        if (pr.dead) continue;
        pr.t += dt;
        // Hard lifetime cap: no projectile may stall the turn forever
        // (e.g. a homing orb circling its target). It bursts in place.
        if (pr.t > 5) { this._resolveHit(pr, null, 'timeout'); continue; }
        const step = dt;
        pr.vx += windAcc * step;
        if (pr.kind === 'homing') {
          const foe = this.players[1 - pr.owner];
          const tx = foe.x - pr.x, ty = (foe.y - 40) - pr.y, d = Math.hypot(tx, ty) || 1;
          const sp = Math.hypot(pr.vx, pr.vy) || 1, turn = 2.4 * step;
          pr.vx += ((tx / d) * sp - pr.vx) * turn;
          pr.vy += ((ty / d) * sp - pr.vy) * turn;
        }
        if (pr.kind !== 'beam') pr.vy += GRAVITY * step;
        pr.x += pr.vx * step; pr.y += pr.vy * step;
        pr.trail.push([pr.x, pr.y]); if (pr.trail.length > 18) pr.trail.shift();
        // Trail sparkles.
        if (Math.random() < 0.5) this.particles.push({ x: pr.x, y: pr.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0, max: 0.35, color: pr.kind === 'arcane' ? '#c9a7ff' : '#ffb347', size: 2.5, grav: 0, kind: 'circle' });
        // v2 — reflect trap: an enemy projectile entering the field bounces
        // back at its shooter (trap is consumed, projectile changes owner).
        if (!pr.reflected) {
          for (const trap of [...this.traps]) {
            if (trap.owner === pr.owner) continue;
            const dx = pr.x - trap.x, dy = pr.y - (trap.y - 40);
            if (dx * dx + dy * dy < TRAP_RADIUS * TRAP_RADIUS) {
              this.traps.splice(this.traps.indexOf(trap), 1);
              this.reflectedCount = (this.reflectedCount || 0) + 1;
              const shooter = this.players[pr.owner];
              const tx = shooter.x - pr.x, ty = (shooter.y - 40) - pr.y, d = Math.hypot(tx, ty) || 1;
              const sp = Math.max(420, Math.hypot(pr.vx, pr.vy));
              pr.vx = (tx / d) * sp; pr.vy = (ty / d) * sp;
              pr.owner = trap.owner; pr.reflected = true;
              this._burst(trap.x, trap.y - 40, '#50dcf0', 22);
              this.setBanner('🪞 REFLECTED!', 'The trap bounces the shot back!', 1.6, '#50dcf0');
              this.audio.reflect();
              break;
            }
          }
        }
        // Character hit?
        const foe = this.players[1 - pr.owner];
        const own = this.players[pr.owner];
        for (const tgt of [foe, own]) {
          if (!tgt.alive) continue;
          const dx = pr.x - tgt.x, dy = pr.y - (tgt.y - 40);
          if (dx * dx + dy * dy < 36 * 36) { this._resolveHit(pr, tgt, 'char'); break; }
        }
        if (pr.dead) continue;
        if (pr.x < -60 || pr.x > W + 60 || pr.y > H + 60) { pr.dead = true; continue; }
        if (pr.kind === 'pierce') {
          if (pr.y >= this.terrain.groundY(pr.x) + 30 || pr.t > 1.3) this._resolveHit(pr, null, 'terrain');
        } else if (pr.y >= this.terrain.groundY(pr.x)) {
          this._resolveHit(pr, null, 'terrain');
        }
      }
      this.projectiles = this.projectiles.filter(p => !p.dead);
      if (this.phase === 'flying' && !this.projectiles.length && !this.pending.length) {
        this.phase = 'resolving'; this.phaseT = 0;
      } else if (this.phase === 'resolving') {
        this.phaseT += dt;
        if (this.phaseT > 0.85) {
          const p1dead = !this.players[0].alive, p2dead = !this.players[1].alive;
          if (this.mode === 'training' && p2dead && !p1dead) {
            // Dummy respawns in training.
            const d = this.players[1]; d.hp = MAX_HP; d.alive = true; d.pose = 'idle'; d.y = this.terrain.groundY(d.x);
            this.setBanner('TARGET RESTORED', 'The dummy is back — keep practicing!', 1.8);
            this.nextTurn();
          } else if (p1dead || p2dead) { this._gameOver(p1dead ? 1 : 0); }
          else this.nextTurn();
        }
      }
    }
  }
  _spawnPending(pd) {
    const foe = this.players[1 - pd.owner];
    const mk = (kind, x, y, vx, vy, weapon, elem) => {
      const pr = { x, y, vx, vy, angle: 0, power: 0, kind, weapon, owner: pd.owner, elem: elem || null, t: 0, dead: false, trail: [], subSpawned: false };
      this.projectiles.push(pr);
    };
    if (pd.kind === 'meteor' || pd.kind === 'bigbomb') {
      const big = pd.kind === 'bigbomb';
      mk('ball', pd.x + (Math.random() * 30 - 15), pd.y, 0, 60, big ? 'meteor' : 'meteor', 'fire');
      const pr = this.projectiles[this.projectiles.length - 1];
      pr.vx = 0; pr.vy = 60; pr.meteorBig = big;
    } else if (pd.kind === 'fireball') {
      mk('ball', pd.x, pd.y, (Math.random() - 0.5) * 40, 50, 'meteor', 'fire');
    } else if (pd.kind === 'starbolt' || pd.kind === 'arcane') {
      mk('arcane', pd.x, pd.y, (Math.random() - 0.5) * 30, 55, pd.kind === 'arcane' ? 'celestial' : 'astral', 'arcane');
      const pr = this.projectiles[this.projectiles.length - 1];
      pr.arcaneBig = pd.arcaneBig;
    } else if (pd.kind === 'boulder') {
      mk('boulder', pd.x, pd.y, (Math.random() - 0.5) * 40, 50, 'crash', 'earth');
    }
  }
  _resolveHit(pr, target, how) {
    pr.dead = true;
    const w = WEAPONS[pr.weapon] || { dmg: 30, radius: 55 };
    const elem = pr.elem || w.elem || null;
    if (pr.weapon === 'cluster' && !pr.subSpawned) {
      // Split into 5 bomblets.
      pr.subSpawned = true;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.35;
        this.projectiles.push({ x: pr.x, y: pr.y, vx: Math.cos(a) * (120 + Math.random() * 120), vy: Math.sin(a) * 160, angle: 0, power: 0, kind: 'bomblet', weapon: 'cluster', owner: pr.owner, elem: null, t: 0, dead: false, trail: [], subSpawned: true });
      }
      this._burst(pr.x, pr.y, '#ffb347', 10);
      return;
    }
    const def = { dmg: w.dmg, radius: w.radius, elem };
    if (pr.weapon === 'lunar') { def.dmg = 34; def.radius = 60; }
    if (pr.weapon === 'crash') { def.dmg = 55; def.radius = 85; }
    if (pr.weapon === 'celestial') { def.dmg = 42; def.radius = 70; }
    if (pr.weapon === 'astral') { def.dmg = 16; def.radius = 40; }
    if (pr.weapon === 'meteor') { def.dmg = pr.meteorBig ? 60 : 46; def.radius = pr.meteorBig ? 95 : 75; }
    if (pr.kind === 'bomblet') { def.dmg = 13; def.radius = 36; }
    if (pr.kind === 'boulder') { def.dmg = 55; def.radius = 80; }
    if (pr.kind === 'arcane') { def.dmg = pr.arcaneBig ? 42 : 16; def.radius = pr.arcaneBig ? 70 : 40; }
    // v2 — Full Power shot: +50% damage, +30% blast radius.
    if (pr.fullPower) { def.dmg = Math.round(def.dmg * 1.5); def.radius = Math.round(def.radius * 1.3); }
    if (how === 'char' && target) {
      // Direct hit: full damage at the target point, plus blast.
      this.explode(pr.x, pr.y, { dmg: def.dmg, radius: def.radius, elem: def.elem }, pr.owner);
    } else {
      // v2.1: a blast that hurts nobody shows a floating MISS.
      const hpBefore = this.players.map(p => p.hp);
      const shBefore = this.players.map(p => p.shield);
      this.explode(pr.x, pr.y, def, pr.owner, { noCrater: pr.kind === 'beam' });
      const hurtAnyone = this.players.some((p, i) => p.hp < hpBefore[i] || p.shield < shBefore[i]);
      if (!hurtAnyone) this._floater(pr.x, pr.y - 40, 'MISS', '#d8d8d8', 18);
    }
  }

  // Trajectory preview for the current aim (dots until terrain/char).
  previewPoints() {
    if (this.state !== 'combat' || this.phase !== 'aim') return [];
    const p = this.active();
    const m = this._muzzle(p);
    const w = WEAPONS[this.selectedWeapon];
    const sim = simulateShot(m.x, m.y, this.worldAngle(), this.aim.power * (w ? w.speed : 1), this.wind * 10,
      { terrain: this.terrain, chars: this.players.filter(pl => pl.alive).map(pl => ({ x: pl.x, y: pl.y, r: 34 })) });
    return sim.points.filter((_, i) => i % 3 === 0).slice(0, 26);
  }
}
