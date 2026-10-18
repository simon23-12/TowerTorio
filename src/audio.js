// Music (menu track + shuffled in-game playlist) and tiny synthesized sound effects.
import { on, emit } from './state.js';

// In-game playlist (OpenGameArt, see CREDITS.md). Each track ships as Opus with an MP3 fallback.
export const GAME_MUSIC = [
  { file: 'track01', title: 'Crystal Cave', artist: 'cynicmusic', license: 'CC0' },
  { file: 'track02', title: 'Battle Theme A', artist: 'cynicmusic', license: 'CC0' },
  { file: 'track03', title: 'Cyberpunk Moonlight Sonata', artist: 'Joth', license: 'CC0' },
  { file: 'track04', title: 'Heroic Demise', artist: 'Matthew Pablo', license: 'CC-BY 3.0' },
  { file: 'track05', title: 'Mystical Theme', artist: 'Alexandr Zhelanov', license: 'CC-BY 3.0' },
  { file: 'track06', title: 'No More Magic', artist: 'HorrorPen', license: 'CC-BY 3.0' },
  { file: 'track07', title: 'Cave Theme', artist: 'HaelDB', license: 'CC0' },
  { file: 'track08', title: 'Orbital Colossus', artist: 'Matthew Pablo', license: 'CC-BY 3.0' },
  { file: 'track09', title: 'Rise of Spirit', artist: 'Alexandr Zhelanov', license: 'CC-BY 3.0' },
  { file: 'track10', title: 'Epic Boss Battle', artist: 'Juhani Junkala', license: 'CC0' },
];

const ext = document.createElement('audio').canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'mp3';

class AudioManager {
  constructor() {
    const menu = new Audio(`assets/menu.${ext}`);
    menu.loop = true;
    menu.preload = 'auto';
    menu.volume = 0;
    const game = new Audio();
    game.preload = 'none';
    game.volume = 0;
    game.addEventListener('ended', () => this.nextSong());
    this.tracks = { menu: { el: menu, target: 0 }, game: { el: game, target: 0 } };
    this.playlist = [];
    this.song = null;
    this.current = null;
    this.muted = false;
    this.ctx = null;
    this.last = {};
    this.visible = { defense: true, factory: true };
    this.g = 1;
    on('sfx', d => (typeof d === 'string' ? this.sfx(d) : this.sfx(d.name, d.view)));
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // shuffled playlist, never repeating the song that just ended
  nextSong() {
    if (!this.playlist.length) {
      this.playlist = GAME_MUSIC.slice().sort(() => Math.random() - 0.5);
      if (this.playlist[0] === this.song && this.playlist.length > 1) this.playlist.push(this.playlist.shift());
    }
    this.song = this.playlist.shift();
    const el = this.tracks.game.el;
    el.src = `assets/music/${this.song.file}.${ext}`;
    if (this.current === 'game') {
      el.play().catch(() => {});
      emit('song', this.song);
    }
  }

  // cross-fade to 'menu', 'game' or null
  playTrack(name, volume = 0.6) {
    this.current = name;
    if (name === 'game' && !this.song) this.nextSong();
    for (const [k, t] of Object.entries(this.tracks)) {
      t.target = k === name ? volume : 0;
      if (k === name && t.el.paused) {
        t.el.play().catch(() => {});
        if (k === 'game') emit('song', this.song);
      }
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    for (const t of Object.values(this.tracks)) t.el.muted = this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  update(dt) {
    for (const t of Object.values(this.tracks)) {
      const v = t.el.volume;
      if (Math.abs(v - t.target) > 0.005) {
        try { t.el.volume = Math.max(0, Math.min(1, v + Math.sign(t.target - v) * Math.min(Math.abs(t.target - v), dt * 0.6))); } catch (e) { /* iOS: volume is read-only */ }
      } else if (t.target === 0 && !t.el.paused) t.el.pause();
    }
  }

  // one oscillator with a pitch sweep and an exponential decay
  tone(type, f0, f1, dur, gain, delay = 0, attack = 0.004) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * this.g, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // filtered noise burst
  burst(dur, gain, freq = 1200, delay = 0, type = 'bandpass', q = 0.8, sweepTo = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain * this.g, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.05);
  }

  // short slap-back echo for lasers, teleports and fanfares
  _echoBus() {
    if (this.echo) return this.echo;
    const c = this.ctx, d = c.createDelay(0.5), fb = c.createGain(), wet = c.createGain();
    d.delayTime.value = 0.13; fb.gain.value = 0.28; wet.gain.value = 0.35;
    d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(this.master);
    const inp = c.createGain();
    inp.connect(this.master); inp.connect(d);
    return (this.echo = inp);
  }

  sfx(name, view) {
    if (!this.ctx || this.muted) return;
    // sounds from a map that isn't on screen are thinned out and played much quieter
    const vis = !view || this.visible[view];
    if (!vis && !['wave', 'alarm', 'destroyed', 'fanfare'].includes(name) && Math.random() > 0.35) return;
    this.g = vis ? 1 : 0.25;
    const now = performance.now();
    const gap = { shoot: 60, laser: 60, twin: 80, hit: 45, crit: 60, kill: 35, deliver: 110, teleport: 110, drill: 220, refine: 160, hurt: 160, zap: 90, frost: 120, coin: 80, shield: 120, spit: 120 }[name] ?? 30;
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    this.out = ['laser', 'twin', 'zap', 'teleport', 'fanfare', 'upgrade', 'special', 'wave'].includes(name) ? this._echoBus() : this.master;
    const r = (a, b) => a + Math.random() * (b - a);
    switch (name) {
      // corridor
      case 'shoot': this.burst(0.05, 0.18, r(2500, 3200), 0, 'highpass', 0.7); this.tone('triangle', r(520, 600), 220, 0.12, 0.12); break;
      case 'laser': this.tone('sawtooth', r(1500, 1800), 260, 0.16, 0.08); this.tone('square', r(900, 1000), 180, 0.12, 0.04); break;
      case 'twin': this.tone('sawtooth', 2100, 400, 0.14, 0.07); this.tone('sawtooth', 1600, 300, 0.14, 0.05, 0.03); break;
      case 'hit': this.burst(0.07, 0.22, r(900, 1400), 0, 'bandpass', 1.2); this.tone('sine', 180, 90, 0.06, 0.12); break;
      case 'crit': this.burst(0.09, 0.3, 3000, 0, 'bandpass', 2); this.tone('square', 1400, 2400, 0.08, 0.07); break;
      case 'kill': this.burst(0.18, 0.28, 700, 0, 'lowpass', 1, 150); this.tone('square', r(260, 320), 55, 0.2, 0.08); break;
      case 'coin': [1320, 1760].forEach((f, i) => this.tone('triangle', f, f, 0.14, 0.12, i * 0.06)); break;
      case 'zap': for (let i = 0; i < 3; i++) this.tone('sawtooth', r(600, 1800), r(200, 500), 0.05, 0.07, i * 0.035); this.burst(0.12, 0.12, 4000, 0, 'highpass'); break;
      case 'frost': this.tone('sine', 2400, 1200, 0.25, 0.06); this.burst(0.2, 0.08, 6000, 0, 'highpass', 0.5); break;
      case 'shield': this.tone('sine', 520, 780, 0.18, 0.14); this.tone('sine', 1040, 1560, 0.18, 0.06); break;
      case 'hurt': this.burst(0.12, 0.3, 300, 0, 'lowpass', 1); this.tone('sine', 110, 60, 0.14, 0.18); break;
      case 'spit': this.burst(0.15, 0.12, 900, 0, 'bandpass', 3, 300); break;
      case 'alarm': this.tone('square', 880, 880, 0.12, 0.08); this.tone('square', 660, 660, 0.16, 0.08, 0.14); this.tone('square', 880, 880, 0.12, 0.06, 0.32); break;
      case 'wave': this.tone('sawtooth', 110, 98, 1.3, 0.16, 0, 0.12); this.tone('sawtooth', 165, 147, 1.3, 0.09, 0, 0.12); this.burst(1.2, 0.08, 200, 0, 'lowpass', 1); break;
      case 'fanfare': [523, 659, 784, 1047, 1319].forEach((f, i) => { this.tone('triangle', f, f, 0.5, 0.14, i * 0.09, 0.01); this.tone('sine', f / 2, f / 2, 0.6, 0.08, i * 0.09); }); break;
      case 'build': this.burst(0.25, 0.25, 250, 0, 'lowpass', 1); [392, 523, 659].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.13, 0.05 + i * 0.07)); break;
      case 'destroyed': this.burst(0.9, 0.45, 400, 0, 'lowpass', 1, 60); this.tone('sawtooth', 160, 35, 0.9, 0.16); break;
      case 'boom': this.burst(0.35, 0.35, 500, 0, 'lowpass', 1, 80); this.tone('sine', 140, 40, 0.3, 0.2); break;
      case 'special': this.tone('sawtooth', 200, 1400, 0.6, 0.09, 0, 0.05); this.burst(0.6, 0.12, 2000, 0, 'bandpass', 1, 6000); break;
      // factory
      case 'teleport': this.tone('sine', 400, 1600, 0.22, 0.09); this.tone('triangle', 1760, 2637, 0.18, 0.05, 0.12); this.burst(0.25, 0.06, 1500, 0, 'bandpass', 1, 5000); break;
      case 'deliver': this.tone('sine', 1300, 1700, 0.09, 0.06); break;
      case 'refine': this.burst(0.08, 0.15, 500, 0, 'bandpass', 4); this.tone('triangle', r(330, 370), r(330, 370), 0.12, 0.06, 0.03); break;
      case 'drill': this.burst(0.09, 0.08, r(1800, 2400), 0, 'bandpass', 6); break;
      case 'place': this.tone('sine', 560, 380, 0.07, 0.16); this.burst(0.05, 0.1, 2500, 0, 'highpass'); break;
      case 'remove': this.tone('sine', 380, 160, 0.12, 0.14); this.burst(0.1, 0.08, 800, 0, 'lowpass'); break;
      case 'upgrade': [659, 784, 988, 1319].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.22, 0.12, i * 0.06)); this.burst(0.5, 0.06, 6000, 0.1, 'highpass'); break;
      // ui
      case 'tier': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.12, i * 0.07)); break;
      case 'error': this.tone('sawtooth', 150, 110, 0.2, 0.09); break;
      case 'click': this.tone('sine', 720, 720, 0.04, 0.08); break;
    }
  }
}

export const audio = new AudioManager();
