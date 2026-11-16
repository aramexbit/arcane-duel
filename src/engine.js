// ARCANE DUEL — terrain (destructible heightmap) + ballistic physics + AI solver.
import { W, WORLD_W, H, GRAVITY, ARENAS, rng, clamp } from './config.js';

export class Terrain {
  constructor(arenaId, seed = 1) {
    this.arena = ARENAS[arenaId];
    this.h = new Float32Array(WORLD_W);
    const r = rng(seed);
    const base = this.arena.base, amp = this.arena.amp;
    const p1 = 0.5 + r() * 0.6, p2 = 0.8 + r() * 0.8, p3 = 1.7 + r() * 1.4;
    const a1 = amp * (0.5 + r() * 0.5), a2 = amp * 0.3, a3 = amp * 0.18;
    const f1 = r() * 6.28, f2 = r() * 6.28, f3 = r() * 6.28;
    for (let x = 0; x < WORLD_W; x++) {
      const t = x / WORLD_W;
      let y = base + Math.sin(t * 6.28 * p1 + f1) * a1 + Math.sin(t * 6.28 * p2 + f2) * a2 + Math.sin(t * 6.28 * p3 + f3) * a3;
      // Flatten landing pads where the heroes stand.
      const dL = Math.abs(x - 480), dR = Math.abs(x - 1568);
      if (dL < 70) y = y * (dL / 70) + base * (1 - dL / 70);
      if (dR < 70) y = y * (dR / 70) + base * (1 - dR / 70);
      this.h[x] = clamp(y, 380, 660);
    }
    // A couple of raised plateaus (floating-island feel) away from spawn pads.
    const bumps = [[700, 90, -46], [1350, 80, -38]];
    for (const [cx, w, dy] of bumps) {
      for (let x = Math.max(0, cx - w); x < Math.min(WORLD_W, cx + w); x++) {
        const t = 1 - Math.abs(x - cx) / w;
        this.h[x] += dy * (t * t * (3 - 2 * t));
      }
    }
  }
  groundY(x) {
    const xi = clamp(Math.floor(x), 0, WORLD_W - 1);
    return this.h[xi];
  }
  // Carve a crater; returns true if any terrain was removed.
  // v3: a column can be dug all the way to H (720) — a hole straight
  // through the world, so a hero standing above it falls to their death.
  crater(cx, cy, r) {
    let changed = false;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(WORLD_W - 1, Math.ceil(cx + r));
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
      const top = cy - dy, bot = cy + dy;
      // Only dig where the blast circle overlaps the ground column.
      if (bot > this.h[x]) {
        const dig = Math.min(bot - this.h[x], dy * 1.1);
        if (dig > 1) { this.h[x] = Math.min(H, this.h[x] + dig); changed = true; }
      } else if (top < this.h[x] && bot > this.h[x] - 4) {
        // Shallow graze: still chip the surface a little.
        this.h[x] = Math.min(H, this.h[x] + 3); changed = true;
      }
    }
    return changed;
  }
  // Raise a stone wall (BRONT skill): returns the columns raised.
  raiseWall(cx, w, hgt) {
    const x0 = Math.max(0, Math.floor(cx - w / 2)), x1 = Math.min(WORLD_W - 1, Math.ceil(cx + w / 2));
    for (let x = x0; x <= x1; x++) this.h[x] = Math.max(360, this.h[x] - hgt);
  }
}

// Simulate a ballistic flight. Returns {points, hitX, hitY, hit:'terrain'|'char'|'none', t}.
// chars: [{x,y,r}] to test direct hits (optional). step in seconds.
// v3 — per-weapon physics: opts.gravityMul (weapon weight) scales gravity,
// opts.windMul (1 - weapon windRes) scales the wind push. The base formulas
// are the user's spec: vx = v·cos θ, vy = v·sin θ, x(t) = x0 + vx·t,
// y(t) = y0 + vy·t − ½gt², plus wind as an extra acceleration.
export function simulateShot(x, y, angleDeg, power, wind, opts = {}) {
  const g = (opts.gravity ?? GRAVITY) * (opts.gravityMul ?? 1);
  const rad = (angleDeg * Math.PI) / 180;
  const sp = power * (opts.speedMul ?? 1);
  let vx = Math.cos(rad) * sp, vy = -Math.sin(rad) * sp;
  const windAcc = wind * 1.2 * (opts.windMul ?? 1);
  const points = [];
  let px = x, py = y, t = 0;
  const dt = 1 / 60;
  const chars = opts.chars || [];
  const pierce = !!opts.pierce;
  while (t < 6) {
    vx += windAcc * dt;
    if (opts.homing && opts.target) {
      // Android v2 Tahap A — the preview MUST match the real flight: the
      // live update() steers with turn 2.4 toward (target.y - 40), so the
      // simulator uses the exact same constants (it used 2.6 / -20 before).
      const tx = opts.target.x - px, ty = (opts.target.y - 40) - py;
      const d = Math.hypot(tx, ty) || 1;
      const spNow = Math.hypot(vx, vy) || 1;
      const turn = 2.4 * dt;
      vx += ((tx / d) * spNow - vx) * turn;
      vy += ((ty / d) * spNow - vy) * turn;
    }
    if (!opts.noGravity) vy += g * dt;
    px += vx * dt; py += vy * dt; t += dt;
    points.push([px, py]);
    if (px < -40 || px > WORLD_W + 40 || py > H + 40) return { points, hitX: px, hitY: py, hit: 'none', t };
    for (const c of chars) {
      // Live hit test in game.js uses (target.y - 40); match it here too.
      const dx = px - c.x, dy = py - (c.y - 40);
      if (dx * dx + dy * dy < 34 * 34) return { points, hitX: px, hitY: py, hit: 'char', target: c, t };
    }
    if (!pierce && opts.terrain && py >= opts.terrain.groundY(px)) {
      return { points, hitX: px, hitY: Math.min(py, opts.terrain.groundY(px)), hit: 'terrain', t };
    }
    if (pierce && opts.terrain && py >= opts.terrain.groundY(px) && t > 0.25) {
      // Piercing bolt keeps flying through the first terrain layer; it stops
      // once it is deep underground or after 1.2s.
      if (py > opts.terrain.groundY(px) + 26 || t > 1.2) {
        return { points, hitX: px, hitY: py, hit: 'terrain', t };
      }
    }
  }
  return { points, hitX: px, hitY: py, hit: 'none', t };
}

// AI: search angle/power for a shot that lands near the target.
// Searches in VELOCITY space (280–950 px/s, as before) and returns power on
// the v3 0–100 scale (power = velocity / 9.5). err = {aim (fraction), ang (deg)} noise.
export function solveShot(from, target, wind, terrain, err, weapon = null) {
  const dir = target.x > from.x ? 1 : -1;
  const dx = Math.abs(target.x - from.x);
  const dy = (target.y - 34) - (from.y - 34);
  // v3: the solver simulates with the weapon's own weight/wind resistance,
  // so the AI aims correctly for heavy and light shots alike.
  const simOpts = { terrain };
  if (weapon) { simOpts.gravityMul = weapon.weight ?? 1; simOpts.windMul = 1 - (weapon.windRes ?? 0); }
  let best = null;
  for (let ang = 25; ang <= 80; ang += 2) {
    for (let pw = 280; pw <= 950; pw += 20) {
      const a = dir === 1 ? ang : 180 - ang;
      const sim = simulateShot(from.x, from.y - 46, a, pw, wind, simOpts);
      const ex = sim.hitX, ey = sim.hitY;
      const miss = Math.hypot(ex - target.x, ey - (target.y - 30));
      if (sim.hit === 'char' && sim.target === target) return { angle: ang, power: pw / 9.5, direct: true };
      if (miss < 46 && (!best || miss < best.miss)) best = { angle: ang, power: pw / 9.5, miss };
      void dx; void dy;
    }
  }
  if (!best) {
    // Fallback: classic range formula ignoring terrain.
    const pw = clamp(Math.sqrt(dx * GRAVITY) * 1.05, 300, 950);
    best = { angle: 55, power: pw / 9.5, miss: 999 };
  }
  // err may be a DIFFICULTY entry ({angErr, aimErr}) or the old {ang, aim} shape.
  const angErr = err.angErr ?? err.ang ?? 0;
  const aimErr = err.aimErr ?? err.aim ?? 0;
  const noisy = {
    angle: clamp(best.angle + (Math.random() * 2 - 1) * angErr, 15, 85),
    power: clamp(best.power * (1 + (Math.random() * 2 - 1) * aimErr), 20, 100),
  };
  // Never hand the game a non-finite aim: a NaN angle poisons the projectile
  // velocity and used to kill the whole rAF loop in the renderer (Nov 2026).
  if (!Number.isFinite(noisy.angle) || !Number.isFinite(noisy.power)) return { angle: 55, power: 65 };
  return noisy;
}
