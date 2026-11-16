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
    // Android v2 Tahap B — merge, don't overwrite: the same key also
    // carries the graphics quality field (set by the game, not audio).
    try {
      const prev = JSON.parse(localStorage.getItem('arcane-duel-settings') || '{}');
      localStorage.setItem('arcane-duel-settings', JSON.stringify({ ...prev, musicVol: this.musicVol, sfxVol: this.sfxVol, muted: this.muted }));
    } catch (e) { /* ignore */ }
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
  // Android v2 Tahap A — one distinct shot sound per weapon family
  // (WebAudio synth only, no files). kind/id selects the variant.
  shoot(weaponId = 'cannon') {
    if (weaponId === 'beam') { // high, clean zap
      this._tone(1400, 0.18, 'sine', 0.3, 2400); this._noise(0.12, 0.25, 4200);
    } else if (weaponId === 'boulder' || weaponId === 'horn') { // heavy, low thud
      this._tone(70, 0.3, 'sine', 0.5, 40); this._noise(0.3, 0.5, 300);
    } else if (weaponId === 'homing') { // shrill rising whine
      this._tone(880, 0.25, 'sawtooth', 0.22, 1760); this._noise(0.15, 0.2, 2600);
    } else if (weaponId === 'meteor' || weaponId === 'cluster') { // deep roar
      this._tone(160, 0.25, 'sawtooth', 0.3, 50); this._noise(0.3, 0.5, 900);
    } else if (weaponId === 'pierce' || weaponId === 'sting') { // sharp crack
      this._noise(0.12, 0.45, 3200); this._tone(520, 0.12, 'square', 0.22, 180);
    } else { // cannon / triple / moon / dart: classic boom
      this._noise(0.25, 0.5, 1800); this._tone(220, 0.2, 'sawtooth', 0.25, 60);
    }
  }
  // Android v2 Tahap A — elemental effect sounds.
  slow() { this._tone(1250, 0.3, 'sine', 0.25, 620); this._tone(940, 0.35, 'sine', 0.2, 470, 0.08); } // ice chime
  lightning() { this._noise(0.18, 0.6, 5200); this._tone(2100, 0.12, 'square', 0.3, 280); } // chain zap
  firewind() { this._noise(0.4, 0.4, 900); this._tone(300, 0.3, 'sawtooth', 0.18, 950); } // wind-fed whoosh
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
  // v3 — fall into the abyss: long descending slide + deep thud.
  fall() { this._tone(600, 0.9, 'sawtooth', 0.3, 60); this._noise(0.5, 0.5, 300, 0.85); this._tone(70, 0.4, 'sine', 0.6, 30, 0.85); }
  fullpower() { this._noise(0.5, 0.6, 900); this._tone(110, 0.4, 'sawtooth', 0.35, 440); this._tone(880, 0.2, 'sine', 0.25, 1760, 0.1); }
  // v3.1 Skin Feature — one synth recipe per skin theme (no audio files).
  // `lastSkin` is set BEFORE the audio-context check so the probe can
  // verify a skin sound was triggered even when audio is muted/unavailable.
  skinShoot(theme) {
    this.lastSkin = { kind: 'shoot', theme, t: Date.now() };
    if (!this.ctx || this.muted) return;
    const s = {
      dragon: () => { this._tone(160, 0.3, 'sawtooth', 0.35, 50); this._noise(0.35, 0.5, 900); },
      ice: () => { this._tone(1250, 0.25, 'sine', 0.3, 620); this._noise(0.15, 0.3, 5200); },
      thunder: () => { this._noise(0.18, 0.6, 5200); this._tone(2100, 0.12, 'square', 0.3, 280); },
      gold: () => { [523, 659, 784].forEach((f, i) => this._tone(f, 0.2, 'sine', 0.3, null, i * 0.05)); },
      dark: () => { this._tone(90, 0.4, 'sine', 0.5, 30); this._tone(220, 0.3, 'sawtooth', 0.25, 55); },
      toxic: () => { [300, 240, 360, 200].forEach((f, i) => this._tone(f, 0.08, 'sine', 0.25, null, i * 0.06)); },
      holy: () => { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.25, 'triangle', 0.28, null, i * 0.07)); },
      shadow: () => { this._noise(0.35, 0.35, 500); this._tone(440, 0.3, 'sine', 0.25, 110); },
      cyber: () => { [880, 1108, 1318, 1760].forEach((f, i) => this._tone(f, 0.07, 'square', 0.22, null, i * 0.04)); },
      plasma: () => { this._tone(700, 0.25, 'sawtooth', 0.3, 1800); this._noise(0.2, 0.3, 3600); },
      matter: () => { this._tone(55, 0.5, 'sine', 0.55, 28); this._tone(880, 0.3, 'sine', 0.15, 1760, 0.1); },
      lava: () => { this._tone(120, 0.35, 'sawtooth', 0.4, 40); this._noise(0.35, 0.5, 600); },
    }[theme];
    if (s) s(); else this.shoot('cannon');
  }
  skinBoom(theme, big = false) {
    this.lastSkin = { kind: 'boom', theme, big, t: Date.now() };
    if (!this.ctx || this.muted) return;
    const b = big ? 1.6 : 1;
    const s = {
      dragon: () => { this._noise(0.7 * b, 0.8, 700); this._tone(140, 0.5 * b, 'sawtooth', 0.5, 45); this._tone(220, 0.35, 'sawtooth', 0.3, 70, 0.1); },
      ice: () => { this._noise(0.4, 0.5, 6500); [1568, 1318, 1046].forEach((f, i) => this._tone(f, 0.3, 'sine', 0.28, f / 2, i * 0.08)); },
      thunder: () => { this._noise(0.25, 0.7, 6000); this._tone(180, 0.4, 'sine', 0.6, 35); this._noise(0.4 * b, 0.6, 900, 0.1); },
      gold: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 0.35, 'triangle', 0.3, null, i * 0.08)); this._noise(0.5, 0.35, 2400); },
      dark: () => { this._tone(70, 0.6 * b, 'sine', 0.7, 25); this._noise(0.5, 0.5, 400); this._tone(311, 0.4, 'square', 0.2, 155, 0.05); },
      toxic: () => { [400, 320, 480, 260, 380].forEach((f, i) => this._tone(f, 0.1, 'sine', 0.28, null, i * 0.07)); this._noise(0.4, 0.4, 1200); },
      holy: () => { [392, 523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.4, 'triangle', 0.3, null, i * 0.09)); },
      shadow: () => { this._noise(0.6, 0.45, 350); this._tone(330, 0.5, 'sine', 0.3, 82); },
      cyber: () => { [660, 880, 660, 1108, 880].forEach((f, i) => this._tone(f, 0.09, 'square', 0.25, null, i * 0.05)); this._noise(0.3, 0.4, 4200); },
      plasma: () => { this._tone(900, 0.3, 'sawtooth', 0.35, 200); this._tone(300, 0.4, 'sawtooth', 0.3, 1200, 0.08); this._noise(0.4, 0.5, 2600); },
      matter: () => { this._tone(45, 0.8 * b, 'sine', 0.7, 22); this._noise(0.6, 0.4, 300); this._tone(1760, 0.3, 'sine', 0.12, 880, 0.15); },
      lava: () => { this._noise(0.7 * b, 0.8, 500); this._tone(100, 0.5 * b, 'sawtooth', 0.5, 30); this._noise(0.5, 0.4, 900, 0.12); },
    }[theme];
    if (s) s(); else this.explosion(b);
  }
  skinFullPower(theme) {
    this.lastSkin = { kind: 'fullpower', theme, t: Date.now() };
    if (!this.ctx || this.muted) return;
    this.fullpower();
    const s = {
      dragon: () => { this._tone(180, 0.5, 'sawtooth', 0.4, 60); this._tone(90, 0.6, 'sawtooth', 0.4, 45, 0.1); },
      ice: () => { [2093, 1760, 1568, 1318].forEach((f, i) => this._tone(f, 0.3, 'sine', 0.28, null, i * 0.07)); },
      thunder: () => { this._noise(0.3, 0.7, 6500); this._tone(120, 0.5, 'sine', 0.6, 30, 0.05); },
      gold: () => { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this._tone(f, 0.35, 'triangle', 0.3, null, i * 0.08)); },
      dark: () => { this._tone(60, 0.7, 'sine', 0.65, 24); this._tone(415, 0.5, 'square', 0.2, 207, 0.1); },
      toxic: () => { [500, 400, 600, 300, 500, 250].forEach((f, i) => this._tone(f, 0.1, 'sine', 0.28, null, i * 0.06)); },
      holy: () => { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 0.4, 'triangle', 0.3, null, i * 0.09)); },
      shadow: () => { this._noise(0.7, 0.45, 300); this._tone(262, 0.6, 'sine', 0.3, 65); },
      cyber: () => { [523, 784, 1046, 784, 1318, 1568].forEach((f, i) => this._tone(f, 0.09, 'square', 0.24, null, i * 0.05)); },
      plasma: () => { this._tone(1200, 0.4, 'sawtooth', 0.35, 150); this._tone(240, 0.5, 'sawtooth', 0.3, 1500, 0.1); },
      matter: () => { this._tone(40, 0.9, 'sine', 0.7, 20); this._tone(2093, 0.4, 'sine', 0.12, 1046, 0.2); },
      lava: () => { this._tone(110, 0.6, 'sawtooth', 0.5, 35); this._noise(0.6, 0.6, 600); },
    }[theme];
    if (s) s();
  }
  ultimate() { [392, 523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.25, null, i * 0.09)); this._noise(1.2, 0.5, 400, 0.1); }
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 0.35, 'triangle', 0.35, null, i * 0.12)); }
  defeat() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.4, 'triangle', 0.3, null, i * 0.15)); }
  turn() { this._tone(880, 0.08, 'sine', 0.2); }
  // Android v2 Tahap B — character shouts: a short synth cry, different
  // per hero, played on ultimate + on defeat. No audio files.
  shout(heroId = 'kairo') {
    if (!this.ctx || this.muted) return;
    const voices = {
      kairo: { type: 'sawtooth', f: 210, slide: 90, dur: 0.35, vol: 0.35 },   // fiery growl
      nyx: { type: 'sine', f: 880, slide: 1320, dur: 0.3, vol: 0.3 },        // arcane cry
      bront: { type: 'sawtooth', f: 95, slide: 48, dur: 0.45, vol: 0.4 },    // deep roar
      kumbang: { type: 'square', f: 140, slide: 70, dur: 0.35, vol: 0.3 },
      momok: { type: 'sawtooth', f: 620, slide: 200, dur: 0.35, vol: 0.3 },
      tawon: { type: 'square', f: 1200, slide: 900, dur: 0.22, vol: 0.25 },
    };
    const v = voices[heroId] || voices.kairo;
    this._tone(v.f, v.dur, v.type, v.vol, v.slide);
    this._tone(v.f * 1.5, v.dur * 0.8, 'triangle', v.vol * 0.6, v.slide * 1.5, 0.05);
  }
  // Android v2 Tahap B — a melody note through the MUSIC bus (follows the
  // music volume + mute, unlike _tone which is SFX).
  _melodyTone(freq, dur, vol = 0.14) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.musicGain); o.start(t0); o.stop(t0 + dur + 0.02);
  }
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
    // Android v2 Tahap B — slow pentatonic melody loop over the drone
    // (A minor pentatonic, one soft note per ~0.55s step, rests included).
    // WebAudio only, no files; volume follows the music setting via
    // musicGain; starts only after ensure() (user interaction).
    const SCALE = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const PATTERN = [0, -1, 2, -1, 4, 3, -1, 2, 5, -1, 4, 2, 1, -1, 0, -1];
    this._melodyStep = 0;
    this.melodyPlaying = true;
    this._melodyTimer = setInterval(() => {
      if (!this.ctx || this.muted) { this._melodyStep++; return; }
      const idx = PATTERN[this._melodyStep % PATTERN.length];
      this._melodyStep++;
      if (idx < 0) return;
      this._melodyTone(SCALE[idx % SCALE.length], 0.9);
      // Occasional soft harmony a fifth below on the downbeat.
      if (this._melodyStep % 8 === 1) this._melodyTone(SCALE[idx % SCALE.length] / 2, 1.4, 0.07);
    }, 550);
  }
}
