// ARCANE DUEL — all canvas rendering: arena, terrain, heroes, HUD, effects.
import { W, WORLD_W, H, WEAPONS, WEAPON_ORDER, ARENAS, FULL_POWER, HERO_SCALE, SKIN_THEMES } from './config.js';

const SPRITES = {};
const SPRITE_LIST = [];
// Filled by main.js via loadAssets().
export function imageFor(name) { return SPRITES[name] || null; }
export function loadAssets() {
  const heroes = ['kairo', 'nyx', 'bront', 'kumbang', 'momok', 'tawon']; // v3: +3 monsters
  const poses = ['idle_0', 'idle_1', 'aim', 'fire', 'hit', 'victory', 'defeat'];
  for (const h of heroes) for (const p of poses) SPRITE_LIST.push(`${h}_${p}`);
  for (const h of heroes) SPRITE_LIST.push(`portrait_${h}`);
  SPRITE_LIST.push('proj_cannon', 'proj_fire', 'proj_moon', 'proj_boulder', 'proj_homing', 'proj_pierce',
    'proj_cluster', 'proj_beam', 'proj_meteor', 'proj_astral', 'proj_shield',
    'expl_0', 'expl_1', 'expl_2', 'arcane_zone', 'spark', 'trap_totem',
    'decor_crystal_blue', 'decor_crystal_pink', 'decor_crystal_gold', 'decor_pillar', 'decor_cloud',
    'decor_grass', 'decor_flower', 'decor_crate', 'decor_barrel', 'decor_moon', 'decor_torch');
  return Promise.all(SPRITE_LIST.map(n => new Promise(res => {
    const img = new Image();
    img.onload = () => { SPRITES[n] = img; res(); };
    img.onerror = () => { res(); };
    img.src = `assets/${n}.png`;
  })));
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function bar(ctx, x, y, w, h, frac, fill, bg = 'rgba(0,0,0,0.55)', border = 'rgba(255,255,255,0.75)') {
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  if (frac > 0) { rr(ctx, x + 2, y + 2, Math.max(h - 4, (w - 4) * Math.min(1, frac)), h - 4, (h - 4) / 2); ctx.fillStyle = fill; ctx.fill(); }
  rr(ctx, x, y, w, h, h / 2); ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.stroke();
}
function text(ctx, s, x, y, size, color, align = 'left', weight = 'bold', font = 'Trebuchet MS') {
  ctx.font = `${weight} ${size}px ${font}, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,10,30,0.8)'; ctx.strokeText(s, x, y);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

export class Renderer {
  constructor(ctx) { this.ctx = ctx; this.uiRegions = { weapons: [], skills: [] }; this.bgCache = {}; }
  draw(game, now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    // Screen-space sky fill FIRST so a cinematic zoom never leaves bare edges.
    // Android v2 Tahap B — the sky gradient is cached per arena instead of
    // rebuilt every frame (same coords every frame, so caching is safe).
    if (game.arenaId) {
      const arena0 = ARENAS[game.arenaId];
      let g0 = this.bgCache['sky-' + game.arenaId];
      if (!g0) {
        g0 = ctx.createLinearGradient(0, 0, 0, H);
        g0.addColorStop(0, arena0.sky[0]); g0.addColorStop(0.55, arena0.sky[1]); g0.addColorStop(1, arena0.sky[2]);
        this.bgCache['sky-' + game.arenaId] = g0;
      }
      ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    }
    // Cinematic zoom + shake (zoom centres on the midpoint of the duel so
    // both heroes stay in frame).
    let zx = 1, zy = 1, ox = 0, oy = 0;
    if (game.cine) { const s = 1.08; const fx = (game.players[0].x + game.players[1].x) / 2, fy = 430; zx = s; ox = W / 2 - fx * s; oy = H / 2 - fy * s; }
    // Android v2 Tahap A — zoom-out camera: the whole 2048px arena at
    // 0.62x, centred, so both heroes are always visible at once.
    else if (game.camMode === 'zoomout') { zx = 0.62; zy = 0.62; ox = (W - WORLD_W * 0.62) / 2; oy = (H - H * 0.62) / 2; }
    // v3 — the world camera lives in game.camX (scrolls across the wider
    // map, following the hero / projectile). During flight we only add a
    // gentle zoom; the position comes from camX, not from a second offset.
    else if (game.phase === 'flying' && game.projectiles.length) { zx = 1.06; zy = 1.06; }
    // v3 — apply the world camera (ignored during cinematics, which centre
    // themselves). camX is in world px; the translate runs pre-scale.
    // Zoom-out mode has its own centring above, so camX stays 0 there.
    const cam = (game.cine || game.camMode === 'zoomout') ? 0 : (game.camX || 0);
    ox -= cam * zx;
    if (game.shake > 0.5) { ox += (Math.random() - 0.5) * game.shake; oy += (Math.random() - 0.5) * game.shake; }
    ctx.translate(ox, oy); ctx.scale(zx, zy);
    this._background(game, now);
    this._terrain(game);
    this._zones(game, now);
    this._crates(game);
    this._traps(game, now);
    this._heroes(game, now);
    this._projectiles(game);
    this._lightning(game);
    this._particles(game);
    this._preview(game);
    this._floaters(game);
    ctx.restore();
    if (game.state === 'combat' || game.state === 'pause' || game.state === 'over') this._hud(game, now);
    if (game.banner) this._banner(game);
    if (game.turnBanner) this._turnBanner(game);
    // Android v2 Tahap B — FPS readout (only with ?fps=1, never on by default).
    if (game.showFps && game.fps) text(ctx, `FPS ${Math.round(game.fps)}`, W - 16, H - 6, 13, '#7ec8f7', 'right');
  }
  // Android v2 Tahap A — chain-lightning bolts (jagged polylines).
  _lightning(game) {
    const ctx = this.ctx;
    for (const fx of game.lightningFx) {
      const a = 1 - fx.t / fx.dur;
      ctx.globalAlpha = Math.max(0, a);
      ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3; ctx.beginPath();
      fx.pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _background(game, now) {
    const ctx = this.ctx;
    const arena = ARENAS[game.arenaId || 'valley'];
    // Android v2 Tahap B — the background sky gradient is cached per arena
    // (same user-space coords every frame). The camera used here MUST match
    // the one draw() computed (0 during cinematics / zoom-out).
    let g = this.bgCache['bg-' + (game.arenaId || 'valley')];
    if (!g) {
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, arena.sky[0]); g.addColorStop(0.55, arena.sky[1]); g.addColorStop(1, arena.sky[2]);
      this.bgCache['bg-' + (game.arenaId || 'valley')] = g;
    }
    ctx.fillStyle = g; ctx.fillRect(-40, -40, WORLD_W + 80, H + 80);
    // Android v2 Tahap B — parallax: far layers are drawn at world x +
    // cam * (1 - factor), so on screen they move SLOWER than the world
    // (clouds 0.3x, ruins 0.5x, moon 0.15x). Exposed as renderer.parallax
    // so the probe can verify the offsets actually change with camX.
    const cam = (game.cine || game.camMode === 'zoomout') ? 0 : (game.camX || 0);
    this.parallax = { cloud: cam * 0.7, ruins: cam * 0.5, moon: cam * 0.85 };
    // Moon / sun.
    const moon = imageFor('decor_moon');
    if (moon && game.arenaId !== 'canyon') ctx.drawImage(moon, 1050 + this.parallax.moon, 46, 128, 128);
    if (game.arenaId === 'canyon') {
      let lg = this.bgCache['lava'];
      if (!lg) {
        lg = ctx.createRadialGradient(640, 700, 60, 640, 700, 700);
        lg.addColorStop(0, 'rgba(255,110,30,0.55)'); lg.addColorStop(1, 'rgba(255,110,30,0)');
        this.bgCache['lava'] = lg;
      }
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    }
    // Drifting clouds.
    const cloud = imageFor('decor_cloud');
    if (cloud) {
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 360 + now * (6 + i * 2) + this.parallax.cloud) % (WORLD_W + 320)) - 160;
        ctx.globalAlpha = 0.5; ctx.drawImage(cloud, cx, 60 + (i % 4) * 42, 160, 64); ctx.globalAlpha = 1;
      }
    }
    // Far ruin silhouettes (parallax layer).
    ctx.fillStyle = arena.far; ctx.globalAlpha = 0.55;
    for (let i = 0; i < 11; i++) {
      const bx = i * 190 + 30 + this.parallax.ruins, bw = 60 + (i % 3) * 26, bh = 150 + ((i * 53) % 120);
      ctx.fillRect(bx, 560 - bh, bw, bh);
      ctx.beginPath(); ctx.moveTo(bx - 8, 560 - bh); ctx.lineTo(bx + bw / 2, 560 - bh - 34); ctx.lineTo(bx + bw + 8, 560 - bh); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Arena decor: crystals / lava rocks / temple pillars along the ground.
    const t = game.terrain;
    if (t) {
      const spots = [140, 420, 700, 980, 1260, 1540, 1820];
      for (let i = 0; i < spots.length; i++) {
        const x = spots[i], gy = t.groundY(x);
        if (arena.decor === 'crystal') {
          const img = imageFor(['decor_crystal_blue', 'decor_crystal_pink', 'decor_crystal_gold'][i % 3]);
          if (img) ctx.drawImage(img, x - 26, gy - 78, 52, 52);
        } else if (arena.decor === 'lava') {
          const torch = imageFor('decor_torch');
          if (torch && i % 2 === 0) ctx.drawImage(torch, x - 14, gy - 76, 28, 76);
          ctx.fillStyle = 'rgba(255,120,30,0.85)';
          ctx.beginPath(); ctx.ellipse(x, gy - 4, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          const pil = imageFor('decor_pillar');
          if (pil && i % 2 === 1) ctx.drawImage(pil, x - 20, gy - 150, 40, 150);
        }
      }
      // Grass tufts + flowers.
      const grass = imageFor('decor_grass'), flower = imageFor('decor_flower');
      for (let x = 40; x < WORLD_W; x += 90) {
        const gy = t.groundY(x);
        if (grass) ctx.drawImage(grass, x, gy - 22, 30, 22);
        if (flower && x % 270 === 40) ctx.drawImage(flower, x + 24, gy - 20, 20, 20);
      }
    }
  }
  _terrain(game) {
    const ctx = this.ctx, t = game.terrain;
    if (!t) return;
    const a = t.arena;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x < WORLD_W; x += 4) ctx.lineTo(x, t.h[x]);
    ctx.lineTo(WORLD_W, H); ctx.closePath();
    ctx.fillStyle = a.ground; ctx.fill();
    // Top grassy/stone rim + speckles.
    ctx.beginPath();
    for (let x = 0; x < WORLD_W; x += 4) { const y = t.h[x]; ctx.moveTo(x, y); ctx.lineTo(x + 4, y); }
    ctx.strokeStyle = a.groundL; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = a.groundD;
    for (let x = 12; x < WORLD_W; x += 47) { const y = t.groundY(x) + 18 + ((x * 7) % 26); ctx.fillRect(x, y, 14, 8); }
    // Lava pool at the very bottom in Ember Canyon.
    if (game.arenaId === 'canyon') {
      ctx.fillStyle = '#ff5a1a';
      ctx.beginPath(); ctx.moveTo(0, 700);
      for (let x = 0; x <= WORLD_W; x += 20) ctx.lineTo(x, 700 + Math.sin(x * 0.02 + game.time * 2) * 3);
      ctx.lineTo(WORLD_W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd76a';
      for (let x = 30; x < WORLD_W; x += 110) { ctx.beginPath(); ctx.ellipse(x, 708, 16, 4, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  _zones(game, now) {
    const ctx = this.ctx;
    for (const z of game.zones) {
      const img = imageFor('arcane_zone');
      const pulse = 1 + Math.sin(now * 4) * 0.08;
      if (img) { ctx.globalAlpha = 0.75; ctx.drawImage(img, z.x - 64 * pulse, z.y - 40, 128 * pulse, 64); ctx.globalAlpha = 1; }
      text(ctx, 'ARCANE', z.x, z.y - 46, 11, '#d9b8ff', 'center');
    }
  }
  _traps(game, now) {
    const ctx = this.ctx;
    for (const t of game.traps) {
      const pulse = 1 + Math.sin(now * 5) * 0.12;
      const img = imageFor('trap_totem');
      // Pulsing reflect field.
      ctx.beginPath(); ctx.arc(t.x, t.y - 40, 48 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(80,220,240,0.65)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(t.x, t.y - 40, 48 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(80,220,240,0.08)'; ctx.fill();
      if (img) ctx.drawImage(img, t.x - 32, t.y - 96, 64, 96);
      text(ctx, 'REFLECT', t.x, t.y - 108, 11, '#50dcf0', 'center');
    }
    // v2 — teleport targeting: show the range circle + hint while armed.
    if (game.teleportMode) {
      const p = game.active();
      ctx.beginPath(); ctx.arc(p.x, p.y - 60, 420, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(201,167,255,0.5)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, 'CLICK A SPOT TO TELEPORT  (Esc cancels)', p.x, p.y - 200, 14, '#c9a7ff', 'center');
    }
  }
  _crates(game) {
    const ctx = this.ctx;
    for (const c of game.crates) {
      const img = imageFor(c.kind === 'crate' ? 'decor_crate' : 'decor_barrel');
      const bob = c.landed ? 0 : Math.sin(game.time * 6) * 3;
      if (img) ctx.drawImage(img, c.x - 24, c.y - 24 + bob, 48, 48);
      else { ctx.fillStyle = c.kind === 'crate' ? '#caa96a' : '#c73e0a'; ctx.fillRect(c.x - 20, c.y - 20, 40, 40); }
    }
  }
  _heroes(game, now) {
    const ctx = this.ctx;
    for (const p of game.players) {
      if (!p.alive && p.pose !== 'defeat') continue;
      const pose = p.pose === 'idle' && this._idleFrame(now) ? 'idle_1' : p.pose === 'idle' ? 'idle_0' : p.pose;
      const img = imageFor(`${p.hero.id}_${pose}`) || imageFor(`${p.hero.id}_idle_0`);
      // Android v2 Tahap A — procedural walk/fall animation (no new
      // sprites): walking bobs + leans forward, falling tilts sideways.
      const walking = p.walkT > 0 && !p.falling;
      const bob = p.pose === 'idle' ? Math.sin(now * 2 + p.x) * 2 : walking ? Math.sin(now * 14) * 4 : 0;
      const tilt = p.falling ? 0.28 * p.facing : walking ? 0.07 * p.facing : 0;
      // v3.1 Skin Feature — heroes are HERO_SCALE of their old size so the
      // map reads wider (Bomb Heroes 2 style). All accessories scale with
      // the sprite; the hit circle (CHAR_HIT_R=36) does NOT change.
      const S = HERO_SCALE;
      const spriteTop = p.y - 140 * S; // top of the shrunken sprite
      ctx.save();
      ctx.translate(p.x, p.y - 140 * S + bob);
      if (tilt) ctx.rotate(tilt);
      if (p.facing === -1) ctx.scale(-1, 1);
      if (img) ctx.drawImage(img, -60 * S, 0, 120 * S, 150 * S);
      else { ctx.fillStyle = p.hero.color; ctx.fillRect(-30 * S, -90 * S, 60 * S, 90 * S); }
      ctx.restore();
      // v3.1 Skin Feature — SMALL power bar above the active hero (the big
      // vertical slider is gone; power still needs to be visible while
      // aiming, and it lives next to the hero who is shooting).
      if (game.state === 'combat' && game.phase === 'aim' && game.players[game.turn] === p) {
        const pw = game.aim.power / 100;
        game.lastPowerBar = { x: p.x - 28, y: spriteTop - 30, w: 56, h: 6, power: Math.round(game.aim.power) };
        bar(ctx, p.x - 28, spriteTop - 30, 56, 6, pw, game.aim.power >= FULL_POWER ? '#ffd76a' : '#ff7a2f');
        text(ctx, `${Math.round(game.aim.power)}`, p.x + 34, spriteTop - 27, 11, '#fff', 'left');
      }
      // Android v2 Tahap A — SLOWED (beam ice): blue ring + label.
      if (p.slowTurns > 0) {
        ctx.strokeStyle = 'rgba(126,200,247,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 50, 45, 55, 0, 0, Math.PI * 2); ctx.stroke();
        text(ctx, 'SLOWED', p.x, p.y - 134, 11, '#7ec8f7', 'center');
      }
      // Shield bubble.
      if (p.shield > 0) {
        const sh = imageFor('proj_shield');
        ctx.globalAlpha = 0.85;
        if (sh) ctx.drawImage(sh, p.x - 42, p.y - 108, 84, 84);
        ctx.globalAlpha = 1;
      }
      // v2 — elite boss: gold crown + dark aura so it reads as the final boss.
      if (p.elite) {
        ctx.fillStyle = 'rgba(120,20,20,0.25)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 50, 48, 56, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd76a'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 19, p.y - 128); ctx.lineTo(p.x - 19, p.y - 143); ctx.lineTo(p.x - 9, p.y - 134);
        ctx.lineTo(p.x, p.y - 145); ctx.lineTo(p.x + 9, p.y - 134); ctx.lineTo(p.x + 19, p.y - 143);
        ctx.lineTo(p.x + 19, p.y - 128); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff5a4e';
        ctx.beginPath(); ctx.arc(p.x, p.y - 135, 3, 0, Math.PI * 2); ctx.fill();
      }
      // Name tag.
      text(ctx, `${p.hero.name}`, p.x, spriteTop - 13, 13, '#ffffff', 'center');
      // v2.1 — emote bubble above the hero who emoted (visual only).
      if (game.emoteBubble && game.emoteBubble.player === game.players.indexOf(p)) {
        const ey = spriteTop - 40;
        ctx.beginPath(); ctx.arc(p.x, ey, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
        ctx.strokeStyle = 'rgba(10,10,30,0.6)'; ctx.lineWidth = 2; ctx.stroke();
        text(ctx, game.emoteBubble.emoji, p.x, ey + 1, 20, '#222', 'center');
      }
      // Falling indicator.
      if (p.falling) text(ctx, '!', p.x, spriteTop - 25, 22, '#ffd76a', 'center');
    }
  }
  _idleFrame(now) { return Math.floor(now * 1.6) % 2 === 1; }
  _projectiles(game) {
    const ctx = this.ctx;
    for (const pr of game.projectiles) {
      // A poisoned projectile must never throw inside draw (Nov 2026).
      if (!Number.isFinite(pr.x) || !Number.isFinite(pr.y)) continue;
      const isEnemy = game.players[pr.owner] && game.players[pr.owner].ai;
      // v3.1 Skin Feature — a skinned projectile glows + trails in its skin's
      // palette (cosmetic only; the flight physics never change).
      const skinC = (pr.skinTheme && pr.skinTheme !== 'default') ? SKIN_THEMES[pr.skinTheme] : null;
      const glowColor = skinC ? skinC.glow : pr.fullPower ? '#ffd76a' : pr.elem === 'arcane' ? '#c9a7ff' : pr.elem === 'fire' ? '#ff8c2f' : '#ffb347';
      // v2 — glowing halo so every shot (especially the enemy's) is visible.
      // Android v2 Tahap B — the halo gradient is cached per colour/size
      // (centred on 0,0, drawn after a translate) instead of rebuilt per
      // projectile per frame.
      const haloR = pr.fullPower ? 64 : 44;
      const haloKey = 'halo-' + glowColor + '-' + haloR;
      let halo = this.bgCache[haloKey];
      if (!halo) {
        halo = ctx.createRadialGradient(0, 0, 4, 0, 0, haloR);
        halo.addColorStop(0, glowColor); halo.addColorStop(1, 'rgba(255,255,255,0)');
        this.bgCache[haloKey] = halo;
      }
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.globalAlpha = 0.55; ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0, 0, haloR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Trail.
      ctx.strokeStyle = skinC ? skinC.trail : pr.elem === 'arcane' ? 'rgba(192,140,255,0.8)' : pr.elem === 'fire' ? 'rgba(255,140,50,0.8)' : pr.fullPower ? 'rgba(255,215,106,0.9)' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = pr.fullPower ? 7 : 5; ctx.beginPath();
      pr.trail.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      const spr = { cannon: 'proj_cannon', ball: 'proj_cannon', meteor: 'proj_meteor', fireball: 'proj_fire',
        arcane: 'proj_moon', starbolt: 'proj_astral', boulder: 'proj_boulder', homing: 'proj_homing',
        pierce: 'proj_pierce', cluster: 'proj_cluster', bomblet: 'proj_cluster', beam: 'proj_beam' }[pr.kind] || 'proj_cannon';
      const img = imageFor(spr);
      const size = spr === 'proj_meteor' ? 72 : pr.fullPower ? 66 : 44;
      if (img) {
        ctx.save(); ctx.translate(pr.x, pr.y);
        ctx.rotate(Math.atan2(pr.vy, pr.vx));
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 8, 0, Math.PI * 2); ctx.fill(); }
      // v3.1 Skin Feature — a thin ring in the skin's colour marks a skinned shot.
      if (skinC) {
        ctx.beginPath(); ctx.arc(pr.x, pr.y, size / 2 + 4, 0, Math.PI * 2);
        ctx.strokeStyle = skinC.proj; ctx.lineWidth = 3; ctx.stroke();
      }
      // v2 — enemy shots get a pulsing red ring so the eye finds them instantly.
      if (isEnemy) {
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 30 + Math.sin(game.time * 10) * 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,90,78,0.9)'; ctx.lineWidth = 3; ctx.stroke();
      }
      if (pr.fullPower) {
        text(ctx, 'FULL POWER!', pr.x, pr.y - 44, 13, '#ffd76a', 'center');
      }
    }
  }
  _particles(game) {
    const ctx = this.ctx;
    for (const pt of game.particles) {
      const a = 1 - pt.life / pt.max;
      // Android v2 Tahap B — weather motes are soft (half alpha).
      ctx.globalAlpha = pt.kind === 'weather' ? Math.max(0, a) * 0.55 : Math.max(0, a);
      if (pt.kind === 'smoke') { ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1 + pt.life), 0, Math.PI * 2); ctx.fill(); }
      else { ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * a + 1, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  _preview(game) {
    const ctx = this.ctx;
    if (game.state !== 'combat' || game.phase !== 'aim' || !game.showPreview) return;
    // v3 — aim fan (Worms-style arc, from the user's reference image):
    // a translucent sector from the muzzle spanning ±25° around the aim.
    const p = game.active();
    const m = game._muzzle(p);
    const worldAng = game.worldAngle() * Math.PI / 180;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.arc(m.x, m.y, 150, -worldAng - 0.44, -worldAng + 0.44);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,215,106,0.10)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,106,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    const pts = game.previewPoints();
    const full = game.aim.power >= FULL_POWER;
    ctx.fillStyle = full ? 'rgba(255,215,106,1)' : 'rgba(255,255,255,0.9)';
    pts.forEach(([x, y], i) => { ctx.globalAlpha = 0.95 - i * 0.03; ctx.beginPath(); ctx.arc(x, y, full ? 5 : i === 0 ? 5 : 3.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  _floaters(game) {
    const ctx = this.ctx;
    for (const f of game.floaters) {
      ctx.globalAlpha = 1 - f.t / f.dur;
      text(ctx, f.text, f.x, f.y, f.size || 20, f.color, 'center');
    }
    ctx.globalAlpha = 1;
  }
  _hud(game, now) {
    const ctx = this.ctx;
    this.uiRegions = { weapons: [], skills: [], utility: [], powFire: null, powUlt: null, fireBtn: null, dpad: [], joystick: null, pauseBtn: null, camBtn: null, aimPad: null };
    // Touch press feedback: a button tapped <180ms ago draws highlighted.
    const flash = game.pressFlash && (Date.now() - game.pressFlash.t) < 180 ? game.pressFlash.key : null;
    // Top player cards.
    this._playerCard(game, 0, 16, 14, false);
    this._playerCard(game, 1, W - 316, 14, true);
    // Center: VS header + remaining enemies + wind/timer.
    // v2.1 — three clean lines (was two cramped lines: turn name + wind/timer
    // overlapped). Line 1: hero names + VS, each in its hero colour.
    const p = game.players[game.turn];
    const h0 = game.players[0], h1 = game.players[1];
    rr(ctx, W / 2 - 190, 12, 380, 72, 12); ctx.fillStyle = 'rgba(8,12,30,0.72)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,106,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    if (game.phase === 'over') {
      text(ctx, 'DUEL OVER', W / 2, 30, 15, '#ffd76a', 'center');
    } else {
      text(ctx, h0.hero.name, W / 2 - 34, 30, 15, h0.hero.color, 'right');
      text(ctx, 'VS', W / 2, 30, 15, '#ffd76a', 'center');
      text(ctx, h1.hero.name, W / 2 + 34, 30, 15, h1.hero.color, 'left');
      // Turn marker: a gold dot outside the active hero's name.
      const dotX = game.turn === 0 ? W / 2 - 112 : W / 2 + 112;
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath(); ctx.arc(dotX, 30, 4, 0, Math.PI * 2); ctx.fill();
    }
    text(ctx, `${p.name}'s turn  •  ${game.remainingLabel()}`, W / 2, 50, 12, '#ffffff', 'center');
    const windArrow = game.wind === 0 ? '—' : game.wind > 0 ? '→' : '←';
    text(ctx, `WIND ${windArrow} ${Math.abs(game.wind)}`, W / 2 - 52, 68, 13, '#ffffff', 'right');
    // v3 — turn timer: big, red + pulsing under 5s (15s turns now).
    const tLeft = Math.ceil(game.turnTimer);
    const tColor = game.phase === 'aim' && tLeft <= 5 ? '#ff5a4e' : '#ffffff';
    const tSize = game.phase === 'aim' && tLeft <= 5 ? 16 + Math.sin(now * 8) * 2 : 13;
    text(ctx, `⏱ ${tLeft}s`, W / 2 + 52, 68, tSize, tColor, 'left');
    // Aim readout (active player) — Android v2 Tahap A: moved to the top
    // centre, below the VS header, so it never overlaps the weapon slots
    // at the bottom (a pre-existing v3 cosmetic overlap).
    if (game.state === 'combat' && game.phase === 'aim') {
      // v3 — power is 0–100 now; show it as a number + a bar.
      const pow = Math.round(game.aim.power);
      rr(ctx, W / 2 - 150, 92, 300, 34, 10); ctx.fillStyle = 'rgba(8,12,30,0.72)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      text(ctx, `ANGLE ${Math.round(game.aim.angle)}°    POWER ${pow}${pow >= FULL_POWER ? '  ★ FULL POWER!' : ''}`, W / 2, 104, 14, pow >= FULL_POWER ? '#ffd76a' : '#ffffff', 'center');
      bar(ctx, W / 2 - 140, 118, 280, 7, pow / 100, pow >= FULL_POWER ? '#ffd76a' : '#ff7a2f');
      // v3.1 P0 — the MOVE line used to sit at y=140, directly under the
      // 44px banner text at y=150, so the banner painted over it. It now
      // lives below the banner zone (banner text + sub end ~y=201).
      text(ctx, `MOVE [A/D]: ${Math.round(p.moveSteps)}px left this turn`, W / 2, 210, 11, '#bfe9ff', 'center');
      // v3 — charging indicator while Space is held.
      if (game.charging) text(ctx, '⚡ CHARGING… release SPACE to fire!', W / 2, 156, 13, '#ffd76a', 'center');
      // Android v2 Tahap A — SPECIAL READY must be obvious on mobile too.
      if (pow >= FULL_POWER) {
        const pulse = 15 + Math.sin(now * 6) * 2;
        text(ctx, '★ SPECIAL READY — tap POW FIRE! ★', W / 2, 174, pulse, '#ffd76a', 'center');
      }
    }
    // Android v2 Tahap B — challenge goal + live status under the aim readout.
    const chStatus = game.challengeStatus();
    if (chStatus && game.state === 'combat') {
      text(ctx, chStatus, W / 2, 228, 13, game.challengeFailed ? '#ff5a4e' : '#ffd76a', 'center');
    }
    // Weapon inventory (bottom left) — Android v2 Tahap A: slots 58 -> 64px
    // so they stay finger-friendly when the 1280px canvas is letterboxed
    // onto a phone screen.
    const p0 = game.active();
    let wx = 16;
    text(ctx, 'WEAPONS  [Q/E]', 16, H - 138, 12, '#ffd76a', 'left');
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const sel = game.selectedWeapon === id;
      const ammo = p0.ammo[id];
      const avail = ammo > 0;
      const locked = !p0.ai && !game.ownsWeapon(id); // v3 — shop-locked weapon (human side only)
      rr(ctx, wx, H - 128, 64, 64, 10);
      ctx.fillStyle = sel ? 'rgba(255,215,106,0.9)' : flash === 'weapon:' + id ? 'rgba(255,215,106,0.55)' : 'rgba(8,12,30,0.78)'; ctx.fill();
      ctx.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = sel ? 3 : 1.5; ctx.stroke();
      ctx.globalAlpha = avail ? 1 : 0.35;
      const spr = { cannon: 'proj_cannon', triple: 'proj_cluster', meteor: 'proj_meteor', homing: 'proj_homing', pierce: 'proj_pierce', cluster: 'proj_cluster', beam: 'proj_beam', shield: 'proj_shield' }[id];
      const img = imageFor(spr);
      if (img) ctx.drawImage(img, wx + 12, H - 120, 40, 40);
      // v3.1 Skin Feature — a dot in the skin's colour marks a weapon with a
      // non-default skin equipped (so the loadout is visible at a glance).
      const eqSkin = game.equippedSkin(id);
      if (eqSkin && eqSkin.theme !== 'default') {
        ctx.fillStyle = (SKIN_THEMES[eqSkin.theme] || SKIN_THEMES.default).proj;
        ctx.beginPath(); ctx.arc(wx + 56, H - 122, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (locked) text(ctx, '🔒', wx + 32, H - 104, 20, '#ffd76a', 'center');
      else text(ctx, ammo === Infinity ? '∞' : String(ammo), wx + 54, H - 76, 12, '#fff', 'center');
      ctx.globalAlpha = 1;
      this.uiRegions.weapons.push({ x: wx, y: H - 128, w: 64, h: 64, id });
      wx += 70;
    }
    // Skill icons (bottom right).
    let sx = W - 16 - 3 * 64 - 2 * 6;
    text(ctx, 'SKILLS  [1/2/3]', sx, H - 138, 12, '#ffd76a', 'left');
    const skills = [p0.hero.skill1, p0.hero.skill2, p0.hero.ult];
    skills.forEach((sk, i) => {
      const slot = i + 1;
      const ready = game.skillAvailable(p0, slot);
      const cd = p0.cds[sk.id] || 0;
      rr(ctx, sx, H - 128, 64, 64, 10);
      ctx.fillStyle = ready ? p0.hero.color : flash === 'skill:' + slot ? 'rgba(255,255,255,0.35)' : 'rgba(8,12,30,0.78)'; ctx.fill();
      ctx.strokeStyle = ready ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = ready ? 3 : 1.5; ctx.stroke();
      ctx.globalAlpha = ready ? 1 : 0.55;
      text(ctx, slot === 3 ? '★' : String(slot), sx + 32, H - 104, 22, '#fff', 'center');
      text(ctx, `${sk.cost}⚡`, sx + 32, H - 76, 11, '#fff', 'center');
      ctx.globalAlpha = 1;
      if (cd > 0) text(ctx, `CD ${cd}`, sx + 32, H - 92, 11, '#ff9d9d', 'center');
      this.uiRegions.skills.push({ x: sx, y: H - 128, w: 64, h: 64, slot });
      sx += 70;
    });
    // Skill names tooltip line.
    const sk = [p0.hero.skill1, p0.hero.skill2, p0.hero.ult];
    text(ctx, sk.map(s => s.name).join('  •  '), W - 16, H - 52, 12, 'rgba(255,255,255,0.85)', 'right');
    // v2 — utility buttons (bottom centre): Teleport / Trap / Heal.
    // v3 — teleport + heal END the turn (rule change); the labels say so.
    // v2.1 — PASS (skips the turn) and EMOTE (visual only) join the row.
    if (game.state === 'combat') {
      const utils = [
        { id: 'pass', label: '⏭ PASS [P]', cost: null, ready: game.phase === 'aim' },
        { id: 'teleport', label: '✨ TELEPORT [T]', sub: 'ends turn', cost: game.teleportCost(p0), ready: game.utilityReady(p0, 'teleport') },
        { id: 'trap', label: '🪞 TRAP [R]', cost: 35, ready: game.utilityReady(p0, 'trap') },
        { id: 'heal', label: '💚 HEAL [H]', sub: 'ends turn', cost: 40, ready: game.utilityReady(p0, 'heal') },
        { id: 'emote', label: '😤 EMOTE [G]', cost: null, ready: game.phase === 'aim' },
      ];
      let ux = W / 2 - 326;
      for (const u of utils) {
        // Android v2 Tahap A — utility buttons 120x34 -> 124x40 (finger-sized).
        rr(ctx, ux, H - 64, 124, 40, 9);
        ctx.fillStyle = u.ready ? 'rgba(90,140,255,0.85)' : flash === 'util:' + u.id ? 'rgba(90,140,255,0.55)' : 'rgba(8,12,30,0.78)'; ctx.fill();
        ctx.strokeStyle = u.ready ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = u.ready ? 2.5 : 1.5; ctx.stroke();
        ctx.globalAlpha = u.ready ? 1 : 0.6;
        if (u.cost === null) {
          text(ctx, u.label, ux + 62, H - 44, 12, '#fff', 'center');
        } else if (u.sub) {
          text(ctx, u.label, ux + 62, H - 52, 11, '#fff', 'center');
          text(ctx, `${u.cost}⚡ · ${u.sub}`, ux + 62, H - 36, 9, '#ffd76a', 'center');
        } else {
          text(ctx, u.label, ux + 62, H - 50, 12, '#fff', 'center');
          text(ctx, `${u.cost}⚡`, ux + 62, H - 35, 10, '#fff', 'center');
        }
        ctx.globalAlpha = 1;
        this.uiRegions.utility.push({ x: ux, y: H - 64, w: 124, h: 40, id: u.id });
        ux += 132;
      }
      // Active trap indicator.
      if (game.traps.some(t => t.owner === game.turn)) {
        text(ctx, '🪞 YOUR TRAP IS SET', W / 2, H - 132, 12, '#50dcf0', 'center');
      }
      // v3 — POW FIRE button: at power 100 a big flaming button appears;
      // clicking it fires the FULL POWER move.
      if (game.phase === 'aim' && game.aim.power >= FULL_POWER) {
        const pulse = 1 + Math.sin(now * 6) * 0.06;
        const bw = 240 * pulse, bh = 46;
        const bx = W / 2 - bw / 2, by = H - 184; // clear of the MOVE/ANGLE text lines below
        rr(ctx, bx, by, bw, bh, 12);
        ctx.fillStyle = 'rgba(255,120,20,0.92)'; ctx.fill();
        ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3; ctx.stroke();
        text(ctx, '🔥 POW FIRE! 🔥', W / 2, by + bh / 2, 20, '#fff', 'center');
        this.uiRegions.powFire = { x: bx, y: by, w: bw, h: bh };
      }
      // v3.1 Skin Feature — POINT at 100: a big POW button fires the ultimate
      // (the jurus). Same action as skill slot 3 / key 3. Top-right, clear of
      // the FIRE button, the skills row and the POW FIRE button.
      if (game.phase === 'aim' && !p0.ai && p0.energy >= 100) {
        const pulse = 1 + Math.sin(now * 6) * 0.06;
        const bw = 200 * pulse, bh = 40;
        const bx = W - 216, by = 122;
        rr(ctx, bx, by, bw, bh, 12);
        ctx.fillStyle = 'rgba(160,107,255,0.95)'; ctx.fill();
        ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3; ctx.stroke();
        text(ctx, '💥 POW! ULTIMATE', bx + bw / 2, by + bh / 2, 15, '#fff', 'center');
        this.uiRegions.powUlt = { x: bx, y: by, w: bw, h: bh };
      }
      // Android v2 Tahap A — touch controls replace the old ◀ ▶ D-pad:
      // virtual joystick (left), AIM pad (left, above the joystick) and a
      // big FIRE button (bottom right). Sizes follow the touch settings
      // (scale 0.8–1.3, opacity 0.5–1.0, key arcane-duel-touch).
      // v3.1 Skin Feature — the big vertical POWER slider is GONE (it covered
      // the middle of the arena). Power is set via the AIM pad / field drag /
      // Space charge, and shown as a small bar above the active hero.
      if (game.touchMode && game.phase === 'aim') {
        const ts = game.touchSettings.scale, op = game.touchSettings.opacity;
        // Virtual joystick: grab zone is bigger than the drawn base.
        const jcx = 112, jcy = 468, jr = 60 * ts;
        const joy = game.joystick || { dx: 0, dy: 0 };
        ctx.globalAlpha = op;
        ctx.beginPath(); ctx.arc(jcx, jcy, jr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8,12,30,0.55)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.5; ctx.stroke();
        const kx = jcx + joy.dx * jr * 0.7, ky = jcy + joy.dy * jr * 0.7;
        ctx.beginPath(); ctx.arc(kx, ky, 26 * ts, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(90,140,255,0.9)'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.globalAlpha = 1;
        text(ctx, '◀ ▶', jcx, jcy + jr + 16, 12, 'rgba(255,255,255,0.8)', 'center');
        this.uiRegions.joystick = { cx: jcx, cy: jcy, r: jr, grabR: jr + 34 };
        // v3.1 P0 — left AIM pad (above the joystick, so the two thumbs
        // never fight over one zone): hold to aim, drag to steer, release
        // to fire. The knob follows the drag offset; the pad glows gold
        // while held. Its grab zone ends ~24px above the joystick's.
        const apcx = 112, apcy = 268, apr = 62 * ts, apGrab = apr + 20;
        ctx.globalAlpha = op;
        ctx.beginPath(); ctx.arc(apcx, apcy, apr, 0, Math.PI * 2);
        ctx.fillStyle = game.aimHolding ? 'rgba(255,215,106,0.35)' : 'rgba(8,12,30,0.55)'; ctx.fill();
        ctx.strokeStyle = game.aimHolding ? '#ffd76a' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = game.aimHolding ? 3.5 : 2.5; ctx.stroke();
        const knob = game.aimPadKnob || { dx: 0, dy: 0 };
        const kx2 = apcx + Math.max(-1, Math.min(1, knob.dx / 60)) * apr * 0.55;
        const ky2 = apcy + Math.max(-1, Math.min(1, knob.dy / 60)) * apr * 0.55;
        ctx.beginPath(); ctx.arc(kx2, ky2, 22 * ts, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,215,106,0.9)'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.globalAlpha = 1;
        text(ctx, '🎯 AIM', apcx, apcy - apr - 8, 12, '#ffd76a', 'center');
        text(ctx, 'hold • drag • release to fire', apcx, apcy + apr + 16, 10, 'rgba(255,255,255,0.8)', 'center');
        this.uiRegions.aimPad = { cx: apcx, cy: apcy, r: apr, grabR: apGrab };
        // Big FIRE button (min 64px, here 160x90 at scale 1).
        const fw = 160 * ts, fh = 90 * ts, fx = W - 20 - fw, fy = 470;
        ctx.globalAlpha = op;
        rr(ctx, fx, fy, fw, fh, 14);
        ctx.fillStyle = flash === 'fire' ? 'rgba(255,140,80,1)' : 'rgba(255,90,40,0.92)'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        ctx.globalAlpha = 1;
        text(ctx, '🔥 FIRE', fx + fw / 2, fy + fh / 2, Math.round(22 * ts), '#fff', 'center');
        this.uiRegions.fireBtn = { x: fx, y: fy, w: fw, h: fh };
      }
    }
    // Android v2 Tahap A — pause + camera are real buttons now (the old
    // "II ESC" pill was text only). Camera toggles follow / zoom-out.
    rr(ctx, W - 200, 86, 96, 28, 8);
    ctx.fillStyle = flash === 'cam' ? 'rgba(126,200,247,0.9)' : 'rgba(8,12,30,0.72)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    text(ctx, game.camMode === 'zoomout' ? '🎥 FOLLOW' : '🔍 ZOOM OUT', W - 152, 100, 11, '#fff', 'center');
    this.uiRegions.camBtn = { x: W - 200, y: 86, w: 96, h: 28 };
    rr(ctx, W - 96, 86, 80, 28, 8); ctx.fillStyle = flash === 'pause' ? 'rgba(126,200,247,0.9)' : 'rgba(8,12,30,0.72)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    text(ctx, 'II  ESC', W - 56, 100, 12, '#fff', 'center');
    this.uiRegions.pauseBtn = { x: W - 96, y: 86, w: 80, h: 28 };
  }
  _playerCard(game, idx, x, y, right) {
    const ctx = this.ctx;
    const p = game.players[idx];
    // R3 — the card is 14px taller than before so the delay line fits:
    // the active player sees the cost of the shot they are about to take,
    // the other player sees the cost of their last action.
    rr(ctx, x, y, 300, 80, 12); ctx.fillStyle = game.turn === idx && game.state === 'combat' ? 'rgba(255,215,106,0.25)' : 'rgba(8,12,30,0.72)'; ctx.fill();
    ctx.strokeStyle = p.hero.color; ctx.lineWidth = 2.5; ctx.stroke();
    const img = imageFor(`portrait_${p.hero.id}`);
    if (img) { ctx.save(); ctx.beginPath(); ctx.arc(x + 33, y + 33, 26, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, x + 7, y + 7, 52, 52); ctx.restore(); }
    ctx.beginPath(); ctx.arc(x + 33, y + 33, 26, 0, Math.PI * 2); ctx.strokeStyle = p.hero.color; ctx.lineWidth = 3; ctx.stroke();
    const tx = x + 66;
    text(ctx, `${p.name} — ${p.hero.name}`, tx, y + 16, 14, '#fff', 'left');
    bar(ctx, tx, y + 30, 200, 12, p.hp / p.maxHp, p.hp > p.maxHp * 0.5 ? '#58d158' : p.hp > p.maxHp * 0.25 ? '#ffb347' : '#ff5a4e');
    text(ctx, `${Math.max(0, Math.round(p.hp))}`, tx + 210, y + 36, 12, '#fff', 'left');
    // v3.1 Skin Feature — the energy meter is now the POINT meter: hitting
    // the enemy fills it (+8 per hit, +25 per turn); at 100 POINT the 💥 POW!
    // button fires the ultimate. Shorter bar leaves room for the label.
    bar(ctx, tx, y + 48, 140, 8, p.energy / 100, '#a06bff');
    text(ctx, `POINT ${Math.round(p.energy)}${p.energy >= 100 ? ' • POW!' : ''}`, tx + 148, y + 52, 11, p.energy >= 100 ? '#ffd76a' : '#c9a7ff', 'left');
    if (game.turn === idx && game.state === 'combat' && game.phase === 'aim') {
      text(ctx, `⏱ This shot +${game.currentDelayCost()}`, tx, y + 70, 11, '#ffd76a', 'left');
    } else if (game.lastCostByPlayer[idx] != null) {
      text(ctx, `⏱ Last action +${game.lastCostByPlayer[idx]}`, tx, y + 70, 11, '#9fb8d8', 'left');
    }
    if (p.shield > 0) text(ctx, `🛡 ${p.shield}`, x + 268, y + 16, 12, '#7ec8f7', 'center');
    void right;
  }
  _banner(game) {
    const ctx = this.ctx, b = game.banner;
    const a = b.t < 0.2 ? b.t / 0.2 : b.t > b.dur - 0.3 ? Math.max(0, (b.dur - b.t) / 0.3) : 1;
    ctx.globalAlpha = a;
    text(ctx, b.text, W / 2, 150, 44, b.color, 'center');
    if (b.sub) text(ctx, b.sub, W / 2, 192, 18, '#ffffff', 'center');
    ctx.globalAlpha = 1;
  }
  // Android v2 Tahap A — animated turn banner: scales in at every turn
  // change so the turn never switches silently.
  _turnBanner(game) {
    const ctx = this.ctx, b = game.turnBanner;
    const a = b.t < 0.25 ? b.t / 0.25 : b.t > b.dur - 0.3 ? Math.max(0, (b.dur - b.t) / 0.3) : 1;
    const scale = 0.7 + 0.3 * Math.min(1, b.t / 0.25);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, 250); ctx.scale(scale, scale);
    text(ctx, b.text, 0, 0, 40, '#ffd76a', 'center');
    if (b.sub) text(ctx, b.sub, 0, 38, 17, '#ffffff', 'center');
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
