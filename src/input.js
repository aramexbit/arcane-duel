// ARCANE DUEL — keyboard + mouse input.
export class Input {
  constructor(canvas, game, renderer, onPause) {
    this.canvas = canvas; this.game = game; this.renderer = renderer; this.onPause = onPause;
    this.keys = new Set();
    this._bind();
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
    return false;
  }
  _bind() {
    const g = this.game, c = this.canvas;
    c.addEventListener('mousemove', e => {
      if (g.state !== 'combat' || g.phase !== 'aim') return;
      const p = g.active(); if (p.ai) return;
      const { x, y } = this._toLogical(e);
      g.aimFromMouse(x, y);
    });
    c.addEventListener('mousedown', e => {
      if (g.state !== 'combat') return;
      const { x, y } = this._toLogical(e);
      if (this._hitRegions(x, y)) return;
      if (g.phase === 'aim' && !g.active().ai) g.fire();
    });
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (g.state === 'combat' && g.phase === 'aim' && !g.active().ai) {
        if (e.code === 'ArrowUp') g.nudgeAim(2, 0);
        if (e.code === 'ArrowDown') g.nudgeAim(-2, 0);
        if (e.code === 'ArrowLeft') g.nudgeAim(0, -18);
        if (e.code === 'ArrowRight') g.nudgeAim(0, 18);
        if (e.code === 'Space') { e.preventDefault(); g.fire(); }
        if (e.code === 'KeyQ') g.cycleWeapon(-1);
        if (e.code === 'KeyE') g.cycleWeapon(1);
        if (e.code === 'Digit1') g.useSkill(1);
        if (e.code === 'Digit2') g.useSkill(2);
        if (e.code === 'Digit3') g.useSkill(3);
      }
      if (e.code === 'Escape') this.onPause();
      if (e.code === 'KeyM') { g.audio.ensure(); g.audio.setMuted(!g.audio.muted); }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
  }
}
