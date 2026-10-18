// Music (menu track + optional in-game track) and tiny synthesized sound effects.
import { on } from './state.js';

// In-game music: drop files into assets/ and list them here (Opus first, MP3 fallback),
// e.g. ['assets/game.ogg', 'assets/game.mp3']. Empty = silence during gameplay.
export const GAME_MUSIC = [];

const opus = document.createElement('audio').canPlayType('audio/ogg; codecs="opus"');
function track(srcs) {
  const src = srcs.find(s => opus || !s.endsWith('.ogg'));
  if (!src) return null;
  const a = new Audio(src);
  a.loop = true;
  a.preload = 'auto';
  a.volume = 0;
  return { el: a, target: 0 };
}

class AudioManager {
  constructor() {
    this.tracks = { menu: track(['assets/menu.ogg', 'assets/menu.mp3']), game: track(GAME_MUSIC) };
    this.current = null;
    this.muted = false;
    this.ctx = null;
    this.last = {};
    on('sfx', name => this.sfx(name));
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // cross-fade to 'menu', 'game' or null
  playTrack(name, volume = 0.6) {
    this.current = name;
    for (const [k, t] of Object.entries(this.tracks)) {
      if (!t) continue;
      t.target = k === name ? volume : 0;
      if (k === name && t.el.paused) t.el.play().catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    for (const t of Object.values(this.tracks)) if (t) t.el.muted = this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  }

  update(dt) {
    for (const t of Object.values(this.tracks)) {
      if (!t) continue;
      const v = t.el.volume;
      if (Math.abs(v - t.target) > 0.005) {
        try { t.el.volume = Math.max(0, Math.min(1, v + Math.sign(t.target - v) * Math.min(Math.abs(t.target - v), dt * 0.6))); } catch (e) { /* iOS: volume is read-only */ }
      } else if (t.target === 0 && !t.el.paused) t.el.pause();
    }
  }

  tone(type, f0, f1, dur, gain, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  burst(dur, gain, freq = 1200, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur);
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    const gap = { shoot: 70, hit: 50, deliver: 140, kill: 40 }[name] ?? 30;
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot': this.tone('triangle', 900, 300, 0.07, 0.05); break;
      case 'hit': this.burst(0.06, 0.08, 2200); break;
      case 'kill': this.tone('square', 320, 60, 0.16, 0.05); this.burst(0.12, 0.06, 600); break;
      case 'build': this.tone('sine', 440, 440, 0.08, 0.15); this.tone('sine', 660, 660, 0.12, 0.15, 0.08); break;
      case 'place': this.tone('sine', 520, 380, 0.06, 0.1); break;
      case 'remove': this.tone('sine', 300, 150, 0.1, 0.1); break;
      case 'error': this.tone('sawtooth', 140, 110, 0.18, 0.08); break;
      case 'alert': this.tone('square', 880, 880, 0.09, 0.05); this.tone('square', 660, 660, 0.12, 0.05, 0.12); break;
      case 'wave': this.tone('sawtooth', 110, 98, 1.1, 0.12); this.tone('sawtooth', 165, 147, 1.1, 0.06); break;
      case 'tier': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.1, i * 0.07)); break;
      case 'deliver': this.tone('sine', 1300, 1700, 0.09, 0.04); break;
      case 'special': this.tone('sawtooth', 200, 1200, 0.5, 0.08); this.burst(0.5, 0.06, 3000); break;
      case 'boom': this.burst(0.25, 0.12, 400); this.tone('sine', 120, 40, 0.25, 0.12); break;
      case 'destroyed': this.burst(0.6, 0.18, 300); this.tone('sawtooth', 200, 40, 0.7, 0.1); break;
      case 'click': this.tone('sine', 700, 700, 0.04, 0.06); break;
    }
  }
}

export const audio = new AudioManager();
