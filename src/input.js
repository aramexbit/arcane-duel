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
  _hitRegions(x, y) {
    const g = this.game;
    if (g.state !== 'combat') return false;
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
  _bind() {
    const g = this.game, c = this.canvas;
    c.addEventListener('mousemove', e => {
      if (g.state !== 'combat' || g.phase !== 'aim') return;
      const p = g.active(); if (!p || p.ai) return;
      const { x, y } = this._toLogical(e);
      g.aimFromMouse(x, y);
    });
    c.addEventListener('mousedown', e => {
      if (g.state !== 'combat') return;
      const { x, y } = this._toLogical(e);
      // v2 — teleport targeting: a click while armed teleports instead of firing.
      if (g.teleportMode && g.phase === 'aim' && !g.active().ai) { g.doTeleport(x, y); return; }
      if (this._hitRegions(x, y)) return;
      if (g.phase === 'aim' && !g.active().ai) g.fire();
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
        if (e.code === 'ArrowLeft') g.nudgeAim(0, -18);
        if (e.code === 'ArrowRight') g.nudgeAim(0, 18);
        if (e.code === 'Space') { e.preventDefault(); g.teleportMode = false; g.fire(); }
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
      }
      if (e.code === 'Escape') {
        // v2 — Esc first cancels teleport targeting, then pauses.
        if (g.teleportMode) { g.cancelTeleport(); return; }
        this.onPause();
      }
      if (e.code === 'KeyM') { g.audio.ensure(); g.audio.setMuted(!g.audio.muted); }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
  }
}
