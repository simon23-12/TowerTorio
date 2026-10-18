// Procedural canvas textures (no external assets).
import * as THREE from 'three';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function stoneTexture(base = [42, 44, 52], tiles = 4, seed = 1) {
  const [c, g] = canvas(256);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = `rgb(${base})`;
  g.fillRect(0, 0, 256, 256);
  const ts = 256 / tiles;
  for (let y = 0; y < tiles; y++) for (let x = 0; x < tiles; x++) {
    const v = (rnd() - 0.5) * 18;
    g.fillStyle = `rgb(${base.map(b => Math.max(0, b + v))})`;
    g.fillRect(x * ts + 2, y * ts + 2, ts - 4, ts - 4);
  }
  for (let i = 0; i < 900; i++) {
    const v = rnd() * 30 - 15;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 300})`;
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    g.beginPath(); g.moveTo(i * ts, 0); g.lineTo(i * ts, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * ts); g.lineTo(256, i * ts); g.stroke();
  }
  return finish(c);
}

export function beltTexture() {
  const [c, g] = canvas(64);
  g.fillStyle = '#23272f';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#59657a';
  g.lineWidth = 6;
  g.lineCap = 'round';
  for (const ox of [8, 40]) {
    g.beginPath(); g.moveTo(ox, 14); g.lineTo(ox + 14, 32); g.lineTo(ox, 50); g.stroke();
  }
  return finish(c);
}

export function textTexture(text, color = '#5fa8ff', w = 512, h = 128, font = 'bold 72px Orbitron, sans-serif') {
  const [c, g] = canvas(w, h);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  return finish(c, false);
}

export function groundTexture(N, ore, colors) {
  const px = 16;
  const [c, g] = canvas(N * px);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = 26 + rnd() * 6;
    g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    g.fillRect(x * px, y * px, px, px);
    const o = ore[y * N + x];
    if (o >= 0) {
      const col = colors[o];
      g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.32)`;
      g.fillRect(x * px, y * px, px, px);
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  for (let i = 0; i <= N; i++) {
    g.beginPath(); g.moveTo(i * px + 0.5, 0); g.lineTo(i * px + 0.5, N * px); g.stroke();
    g.beginPath(); g.moveTo(0, i * px + 0.5); g.lineTo(N * px, i * px + 0.5); g.stroke();
  }
  const t = finish(c, false);
  t.magFilter = THREE.LinearFilter;
  return t;
}
