// Menu music (compressed Opus with MP3 fallback) + tiny synthesized sound effects.
import { on } from './state.js';

class AudioManager {
  constructor() {
    this.music = new Audio();
    const probe = document.createElement('audio');
    const opus = probe.canPlayType('audio/ogg; codecs="opus"');
    this.music.src = opus ? 'assets/menu.ogg' : 'assets/menu.mp3';
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.volume = 0;
    this.musicTarget = 0.6;
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

  playMusic() { this.music.play().catch(() => {}); }
  setMusicLevel(v) { this.musicTarget = v; }

  toggleMute() {
    this.muted = !this.muted;
    this.music.muted = this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  }

  update(dt) {
    const v = this.music.volume, t = this.musicTarget;
    if (Math.abs(v - t) > 0.005) {
      try { this.music.volume = Math.max(0, Math.min(1, v + Math.sign(t - v) * Math.min(Math.abs(t - v), dt * 0.5))); } catch (e) { /* iOS: volume is read-only */ }
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
