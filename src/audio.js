// ARCANE DUEL — procedural WebAudio: no audio files, everything synthesized.
export class AudioSys {
  constructor() {
    this.ctx = null; this.musicGain = null; this.sfxGain = null;
    this.musicOn = true; this.sfxOn = true; this.musicVol = 0.5; this.sfxVol = 0.7;
    this.muted = false; this._ambient = null;
    try {
      const v = JSON.parse(localStorage.getItem('arcane-duel-settings') || '{}');
      if (typeof v.musicVol === 'number') this.musicVol = v.musicVol;
      if (typeof v.sfxVol === 'number') this.sfxVol = v.sfxVol;
      if (typeof v.muted === 'boolean') this.muted = v.muted;
    } catch (e) { /* storage unavailable: defaults */ }
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.muted ? 0 : this.musicVol * 0.35;
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.muted ? 0 : this.sfxVol;
    this.sfxGain.connect(this.ctx.destination);
    this.startAmbient();
  }
  save() {
    try { localStorage.setItem('arcane-duel-settings', JSON.stringify({ musicVol: this.musicVol, sfxVol: this.sfxVol, muted: this.muted })); } catch (e) { /* ignore */ }
  }
  setMuted(m) { this.muted = m; if (this.ctx) { this.musicGain.gain.value = m ? 0 : this.musicVol * 0.35; this.sfxGain.gain.value = m ? 0 : this.sfxVol; } this.save(); }
  setMusic(v) { this.musicVol = v; if (this.ctx) this.musicGain.gain.value = this.muted ? 0 : v * 0.35; this.save(); }
  setSfx(v) { this.sfxVol = v; if (this.ctx) this.sfxGain.gain.value = this.muted ? 0 : v; this.save(); }
  _tone(freq, dur, type, vol, slideTo, when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  _noise(dur, vol, freq, when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain); src.start(t0);
  }
  click() { this._tone(660, 0.07, 'triangle', 0.25, 880); }
  shoot() { this._noise(0.25, 0.5, 1800); this._tone(220, 0.2, 'sawtooth', 0.25, 60); }
  explosion(big = 1) {
    this._noise(0.6 * big, 0.8, 500); this._tone(90, 0.5 * big, 'sine', 0.7, 30);
    if (big > 1) this._noise(1.0, 0.6, 300, 0.08);
  }
  hit() { this._tone(180, 0.12, 'square', 0.3, 90); this._noise(0.1, 0.3, 900); }
  skill() { [523, 659, 784].forEach((f, i) => this._tone(f, 0.15, 'sine', 0.3, null, i * 0.06)); }
  // v2 sounds.
  teleport() { [880, 1108, 1318, 1760].forEach((f, i) => this._tone(f, 0.12, 'sine', 0.3, null, i * 0.05)); this._tone(220, 0.3, 'sine', 0.2, 880, 0.1); }
  reflect() { this._tone(1200, 0.18, 'square', 0.3, 300); this._tone(1800, 0.12, 'triangle', 0.25, null, 0.05); this._noise(0.15, 0.3, 3000); }
  heal() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.25, 'triangle', 0.3, null, i * 0.09)); }
  // v2.1 — emote blip (two-tone, playful).
  emote() { this._tone(700, 0.08, 'square', 0.22, 990); this._tone(990, 0.1, 'square', 0.2, 660, 0.08); }
  fullpower() { this._noise(0.5, 0.6, 900); this._tone(110, 0.4, 'sawtooth', 0.35, 440); this._tone(880, 0.2, 'sine', 0.25, 1760, 0.1); }
  ultimate() { [392, 523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.25, null, i * 0.09)); this._noise(1.2, 0.5, 400, 0.1); }
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 0.35, 'triangle', 0.35, null, i * 0.12)); }
  defeat() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.4, 'triangle', 0.3, null, i * 0.15)); }
  turn() { this._tone(880, 0.08, 'sine', 0.2); }
  startAmbient() {
    if (!this.ctx || this._ambient) return;
    // Gentle two-oscillator drone + slow shimmer, menu ambience.
    const g = this.ctx.createGain(); g.gain.value = 0.05; g.connect(this.musicGain);
    const o1 = this.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 110;
    const o2 = this.ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 164.8;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lg = this.ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    o1.connect(g); o2.connect(g); o1.start(); o2.start(); lfo.start();
    this._ambient = { o1, o2, lfo, g };
  }
}
