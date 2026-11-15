// ARCANE DUEL — terrain (destructible heightmap) + ballistic physics + AI solver.
import { W, H, GRAVITY, ARENAS, rng, clamp } from './config.js';

export class Terrain {
  constructor(arenaId, seed = 1) {
    this.arena = ARENAS[arenaId];
    this.h = new Float32Array(W);
    const r = rng(seed);
    const base = this.arena.base, amp = this.arena.amp;
    const p1 = 0.5 + r() * 0.6, p2 = 0.8 + r() * 0.8, p3 = 1.7 + r() * 1.4;
    const a1 = amp * (0.5 + r() * 0.5), a2 = amp * 0.3, a3 = amp * 0.18;
    const f1 = r() * 6.28, f2 = r() * 6.28, f3 = r() * 6.28;
    for (let x = 0; x < W; x++) {
      const t = x / W;
      let y = base + Math.sin(t * 6.28 * p1 + f1) * a1 + Math.sin(t * 6.28 * p2 + f2) * a2 + Math.sin(t * 6.28 * p3 + f3) * a3;
      // Flatten landing pads where the heroes stand.
      const dL = Math.abs(x - 220), dR = Math.abs(x - 1060);
      if (dL < 70) y = y * (dL / 70) + base * (1 - dL / 70);
      if (dR < 70) y = y * (dR / 70) + base * (1 - dR / 70);
      this.h[x] = clamp(y, 380, 660);
    }
    // A couple of raised plateaus (floating-island feel) away from spawn pads.
    const bumps = [[430, 90, -46], [850, 80, -38]];
    for (const [cx, w, dy] of bumps) {
      for (let x = Math.max(0, cx - w); x < Math.min(W, cx + w); x++) {
        const t = 1 - Math.abs(x - cx) / w;
        this.h[x] += dy * (t * t * (3 - 2 * t));
      }
    }
  }
  groundY(x) {
    const xi = clamp(Math.floor(x), 0, W - 1);
    return this.h[xi];
  }
  // Carve a crater; returns true if any terrain was removed.
  crater(cx, cy, r) {
    let changed = false;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
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
    const x0 = Math.max(0, Math.floor(cx - w / 2)), x1 = Math.min(W - 1, Math.ceil(cx + w / 2));
    for (let x = x0; x <= x1; x++) this.h[x] = Math.max(360, this.h[x] - hgt);
  }
}

// Simulate a ballistic flight. Returns {points, hitX, hitY, hit:'terrain'|'char'|'none', t}.
// chars: [{x,y,r}] to test direct hits (optional). step in seconds.
export function simulateShot(x, y, angleDeg, power, wind, opts = {}) {
  const g = opts.gravity ?? GRAVITY;
  const rad = (angleDeg * Math.PI) / 180;
  const sp = power * (opts.speedMul ?? 1);
  let vx = Math.cos(rad) * sp, vy = -Math.sin(rad) * sp;
  const windAcc = wind * 1.2;
  const points = [];
  let px = x, py = y, t = 0;
  const dt = 1 / 60;
  const chars = opts.chars || [];
  const pierce = !!opts.pierce;
  while (t < 6) {
    vx += windAcc * dt;
    if (opts.homing && opts.target) {
      const tx = opts.target.x - px, ty = (opts.target.y - 20) - py;
      const d = Math.hypot(tx, ty) || 1;
      const spNow = Math.hypot(vx, vy) || 1;
      const turn = 2.6 * dt;
      vx += ((tx / d) * spNow - vx) * turn;
      vy += ((ty / d) * spNow - vy) * turn;
    }
    if (!opts.noGravity) vy += g * dt;
    px += vx * dt; py += vy * dt; t += dt;
    points.push([px, py]);
    if (px < -40 || px > W + 40 || py > H + 40) return { points, hitX: px, hitY: py, hit: 'none', t };
    for (const c of chars) {
      const dx = px - c.x, dy = py - (c.y - 34);
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
// Returns {angle, power} or null. err = {aim (fraction), ang (deg)} noise.
export function solveShot(from, target, wind, terrain, err) {
  const dir = target.x > from.x ? 1 : -1;
  const dx = Math.abs(target.x - from.x);
  const dy = (target.y - 34) - (from.y - 34);
  let best = null;
  for (let ang = 25; ang <= 80; ang += 2) {
    for (let pw = 280; pw <= 950; pw += 20) {
      const a = dir === 1 ? ang : 180 - ang;
      const sim = simulateShot(from.x, from.y - 46, a, pw, wind, { terrain });
      const ex = sim.hitX, ey = sim.hitY;
      const miss = Math.hypot(ex - target.x, ey - (target.y - 30));
      if (sim.hit === 'char' && sim.target === target) return { angle: ang, power: pw, direct: true };
      if (miss < 46 && (!best || miss < best.miss)) best = { angle: ang, power: pw, miss };
      void dx; void dy;
    }
  }
  if (!best) {
    // Fallback: classic range formula ignoring terrain.
    const pw = clamp(Math.sqrt(dx * GRAVITY) * 1.05, 300, 950);
    best = { angle: 55, power: pw, miss: 999 };
  }
  // err may be a DIFFICULTY entry ({angErr, aimErr}) or the old {ang, aim} shape.
  const angErr = err.angErr ?? err.ang ?? 0;
  const aimErr = err.aimErr ?? err.aim ?? 0;
  const noisy = {
    angle: clamp(best.angle + (Math.random() * 2 - 1) * angErr, 15, 85),
    power: clamp(best.power * (1 + (Math.random() * 2 - 1) * aimErr), 200, 950),
  };
  // Never hand the game a non-finite aim: a NaN angle poisons the projectile
  // velocity and used to kill the whole rAF loop in the renderer (Nov 2026).
  if (!Number.isFinite(noisy.angle) || !Number.isFinite(noisy.power)) return { angle: 55, power: 600 };
  return noisy;
}
