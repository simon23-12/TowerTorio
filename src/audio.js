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
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
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
