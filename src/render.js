// ARCANE DUEL — all canvas rendering: arena, terrain, heroes, HUD, effects.
import { W, H, WEAPONS, WEAPON_ORDER, ARENAS } from './config.js';

const SPRITES = {};
const SPRITE_LIST = [];
// Filled by main.js via loadAssets().
export function imageFor(name) { return SPRITES[name] || null; }
export function loadAssets() {
  const heroes = ['kairo', 'nyx', 'bront'];
  const poses = ['idle_0', 'idle_1', 'aim', 'fire', 'hit', 'victory', 'defeat'];
  for (const h of heroes) for (const p of poses) SPRITE_LIST.push(`${h}_${p}`);
  for (const h of heroes) SPRITE_LIST.push(`portrait_${h}`);
  SPRITE_LIST.push('proj_cannon', 'proj_fire', 'proj_moon', 'proj_boulder', 'proj_homing', 'proj_pierce',
    'proj_cluster', 'proj_beam', 'proj_meteor', 'proj_astral', 'proj_shield',
    'expl_0', 'expl_1', 'expl_2', 'arcane_zone', 'spark',
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
    if (game.arenaId) {
      const arena0 = ARENAS[game.arenaId];
      const g0 = ctx.createLinearGradient(0, 0, 0, H);
      g0.addColorStop(0, arena0.sky[0]); g0.addColorStop(0.55, arena0.sky[1]); g0.addColorStop(1, arena0.sky[2]);
      ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
    }
    // Cinematic zoom + shake (zoom centres on the midpoint of the duel so
    // both heroes stay in frame).
    let zx = 1, zy = 1, ox = 0, oy = 0;
    if (game.cine) { const s = 1.08; const fx = (game.players[0].x + game.players[1].x) / 2, fy = 430; zx = s; ox = W / 2 - fx * s; oy = H / 2 - fy * s; }
    if (game.shake > 0.5) { ox += (Math.random() - 0.5) * game.shake; oy += (Math.random() - 0.5) * game.shake; }
    ctx.translate(ox, oy); ctx.scale(zx, zy);
    this._background(game, now);
    this._terrain(game);
    this._zones(game, now);
    this._crates(game);
    this._heroes(game, now);
    this._projectiles(game);
    this._particles(game);
    this._preview(game);
    this._floaters(game);
    ctx.restore();
    if (game.state === 'combat' || game.state === 'pause' || game.state === 'over') this._hud(game, now);
    if (game.banner) this._banner(game);
  }

  _background(game, now) {
    const ctx = this.ctx;
    const arena = ARENAS[game.arenaId || 'valley'];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, arena.sky[0]); g.addColorStop(0.55, arena.sky[1]); g.addColorStop(1, arena.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80);
    // Moon / sun.
    const moon = imageFor('decor_moon');
    if (moon && game.arenaId !== 'canyon') ctx.drawImage(moon, 1050, 46, 128, 128);
    if (game.arenaId === 'canyon') {
      const lg = ctx.createRadialGradient(640, 700, 60, 640, 700, 700);
      lg.addColorStop(0, 'rgba(255,110,30,0.55)'); lg.addColorStop(1, 'rgba(255,110,30,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    }
    // Drifting clouds.
    const cloud = imageFor('decor_cloud');
    if (cloud) {
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 340 + now * (6 + i * 2)) % (W + 320)) - 160;
        ctx.globalAlpha = 0.5; ctx.drawImage(cloud, cx, 60 + i * 42, 160, 64); ctx.globalAlpha = 1;
      }
    }
    // Far ruin silhouettes (parallax layer).
    ctx.fillStyle = arena.far; ctx.globalAlpha = 0.55;
    for (let i = 0; i < 7; i++) {
      const bx = i * 190 + 30, bw = 60 + (i % 3) * 26, bh = 150 + ((i * 53) % 120);
      ctx.fillRect(bx, 560 - bh, bw, bh);
      ctx.beginPath(); ctx.moveTo(bx - 8, 560 - bh); ctx.lineTo(bx + bw / 2, 560 - bh - 34); ctx.lineTo(bx + bw + 8, 560 - bh); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Arena decor: crystals / lava rocks / temple pillars along the ground.
    const t = game.terrain;
    if (t) {
      const spots = [140, 330, 520, 700, 880, 1160];
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
      for (let x = 40; x < W; x += 90) {
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
    for (let x = 0; x < W; x += 4) ctx.lineTo(x, t.h[x]);
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = a.ground; ctx.fill();
    // Top grassy/stone rim + speckles.
    ctx.beginPath();
    for (let x = 0; x < W; x += 4) { const y = t.h[x]; ctx.moveTo(x, y); ctx.lineTo(x + 4, y); }
    ctx.strokeStyle = a.groundL; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = a.groundD;
    for (let x = 12; x < W; x += 47) { const y = t.groundY(x) + 18 + ((x * 7) % 26); ctx.fillRect(x, y, 14, 8); }
    // Lava pool at the very bottom in Ember Canyon.
    if (game.arenaId === 'canyon') {
      ctx.fillStyle = '#ff5a1a';
      ctx.beginPath(); ctx.moveTo(0, 700);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 700 + Math.sin(x * 0.02 + game.time * 2) * 3);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd76a';
      for (let x = 30; x < W; x += 110) { ctx.beginPath(); ctx.ellipse(x, 708, 16, 4, 0, 0, Math.PI * 2); ctx.fill(); }
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
      const bob = p.pose === 'idle' ? Math.sin(now * 2 + p.x) * 2 : 0;
      ctx.save();
      ctx.translate(p.x, p.y - 140 + bob);
      if (p.facing === -1) ctx.scale(-1, 1);
      if (img) ctx.drawImage(img, -60, 0, 120, 150);
      else { ctx.fillStyle = p.hero.color; ctx.fillRect(-30, -90, 60, 90); }
      ctx.restore();
      // Shield bubble.
      if (p.shield > 0) {
        const sh = imageFor('proj_shield');
        ctx.globalAlpha = 0.85;
        if (sh) ctx.drawImage(sh, p.x - 58, p.y - 150, 116, 116);
        ctx.globalAlpha = 1;
      }
      // Name tag.
      text(ctx, `${p.hero.name}`, p.x, p.y - 158, 13, '#ffffff', 'center');
      // Falling indicator.
      if (p.falling) text(ctx, '!', p.x, p.y - 180, 22, '#ffd76a', 'center');
    }
  }
  _idleFrame(now) { return Math.floor(now * 1.6) % 2 === 1; }
  _projectiles(game) {
    const ctx = this.ctx;
    for (const pr of game.projectiles) {
      // Trail.
      ctx.strokeStyle = pr.elem === 'arcane' ? 'rgba(192,140,255,0.7)' : pr.elem === 'fire' ? 'rgba(255,140,50,0.7)' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3; ctx.beginPath();
      pr.trail.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      const spr = { cannon: 'proj_cannon', ball: 'proj_cannon', meteor: 'proj_meteor', fireball: 'proj_fire',
        arcane: 'proj_moon', starbolt: 'proj_astral', boulder: 'proj_boulder', homing: 'proj_homing',
        pierce: 'proj_pierce', cluster: 'proj_cluster', bomblet: 'proj_cluster', beam: 'proj_beam' }[pr.kind] || 'proj_cannon';
      const img = imageFor(spr);
      const size = spr === 'proj_meteor' ? 72 : 44;
      if (img) {
        ctx.save(); ctx.translate(pr.x, pr.y);
        ctx.rotate(Math.atan2(pr.vy, pr.vx));
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 8, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  _particles(game) {
    const ctx = this.ctx;
    for (const pt of game.particles) {
      const a = 1 - pt.life / pt.max;
      ctx.globalAlpha = Math.max(0, a);
      if (pt.kind === 'smoke') { ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1 + pt.life), 0, Math.PI * 2); ctx.fill(); }
      else { ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * a + 1, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  _preview(game) {
    const ctx = this.ctx;
    if (game.state !== 'combat' || game.phase !== 'aim') return;
    const pts = game.previewPoints();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    pts.forEach(([x, y], i) => { ctx.globalAlpha = 0.95 - i * 0.03; ctx.beginPath(); ctx.arc(x, y, i === 0 ? 5 : 3.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  _floaters(game) {
    const ctx = this.ctx;
    for (const f of game.floaters) {
      ctx.globalAlpha = 1 - f.t / f.dur;
      text(ctx, f.text, f.x, f.y, 20, f.color, 'center');
    }
    ctx.globalAlpha = 1;
  }
  _hud(game, now) {
    const ctx = this.ctx;
    this.uiRegions = { weapons: [], skills: [] };
    // Top player cards.
    this._playerCard(game, 0, 16, 14, false);
    this._playerCard(game, 1, W - 316, 14, true);
    // Center: turn + timer + wind.
    const p = game.players[game.turn];
    rr(ctx, W / 2 - 190, 12, 380, 46, 12); ctx.fillStyle = 'rgba(8,12,30,0.72)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,106,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, game.phase === 'over' ? 'DUEL OVER' : `${p.name} • ${p.hero.name}`, W / 2, 28, 15, '#ffd76a', 'center');
    const windArrow = game.wind === 0 ? '—' : game.wind > 0 ? '→' : '←';
    text(ctx, `WIND ${windArrow} ${Math.abs(game.wind)}    ⏱ ${Math.ceil(game.turnTimer)}s`, W / 2, 48, 13, '#ffffff', 'center');
    // Aim readout (active player, bottom center-left).
    if (game.state === 'combat' && game.phase === 'aim') {
      rr(ctx, W / 2 - 150, H - 108, 300, 34, 10); ctx.fillStyle = 'rgba(8,12,30,0.72)'; ctx.fill();
      text(ctx, `ANGLE ${Math.round(game.aim.angle)}°    POWER ${Math.round(game.aim.power)}`, W / 2, H - 90, 15, '#ffffff', 'center');
    }
    // Weapon inventory (bottom left).
    const p0 = game.active();
    let wx = 16;
    text(ctx, 'WEAPONS  [Q/E]', 16, H - 138, 12, '#ffd76a', 'left');
    for (const id of WEAPON_ORDER) {
      const w = WEAPONS[id];
      const sel = game.selectedWeapon === id;
      const ammo = p0.ammo[id];
      const avail = ammo > 0;
      rr(ctx, wx, H - 128, 58, 58, 10);
      ctx.fillStyle = sel ? 'rgba(255,215,106,0.9)' : 'rgba(8,12,30,0.78)'; ctx.fill();
      ctx.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = sel ? 3 : 1.5; ctx.stroke();
      ctx.globalAlpha = avail ? 1 : 0.35;
      const spr = { cannon: 'proj_cannon', triple: 'proj_cluster', meteor: 'proj_meteor', homing: 'proj_homing', pierce: 'proj_pierce', cluster: 'proj_cluster', beam: 'proj_beam', shield: 'proj_shield' }[id];
      const img = imageFor(spr);
      if (img) ctx.drawImage(img, wx + 11, H - 122, 36, 36);
      text(ctx, ammo === Infinity ? '∞' : String(ammo), wx + 48, H - 82, 12, '#fff', 'center');
      ctx.globalAlpha = 1;
      this.uiRegions.weapons.push({ x: wx, y: H - 128, w: 58, h: 58, id });
      wx += 64;
    }
    // Skill icons (bottom right).
    let sx = W - 16 - 3 * 64;
    text(ctx, 'SKILLS  [1/2/3]', sx, H - 138, 12, '#ffd76a', 'left');
    const skills = [p0.hero.skill1, p0.hero.skill2, p0.hero.ult];
    skills.forEach((sk, i) => {
      const slot = i + 1;
      const ready = game.skillAvailable(p0, slot);
      const cd = p0.cds[sk.id] || 0;
      rr(ctx, sx, H - 128, 58, 58, 10);
      ctx.fillStyle = ready ? p0.hero.color : 'rgba(8,12,30,0.78)'; ctx.fill();
      ctx.strokeStyle = ready ? '#fff' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = ready ? 3 : 1.5; ctx.stroke();
      ctx.globalAlpha = ready ? 1 : 0.55;
      text(ctx, slot === 3 ? '★' : String(slot), sx + 29, H - 108, 22, '#fff', 'center');
      text(ctx, `${sk.cost}⚡`, sx + 29, H - 82, 11, '#fff', 'center');
      ctx.globalAlpha = 1;
      if (cd > 0) text(ctx, `CD ${cd}`, sx + 29, H - 96, 11, '#ff9d9d', 'center');
      this.uiRegions.skills.push({ x: sx, y: H - 128, w: 58, h: 58, slot });
      sx += 64;
    });
    // Skill names tooltip line.
    const sk = [p0.hero.skill1, p0.hero.skill2, p0.hero.ult];
    text(ctx, sk.map(s => s.name).join('  •  '), W - 16, H - 52, 12, 'rgba(255,255,255,0.85)', 'right');
    // Pause + mute buttons (below the P2 card, so they never overlap it).
    rr(ctx, W - 96, 86, 80, 28, 8); ctx.fillStyle = 'rgba(8,12,30,0.72)'; ctx.fill();
    text(ctx, 'II  ESC', W - 56, 100, 12, '#fff', 'center');
  }
  _playerCard(game, idx, x, y, right) {
    const ctx = this.ctx;
    const p = game.players[idx];
    rr(ctx, x, y, 300, 66, 12); ctx.fillStyle = game.turn === idx && game.state === 'combat' ? 'rgba(255,215,106,0.25)' : 'rgba(8,12,30,0.72)'; ctx.fill();
    ctx.strokeStyle = p.hero.color; ctx.lineWidth = 2.5; ctx.stroke();
    const img = imageFor(`portrait_${p.hero.id}`);
    if (img) { ctx.save(); ctx.beginPath(); ctx.arc(x + 33, y + 33, 26, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, x + 7, y + 7, 52, 52); ctx.restore(); }
    ctx.beginPath(); ctx.arc(x + 33, y + 33, 26, 0, Math.PI * 2); ctx.strokeStyle = p.hero.color; ctx.lineWidth = 3; ctx.stroke();
    const tx = x + 66;
    text(ctx, `${p.name} — ${p.hero.name}`, tx, y + 16, 14, '#fff', 'left');
    bar(ctx, tx, y + 30, 200, 12, p.hp / 100, p.hp > 50 ? '#58d158' : p.hp > 25 ? '#ffb347' : '#ff5a4e');
    text(ctx, `${Math.max(0, Math.round(p.hp))}`, tx + 210, y + 36, 12, '#fff', 'left');
    bar(ctx, tx, y + 48, 200, 8, p.energy / 100, '#a06bff');
    text(ctx, `⚡${Math.round(p.energy)}${p.energy >= 100 ? ' ULT READY!' : ''}`, tx + 210, y + 52, 11, p.energy >= 100 ? '#ffd76a' : '#c9a7ff', 'left');
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
}
