// ARCANE DUEL — keyboard + mouse input.
export class Input {
  constructor(canvas, game, renderer, onPause) {
    this.canvas = canvas; this.game = game; this.renderer = renderer; this.onPause = onPause;
    this.keys = new Set();
    this._lastMove = performance.now();
    this._bind();
    // v2 — hold-to-walk loop: while A/D is held (real browser auto-repeat
    // is unreliable in headless tests), poll the held-key set every frame.
    const step = (now) => {
      const dt = Math.min(0.05, (now - this._lastMove) / 1000); this._lastMove = now;
      const g = this.game;
      if (g.state === 'combat' && g.phase === 'aim') {
        const ap = g.active();
        if (ap && !ap.ai) {
          if (this.keys.has('KeyA')) g.moveStep(-1, dt);
          else if (this.keys.has('KeyD')) g.moveStep(1, dt);
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  _toLogical(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (1280 / r.width), y: (e.clientY - r.top) * (720 / r.height) };
  }
  // v3 — touch points use the same logical mapping (screen coords; the
  // camera offset is added by the caller when aiming at the world).
  _toLogicalTouch(t) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (t.clientX - r.left) * (1280 / r.width), y: (t.clientY - r.top) * (720 / r.height) };
  }
  _hitRegions(x, y) {
    const g = this.game;
    if (g.state !== 'combat') return false;
    // v3 — POW FIRE button (power 100) fires the FULL POWER move.
    const pf = this.renderer.uiRegions.powFire;
    if (pf && x >= pf.x && x <= pf.x + pf.w && y >= pf.y && y <= pf.y + pf.h) {
      if (g.phase === 'aim' && !g.active().ai) { g.fire(); return true; }
    }
    // v3 — touch FIRE button (big, bottom right).
    const fb = this.renderer.uiRegions.fireBtn;
    if (fb && x >= fb.x && x <= fb.x + fb.w && y >= fb.y && y <= fb.y + fb.h) {
      if (g.phase === 'aim' && !g.active().ai) { g.fire(); return true; }
    }
    for (const w of this.renderer.uiRegions.weapons) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) { g.selectWeapon(w.id); return true; }
    }
    for (const s of this.renderer.uiRegions.skills) {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) { g.useSkill(s.slot); return true; }
    }
    // v2 — utility buttons: Teleport / Trap / Heal.
    // v2.1 — PASS (skips the turn) and EMOTE (visual only).
    for (const u of (this.renderer.uiRegions.utility || [])) {
      if (x >= u.x && x <= u.x + u.w && y >= u.y && y <= u.y + u.h) {
        if (u.id === 'teleport') g.useTeleport();
        else if (u.id === 'trap') g.placeTrap();
        else if (u.id === 'heal') g.useHeal();
        else if (u.id === 'pass') g.passTurn();
        else if (u.id === 'emote') g.emote();
        return true;
      }
    }
    return false;
  }
  // v3 — true when the point is over a HUD button/row: mouse aim must not
  // re-aim there (moving the mouse onto the POW FIRE button would otherwise
  // drop power below 100 before the click lands).
  _inUiRegion(x, y) {
    const r = this.renderer.uiRegions;
    const inRect = (q) => q && x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h;
    if (inRect(r.powFire) || inRect(r.fireBtn)) return true;
    for (const q of [...(r.weapons || []), ...(r.skills || []), ...(r.utility || [])]) if (inRect(q)) return true;
    return false;
  }
  _bind() {
    const g = this.game, c = this.canvas;
    c.addEventListener('mousemove', e => {
      if (g.state !== 'combat' || g.phase !== 'aim') return;
      const p = g.active(); if (!p || p.ai) return;
      const { x, y } = this._toLogical(e);
      if (this._inUiRegion(x, y)) return; // v3 — don't re-aim over HUD buttons
      // v3 — mouse is in screen coords; add the camera offset for the world.
      g.aimFromMouse(x + g.camX, y);
    });
    c.addEventListener('mousedown', e => {
      if (g.state !== 'combat') return;
      const { x, y } = this._toLogical(e);
      // v2 — teleport targeting: a click while armed teleports instead of firing.
      if (g.teleportMode && g.phase === 'aim' && !g.active().ai) { g.doTeleport(x + g.camX, y); return; }
      if (this._hitRegions(x, y)) return;
      if (g.phase === 'aim' && !g.active().ai) g.fire();
    });
    // v3 — touch controls (HP layar sentuh): drag to aim, quick tap to fire,
    // big FIRE button + ◀ ▶ walk pad are canvas buttons (see _hitRegions).
    c.addEventListener('touchstart', e => {
      e.preventDefault();
      if (g.state !== 'combat') return;
      const t = e.changedTouches[0];
      const { x, y } = this._toLogicalTouch(t);
      // D-pad hold-to-walk.
      for (const d of (this.renderer.uiRegions.dpad || [])) {
        if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) {
          g.moveDir = d.dir; this._touchWalk = d.dir; return;
        }
      }
      if (this._hitRegions(x, y)) return;
      if (g.teleportMode && g.phase === 'aim' && !g.active().ai) { g.doTeleport(x + g.camX, y); return; }
      if (g.phase === 'aim' && !g.active().ai) {
        this._touchAim = { x0: x, y0: y, t: performance.now(), moved: false };
        g.aimFromTouch(x + g.camX, y);
      }
    }, { passive: false });
    c.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!this._touchAim) return;
      const t = e.changedTouches[0];
      const { x, y } = this._toLogicalTouch(t);
      if (Math.hypot(x - this._touchAim.x0, y - this._touchAim.y0) > 12) this._touchAim.moved = true;
      if (g.phase === 'aim' && !g.active().ai) g.aimFromTouch(x + g.camX, y);
    }, { passive: false });
    c.addEventListener('touchend', e => {
      if (this._touchWalk) { g.moveDir = 0; this._touchWalk = 0; }
      if (this._touchAim) {
        const quick = performance.now() - this._touchAim.t < 250 && !this._touchAim.moved;
        this._touchAim = null;
        if (quick && g.phase === 'aim' && !g.active().ai) g.fire();
      }
    });
    // Right-click cancels teleport targeting.
    c.addEventListener('contextmenu', e => { e.preventDefault(); if (g.teleportMode) g.cancelTeleport(); });
    window.addEventListener('keydown', e => {
      // v2 — A/D walk: track held keys (the rAF loop in the constructor
      // polls this set, so holding the key walks continuously).
      if (e.code === 'KeyA' || e.code === 'KeyD') this.keys.add(e.code);
      if (e.repeat) return;
      this.keys.add(e.code);
      if (g.state === 'combat' && g.phase === 'aim' && !g.active().ai) {
        if (e.code === 'ArrowUp') g.nudgeAim(2, 0);
        if (e.code === 'ArrowDown') g.nudgeAim(-2, 0);
        if (e.code === 'ArrowLeft') g.nudgeAim(0, -2); // v3 — power is 0–100 now
        if (e.code === 'ArrowRight') g.nudgeAim(0, 2);
        // v3 — Space charges (hold) / fires on release; quick tap = fire now.
        if (e.code === 'Space') { e.preventDefault(); g.teleportMode = false; g.startCharge(); }
        if (e.code === 'KeyQ') g.cycleWeapon(-1);
        if (e.code === 'KeyE') g.cycleWeapon(1);
        if (e.code === 'Digit1') g.useSkill(1);
        if (e.code === 'Digit2') g.useSkill(2);
        if (e.code === 'Digit3') g.useSkill(3);
        // v2 utilities: T teleport, R reflect trap, H heal.
        if (e.code === 'KeyT') g.useTeleport();
        if (e.code === 'KeyR') g.placeTrap();
        if (e.code === 'KeyH') g.useHeal();
        // v2.1: P pass the turn, G emote (visual only, turn continues).
        if (e.code === 'KeyP') g.passTurn();
        if (e.code === 'KeyG') g.emote();
        // v3 — V toggles the trajectory preview.
        if (e.code === 'KeyV') g.togglePreview();
      }
      if (e.code === 'Escape') {
        // v2 — Esc first cancels teleport targeting, then pauses.
        if (g.teleportMode) { g.cancelTeleport(); return; }
        this.onPause();
      }
      if (e.code === 'KeyM') { g.audio.ensure(); g.audio.setMuted(!g.audio.muted); }
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      // v3 — releasing Space fires the (possibly charged) shot.
      if (e.code === 'Space') g.releaseCharge();
    });
  }
}
