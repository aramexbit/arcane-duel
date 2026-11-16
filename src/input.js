// ARCANE DUEL — keyboard + mouse + touch input.
// Android v2 Tahap A: the old single-touch handlers (changedTouches[0])
// are replaced by Pointer Events with per-pointerId tracking +
// setPointerCapture, so joystick + aim + FIRE + power slider can be held
// at the same time. Legacy TouchEvent handlers stay as a fallback (some
// embedded WebViews / synthetic events never emit Pointer Events); they
// are deduped against a recent pointer gesture so one touch never fires
// twice. window blur / visibility loss releases every input.
export class Input {
  constructor(canvas, game, renderer, onPause) {
    this.canvas = canvas; this.game = game; this.renderer = renderer; this.onPause = onPause;
    this.keys = new Set();
    this._lastMove = performance.now();
    // Android v2 Tahap A — active pointers: id -> { role, x0, y0, t, moved }
    // roles: 'joystick' | 'aim' | 'slider'. FIRE/buttons resolve on down.
    this.pointers = new Map();
    this._ptrDownAt = 0; this._ptrUpAt = 0;
    this._mouseSlider = false;
    this.game.joystick = { dx: 0, dy: 0 };
    this.game.pressFlash = null;
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
  _flash(key) { this.game.pressFlash = { key, t: Date.now() }; }
  _hitRegions(x, y) {
    const g = this.game;
    if (g.state !== 'combat') return false;
    // Android v2 Tahap A — pause + camera are real buttons now.
    const pb = this.renderer.uiRegions.pauseBtn;
    if (pb && x >= pb.x && x <= pb.x + pb.w && y >= pb.y && y <= pb.y + pb.h) {
      this._flash('pause'); this.onPause(); return true;
    }
    const cb = this.renderer.uiRegions.camBtn;
    if (cb && x >= cb.x && x <= cb.x + cb.w && y >= cb.y && y <= cb.y + cb.h) {
      this._flash('cam'); g.toggleCamera(); return true;
    }
    // v3 — POW FIRE button (power 100) fires the FULL POWER move.
    const pf = this.renderer.uiRegions.powFire;
    if (pf && x >= pf.x && x <= pf.x + pf.w && y >= pf.y && y <= pf.y + pf.h) {
      if (g.phase === 'aim' && !g.active().ai) { this._flash('pow'); g.fire(); return true; }
    }
    // v3 — touch FIRE button (big, bottom right). A tap here must NOT
    // also start an aim drag (it returns before any aim handling).
    const fb = this.renderer.uiRegions.fireBtn;
    if (fb && x >= fb.x && x <= fb.x + fb.w && y >= fb.y && y <= fb.y + fb.h) {
      if (g.phase === 'aim' && !g.active().ai) { this._flash('fire'); g.fire(); return true; }
    }
    for (const w of this.renderer.uiRegions.weapons) {
      if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) { this._flash('weapon:' + w.id); g.selectWeapon(w.id); return true; }
    }
    for (const s of this.renderer.uiRegions.skills) {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) { this._flash('skill:' + s.slot); g.useSkill(s.slot); return true; }
    }
    // v2 — utility buttons: Teleport / Trap / Heal.
    // v2.1 — PASS (skips the turn) and EMOTE (visual only).
    for (const u of (this.renderer.uiRegions.utility || [])) {
      if (x >= u.x && x <= u.x + u.w && y >= u.y && y <= u.y + u.h) {
        this._flash('util:' + u.id);
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
    if (inRect(r.powFire) || inRect(r.fireBtn) || inRect(r.powerSlider) || inRect(r.pauseBtn) || inRect(r.camBtn)) return true;
    const j = r.joystick;
    if (j && Math.hypot(x - j.cx, y - j.cy) <= j.grabR) return true;
    for (const q of [...(r.weapons || []), ...(r.skills || []), ...(r.utility || [])]) if (inRect(q)) return true;
    return false;
  }
  // Android v2 Tahap A — joystick: drag from the joystick zone; a ~12px
  // deadzone keeps the hero still when the thumb rests near the centre.
  // Releasing the stick stops the hero instantly (moveDir = 0).
  _joystickUpdate(x, y) {
    const g = this.game, j = this.renderer.uiRegions.joystick;
    if (!j) return;
    const dxPx = x - j.cx, dyPx = y - j.cy;
    const dead = 12;
    const nx = Math.max(-1, Math.min(1, dxPx / j.r));
    const ny = Math.max(-1, Math.min(1, dyPx / j.r));
    g.joystick = { dx: nx, dy: ny };
    g.moveDir = Math.abs(dxPx) <= dead ? 0 : (dxPx > 0 ? 1 : -1);
  }
  _joystickRelease() {
    this.game.joystick = { dx: 0, dy: 0 };
    this.game.moveDir = 0;
  }
  // Android v2 Tahap A — vertical power slider: top = 100, bottom = 0.
  _sliderSetPower(y) {
    const s = this.renderer.uiRegions.powerSlider;
    if (!s) return;
    const frac = Math.max(0, Math.min(1, (s.y + s.h - y) / s.h));
    this.game.setAim(this.game.aim.angle, Math.round(frac * 100));
  }
  // Shared pointer/touch down handling. Returns the role assigned to this
  // pointer ('joystick' | 'aim' | 'slider') or null (button / ignored).
  _down(x, y, id) {
    const g = this.game;
    if (g.state !== 'combat') return null;
    // Joystick zone first (it overlaps the field, not the HUD rows).
    const j = this.renderer.uiRegions.joystick;
    if (j && g.phase === 'aim' && !g.active().ai && Math.hypot(x - j.cx, y - j.cy) <= j.grabR) {
      this.pointers.set(id, { role: 'joystick', x0: x, y0: y, t: performance.now(), moved: false });
      this._joystickUpdate(x, y);
      return 'joystick';
    }
    // Power slider.
    const s = this.renderer.uiRegions.powerSlider;
    if (s && g.phase === 'aim' && !g.active().ai && x >= s.x - 8 && x <= s.x + s.w + 8 && y >= s.y - 8 && y <= s.y + s.h + 8) {
      this.pointers.set(id, { role: 'slider', x0: x, y0: y, t: performance.now(), moved: false });
      this._sliderSetPower(y);
      return 'slider';
    }
    if (this._hitRegions(x, y)) return null;
    if (g.teleportMode && g.phase === 'aim' && !g.active().ai) {
      const w = g.screenToWorld(x, y);
      g.doTeleport(w.x, w.y);
      return null;
    }
    if (g.phase === 'aim' && !g.active().ai) {
      this.pointers.set(id, { role: 'aim', x0: x, y0: y, t: performance.now(), moved: false });
      const w = g.screenToWorld(x, y);
      g.aimFromTouch(w.x, w.y);
      return 'aim';
    }
    return null;
  }
  _move(x, y, id) {
    const rec = this.pointers.get(id);
    if (!rec) return;
    if (Math.hypot(x - rec.x0, y - rec.y0) > 12) rec.moved = true;
    const g = this.game;
    if (rec.role === 'joystick') this._joystickUpdate(x, y);
    else if (rec.role === 'slider') this._sliderSetPower(y);
    else if (rec.role === 'aim') {
      if (g.phase === 'aim' && !g.active().ai) {
        const w = g.screenToWorld(x, y);
        g.aimFromTouch(w.x, w.y);
      }
    }
  }
  // Returns true if this pointer release should fire (quick tap, no drag).
  _up(id) {
    const rec = this.pointers.get(id);
    this.pointers.delete(id);
    if (!rec) return;
    if (rec.role === 'joystick') this._joystickRelease();
    else if (rec.role === 'aim') {
      const quick = performance.now() - rec.t < 250 && !rec.moved;
      if (quick) {
        const g = this.game;
        if (g.phase === 'aim' && !g.active().ai) g.fire();
      }
    }
  }
  // Android v2 Tahap A — focus loss releases EVERYTHING: a stuck joystick,
  // a half-charge or a held aim must never survive an app switch.
  releaseAllInputs() {
    this.pointers.clear();
    this.keys.clear();
    this._mouseSlider = false;
    const g = this.game;
    g.moveDir = 0; g.joystick = { dx: 0, dy: 0 }; g.charging = false;
  }
  _bind() {
    const g = this.game, c = this.canvas;
    c.addEventListener('mousemove', e => {
      if (this._mouseSlider) { const { y } = this._toLogical(e); this._sliderSetPower(y); return; }
      if (g.state !== 'combat' || g.phase !== 'aim') return;
      const p = g.active(); if (!p || p.ai) return;
      const { x, y } = this._toLogical(e);
      if (this._inUiRegion(x, y)) return; // v3 — don't re-aim over HUD buttons
      // v3 — mouse is in screen coords; the camera offset / zoom-out
      // transform is applied by screenToWorld.
      const w = g.screenToWorld(x, y);
      g.aimFromMouse(w.x, w.y);
    });
    c.addEventListener('mousedown', e => {
      if (g.state !== 'combat') return;
      const { x, y } = this._toLogical(e);
      // Android v2 Tahap A — the power slider also works with a mouse drag.
      const s = this.renderer.uiRegions.powerSlider;
      if (s && g.phase === 'aim' && !g.active().ai && x >= s.x - 8 && x <= s.x + s.w + 8 && y >= s.y - 8 && y <= s.y + s.h + 8) {
        this._mouseSlider = true; this._sliderSetPower(y); return;
      }
      // v2 — teleport targeting: a click while armed teleports instead of firing.
      if (g.teleportMode && g.phase === 'aim' && !g.active().ai) {
        const w = g.screenToWorld(x, y);
        g.doTeleport(w.x, w.y); return;
      }
      if (this._hitRegions(x, y)) return;
      if (g.phase === 'aim' && !g.active().ai) g.fire();
    });
    window.addEventListener('mouseup', () => { this._mouseSlider = false; });
    // ---- Pointer Events (touch + pen). Mouse keeps its own handlers above
    // so a mouse pointer never double-fires through both paths.
    c.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      e.preventDefault(); // also suppresses the compatibility mouse events
      this._ptrDownAt = Date.now();
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const { x, y } = this._toLogical(e);
      this._down(x, y, 'p' + e.pointerId);
    });
    c.addEventListener('pointermove', e => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      const { x, y } = this._toLogical(e);
      this._move(x, y, 'p' + e.pointerId);
    });
    const endPointer = e => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      this._ptrUpAt = Date.now();
      this._up('p' + e.pointerId);
    };
    c.addEventListener('pointerup', endPointer);
    c.addEventListener('pointercancel', e => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      this._ptrUpAt = Date.now();
      this.pointers.delete('p' + e.pointerId);
      this._joystickRelease();
    });
    // ---- Legacy TouchEvent fallback (no Pointer Events in this WebView,
    // or synthetic TouchEvents from tests). Skipped when a pointer gesture
    // just handled the same touch, so one finger never fires twice.
    c.addEventListener('touchstart', e => {
      e.preventDefault();
      if (Date.now() - this._ptrDownAt < 500) return; // pointer already handled it
      if (g.state !== 'combat') return;
      const t = e.changedTouches[0];
      const { x, y } = this._toLogical(t);
      this._down(x, y, 't' + t.identifier);
    }, { passive: false });
    c.addEventListener('touchmove', e => {
      e.preventDefault();
      if (Date.now() - this._ptrDownAt < 500 && this.pointers.size > 0) return;
      const t = e.changedTouches[0];
      const { x, y } = this._toLogical(t);
      this._move(x, y, 't' + t.identifier);
    }, { passive: false });
    c.addEventListener('touchend', e => {
      if (Date.now() - this._ptrUpAt < 500) return; // pointer already handled it
      const t = e.changedTouches[0];
      if (t) this._up('t' + t.identifier);
      else { this._joystickRelease(); this.pointers.clear(); }
    });
    c.addEventListener('touchcancel', () => { this.releaseAllInputs(); });
    // Focus loss: app switch / lock screen / tab hide releases all input.
    window.addEventListener('blur', () => this.releaseAllInputs());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAllInputs(); });
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
        // Android v2 Tahap A — C toggles the camera (follow / zoom-out).
        if (e.code === 'KeyC') g.toggleCamera();
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
