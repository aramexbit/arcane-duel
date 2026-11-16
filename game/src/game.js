// ARCANE DUEL — game state machine, combat, skills, ultimates, AI, combos.
import { W, WORLD_W, H, GRAVITY, TURN_TIME, MAX_HP, CHAR_HIT_R, HERO_SCALE, AIM_SENS_MIN, AIM_SENS_MAX, AIM_SENS_DEFAULT, HIT_STOP, HIT_STOP_FULL_MULT, HIT_STOP_BIG_DMG, DELAY_BASE, DELAY_SKILL, DELAY_ULTIMATE, DELAY_PASS, DELAY_SHIELD, weaponDelay, HEROES, WEAPONS, WEAPON_ORDER, ARENAS, ARENA_ORDER, DIFFICULTY, MOVE_STEPS, MOVE_SPEED, TELEPORT_RANGE, TELEPORT_COST, TRAP_COST, TRAP_TURNS, TRAP_RADIUS, HEAL_COST, HEAL_AMOUNT, FULL_POWER, POWER_VEL, FULL_POWER_MOVES, SHOP_PRICES, FREE_WEAPONS, WIN_CREDITS, AI_SHOP_OWNED, ELITE_HP, ELITE_DMG_MUL, SURVIVAL_ROSTER, SURVIVAL_DIFFS, SURVIVAL_ARENAS, SURVIVAL_HP_PER_WAVE, SURVIVAL_DMG_PER_WAVE, CHALLENGES, SPEEDRUN_MAX_TURNS, QUALITY, SKIN_THEMES, SKIN_WEAPONS, GEMS_PER_DAMAGE, GEMS_PER_HIT, GEMS_WIN_BONUS, GEMS_LOSS_BONUS, STREAK_BONUS_PER_WIN, skinById, clamp, rng } from './config.js';
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
    this.stats = { turns: 0, damage: [0, 0], combos: 0, hits: 0 };
    // v2: reflect traps, teleport targeting, AI telegraph, walk meter.
    this.traps = []; this.teleportMode = false; this.moveDir = 0;
    this.aiTelegraph = null; this.aiTelegraphSeen = false; this.aiUtils = 0;
    // v2.1: emote bubble above the active hero (visual only).
    this.emoteBubble = null;
    // v3: wider-world camera, trajectory-preview toggle, hold-to-charge.
    this.camX = 0; this.showPreview = true; this.charging = false; this.chargeT = 0;
    this.fellDeath = false; // v3 — set when a hero falls into the abyss
    this.touchMode = false;
    // Android v2 Tahap A — camera mode (follow / zoom-out), turn banner,
    // lightning-chain FX, touch settings (NEW key, old keys untouched).
    this.camMode = 'follow';
    this.turnBanner = null;
    this.lightningFx = [];
    this.lastKnockback = null; this.lastFireWind = null; this.lastSlow = null;
    this.lastChain = null; this.lastEarth = null;
    this.touchSettings = { scale: 1, opacity: 0.85 };
    try {
      const t = JSON.parse(localStorage.getItem('arcane-duel-touch') || '{}');
      if (typeof t.scale === 'number') this.touchSettings.scale = Math.min(1.3, Math.max(0.8, t.scale));
      if (typeof t.opacity === 'number') this.touchSettings.opacity = Math.min(1, Math.max(0.5, t.opacity));
    } catch (e) { /* ignore */ }
    // v3: weapon shop — owned set persists in localStorage.
    this.owned = new Set();
    try { const v = JSON.parse(localStorage.getItem('arcane-duel-shop-owned') || '[]'); if (Array.isArray(v)) this.owned = new Set(v); } catch (e) { /* ignore */ }
    // Android v2 Tahap B — graphics quality (own field inside the shared
    // settings key; audio.save() merges instead of overwriting).
    this.quality = 'medium';
    // R4 — aim sensitivity (own field inside the shared settings key;
    // default 1.0 when the save predates it).
    this.aimSens = AIM_SENS_DEFAULT;
    try {
      const s = JSON.parse(localStorage.getItem('arcane-duel-settings') || '{}');
      if (s.quality && QUALITY[s.quality]) this.quality = s.quality;
      if (typeof s.aimSens === 'number' && Number.isFinite(s.aimSens)) this.aimSens = clamp(s.aimSens, AIM_SENS_MIN, AIM_SENS_MAX);
    } catch (e) { /* ignore */ }
    // Android v2 Tahap B — Survival best wave + completed challenges.
    this.survivalBest = 0;
    try { this.survivalBest = parseInt(localStorage.getItem('arcane-duel-survival-best') || '0', 10) || 0; } catch (e) { /* ignore */ }
    this.challengesDone = new Set();
    try { const v = JSON.parse(localStorage.getItem('arcane-duel-challenges') || '[]'); if (Array.isArray(v)) this.challengesDone = new Set(v); } catch (e) { /* ignore */ }
    this.showFps = false; // Android v2 Tahap B — set from ?fps=1 in main.js
    // Facebook-era flavour, original implementation: Duel Coins persist
    // across sessions; crates/barrels drop into the arena every few turns.
    this.crates = [];
    this.battleCoins = 0;
    // v3.1 Skin Feature — Gems (skin currency) + owned/equipped skins.
    // NEW keys (arcane-duel-gems, arcane-duel-skins-owned,
    // arcane-duel-skins-equipped); the old keys are never touched.
    this.gems = 0;
    try { this.gems = parseInt(localStorage.getItem('arcane-duel-gems') || '0', 10) || 0; } catch (e) { this.gems = 0; }
    // R1 — consecutive-win streak (NEW key 'arcane-duel-streak'; old keys
    // untouched). +1 per win in any real mode, reset to 0 on a loss.
    this.streak = 0;
    try { this.streak = parseInt(localStorage.getItem('arcane-duel-streak') || '0', 10) || 0; } catch (e) { this.streak = 0; }
    this.skinOwned = new Set();
    try { const v = JSON.parse(localStorage.getItem('arcane-duel-skins-owned') || '[]'); if (Array.isArray(v)) this.skinOwned = new Set(v.filter(x => typeof x === 'string')); } catch (e) { /* ignore */ }
    this.skinEquipped = {};
    try { const v = JSON.parse(localStorage.getItem('arcane-duel-skins-equipped') || '{}'); if (v && typeof v === 'object') this.skinEquipped = v; } catch (e) { /* ignore */ }
    // Default skins are always owned (even on a save from before skins existed).
    for (const w of SKIN_WEAPONS) this.skinOwned.add(w + ':default');
    this.battleGems = 0;
    this.lastSkinFx = null; // v3.1 Skin Feature — last skin explosion FX (probe reads it)
    this.lastPowerBar = null; // v3.1 Skin Feature — small power bar above the active hero (probe reads it)
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
    this.wind = 0; this.aim = { angle: 55, power: 65 }; this.selectedWeapon = 'cannon';
    // v3.1 Skin Feature + R1/R2 — per-battle stats reset (they used to
    // accumulate across battles, which corrupted per-match Gems + the
    // game-over screen). `hits` counts P1 shots that damaged the foe.
    this.stats = { turns: 0, damage: [0, 0], combos: 0, hits: 0 };
    this.lastGemBreakdown = null;
    this.campaignIndex = 0; this.campaignHero = null; this.campaignDiff = null;
    this.trainingTip = 0; this.winner = null; this.crates = []; this.battleCoins = 0; this.battleGems = 0; this.lastSkinFx = null;
    this.traps = []; this.teleportMode = false; this.moveDir = 0;
    this.aiTelegraph = null; this.aiUtils = 0;
    this.emoteBubble = null; // v2.1
    this.camX = 0; this.charging = false; this.chargeT = 0; // v3
    this.aimHolding = false; this.aimPadKnob = { dx: 0, dy: 0 }; // v3.1 P0 — left aim pad state
    this.fellDeath = false; // v3 — reset per battle
    this.camMode = 'follow'; this.turnBanner = null; this.lightningFx = [];
    this.lastKnockback = null; this.lastFireWind = null; this.lastSlow = null;
    this.lastChain = null; this.lastEarth = null;
    // Android v2 Tahap B — Survival / Challenge state (per battle).
    this.survivalWave = 0; this.challengeId = null; this.challengeShots = 0;
    this.challengeMisses = 0; this.challengePlayerTurns = 0;
    this.challengeFailed = false; this.challengeFailReason = null;
    this.challengeResult = null; // 'complete' | 'failed' (set at game over)
    this.weatherT = 0; // Android v2 Tahap B — ambient weather spawn timer
    // R3 — delay queue: per-player clocks (time spent acting). The player
    // with the lowest clock acts next. `pendingDelay` is the cost of the
    // action that just ended (paid in nextTurn); `lastDelay` is the last
    // paid cost (probe + HUD read it); `lastCostByPlayer` feeds the HUD.
    this.clocks = [0, 0]; this.pendingDelay = null; this.lastDelay = null;
    this.lastCostByPlayer = [null, null];
    // R4 — hit-stop: seconds of world freeze left (0 = running normally).
    // `lastHitStop` is the last freeze fired (probe reads it).
    this.hitStop = 0; this.lastHitStop = null; this.hitStopCount = 0;
  }
  // Android v2 Tahap B — graphics quality: saved in arcane-duel-settings.
  setQuality(q) {
    if (!QUALITY[q]) return false;
    this.quality = q;
    try {
      const prev = JSON.parse(localStorage.getItem('arcane-duel-settings') || '{}');
      localStorage.setItem('arcane-duel-settings', JSON.stringify({ ...prev, quality: q }));
    } catch (e) { /* ignore */ }
    return true;
  }
  qualityCap() { return QUALITY[this.quality] || QUALITY.medium; }
  // R4 — aim sensitivity: stored as a field inside the shared settings
  // key (same merge-save pattern as setQuality; old saves default to 1.0).
  setAimSens(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    this.aimSens = clamp(v, AIM_SENS_MIN, AIM_SENS_MAX);
    try {
      const prev = JSON.parse(localStorage.getItem('arcane-duel-settings') || '{}');
      localStorage.setItem('arcane-duel-settings', JSON.stringify({ ...prev, aimSens: this.aimSens }));
    } catch (e) { /* ignore */ }
    return true;
  }
  // R3 — the delay cost of the shot the active player is about to take
  // (selected weapon + Full Power bonus), for the HUD readout.
  currentDelayCost() {
    return weaponDelay(this.selectedWeapon, this.aim.power >= FULL_POWER);
  }
  // R4 — hit-stop: freeze the world briefly so a big impact lands with
  // weight. Duration scales with graphics quality; Full Power freezes
  // longer. A new freeze never shortens one already running (max wins).
  triggerHitStop(kind) {
    const base = HIT_STOP[this.quality] ?? HIT_STOP.medium;
    const ms = base * (kind === 'full' ? HIT_STOP_FULL_MULT : 1);
    this.hitStop = Math.max(this.hitStop, ms);
    this.lastHitStop = { kind, ms, t: this.time };
    this.hitStopCount++;
  }
  // Android v2 Tahap B — Survival wave spec: which foe, difficulty, arena,
  // HP bonus and damage multiplier for this wave.
  survivalSpec(wave) {
    const elite = wave % 5 === 0;
    const ai = elite ? 'bront' : SURVIVAL_ROSTER[(wave - 1) % SURVIVAL_ROSTER.length];
    const diff = elite ? 'elite' : SURVIVAL_DIFFS[Math.min(wave - 1, SURVIVAL_DIFFS.length - 1)];
    const arena = SURVIVAL_ARENAS[(wave - 1) % SURVIVAL_ARENAS.length];
    return { ai, diff, arena, elite, hpBonus: SURVIVAL_HP_PER_WAVE * (wave - 1), dmgMul: 1 + SURVIVAL_DMG_PER_WAVE * (wave - 1) };
  }
  _saveSurvivalBest() {
    try { localStorage.setItem('arcane-duel-survival-best', String(this.survivalBest)); } catch (e) { /* ignore */ }
  }
  _saveChallengesDone() {
    try { localStorage.setItem('arcane-duel-challenges', JSON.stringify([...this.challengesDone])); } catch (e) { /* ignore */ }
  }
  // Android v2 Tahap B — mark a challenge failed mid-battle (banner once).
  failChallenge(reason) {
    if (this.mode !== 'challenge' || this.challengeFailed) return;
    this.challengeFailed = true; this.challengeFailReason = reason;
    this.setBanner('❌ CHALLENGE FAILED', reason, 2.4, '#ff5a4e');
  }
  // Android v2 Tahap B — one-line challenge status for the HUD.
  challengeStatus() {
    if (this.mode !== 'challenge' || !this.challengeId) return null;
    const c = CHALLENGES[this.challengeId];
    if (this.challengeFailed) return `🏆 ${c.name} — ❌ FAILED (${this.challengeFailReason})`;
    if (this.challengeId === 'oneshot') return `🏆 ${c.name} — shots fired: ${this.challengeShots}/1`;
    if (this.challengeId === 'nomiss') return `🏆 ${c.name} — misses: ${this.challengeMisses} (must stay 0)`;
    return `🏆 ${c.name} — your turns: ${this.challengePlayerTurns}/${SPEEDRUN_MAX_TURNS}`;
  }
  // Android v2 Tahap A — touch button size/opacity settings (own key).
  setTouchSettings(scale, opacity) {
    if (typeof scale === 'number') this.touchSettings.scale = Math.min(1.3, Math.max(0.8, scale));
    if (typeof opacity === 'number') this.touchSettings.opacity = Math.min(1, Math.max(0.5, opacity));
    try { localStorage.setItem('arcane-duel-touch', JSON.stringify(this.touchSettings)); } catch (e) { /* ignore */ }
  }
  // Android v2 Tahap A — camera toggle: follow the hero/projectile, or
  // zoom out to show the whole 2048px arena at once.
  toggleCamera() {
    this.camMode = this.camMode === 'zoomout' ? 'follow' : 'zoomout';
    this.setBanner(this.camMode === 'zoomout' ? '🔍 ZOOM OUT' : '🎥 CAMERA FOLLOW',
      this.camMode === 'zoomout' ? 'Whole arena in view — tap again to follow' : 'Camera follows the action', 1.4, '#7ec8f7');
    this.audio.click();
    return this.camMode;
  }
  // Android v2 Tahap A — map a logical screen point (1280x720) to world
  // coords, honouring the camera mode (follow adds camX; zoom-out unscales).
  screenToWorld(sx, sy) {
    if (this.camMode === 'zoomout') {
      const z = 0.62, ox = (W - WORLD_W * z) / 2, oy = (H - H * z) / 2;
      return { x: (sx - ox) / z, y: (sy - oy) / z };
    }
    return { x: sx + this.camX, y: sy };
  }

  // ------------------------------------------------------------ v3: weapon shop
  ownsWeapon(id) { return FREE_WEAPONS.includes(id) || this.owned.has(id); }
  _saveOwned() { try { localStorage.setItem('arcane-duel-shop-owned', JSON.stringify([...this.owned])); } catch (e) { /* ignore */ } }
  buyWeapon(id) {
    const price = SHOP_PRICES[id];
    if (!price || this.ownsWeapon(id)) return false;
    if (this.coins < price) return false;
    this.coins -= price; this.owned.add(id); this._saveOwned();
    try { localStorage.setItem('arcane-duel-coins', String(this.coins)); } catch (e) { /* ignore */ }
    this.audio.skill();
    return true;
  }

  // ------------------------------------------------------------ v3.1 Skin Feature: Gems + skins
  // Skins are COSMETIC ONLY — they never change damage, radius or any stat.
  // Owned keys are "weaponId:skinId" (e.g. "cannon:fire-dragon").
  skinKey(weaponId, skinId) { return weaponId + ':' + skinId; }
  equippedSkin(weaponId) { return skinById(weaponId, this.skinEquipped[weaponId] || 'default'); }
  ownsSkin(weaponId, skinId) { return skinId === 'default' || this.skinOwned.has(this.skinKey(weaponId, skinId)); }
  _saveSkins() {
    try {
      localStorage.setItem('arcane-duel-gems', String(this.gems));
      localStorage.setItem('arcane-duel-skins-owned', JSON.stringify([...this.skinOwned]));
      localStorage.setItem('arcane-duel-skins-equipped', JSON.stringify(this.skinEquipped));
    } catch (e) { /* ignore */ }
  }
  addGems(n) {
    this.gems = Math.max(0, this.gems + n); this.battleGems += n;
    try { localStorage.setItem('arcane-duel-gems', String(this.gems)); } catch (e) { /* ignore */ }
  }
  _saveStreak() { try { localStorage.setItem('arcane-duel-streak', String(this.streak)); } catch (e) { /* ignore */ } }
  buySkin(weaponId, skinId, priceOverride) {
    const skin = skinById(weaponId, skinId);
    if (!skin || skinId === 'default' || this.ownsSkin(weaponId, skinId)) return false;
    // R2 — Featured buys pass the discounted weekly price; anything else
    // pays the config price. The caller computes the discount, never the UI.
    const price = (priceOverride != null ? priceOverride : skin.price);
    if (this.gems < price) return false;
    // Single deduction: the ownsSkin check above + the disabled Buy button
    // after purchase make a double charge impossible.
    this.gems -= price; this.skinOwned.add(this.skinKey(weaponId, skinId)); this._saveSkins();
    this.audio.skill();
    return true;
  }
  equipSkin(weaponId, skinId) {
    if (!this.ownsSkin(weaponId, skinId)) return false;
    this.skinEquipped[weaponId] = skinId; this._saveSkins(); this.audio.click();
    return true;
  }
  unequipSkin(weaponId) { this.skinEquipped[weaponId] = 'default'; this._saveSkins(); this.audio.click(); return true; }

  // ------------------------------------------------------------ setup
  startBattle(opts) {
    // opts: {mode, arena, p1Hero, p2Hero, p2AI (null|'easy'|'normal'|'hard'|'dummy'), campaignIndex}
    this.resetMeta();
    this.mode = opts.mode; this.state = 'combat';
    // v3.1 P0 (B4) — reset the AI difficulty every battle: versus/training
    // used to inherit a stale campaignDiff from the previous battle. The
    // elite / survival / challenge branches below override this default,
    // and launchCampaignBattle still sets it after startBattle.
    this.campaignDiff = 'normal';
    this.campaignIndex = opts.campaignIndex ?? 0;
    this.campaignTotal = opts.campaignTotal || 6; // v3: 6 campaign battles
    const seed = (opts.seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
    this.terrain = new Terrain(opts.arena, seed);
    this.arenaId = opts.arena;
    // v3 — wider world: heroes spawn at 480 and 1568 (1088 px apart, inside max range ~1290 px so turn-1 shots can reach).
    const aiShop = opts.p2AI ? (AI_SHOP_OWNED[opts.p2AI] || []) : [];
    this.players = [this._makePlayer(opts.p1Hero, 480, 1, false, 'Player 1'),
      this._makePlayer(opts.p2Hero, 1568, -1, opts.p2AI || false, opts.p2AI ? (opts.p2AI === 'dummy' ? 'Training Dummy' : (opts.elite ? 'Elite Opponent' : 'AI Opponent')) : 'Player 2', aiShop)];
    this.players[0].y = this.terrain.groundY(480);
    this.players[1].y = this.terrain.groundY(1568);
    // v2 — elite final boss: 150 HP, harder hits, sharper aim (see DIFFICULTY.elite).
    if (opts.elite) {
      const b = this.players[1];
      b.elite = true; b.maxHp = ELITE_HP; b.hp = ELITE_HP;
      this.campaignDiff = 'elite';
    }
    // Android v2 Tahap B — Survival: the foe scales with the wave
    // (+10 HP, +5% damage per wave); the best wave reached is persisted.
    // Challenge: reset the per-battle trackers and announce the goal.
    if (opts.mode === 'survival') {
      this.survivalWave = opts.survivalWave || 1;
      const spec = this.survivalSpec(this.survivalWave);
      const foe = this.players[1];
      foe.maxHp = (spec.elite ? ELITE_HP : (foe.hero.hp || MAX_HP)) + spec.hpBonus;
      foe.hp = foe.maxHp;
      foe.dmgMul = spec.dmgMul;
      this.campaignDiff = spec.diff;
      if (this.survivalWave > this.survivalBest) { this.survivalBest = this.survivalWave; this._saveSurvivalBest(); }
      this.setBanner(`🌊 WAVE ${this.survivalWave}`, `${foe.hero.name} — ${spec.diff.toUpperCase()}${spec.elite ? ' • ELITE' : ''} • +${spec.hpBonus} HP, +${Math.round((spec.dmgMul - 1) * 100)}% damage`, 2.6, '#7ec8f7');
    }
    if (opts.mode === 'challenge') {
      this.challengeId = opts.challengeId || 'oneshot';
      this.campaignDiff = 'normal';
      this.challengePlayerTurns = 1; // the opening turn is player turn #1
      const c = CHALLENGES[this.challengeId];
      this.setBanner(`🏆 ${c.name.toUpperCase()}`, c.desc, 3.0, '#ffd76a');
    }
    this.wind = this._rollWind(seed);
    this.aim = { angle: 55, power: 65 };
    this.phase = 'aim'; this.phaseT = 0; this.turnTimer = TURN_TIME;
    this.turn = 0; this.players[0].energy = 30; this.players[1].energy = 30;
    this.camX = 0; // v3 — camera starts at the left edge (P1's side)
    this.camMode = 'follow';
    this.setBanner(this.mode === 'training' ? 'TRAINING' : `${ARENAS[opts.arena].name.toUpperCase()}`, this._turnText(), 2.2);
    // Android v2 Tahap A — animated turn banner (separate from the arena
    // banner so a turn change is never silent).
    this.turnBanner = { text: `${this.players[0].name}'S TURN`, sub: `${this.players[0].hero.name} — ${this.players[0].hero.title}`, t: 0, dur: 1.6 };
    if (opts.elite) this.setBanner('⚔ FINAL ROUND — ELITE ENEMY!', 'Elite Bront: 150 HP, harder hits, sharper aim!', 3.2, '#ff5a4e');
    this.audio.ensure(); this.audio.turn();
    if (this.ui.onTurn) this.ui.onTurn(this.turn);
  }
  _makePlayer(heroId, x, facing, ai, name, aiShop = []) {
    const h = HEROES[heroId];
    // v3 — ammo respects the shop: locked weapons start with 0 ammo.
    // AI opponents get their difficulty's shop set; humans use the shop.
    const ammo = {};
    for (const w of WEAPON_ORDER) {
      const owned = ai ? (FREE_WEAPONS.includes(w) || aiShop.includes(w)) : this.ownsWeapon(w);
      ammo[w] = owned ? WEAPONS[w].ammo : 0;
    }
    // The hero's signature weapon is always available (even for monsters).
    ammo[h.basic.id] = Infinity;
    return { hero: h, x, y: 0, vy: 0, falling: false, fallStart: 0, hp: h.hp || MAX_HP, maxHp: h.hp || MAX_HP, elite: false, dmgMul: 1,
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
    // R3 — passing is cheap: you act sooner next time.
    this.pendingDelay = { actor: this.turn, cost: DELAY_PASS, label: 'Pass' };
    this.nextTurn();
    return true;
  }
  // Emote: a fun bubble above the active hero (visual only — costs nothing,
  // spends no energy, does NOT end the turn).
  emote() {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    // v3.1 P0 (B2) — never show an emote bubble on the AI's turn (the
    // keyboard path already blocked it; direct calls did not).
    const p = this.active();
    if (!p || p.ai) return false;
    const EMOTES = ['😤', '😂', '💪'];
    const emoji = EMOTES[Math.floor(Math.random() * EMOTES.length)];
    this.emoteBubble = { player: this.turn, emoji, t: 0, dur: 2.5 };
    this.audio.emote();
    return true;
  }
  // VS header counter: campaign = battles left (incl. current), versus = 1 rival.
  remainingLabel() {
    if (this.mode === 'campaign') return `Musuh tersisa: ${Math.max(0, (this.campaignTotal || 6) - this.campaignIndex)}`;
    if (this.mode === 'training') return '🎯 Latihan — dummy';
    // Android v2 Tahap B — Survival shows the wave + best; Challenge the goal.
    if (this.mode === 'survival') return `🌊 Wave ${this.survivalWave} • Best: ${this.survivalBest}`;
    if (this.mode === 'challenge') return `🏆 ${CHALLENGES[this.challengeId]?.name || 'Challenge'}`;
    return '⚔ Duel 1 lawan 1';
  }

  // ------------------------------------------------------------ aiming / firing
  // v3 — angle 0–180°, power 0–100 (user spec). Power converts to initial
  // speed at fire time: v = power × 9.5 × weapon.speed.
  setAim(angle, power) {
    // clamp(NaN) is NaN — a poisoned aim used to kill the game loop (Nov 2026).
    if (Number.isFinite(angle)) this.aim.angle = clamp(angle, 0, 180);
    if (Number.isFinite(power)) this.aim.power = clamp(power, 0, 100);
  }
  nudgeAim(dAngle, dPower) { this.setAim(this.aim.angle + dAngle, this.aim.power + dPower); }
  togglePreview() { this.showPreview = !this.showPreview; return this.showPreview; }
  // v3 — hold-to-charge: hold Space to charge power up toward 100, release
  // to fire. A quick tap fires immediately with the current power.
  startCharge() {
    if (this.state !== 'combat' || this.phase !== 'aim' || this.active().ai) return false;
    this.charging = true; this.chargeT = 0;
    return true;
  }
  releaseCharge() {
    if (!this.charging) return false;
    this.charging = false;
    if (this.state !== 'combat' || this.phase !== 'aim' || this.active().ai) return false;
    this.teleportMode = false;
    return this._fireWeapon(this.selectedWeapon);
  }
  // v2 — walk left/right (A/D hold). Limited steps per turn, Worms-style.
  // Called every frame by input.js while a move key is held, and by the AI.
  moveStep(dir, dt) {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    const p = this.active();
    if (!p.alive || p.falling) return false;
    if (p.moveSteps <= 0) return false;
    const step = MOVE_SPEED * dt;
    const nx = clamp(p.x + dir * step, 40, WORLD_W - 40);
    const moved = Math.abs(nx - p.x);
    if (moved < 0.01) return false;
    p.x = nx; p.facing = dir; p.moveSteps = Math.max(0, p.moveSteps - moved);
    p.y = this.terrain.groundY(p.x);
    // Android v2 Tahap A — walk animation state (renderer bobs + tilts).
    p.walking = true; p.walkT = 0.18;
    return true;
  }
  aimFromMouse(mx, my) {
    const p = this.active(), m = this._muzzle(p);
    const dx = (mx - m.x) * p.facing, dy = -(my - m.y);
    if (Math.hypot(dx, dy) < 20) return;
    const ang = clamp(Math.atan2(dy, Math.max(1, dx)) * 180 / Math.PI, 0, 180);
    // R4 — aim sensitivity scales how fast power builds with drag distance.
    const pw = clamp(Math.hypot(mx - m.x, my - m.y) * 0.11 * this.aimSens, 5, 100);
    this.setAim(ang, pw);
  }
  // v3 — touch drag aim: drag anywhere on the field; the drag vector from
  // the muzzle sets angle + power (Perjuangan Semut style: pull to aim).
  // v3.1 P0 — the drag distance is normalised against the VISIBLE screen
  // diagonal in world units (half-diagonal = power 100), not a fixed 0.11
  // factor: on a phone the muzzle sits mid-screen, so the longest possible
  // drag is only ~700 world px and could never reach power 100 (max ~77).
  // A full-screen drag now reaches 100 in follow AND zoom-out mode; the
  // mouse path (aimFromMouse) keeps its old factor — desktop behaviour
  // is unchanged.
  aimFromTouch(tx, ty) {
    const p = this.active(), m = this._muzzle(p);
    const dx = (tx - m.x) * p.facing, dy = -(ty - m.y);
    if (Math.hypot(dx, dy) < 24) return;
    const ang = clamp(Math.atan2(dy, Math.max(1, dx)) * 180 / Math.PI, 0, 180);
    const zoom = this.camMode === 'zoomout' ? 0.62 : 1;
    const refDist = 0.5 * Math.hypot(W / zoom, H / zoom);
    // R4 — aim sensitivity scales how fast power builds with drag distance
    // (at 0.5x a full-screen drag only reaches ~50 power — the AIM pad's
    // incremental drags and Space charge still reach 100).
    const pw = clamp(Math.hypot(tx - m.x, ty - m.y) / refDist * 100 * this.aimSens, 5, 100);
    this.setAim(ang, pw);
  }
  _muzzle(p) {
    const mz = p.hero.muzzle;
    // v3.1 Skin Feature — the sprite is HERO_SCALE of its old size, so the
    // muzzle (gun tip) scales with it; physics otherwise unchanged (the AI
    // solver already aims from the player position, not the muzzle).
    return { x: p.x + (p.facing === 1 ? mz.x - 60 : 60 - mz.x) * HERO_SCALE, y: p.y - 140 * HERO_SCALE + mz.y * HERO_SCALE };
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
      // R3 — a defensive shield is quick: you act sooner next time.
      this.pendingDelay = { actor: this.turn, cost: DELAY_SHIELD, label: 'Shield' };
      return true;
    }
    if (p.ammo[weaponId] !== Infinity) { if (p.ammo[weaponId] <= 0) return false; p.ammo[weaponId]--; }
    const m = this._muzzle(p);
    // v3 — power 0–100 converts to initial speed: v = power × 9.5 × weapon.speed.
    const ang = this.worldAngle(), pw = this.aim.power * POWER_VEL * w.speed;
    p.pose = 'fire'; p.poseT = 0.4;
    // v3 — FULL POWER: each weapon unleashes its OWN special move at power 100.
    const full = this.aim.power >= FULL_POWER;
    const fpMove = full ? FULL_POWER_MOVES[weaponId] : null;
    // R3 — the shot's delay cost is paid when the turn ends (nextTurn):
    // heavy weapons + Full Power delay your next turn.
    this.pendingDelay = { actor: this.turn, cost: weaponDelay(weaponId, full), label: w.name + (full ? ' FULL POWER' : '') };
    // v3.1 Skin Feature — the shooter's equipped skin rides with the shot
    // (cosmetic only: it changes the look + sound, never the damage).
    const skin = this.equippedSkin(weaponId);
    const skinTheme = skin ? skin.theme : 'default';
    if (full && fpMove) {
      this.setBanner(`🔥 ${fpMove.name.toUpperCase()}!`, `${p.hero.name} unleashes ${fpMove.name} — ${fpMove.desc}`, 2.0, '#ffd76a');
      if (skinTheme !== 'default') this.audio.skinFullPower(skinTheme); else this.audio.fullpower();
    } else if (skinTheme !== 'default') this.audio.skinShoot(skinTheme);
    else this.audio.shoot(weaponId); // Android v2 Tahap A — per-weapon shot sound
    // v3 — recoil: the hero is knocked back opposite the shot + camera shake.
    p.x = clamp(p.x - p.facing * 8, 40, WORLD_W - 40);
    p.y = this.terrain.groundY(p.x);
    this.shake = Math.max(this.shake, 4);
    this._burst(m.x, m.y, '#ffd76a', 8);
    const mkProj = (a, kindOverride) => ({
      x: m.x, y: m.y, angle: a, power: pw, kind: kindOverride || w.kind,
      weapon: weaponId, owner: this.turn, elem: w.elem || null, trail: [],
      fullPower: full, fullPowerMove: fpMove, skinTheme,
      weight: w.weight ?? 1, windRes: w.windRes ?? 0,
    });
    if (full && fpMove && fpMove.effect === 'swarm') {
      // Swarm: N projectiles fan out from the muzzle instead of one shot.
      for (let i = 0; i < fpMove.count; i++) {
        const off = (i - (fpMove.count - 1) / 2) * fpMove.spread;
        this._spawnProjectile(mkProj(ang + off, w.kind === 'triple' ? 'ball' : undefined));
      }
    } else {
      this._spawnProjectile(mkProj(ang));
      if (w.kind === 'triple' && !full) {
        this._spawnProjectile(mkProj(ang - 6, 'ball'));
        this._spawnProjectile(mkProj(ang + 6, 'ball'));
      }
      if (full && fpMove && fpMove.effect === 'rain') {
        // Rain: extra projectiles fall on the foe after the main shot.
        const foe = this.opponent();
        const rainKind = fpMove.elem === 'fire' ? 'meteor' : fpMove.elem === 'arcane' ? 'starbolt' : fpMove.elem === 'earth' ? 'boulder' : 'cluster';
        for (let i = 0; i < fpMove.count; i++) {
          this.pending.push({ delay: 0.15 + i * 0.25, kind: rainKind, x: foe.x - 60 + i * 60, y: 40, owner: this.turn, fpMove, skinTheme });
        }
      }
    }
    this.phase = 'flying'; this.phaseT = 0;
    // Android v2 Tahap B — Challenge: every player shot counts. One-Shot
    // is lost the moment a second shot leaves the muzzle. (Shield returns
    // early above, so it never counts as a shot.)
    if (this.mode === 'challenge' && this.turn === 0) {
      this.challengeShots++;
      if (this.challengeId === 'oneshot' && this.challengeShots > 1) this.failChallenge('More than one shot fired');
    }
    return true;
  }
  _spawnProjectile(pr) {
    // A non-finite angle/power poisons velocity and used to kill the loop.
    if (!Number.isFinite(pr.angle)) pr.angle = 55;
    if (!Number.isFinite(pr.power)) pr.power = 600;
    const rad = pr.angle * Math.PI / 180;
    pr.vx = Math.cos(rad) * pr.power; pr.vy = -Math.sin(rad) * pr.power;
    pr.t = 0; pr.dead = false; pr.subSpawned = false; pr.lastX = pr.x; pr.lastY = pr.y;
    pr.weight = pr.weight ?? 1; pr.windRes = pr.windRes ?? 0;
    this.projectiles.push(pr);
  }

  // ------------------------------------------------------------ v3 utility skills
  // v3 RULE CHANGE (replaces the v2 "free action" rule): Teleport and Heal
  // each END the turn — use one and you cannot shoot that turn. The turn
  // passes immediately after the skill resolves. Trap is unchanged: it
  // does not end the turn (the user only named teleport + heal).
  teleportCost(p) { return p.hero.id === 'nyx' ? 20 : TELEPORT_COST; } // Nyx: signature teleport, cheaper
  utilityReady(p, kind) {
    const cost = kind === 'teleport' ? this.teleportCost(p) : kind === 'trap' ? TRAP_COST : HEAL_COST;
    if (p.energy < cost) return false;
    if ((p.cds[kind] || 0) > 0) return false;
    if (kind === 'heal' && p.hp >= p.maxHp) return false;
    if (kind === 'trap' && this.traps.some(t => t.owner === this.turn)) return false;
    return true;
  }
  // v3.1 teleport fix (user report 16 Nov: "T does nothing") — the happy
  // path always worked (T -> click -> move), but a press at the WRONG
  // moment failed SILENTLY: the key handler only ran in the aim phase on
  // a human turn, so T during the enemy turn / mid-flight did nothing at
  // all, and a NOT READY press only said "needs 30 energy" for 1.4s.
  // `human` callers (key T, TELEPORT button) now always get an explaining
  // banner; the AI calls without it and stays silent on failure.
  useTeleport(human = false) {
    if (this.state !== 'combat') return false;
    const p = this.active();
    if (human && p.ai) { this.setBanner('⏳ ENEMY TURN', 'Wait for the enemy to finish their turn', 1.8); return false; }
    if (this.phase !== 'aim') {
      if (human) this.setBanner('⏳ NOT NOW', 'Wait for the shot to land first', 1.8);
      return false;
    }
    if (!this.utilityReady(p, 'teleport')) {
      if (human) {
        const cd = p.cds.teleport || 0;
        const sub = cd > 0
          ? `Cooling down — ${cd} turn${cd > 1 ? 's' : ''} left • needs ${this.teleportCost(p)} energy (you have ${Math.floor(p.energy)})`
          : `Needs ${this.teleportCost(p)} energy (you have ${Math.floor(p.energy)})`;
        this.setBanner('NOT READY', sub, 2.0);
      }
      return false;
    }
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
    const cx = clamp(x, 40, WORLD_W - 40);
    if (Math.abs(cx - p.x) > TELEPORT_RANGE) { this.setBanner('TOO FAR!', `Teleport range is ${TELEPORT_RANGE}px`, 1.4); return false; }
    const gy = this.terrain.groundY(cx);
    this._burst(p.x, p.y - 60, '#a06bff', 18);
    p.energy -= this.teleportCost(p); p.cds.teleport = 3;
    p.x = cx; p.y = gy; p.falling = false; p.vy = 0;
    this._burst(p.x, p.y - 60, '#c9a7ff', 22);
    this._floater(p.x, p.y - 140, '✨ TELEPORT!', '#c9a7ff');
    this.teleportMode = false;
    this.audio.teleport();
    // v3 — teleport ends the turn (no shooting afterwards).
    // R3 — a standard turn's worth of time.
    this.pendingDelay = { actor: this.turn, cost: DELAY_BASE, label: 'Teleport' };
    this.setBanner('✨ TELEPORTED — TURN OVER', 'Teleport uses up the whole turn', 1.6, '#c9a7ff');
    this._endShot(p);
    return true;
  }
  placeTrap() {
    if (this.state !== 'combat' || this.phase !== 'aim') return false;
    const p = this.active();
    if (!this.utilityReady(p, 'trap')) { this.setBanner('NOT READY', 'Trap needs 35 energy — or one is already set', 1.4); return false; }
    const tx = clamp(p.x + p.facing * 120, 60, WORLD_W - 60);
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
    // v3 — heal ends the turn (no shooting afterwards).
    // R3 — a standard turn's worth of time.
    this.pendingDelay = { actor: this.turn, cost: DELAY_BASE, label: 'Heal' };
    this._endShot(p);
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
    // R3 — skills cost time (ultimate costs the most: the foe may act
    // twice before you do). Paid when the turn ends (nextTurn).
    this.pendingDelay = { actor: this.turn, cost: slot === 3 ? DELAY_ULTIMATE : DELAY_SKILL, label: def.name };
    // Android v2 Tahap B — Challenge: a skill / ultimate counts as a shot
    // too (a wall is defensive, not a shot, so it doesn't count).
    if (this.mode === 'challenge' && this.turn === 0 && def.id !== 'wall') {
      this.challengeShots++;
      if (this.challengeId === 'oneshot' && this.challengeShots > 1) this.failChallenge('More than one shot fired');
    }
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
      this._spawnProjectile({ x: m.x, y: m.y, angle: this.worldAngle(), power: this.aim.power * POWER_VEL, kind: 'arcane', weapon: 'lunar', owner: this.turn, elem: 'arcane', trail: [], weight: 0.9, windRes: 0.3 });
      this.phase = 'flying'; this.phaseT = 0;
    } else if (def.id === 'astral') {
      for (let i = 0; i < 5; i++) this.pending.push({ delay: 0.1 + i * 0.18, kind: 'starbolt', x: foe.x - 120 + i * 60, y: 30, owner: this.turn });
      this.phase = 'flying'; this.phaseT = 0;
    } else if (def.id === 'crash') {
      this._spawnProjectile({ x: m.x, y: m.y, angle: this.worldAngle(), power: this.aim.power * POWER_VEL * 1.1, kind: 'boulder', weapon: 'crash', owner: this.turn, elem: 'earth', trail: [], weight: 1.4, windRes: 0.7 });
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
    this.audio.shout(p.hero.id); // Android v2 Tahap B — battle cry on ultimate
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
      // R4 — the ultimate's ground slam freezes the world briefly.
      this.triggerHitStop('full');
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
    // R3 — delay queue: the player who just acted pays the cost of their
    // action, then the player with the LOWEST clock acts next. Tie -> the
    // other player, so plain alternation is preserved when costs are
    // equal (two standard 100-cost turns still alternate). A heavy action
    // leaves your clock high, so the foe may act twice before you do —
    // that is the mechanic, and the HUD + turn banner say so out loud.
    const prevTurn = this.turn;
    let paid = null;
    if (this.pendingDelay) {
      paid = this.pendingDelay;
      this.clocks[paid.actor] += paid.cost;
      this.lastCostByPlayer[paid.actor] = paid.cost;
      this.pendingDelay = null;
    }
    const [c0, c1] = this.clocks;
    this.turn = c0 < c1 ? 0 : c1 < c0 ? 1 : 1 - prevTurn;
    const doubleTurn = this.turn === prevTurn;
    this.lastDelay = { actor: prevTurn, cost: paid ? paid.cost : 0, label: paid ? paid.label : '', clocks: [this.clocks[0], this.clocks[1]], doubleTurn, next: this.turn };
    const p = this.active();
    // Android v2 Tahap B — Speed Run counts the player's own turns: the
    // challenge is lost the moment the 7th player turn begins.
    if (this.mode === 'challenge' && this.turn === 0) {
      this.challengePlayerTurns++;
      if (this.challengeId === 'speedrun' && this.challengePlayerTurns > SPEEDRUN_MAX_TURNS) this.failChallenge(`More than ${SPEEDRUN_MAX_TURNS} turns taken`);
    }
    // Android v2 Tahap B — One-Shot: if the player's single shot didn't
    // finish the enemy, the challenge is lost as soon as the turn moves on
    // (a kill ends the battle via _gameOver before this point, so a live
    // foe here means the one shot failed to finish the job).
    if (this.mode === 'challenge' && this.challengeId === 'oneshot' && this.challengeShots >= 1) {
      this.failChallenge('The first shot did not finish the enemy');
    }
    p.energy = clamp(p.energy + 25, 0, 100);
    // Android v2 Tahap A — Ice SLOW: a beam-slowed hero gets half the walk
    // steps on their next turn, then the status clears.
    if (p.slowTurns > 0) {
      p.moveSteps = Math.floor(MOVE_STEPS / 2);
      p.slowTurns--;
      this._floater(p.x, p.y - 150, 'SLOWED — half moves!', '#7ec8f7', 18);
    } else p.moveSteps = MOVE_STEPS; // v2: walking refills every turn
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
    this.aim = { angle: 55, power: 65 };
    this.selectedWeapon = 'cannon';
    this.phase = 'aim'; this.phaseT = 0;
    this.stats.turns++;
    // Supply drop every 3rd turn: a crate (bonus ammo) or a barrel (explosive).
    if (this.stats.turns % 3 === 0 && this.crates.length < 2 && this.mode !== 'training') {
      const kind = Math.random() < 0.55 ? 'crate' : 'barrel';
      const cx = 380 + Math.random() * 1288; // v3 — across the wider world
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
    // Android v2 Tahap A — every turn change gets a clear animated banner.
    // R3 — a double turn gets its own banner text, so the extra turn is
    // never a silent surprise: the foe was delayed by a heavy action.
    const ap = this.active();
    this.turnBanner = doubleTurn
      ? { text: `⚡ ${ap.name}'S TURN AGAIN!`, sub: `${this.players[1 - this.turn].hero.name} delayed — heavy actions cost time`, t: 0, dur: 1.6 }
      : { text: `${ap.name}'S TURN`, sub: `${ap.hero.name} — ${ap.hero.title}`, t: 0, dur: 1.6 };
  }
  _trainingTipText() {
    return ['Move the mouse to aim — the dotted line shows the flight path.',
      'Arrow keys fine-tune angle and power. SPACE fires.',
      'Wind pushes every projectile — check the compass before you shoot!',
      'Q / E switch weapons. Number keys 1 / 2 / 3 use skills.',
      'Skills need energy. The ultimate only works at FULL energy.',
      'Fire hitting a purple arcane zone triggers an ELEMENTAL COMBO!',
      'Hold A / D to walk — 150 steps per turn. Reposition before you shoot!',
      'T teleports, R sets a reflect trap, H heals — teleport and heal END your turn, no shooting after! Fire at POWER 100 for a FULL POWER move!'][this.trainingTip];
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
    // Android v2 Tahap B — Survival scaling: the foe's damage grows +5%/wave.
    if (attacker && attacker.dmgMul && attacker.dmgMul !== 1 && idx !== this.turn) dmg = Math.round(dmg * attacker.dmgMul);
    if (p.shield > 0) { const blocked = Math.min(p.shield, dmg); p.shield -= blocked; dmg -= blocked; this._floater(p.x, p.y - 120, `-${blocked} SHIELD`, '#7ec8f7'); }
    if (dmg <= 0) { this._floater(p.x, p.y - 120, 'BLOCKED!', '#7ec8f7'); return 0; }
    p.hp = Math.max(0, p.hp - dmg);
    p.pose = 'hit'; p.poseT = 0.55;
    // v2.1: floating damage number — bigger + gold on crit.
    this._floater(p.x, p.y - 130, `-${dmg}${crit ? ' CRIT!' : ''}`, crit ? '#ffd76a' : '#ff6a5e', crit ? 26 : 20);
    this.stats.damage[this.turn] += dmg;
    // R1 — hit counter: P1 damaging the foe (own fall/trap damage excluded).
    if (this.turn === 0 && idx === 1) this.stats.hits++;
    // Duel Coins: the attacker earns coins for damage dealt.
    if (idx !== this.turn) this.addCoins(Math.max(1, Math.floor(dmg / 5)));
    if (attacker && idx !== this.turn) attacker.energy = clamp(attacker.energy + 8, 0, 100);
    if (p.hp <= 0) { p.alive = false; p.pose = 'defeat'; }
    this.audio.hit();
    return dmg;
  }
  explode(x, y, def, ownerIdx, opts = {}) {
    // def: {dmg, radius, elem}
    // Android v2 Tahap A — elemental interactions (see BUILD_LOG for the map):
    // Fire+Wind: |wind|>=6 boosts a fire blast radius +25%.
    // Earth: crater +30% deeper + small raised rims at the crater edges.
    // Ice (beam): SLOW — see the damage loop below. Lightning (homing):
    // chain — see below. Hero names/elements are unchanged.
    const hpBefore = this.players.map(p => p.hp);
    const fireWind = def.elem === 'fire' && Math.abs(this.wind) >= 6;
    const isEarth = def.elem === 'earth';
    const R = def.radius * (fireWind ? 1.25 : 1);
    if (fireWind) {
      this.lastFireWind = { x, y, radius: R, wind: this.wind };
      this._floater(x, y - 60, 'FIRE+WIND!', '#ff9d5e', 22);
      this.audio.firewind();
    }
    // v3.1 Skin Feature — a skinned blast plays its themed sound instead of
    // the generic explosion (one sound, not two); the themed particles layer
    // on top of the base blast (cosmetic only: damage/radius already fixed).
    if (opts.skinTheme && opts.skinTheme !== 'default') {
      this.audio.skinBoom(opts.skinTheme, !!opts.fullPowerSkin);
      this._skinBoomFx(x, y, R, opts.skinTheme, !!opts.fullPowerSkin);
    } else this.audio.explosion(R > 70 ? 1.6 : 1);
    this.shake = Math.max(this.shake, R > 70 ? 12 : 7);
    this._burst(x, y, def.elem === 'fire' ? '#ff8c2f' : def.elem === 'arcane' ? '#a06bff' : def.elem === 'earth' ? '#8a7a5e' : '#ffb347', Math.round(R / 2.4));
    this._burst(x, y, '#3a3a3a', Math.round(R / 3), true);
    // Terrain crater (not for beam). Earth digs deeper + shapes rims.
    if (!opts.noCrater) {
      const craterR = R * 0.85 * (isEarth ? 1.3 : 1);
      this.terrain.crater(x, y, craterR);
      if (isEarth) {
        this.lastEarth = { x, y, craterR };
        // Rims sit just OUTSIDE the crater (craterR + 24) so the crater
        // itself never digs them back down; they rise 18px above the old ground.
        this.terrain.raiseWall(x - craterR - 24, 40, 18);
        this.terrain.raiseWall(x + craterR + 24, 40, 18);
        this._burst(x - craterR - 24, this.terrain.groundY(x - craterR - 24) - 10, '#8a7a5e', 8);
        this._burst(x + craterR + 24, this.terrain.groundY(x + craterR + 24) - 10, '#8a7a5e', 8);
      }
    }
    // Supply crates / barrels caught in the blast.
    for (const c of [...this.crates]) {
      if (Math.hypot(c.x - x, (c.y) - y) < R + CHAR_HIT_R) {
        this.crates.splice(this.crates.indexOf(c), 1);
        if (c.kind === 'crate') {
          // v3 — crates only restock weapons you own (locked shop weapons
          // stay locked until bought).
          const pool = ['triple', 'meteor', 'homing', 'pierce', 'cluster', 'beam', 'shield'].filter(id => WEAPONS[id].ammo !== Infinity && this.ownsWeapon(id));
          if (!pool.length) { // nothing owned beyond free weapons: coins instead
            this._floater(c.x, c.y - 30, '+15 🪙!', '#ffd76a');
            this._burst(c.x, c.y - 10, '#ffd76a', 14);
            this.addCoins(15);
          } else {
            const pick = pool[Math.floor(Math.random() * pool.length)];
            const owner = this.players[ownerIdx];
            if (owner) { owner.ammo[pick] = (owner.ammo[pick] || 0) + 1; }
            this._floater(c.x, c.y - 30, `+1 ${WEAPONS[pick].name}!`, '#ffd76a');
            this._burst(c.x, c.y - 10, '#ffd76a', 14);
            this.addCoins(10);
          }
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
    // Android v2 Tahap A — knockback: a hero caught in a blast is shoved
    // away from the blast point (bounded, never through terrain: the new
    // spot is clamped to the world and re-grounded; a small hop follows
    // the shove so the landing uses the normal falling rules).
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      if (!p.alive || p.hp >= hpBefore[i]) continue;
      const d = Math.hypot(p.x - x, (p.y - 40) - y);
      if (d >= R * 1.5) continue;
      const dir = p.x >= x ? 1 : -1;
      const shift = clamp(R * 0.25, 8, 36);
      const nx = clamp(p.x + dir * shift, 40, WORLD_W - 40);
      if (Math.abs(nx - p.x) >= 2) {
        const dx = nx - p.x;
        p.x = nx; p.y = this.terrain.groundY(p.x);
        p.falling = true; p.fallStart = p.y; p.vy = -70;
        this.lastKnockback = { player: i, dx, x: p.x };
      }
    }
    // Android v2 Tahap A — Ice (Elemental Beam): a hero damaged by a beam
    // is SLOWED for their next turn (half the walk steps, blue effect).
    if (opts.slow) {
      for (let i = 0; i < 2; i++) {
        const p = this.players[i];
        if (!p.alive || p.hp >= hpBefore[i]) continue;
        p.slowTurns = 1;
        this.lastSlow = { player: i, x: p.x };
        this._floater(p.x, p.y - 150, 'SLOWED', '#7ec8f7', 20);
        this._burst(p.x, p.y - 60, '#7ec8f7', 14);
        this.audio.slow();
      }
    }
    // Android v2 Tahap A — Lightning (Homing Orb): on impact, a small bolt
    // chains to any OTHER hero within 120px (30% of the main damage).
    if (opts.chain) {
      for (let i = 0; i < 2; i++) {
        if (i === opts.chainTarget) continue;
        const p = this.players[i];
        if (!p.alive) continue;
        const d = Math.hypot(p.x - x, (p.y - 40) - y);
        if (d > 120) continue;
        const chainDmg = Math.round(def.dmg * 0.3);
        this._damagePlayer(i, chainDmg, x, y, 'lightning');
        this.lastChain = { from: { x, y }, to: { x: p.x, y: p.y - 40 }, dmg: chainDmg };
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          pts.push([x + (p.x - x) * t + (k > 0 && k < 6 ? (Math.random() - 0.5) * 26 : 0),
                    y + ((p.y - 40) - y) * t + (k > 0 && k < 6 ? (Math.random() - 0.5) * 26 : 0)]);
        }
        this.lightningFx.push({ pts, t: 0, dur: 0.4 });
        this._floater(p.x, p.y - 150, `CHAIN ${chainDmg}!`, '#ffe08a', 18);
        this.audio.lightning();
      }
    }
    // Falling heroes: if their ground dropped away, they drop.
    for (const p of this.players) {
      if (!p.alive) continue;
      const gy = this.terrain.groundY(p.x);
      if (gy > p.y + 6) { p.falling = true; p.fallStart = p.y; p.vy = 0; }
    }
    // R4 — hit-stop: a Full Power blast, or any single blast dealing
    // >= HIT_STOP_BIG_DMG to the heroes, freezes the world briefly so the
    // hit lands heavy. (hpBefore was captured at the top of this call, so
    // nested blasts — barrels, combos — are measured on their own.)
    const dmgDealt = (hpBefore[0] - this.players[0].hp) + (hpBefore[1] - this.players[1].hp);
    if (opts.fullPower || dmgDealt >= HIT_STOP_BIG_DMG) this.triggerHitStop(opts.fullPower ? 'full' : 'big');
    void combo;
  }
  // v3.1 Skin Feature — themed explosion FX for one skin blast. Reuses the
  // existing particle system (_burst) + lightning FX; the `big` flag is the
  // Full Power (power 100) variant: more particles, more shake, bigger label.
  _skinBoomFx(x, y, R, theme, big = false) {
    const c = SKIN_THEMES[theme] || SKIN_THEMES.default;
    const n = big ? 2 : 1;
    this.lastSkinFx = { theme, big, x, y, t: this.time };
    const names = { dragon: '🐉 FIRE DRAGON!', ice: '❄ ICE CRYSTAL!', thunder: '⚡ THUNDER!', gold: '✨ GOLDEN GLORY!', dark: '🌑 DARK FLAME!', toxic: '☠ TOXIC!', holy: '😇 HOLY!', shadow: '👻 SHADOW!', cyber: '🤖 CYBER!', plasma: '🔮 PLASMA!', matter: '🌌 DARK MATTER!', lava: '🌋 LAVA!' };
    this._burst(x, y, c.boom, Math.round(R / 2) * n);
    this._burst(x, y, c.glow, Math.round(R / 3) * n);
    if (theme === 'thunder') {
      // Chain lightning: 3 bolts fan out from the blast (reuses lightningFx).
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k - 1) * 0.7;
        const tx = x + Math.cos(a) * (R + 60), ty = y + Math.sin(a) * (R + 60) - 40;
        const pts = [];
        for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([x + (tx - x) * t + (i > 0 && i < 6 ? (Math.random() - 0.5) * 30 : 0), y + (ty - y) * t + (i > 0 && i < 6 ? (Math.random() - 0.5) * 30 : 0)]); }
        this.lightningFx.push({ pts, t: 0, dur: 0.45 });
      }
      this.shake = Math.max(this.shake, big ? 16 : 10);
    } else if (theme === 'gold') {
      this.shake = Math.max(this.shake, big ? 14 : 8);
      this._burst(x, y, '#ffffff', Math.round(R / 4) * n);
    } else if (theme === 'dragon' || theme === 'lava') {
      this.shake = Math.max(this.shake, big ? 16 : 10);
      this._burst(x, y - 20, '#ff8c2f', Math.round(R / 3) * n);
    } else if (theme === 'dark' || theme === 'matter' || theme === 'shadow') {
      this._burst(x, y, '#3a2a5e', Math.round(R / 3) * n, true);
      this.shake = Math.max(this.shake, big ? 14 : 8);
    } else if (theme === 'ice') {
      this._burst(x, y, '#bfe9ff', Math.round(R / 3) * n);
    }
    if (names[theme]) this._floater(x, y - R - 30, names[theme], c.glow, big ? 26 : 20);
  }
  _burst(x, y, color, n, smoke = false) {
    // Android v2 Tahap B — particle cap from the graphics quality setting
    // (Low 40 / Medium 120 / High 250): stop spawning once the cap is hit.
    const cap = this.qualityCap().particles;
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= cap) break;
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * (smoke ? 60 : 260);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (smoke ? 40 : 80),
        life: 0, max: 0.5 + Math.random() * (smoke ? 0.9 : 0.5), color, size: smoke ? 8 + Math.random() * 10 : 3 + Math.random() * 6,
        grav: smoke ? -30 : 320, kind: smoke ? 'smoke' : 'circle' });
    }
  }
  // Android v2 Tahap B — ambient weather per arena (cheap drifting
  // particles, count limited by quality: none on Low, light on Medium,
  // full on High). Valley = snow, canyon = rising embers, temple = light
  // motes / petals. Spawns in combat AND in the menu demo backdrop.
  _spawnWeather(dt) {
    const q = this.qualityCap();
    if (q.weather === 0 || !this.arenaId || !this.terrain) return;
    this.weatherT -= dt;
    if (this.weatherT > 0) return;
    this.weatherT = q.weather === 1 ? 0.28 : 0.1;
    const cap = q.weather === 1 ? 30 : 80;
    let n = 0;
    for (const p of this.particles) if (p.weather) n++;
    if (n >= cap) return;
    const x = Math.random() * WORLD_W;
    if (this.arenaId === 'valley') {
      this.particles.push({ x, y: -10, vx: -12 - Math.random() * 18, vy: 26 + Math.random() * 26, life: 0, max: 14, color: '#ffffff', size: 2 + Math.random() * 2.5, grav: 0, kind: 'weather', weather: true, sway: Math.random() * 6.28 });
    } else if (this.arenaId === 'canyon') {
      this.particles.push({ x, y: H + 10, vx: (Math.random() - 0.5) * 24, vy: -34 - Math.random() * 40, life: 0, max: 9, color: Math.random() < 0.5 ? '#ff8c2f' : '#ffd76a', size: 2 + Math.random() * 2.5, grav: -14, kind: 'weather', weather: true, sway: Math.random() * 6.28 });
    } else {
      this.particles.push({ x, y: -10, vx: (Math.random() - 0.5) * 16, vy: 18 + Math.random() * 20, life: 0, max: 14, color: Math.random() < 0.5 ? '#ffd76a' : '#ffb3d9', size: 2 + Math.random() * 2.5, grav: 0, kind: 'weather', weather: true, sway: Math.random() * 6.28 });
    }
  }
  _floater(x, y, text, color, size = 20) { this.floaters.push({ x, y, text, color, size, t: 0, dur: 1.1 }); }
  setBanner(text, sub, dur = 2, color = '#ffd76a') { this.banner = { text, sub, t: 0, dur, color }; }

  // ------------------------------------------------------------ AI
  // v2: the AI telegraphs its shot — it picks a plan, shows its aim line +
  // muzzle flash for ~1s (so the enemy shot is visible coming), then fires.
  // Plans: 'shoot' | 'skill1' | 'ult' | 'heal' | 'trap' | 'teleport' | 'move'.
  // Android v2 Tahap A — terrain danger: is the AI standing next to a
  // cliff / hole (ground drops steeply within 70px on either side)?
  _aiTerrainDanger(p) {
    const gyHere = this.terrain.groundY(p.x);
    for (const dx of [-70, 70]) {
      if (this.terrain.groundY(p.x + dx) > gyHere + 50) return true;
    }
    return false;
  }
  _planAi() {
    const p = this.active(), foe = this.opponent();
    const diff = DIFFICULTY[this.campaignDiff || 'normal'];
    // Android v2 Tahap A — terrain-aware: standing at a crater's edge is
    // dangerous (a blast or a step could drop the AI in). Prefer walking
    // back toward the centre instead of shooting from the edge.
    if (this._aiTerrainDanger(p) && Math.random() < 0.75) {
      return { kind: 'move', dx: p.x < 1024 ? 100 : -100 };
    }
    if (p.energy >= 100 && Math.random() < 0.6) return { kind: 'ult' };
    if (this.aiUtils < 2) {
      if (p.hp <= 45 && p.energy >= HEAL_COST && Math.random() < 0.5) return { kind: 'heal' };
      if (p.energy >= TRAP_COST && !this.traps.some(t => t.owner === this.turn) && Math.random() < 0.25) return { kind: 'trap' };
      if (p.energy >= this.teleportCost(p) && (p.x < 300 || p.x > 1750) && Math.random() < 0.45) {
        return { kind: 'teleport', x: 500 + Math.random() * 1000 };
      }
      // Reposition: walk toward the centre when hugging an edge.
      if ((p.x < 300 || p.x > 1750) && Math.random() < 0.5) {
        return { kind: 'move', dx: p.x < 1024 ? 80 : -80 };
      }
    }
    if (p.energy >= 40 && Math.random() < diff.skillUse) return { kind: 'skill1' };
    if (p.hp < 35 && p.ammo.shield > 0 && Math.random() < 0.5) return { kind: 'shield' };
    // v2.1 — rare PASS: the AI occasionally skips a hopeless turn instead of
    // wasting a shot (kept rare — 4% — so it never looks passive).
    if (Math.random() < 0.04) return { kind: 'pass' };
    return { kind: 'shoot' };
  }
  // v3 — AI weapon pick: the hero's signature weapon by default; special
  // weapons only if the AI "owns" them for its difficulty (shop set).
  // Android v2 Tahap A — situational picks: far target + strong wind ->
  // the most wind-resistant weapon owned; low-HP target -> the hardest
  // hitter owned. Otherwise the old 30% random special pick.
  _aiPickWeapon(p) {
    const foe = this.opponent();
    const aiOwned = AI_SHOP_OWNED[this.campaignDiff || 'normal'] || [];
    const owned = WEAPON_ORDER.filter(id =>
      (FREE_WEAPONS.includes(id) || aiOwned.includes(id) || id === p.hero.basic.id) && p.ammo[id] > 0);
    const dist = Math.abs(foe.x - p.x);
    if (foe.hp <= 30 && owned.length) {
      return owned.reduce((best, id) => (WEAPONS[id].dmg > WEAPONS[best].dmg ? id : best), owned[0]);
    }
    if (dist > 700 && Math.abs(this.wind) >= 5 && owned.length) {
      return owned.reduce((best, id) =>
        (WEAPONS[id].windRes > WEAPONS[best].windRes ||
          (WEAPONS[id].windRes === WEAPONS[best].windRes && WEAPONS[id].dmg > WEAPONS[best].dmg) ? id : best), owned[0]);
    }
    let wid = p.hero.basic.id;
    const specials = ['meteor', 'homing', 'cluster', 'triple'].filter(id => p.ammo[id] > 0 && (FREE_WEAPONS.includes(id) || aiOwned.includes(id)));
    if (specials.length && Math.random() < 0.3) wid = specials[Math.floor(Math.random() * specials.length)];
    return wid;
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
    const wid = plan.wid || this._aiPickWeapon(p);
    this.selectedWeapon = wid;
    // Reuse the aim solved during the telegraph (what the player saw).
    const sol = plan.aim || solveShot({ x: p.x, y: p.y }, { x: foe.x, y: foe.y }, this.wind * 10, this.terrain, diff, WEAPONS[wid]);
    this.setAim(sol.angle, sol.power);
    this._fireWeapon(wid);
  }

  // ------------------------------------------------------------ game over
  _gameOver(winnerIdx) {
    this.phase = 'over'; this.winner = winnerIdx;
    this.banner = null; // clear any arena/turn banner behind the result screen
    this.players[winnerIdx].pose = 'victory';
    this.players[1 - winnerIdx].pose = 'defeat';
    // v3.1 P0 (B1) — in versus, the winner is the player who actually won:
    // the old `mode === 'versus' ? true` played the victory jingle (and
    // flagged the result "won") even when Player 2 won the duel. The
    // versus title in main.js already uses winnerName, so only the audio
    // and the won flag change here.
    const won = winnerIdx === 0;
    this.lastWon = won; // v3.1 P0 (B1) — exposed so the probe can verify the versus flag (audio itself is not audible headless)
    if (won) this.audio.victory(); else this.audio.defeat();
    // Android v2 Tahap B — the loser cries out; the Challenge verdict is
    // decided here (win the duel AND meet the condition = complete).
    this.audio.shout(this.players[1 - winnerIdx].hero.id);
    if (this.mode === 'challenge') {
      const met = !this.challengeFailed && (
        (this.challengeId === 'oneshot' && this.challengeShots <= 1) ||
        (this.challengeId === 'nomiss' && this.challengeMisses === 0) ||
        (this.challengeId === 'speedrun' && this.challengePlayerTurns <= SPEEDRUN_MAX_TURNS));
      this.challengeResult = (winnerIdx === 0 && met) ? 'complete' : 'failed';
      if (this.challengeResult === 'complete') { this.challengesDone.add(this.challengeId); this._saveChallengesDone(); }
    }
    // v3 — win credits: campaign +100, versus +50, training 0.
    // Android v2 Tahap B — survival pays +25 per wave won; a challenge pays
    // +50 only when the challenge itself is completed (a plain duel win in
    // challenge mode pays nothing extra).
    if (winnerIdx === 0) {
      if (this.mode === 'challenge') { if (this.challengeResult === 'complete') this.addCoins(WIN_CREDITS.challenge); }
      else this.addCoins(WIN_CREDITS[this.mode] ?? 50);
    }
    // v3.1 Skin Feature + R1/R2 — Gems breakdown (shown on the game-over
    // screen): damage + hits + win/loss bonus + win-streak bonus. Training
    // pays nothing and never touches the streak (no stakes); versus /
    // campaign / survival / challenge do. Streak: +1 per consecutive win,
    // reset to 0 on a loss. Rates live in config.js.
    this.lastGemBreakdown = null;
    if (this.mode !== 'training') {
      const dmg = this.stats.damage[0] || 0;
      const hits = this.stats.hits || 0;
      const damageGems = Math.floor(dmg / GEMS_PER_DAMAGE);
      const hitGems = hits * GEMS_PER_HIT;
      let bonus = GEMS_LOSS_BONUS, bonusLabel = 'Loss bonus', streakGems = 0;
      if (winnerIdx === 0) {
        this.streak += 1; this._saveStreak();
        bonus = GEMS_WIN_BONUS; bonusLabel = 'Win bonus';
        streakGems = this.streak * STREAK_BONUS_PER_WIN;
      } else {
        this.streak = 0; this._saveStreak();
      }
      const total = damageGems + hitGems + bonus + streakGems;
      this.lastGemBreakdown = { damage: dmg, damageGems, hits, hitGems, bonus, bonusLabel, streak: this.streak, streakGems, total, won: winnerIdx === 0 };
      this.addGems(total);
    }
    this.state = 'over';
    if (this.ui.onGameOver) this.ui.onGameOver({
      winnerIdx, won, mode: this.mode,
      campaignIndex: this.campaignIndex,
      survivalWave: this.survivalWave, survivalBest: this.survivalBest,
      challengeId: this.challengeId, challengeResult: this.challengeResult,
      challengeFailReason: this.challengeFailReason,
      stats: { turns: this.stats.turns, damage: [...this.stats.damage], combos: this.stats.combos, hits: this.stats.hits },
      gemBreakdown: this.lastGemBreakdown,
      winnerName: this.players[winnerIdx].name,
      winnerHero: this.players[winnerIdx].hero,
    });
  }

  // v3 — fall death: a hero whose ground was blasted clean through falls
  // into the abyss and dies (no fall damage — death). Works for both sides.
  _fallDeath(p) {
    if (!p.alive) return;
    p.alive = false; p.falling = false; p.pose = 'defeat';
    this._floater(p.x, H - 180, 'FELL!', '#ff5a4e', 26);
    this.setBanner('💀 FELL INTO THE ABYSS!', `${p.hero.name} fell through the shattered ground!`, 2.2, '#ff5a4e');
    this.audio.fall();
    this.fellDeath = true; // persistent flag (the banner is replaced by the game-over banner)
    // Let the resolving delay play out (0.85s) so the FELL banner is readable
    // before the game-over screen takes over.
    if (this.phase === 'aim') { this.phase = 'resolving'; this.phaseT = 0; }
  }

  // ------------------------------------------------------------ update
  update(dt) {
    // R4 — hit-stop: while the freeze lasts, NOTHING advances (timer, AI,
    // particles, banners, camera) — the render loop keeps drawing the
    // frozen frame, so the impact reads as weight. The freeze is at most
    // ~0.17s and only ever fires during flying/resolving, never in 'aim'.
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    this.time += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    // Android v2 Tahap A — animated turn banner + lightning FX lifetimes.
    if (this.turnBanner) { this.turnBanner.t += dt; if (this.turnBanner.t > this.turnBanner.dur) this.turnBanner = null; }
    for (const fx of this.lightningFx) fx.t += dt;
    this.lightningFx = this.lightningFx.filter(fx => fx.t < fx.dur);
    for (const p of this.players) if (p.walkT > 0) p.walkT -= dt;
    // v2.1: emote bubble lifetime.
    if (this.emoteBubble) { this.emoteBubble.t += dt; if (this.emoteBubble.t > this.emoteBubble.dur) this.emoteBubble = null; }
    this.shake = Math.max(0, this.shake - dt * 26);
    // Android v2 Tahap B — shake cap from the quality setting (Low = no big shake).
    this.shake = Math.min(this.shake, this.qualityCap().shakeMax);
    for (const pt of this.particles) {
      pt.life += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += pt.grav * dt;
      // Android v2 Tahap B — weather particles sway gently side to side.
      if (pt.kind === 'weather') pt.x += Math.sin(this.time * 1.5 + (pt.sway || 0)) * 14 * dt;
    }
    this.particles = this.particles.filter(p => p.life < p.max);
    this._spawnWeather(dt);
    for (const f of this.floaters) { f.t += dt; f.y -= 34 * dt; }
    this.floaters = this.floaters.filter(f => f.t < f.dur);
    for (const p of this.players) { if (p.poseT > 0) { p.poseT -= dt; if (p.poseT <= 0 && p.alive) p.pose = this.phase === 'aim' && this.players[this.turn] === p ? 'aim' : 'idle'; } }
    if (this.state !== 'combat') return;
    // v3 — camera: follow the active hero while aiming, the projectile
    // while it flies, across the wider world. Smooth lerp, clamped.
    {
      const focusX = (this.phase === 'flying' && this.projectiles.length)
        ? this.projectiles.reduce((s, pr) => s + pr.x, 0) / this.projectiles.length
        : this.active().x;
      const target = clamp(focusX - W / 2, 0, WORLD_W - W);
      this.camX += (target - this.camX) * Math.min(1, dt * 5);
      if (!Number.isFinite(this.camX)) this.camX = 0;
    }
    // Falling heroes.
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.falling) {
        p.vy += GRAVITY * dt; p.y += p.vy * dt;
        const gy = this.terrain.groundY(p.x);
        // v3 — fall death: if the ground was blasted clean through (no
        // terrain column left), the hero keeps falling into the abyss.
        if (gy >= H - 2) {
          if (p.y > H + 80) this._fallDeath(p);
          continue;
        }
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
      if (this.turnTimer <= 0) {
        this.setBanner('TIME UP!', `${this.active().name} loses the turn`, 1.4);
        // R3 — a lost turn still costs a standard turn's worth of time.
        this.pendingDelay = { actor: this.turn, cost: DELAY_BASE, label: 'Time up' };
        this.nextTurn(); return;
      }
      const p = this.active();
      // v3 — hold-to-charge: while Space is held, power ramps toward 100.
      if (this.charging && !p.ai) {
        this.chargeT += dt;
        this.aim.power = Math.min(FULL_POWER, this.aim.power + dt * 70);
      }
      // v3 — POW flames: at power 100 the hero burns with fire.
      // Android v2 Tahap B — capped by the quality setting like _burst.
      if (this.aim.power >= FULL_POWER && this.particles.length < this.qualityCap().particles && Math.random() < 0.6) {
        this.particles.push({ x: p.x + (Math.random() - 0.5) * 90, y: p.y - 20 - Math.random() * 90,
          vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 60, life: 0, max: 0.5 + Math.random() * 0.3,
          color: Math.random() < 0.5 ? '#ff8c2f' : '#ffd76a', size: 3 + Math.random() * 5, grav: -120, kind: 'circle' });
      }
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
              // v3 — solve with the weapon the AI will actually fire.
              const wid = plan.kind === 'shoot' ? this._aiPickWeapon(p) : p.hero.basic.id;
              plan.wid = wid;
              const sol = plan.kind === 'shoot'
                ? solveShot({ x: p.x, y: p.y }, { x: this.opponent().x, y: this.opponent().y }, this.wind * 10, this.terrain, diff, WEAPONS[wid])
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
      // v3 — per-weapon physics: heavy shots fall faster, wind-resistant
      // shots barely drift. Beam ignores gravity (weight 0) and wind.
      for (const pr of this.projectiles) {
        if (pr.dead) continue;
        pr.t += dt;
        // Hard lifetime cap: no projectile may stall the turn forever
        // (e.g. a homing orb circling its target). It bursts in place.
        if (pr.t > 5) { this._resolveHit(pr, null, 'timeout'); continue; }
        const step = dt;
        const windAcc = this.wind * 10 * 1.2 * (1 - (pr.windRes ?? 0));
        pr.vx += windAcc * step;
        if (pr.kind === 'homing') {
          const foe = this.players[1 - pr.owner];
          const tx = foe.x - pr.x, ty = (foe.y - 40) - pr.y, d = Math.hypot(tx, ty) || 1;
          const sp = Math.hypot(pr.vx, pr.vy) || 1, turn = 2.4 * step;
          pr.vx += ((tx / d) * sp - pr.vx) * turn;
          pr.vy += ((ty / d) * sp - pr.vy) * turn;
        }
        if (pr.kind !== 'beam') pr.vy += GRAVITY * (pr.weight ?? 1) * step;
        pr.x += pr.vx * step; pr.y += pr.vy * step;
        pr.trail.push([pr.x, pr.y]); if (pr.trail.length > 18) pr.trail.shift();
        // Trail sparkles. Android v2 Tahap B — capped by quality.
        if (this.particles.length < this.qualityCap().particles && Math.random() < 0.5) this.particles.push({ x: pr.x, y: pr.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0, max: 0.35, color: pr.kind === 'arcane' ? '#c9a7ff' : '#ffb347', size: 2.5, grav: 0, kind: 'circle' });
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
          if (dx * dx + dy * dy < CHAR_HIT_R * CHAR_HIT_R) { this._resolveHit(pr, tgt, 'char'); break; }
        }
        if (pr.dead) continue;
        if (pr.x < -60 || pr.x > WORLD_W + 60 || pr.y > H + 60) { pr.dead = true; continue; }
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
      const pr = { x, y, vx, vy, angle: 0, power: 0, kind, weapon, owner: pd.owner, elem: elem || null, t: 0, dead: false, trail: [], subSpawned: false, weight: 1, windRes: 0, skinTheme: pd.skinTheme || 'default' };
      if (pd.fpMove) { pr.fullPowerMove = pd.fpMove; pr.fullPower = true; }
      this.projectiles.push(pr);
    };
    if (pd.kind === 'meteor' || pd.kind === 'bigbomb') {
      const big = pd.kind === 'bigbomb';
      mk('ball', pd.x + (Math.random() * 30 - 15), pd.y, 0, 60, big ? 'meteor' : 'meteor', 'fire');
      const pr = this.projectiles[this.projectiles.length - 1];
      pr.vx = 0; pr.vy = 60; pr.meteorBig = big;
    } else if (pd.kind === 'fireball') {
      mk('ball', pd.x, pd.y, (Math.random() - 0.5) * 40, 50, 'meteor', 'fire');
    } else if (pd.kind === 'cluster') {
      // v3 — FULL POWER Cluster Storm: clusters fall and split into bomblets.
      mk('cluster', pd.x, pd.y, (Math.random() - 0.5) * 30, 50, 'cluster', null);
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
        this.projectiles.push({ x: pr.x, y: pr.y, vx: Math.cos(a) * (120 + Math.random() * 120), vy: Math.sin(a) * 160, angle: 0, power: 0, kind: 'bomblet', weapon: 'cluster', owner: pr.owner, elem: null, t: 0, dead: false, trail: [], subSpawned: true, skinTheme: pr.skinTheme || 'default' });
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
    // v3 — FULL POWER move: each weapon's own special stats replace the base.
    const fpMove = pr.fullPowerMove || (pr.fpMove ?? null);
    if (fpMove) {
      def.dmg = fpMove.dmg; def.radius = fpMove.radius;
      if (fpMove.elem) def.elem = fpMove.elem;
    }
    if (how === 'char' && target) {
      // Direct hit: full damage at the target point, plus blast.
      // Android v2 Tahap A — beam slows, homing chains (see explode()).
      const tgtIdx = this.players.indexOf(target);
      this.explode(pr.x, pr.y, { dmg: def.dmg, radius: def.radius, elem: def.elem }, pr.owner,
        { slow: pr.weapon === 'beam', chain: pr.weapon === 'homing', chainTarget: tgtIdx, skinTheme: pr.skinTheme, fullPowerSkin: !!(pr.fullPower && pr.skinTheme && pr.skinTheme !== 'default'), fullPower: !!pr.fullPower });
      // v3 — quake moves shatter the ground where they land.
      if (fpMove && fpMove.effect === 'quake') {
        this.terrain.crater(pr.x, this.terrain.groundY(pr.x), def.radius * 1.2);
        this.shake = Math.max(this.shake, 16);
      }
    } else {
      // v2.1: a blast that hurts nobody shows a floating MISS.
      const hpBefore = this.players.map(p => p.hp);
      const shBefore = this.players.map(p => p.shield);
      this.explode(pr.x, pr.y, def, pr.owner, { noCrater: pr.kind === 'beam', slow: pr.weapon === 'beam', chain: pr.weapon === 'homing', chainTarget: -1, skinTheme: pr.skinTheme, fullPowerSkin: !!(pr.fullPower && pr.skinTheme && pr.skinTheme !== 'default'), fullPower: !!pr.fullPower });
      if (fpMove && fpMove.effect === 'quake') {
        this.terrain.crater(pr.x, this.terrain.groundY(pr.x), def.radius * 1.2);
        this.shake = Math.max(this.shake, 16);
      }
      const hurtAnyone = this.players.some((p, i) => p.hp < hpBefore[i] || p.shield < shBefore[i]);
      if (!hurtAnyone) this._floater(pr.x, pr.y - 40, 'MISS', '#d8d8d8', 18);
      // Android v2 Tahap B — No Miss: a player shot that hurts nobody
      // ends the challenge (the MISS floater is the visible signal).
      if (!hurtAnyone && pr.owner === 0 && this.mode === 'challenge' && this.challengeId === 'nomiss') {
        this.challengeMisses++;
        this.failChallenge('A shot missed completely');
      }
    }
  }

  // Trajectory preview for the current aim (dots until terrain/char).
  // v3 — simulates with the selected weapon's own weight + wind resistance,
  // so the preview matches the real shot. Toggle with V (default ON).
  previewPoints() {
    if (this.state !== 'combat' || this.phase !== 'aim' || !this.showPreview) return [];
    const p = this.active();
    const m = this._muzzle(p);
    const w = WEAPONS[this.selectedWeapon];
    const opts = { terrain: this.terrain, chars: this.players.filter(pl => pl.alive).map(pl => ({ x: pl.x, y: pl.y, r: CHAR_HIT_R })),
      gravityMul: w ? (w.weight ?? 1) : 1, windMul: w ? (1 - (w.windRes ?? 0)) : 1 };
    // Android v2 Tahap A — a homing preview must steer like a homing shot
    // (same flags as the live flight), or preview != actual by design.
    if (w && w.kind === 'homing') { opts.homing = true; opts.target = { x: this.opponent().x, y: this.opponent().y }; }
    if (w && w.kind === 'beam') opts.noGravity = true; // weight 0 already zeroes it; explicit for clarity
    const sim = simulateShot(m.x, m.y, this.worldAngle(), this.aim.power * POWER_VEL * (w ? w.speed : 1), this.wind * 10, opts);
    return sim.points.filter((_, i) => i % 3 === 0).slice(0, 26);
  }
}
