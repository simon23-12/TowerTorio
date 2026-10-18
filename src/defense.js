// The tower-defense map: a long dark corridor split into sectors, covered by fog of war.
import * as THREE from 'three';
import {
  game, emit, toast, spend, earn, towerStats, RESOURCES, RES_KEYS,
  SECTORS, SECTOR_LEN, CORRIDOR_W, CORRIDOR_LEN,
} from './state.js';
import { stoneTexture, textTexture } from './textures.js';

const SL = SECTOR_LEN, L = CORRIDOR_LEN, HW = CORRIDOR_W / 2;
const NV = 20;          // max vision sources in the fog shader
const FOG_Y = 4.4;      // height of the fog plane

export const ENEMY_TYPES = {
  crawler:  { name: 'Crawler',  hp: 14,   speed: 2.4, dmg: 4,  range: 1.4, atkRate: 1.0, reward: 4,   leak: 1,  color: '#ff5a4a', desc: 'Swarming bug. Weak alone, dangerous in numbers. Chews on any tower it passes.' },
  runner:   { name: 'Runner',   hp: 9,    speed: 4.6, dmg: 0,  range: 0,   atkRate: 0,   reward: 5,   leak: 1,  color: '#ffa040', ignoresTowers: true, desc: 'Fast and fragile. Ignores towers and sprints straight for the core.' },
  brute:    { name: 'Brute',    hp: 120,  speed: 1.4, dmg: 10, range: 1.8, atkRate: 0.6, reward: 20,  leak: 3,  color: '#c080ff', desc: 'Armored juggernaut. Hunts down towers and smashes them.' },
  spitter:  { name: 'Spitter',  hp: 35,   speed: 2.0, dmg: 8,  range: 9,   atkRate: 0.5, reward: 8,   leak: 2,  color: '#60ff60', ranged: true, desc: 'Lobs acid at towers from long range. Kill it before it gets close.' },
  colossus: { name: 'Colossus', hp: 1200, speed: 1.0, dmg: 45, range: 2.6, atkRate: 0.5, reward: 150, leak: 12, color: '#ff40c0', boss: true, desc: 'Boss of every 10th wave. Brings the walls down.' },
};

export const SPECIALS = [
  { id: 'slow', name: 'Time Warp',   key: '1', cost: 30, req: 1, desc: 'Slows all enemies by 60% for 6s' },
  { id: 'hail', name: 'Energy Hail', key: '2', cost: 50, req: 2, desc: 'Rains energy bolts on the largest visible swarm' },
  { id: 'over', name: 'Overdrive',   key: '3', cost: 40, req: 3, desc: 'Towers fire 2.5× faster for 6s' },
];

// ---------- shared geometry & materials ----------
const G = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 8),
  oct: new THREE.OctahedronGeometry(1),
  bar: new THREE.PlaneGeometry(1, 1),
  particle: new THREE.BoxGeometry(0.14, 0.14, 0.14),
  shaft: new THREE.CylinderGeometry(0.035, 0.035, 0.9, 5).rotateX(Math.PI / 2),
  tip: new THREE.ConeGeometry(0.08, 0.22, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5),
  bolt: new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6).rotateX(Math.PI / 2),
};
const std = (color, emissive = 0, ei = 1, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.75, metalness: 0.1, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

const M = {
  crawler: std(0x4a1a18, 0x200000), crawlerEye: basic(0xff3020),
  runner: std(0x5a3a18, 0x301000), runnerEye: basic(0xffd040),
  brute: std(0x3a2a50, 0x100020), bruteVisor: basic(0xc070ff),
  spitter: std(0x1e3a1e), spitterSac: std(0x30ff40, 0x20ff30, 1.2, { transparent: true, opacity: 0.85 }),
  colossus: std(0x401030, 0x200010), colossusEye: basic(0xff30c0),
  leg: std(0x1a1414),
  barBg: basic(0x000000, { transparent: true, opacity: 0.6, depthTest: false }),
  barFg: basic(0xff4040, { depthTest: false }),
  barTower: basic(0x40ff80, { depthTest: false }),
  stone: std(0x5a5650), stoneDark: std(0x34312e),
  wood: std(0x6a4528), arrowTip: basic(0xffc080),
  spit: basic(0x60ff40),
  hailBolt: basic(0xa0f0ff),
  rubble: std(0x2a2826),
};
const ARROW_COLORS = [0xffd090, 0xffa040, 0xff6030, 0xff3060, 0xd040ff, 0x9070ff, 0x60c0ff, 0xffffff];
const arrowMats = ARROW_COLORS.map(c => basic(c));
const particleMats = new Map();
const pmat = c => { if (!particleMats.has(c)) particleMats.set(c, basic(c)); return particleMats.get(c); };

function mesh(geo, mat, sx = 1, sy = sx, sz = sx, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

function makeBar(width, mat, y) {
  const g = new THREE.Group();
  const bg = mesh(G.bar, M.barBg, width + 0.08, 0.2, 1);
  const fg = mesh(G.bar, mat, width, 0.12, 1, 0, 0, 0.01);
  bg.renderOrder = 10; fg.renderOrder = 11;
  g.add(bg, fg);
  g.position.y = y;
  g.userData = { fg, width };
  g.visible = false;
  return g;
}
function setBar(bar, frac) {
  const { fg, width } = bar.userData;
  frac = Math.max(0, Math.min(1, frac));
  fg.scale.x = Math.max(0.001, width * frac);
  fg.position.x = -width * (1 - frac) / 2;
}

function buildEnemyMesh(type) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs = [];
  const addLeg = (x, y, z, sx, sy, sz, side) => {
    const l = mesh(G.box, M.leg, sx, sy, sz, x, y, z);
    l.userData.side = side;
    body.add(l); legs.push(l);
  };
  let barY = 1.3, barW = 1;
  switch (type) {
    case 'crawler':
      body.add(mesh(G.sphere, M.crawler, 0.6, 0.35, 0.5, 0, 0.45, 0));
      body.add(mesh(G.sphere, M.crawler, 0.32, 0.28, 0.3, 0.5, 0.5, 0));
      body.add(mesh(G.sphere, M.crawlerEye, 0.07, 0.07, 0.07, 0.76, 0.58, 0.12));
      body.add(mesh(G.sphere, M.crawlerEye, 0.07, 0.07, 0.07, 0.76, 0.58, -0.12));
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) addLeg(-0.3 + i * 0.3, 0.25, s * 0.5, 0.07, 0.4, 0.07, s);
      break;
    case 'runner':
      body.add(mesh(G.cone, M.runner, 0.28, 1.0, 0.28, 0, 1.0, 0));
      body.children[0].rotation.z = -0.6;
      body.add(mesh(G.sphere, M.runner, 0.22, 0.2, 0.2, 0.35, 1.45, 0));
      body.add(mesh(G.sphere, M.runnerEye, 0.07, 0.07, 0.1, 0.55, 1.5, 0));
      for (const s of [-1, 1]) addLeg(0, 0.4, s * 0.15, 0.08, 0.8, 0.08, s);
      barY = 2.0; barW = 0.8;
      break;
    case 'brute':
      body.add(mesh(G.box, M.brute, 1.3, 1.1, 1.2, 0, 1.25, 0));
      body.add(mesh(G.sphere, M.brute, 0.45, 0.45, 0.45, 0, 1.75, 0.75));
      body.add(mesh(G.sphere, M.brute, 0.45, 0.45, 0.45, 0, 1.75, -0.75));
      body.add(mesh(G.box, M.bruteVisor, 0.12, 0.15, 0.7, 0.66, 1.5, 0));
      for (const s of [-1, 1]) addLeg(0, 0.4, s * 0.38, 0.4, 0.8, 0.35, s);
      barY = 2.5; barW = 1.6;
      break;
    case 'spitter':
      body.add(mesh(G.sphere, M.spitter, 0.5, 0.4, 0.45, 0, 0.7, 0));
      body.add(mesh(G.sphere, M.spitterSac, 0.42, 0.42, 0.42, -0.25, 1.1, 0));
      body.add(mesh(G.cyl, M.spitter, 0.1, 0.5, 0.1, 0.45, 1.0, 0));
      body.children[2].rotation.z = -0.8;
      for (let i = 0; i < 2; i++) for (const s of [-1, 1]) addLeg(-0.2 + i * 0.4, 0.3, s * 0.4, 0.08, 0.6, 0.08, s);
      barY = 1.8;
      break;
    case 'colossus':
      body.add(mesh(G.box, M.colossus, 2.6, 2.2, 2.4, 0, 2.4, 0));
      body.add(mesh(G.sphere, M.colossus, 0.9, 0.9, 0.9, 0, 3.4, 1.5));
      body.add(mesh(G.sphere, M.colossus, 0.9, 0.9, 0.9, 0, 3.4, -1.5));
      body.add(mesh(G.cone, M.colossusEye, 0.18, 0.9, 0.18, 0.6, 3.9, 0.7));
      body.add(mesh(G.cone, M.colossusEye, 0.18, 0.9, 0.18, 0.6, 3.9, -0.7));
      body.add(mesh(G.box, M.colossusEye, 0.15, 0.25, 1.4, 1.32, 2.9, 0));
      for (const s of [-1, 1]) addLeg(0, 0.7, s * 0.8, 0.8, 1.4, 0.7, s);
      barY = 4.3; barW = 3;
      break;
  }
  const bar = makeBar(barW, M.barFg, barY);
  root.add(bar);
  return { root, body, legs, bar };
}

function buildTowerMesh() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl, M.stoneDark, 1.25, 0.6, 1.25, 0, 0.3, 0));
  g.add(mesh(G.cyl, M.stone, 0.62, 3.0, 0.62, 0, 2.0, 0));
  g.add(mesh(G.cyl, M.stone, 1.0, 0.35, 1.0, 0, 3.6, 0));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    g.add(mesh(G.box, M.stone, 0.32, 0.4, 0.32, Math.cos(a) * 0.82, 3.95, Math.sin(a) * 0.82));
  }
  const crystalMat = basic(0xffd090);
  const crystal = mesh(G.oct, crystalMat, 0.38, 0.55, 0.38, 0, 4.6, 0);
  g.add(crystal);
  // one ring per stat, shown once that stat has a tier
  const rings = RES_KEYS.map((k, i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 24), basic(RESOURCES[k].color));
    r.rotation.x = Math.PI / 2;
    r.position.y = 1.2 + i * 0.55;
    r.visible = false;
    g.add(r);
    return r;
  });
  const bar = makeBar(2.2, M.barTower, 5.6);
  bar.visible = true;
  g.add(bar);
  return { group: g, crystal, crystalMat, rings, bar };
}

function buildRubble() {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const s = 0.3 + Math.random() * 0.5;
    const m = mesh(G.box, M.rubble, s, s * 0.6, s, (Math.random() - 0.5) * 2, s * 0.3, (Math.random() - 0.5) * 2);
    m.rotation.set(Math.random(), Math.random() * 3, Math.random());
    g.add(m);
  }
  return g;
}

// ---------- fog of war shader ----------
const fogVertex = /* glsl */`
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const fogFragment = /* glsl */`
#define NS ${SECTORS}
#define NV ${NV}
uniform float uState[NS];
uniform vec3 uVision[NV];
uniform int uCount;
uniform float uTime;
uniform float uSL;
varying vec3 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
float stAt(float i) {
  if (i < 0.0) return 2.0;
  if (i > float(NS - 1)) return 0.0;
  int k = int(i); float r = 0.0;
  for (int j = 0; j < NS; j++) { if (j == k) r = uState[j]; }
  return r;
}
void main() {
  float s = vW.x / uSL;
  float i = floor(s), f = fract(s);
  float a = stAt(i), b = stAt(i + 1.0), c = stAt(i - 1.0);
  float st = a;
  st = mix(st, (a + b) * 0.5, smoothstep(0.8, 1.0, f));
  st = mix(st, (a + c) * 0.5, smoothstep(0.2, 0.0, f));
  float n = fbm(vW.xz * 0.12 + vec2(uTime * 0.05, uTime * 0.02));
  float n2 = fbm(vW.xz * 0.3 - vec2(uTime * 0.09, uTime * 0.03));
  float alpha = st < 1.0 ? mix(1.0, 0.55, st) : mix(0.55, 0.0, st - 1.0);
  float fogness = clamp(st, 0.0, 1.0) * (1.0 - clamp(st - 1.0, 0.0, 1.0));
  alpha *= mix(1.0, 0.75 + 0.45 * n, fogness);
  float v = 0.0;
  for (int k = 0; k < NV; k++) {
    if (k >= uCount) break;
    vec3 V = uVision[k];
    float d = distance(vW.xz, V.xy);
    v = max(v, 1.0 - smoothstep(V.z * 0.7, V.z, d));
  }
  alpha *= (1.0 - v);
  vec3 col = mix(vec3(0.0), vec3(0.09, 0.11, 0.16) * (0.5 + 0.9 * n2), fogness);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}`;

// ---------- the map ----------
export class Defense {
  constructor(attract = false) {
    this.attract = attract;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020308);
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.5, 400);
    this.camX = 14; this.zoom = 1.35; this.time = 0; this.shake = 0;
    this.enemies = []; this.arrows = []; this.spits = []; this.bolts = []; this.particles = []; this.fx = [];
    this.wave = 0; this.waveTimer = attract ? 1 : 40; this.waveActive = false;
    this.spawnQueue = []; this.spawnTimer = 0; this.bonusPending = 0;
    this.energy = 0; this.slowT = 0; this.overT = 0; this.hail = null;
    this.sectorState = new Array(SECTORS).fill(0);
    this.sectorState[0] = 1;
    this.selected = null; this.hoverPad = null;
    this.lastTowerHit = -99; this.lastHitSector = 0;
    this.keys = new Set();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._buildWorld();
    this._buildPads();
    this._buildFog();
    if (attract) {
      this.sectorState.fill(1);
      [0, 1, 3, 4, 6].forEach(i => this._placeTower(this.pads[i]));
    }
    this.updateCamera(0);
  }

  stats() {
    return this.attract ? towerStats({ alcamanium: 2, vitrium: 3, quicksilite: 2, voltarite: 1 }) : towerStats();
  }

  // ----- world building -----
  _buildWorld() {
    const s = this.scene;
    s.add(new THREE.AmbientLight(0x5a6490, 2.4));
    const moon = new THREE.DirectionalLight(0x99aaff, 2.0);
    moon.position.set(30, 60, 40);
    s.add(moon);
    s.add(new THREE.HemisphereLight(0x223355, 0x100805, 0.6));

    const gTex = stoneTexture([30, 30, 36], 2, 3);
    gTex.repeat.set((L + 100) / 10, 80 / 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L + 100, 80), std(0x777788, 0, 0, { map: gTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(L / 2, -0.03, 0);
    s.add(ground);

    const fTex = stoneTexture([62, 60, 66], 4, 11);
    fTex.repeat.set((L + 10) / 4, CORRIDOR_W / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L + 10, CORRIDOR_W), std(0x9a98a8, 0, 0, { map: fTex, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(L / 2 - 3, 0, 0);
    s.add(floor);

    const wallMat = std(0x2a2b34, 0, 0, { roughness: 0.9 });
    const trimMat = basic(0x2a7fff);
    for (const side of [-1, 1]) {
      s.add(mesh(G.box, wallMat, L + 14, 3.2, 1.2, L / 2 - 3, 1.6, side * (HW + 0.6)));
      s.add(mesh(G.box, trimMat, L + 14, 0.07, 0.07, L / 2 - 3, 3.0, side * (HW - 0.02)));
      for (let i = 0; i <= SECTORS; i++) {
        s.add(mesh(G.box, std(0x3a3a46), 1.7, 3.7, 1.7, i * SL, 1.85, side * (HW + 0.6)));
        s.add(mesh(G.sphere, basic(0xffb060), 0.22, 0.22, 0.22, i * SL, 3.95, side * (HW + 0.2)));
      }
    }
    const lineMat = basic(0x1c4aa0, { transparent: true, opacity: 0.7 });
    for (let i = 1; i < SECTORS; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.18, CORRIDOR_W), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(i * SL, 0.02, 0);
      s.add(line);
    }
    for (let i = 0; i < SECTORS; i++) {
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75),
        basic(0xffffff, { map: textTexture(`SECTOR ${i + 1}`, '#4f7fd0'), transparent: true, opacity: 0.55, depthWrite: false }));
      lab.rotation.x = -Math.PI / 2;
      lab.position.set(i * SL + SL / 2, 0.03, -HW + 1.3);
      s.add(lab);
    }

    // core (what we defend)
    this.core = new THREE.Group();
    this.core.position.set(-3, 0, 0);
    this.core.add(mesh(G.cyl, M.stoneDark, 2.4, 0.5, 2.4, 0, 0.25, 0));
    this.coreCrystal = mesh(G.oct, basic(0x40e0ff), 1.0, 1.5, 1.0, 0, 2.4, 0);
    this.core.add(this.coreCrystal);
    this.coreRing = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.07, 6, 40), basic(0x40a0ff));
    this.coreRing.rotation.x = Math.PI / 2;
    this.coreRing.position.y = 1.2;
    this.core.add(this.coreRing);
    const coreLight = new THREE.PointLight(0x40c0ff, 160, 30, 1.5);
    coreLight.position.y = 3;
    this.core.add(coreLight);
    s.add(this.core);

    // enemy portal at the far, dark end
    this.portal = new THREE.Group();
    this.portal.position.set(L + 3, 0, 0);
    const pr = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.15, 8, 40), basic(0xa030ff));
    pr.rotation.y = Math.PI / 2;
    pr.position.y = 2.05;
    const pd = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), basic(0x300050, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    pd.rotation.y = Math.PI / 2;
    pd.position.y = 2.05;
    this.portal.add(pr, pd);
    s.add(this.portal);
  }

  _buildPads() {
    this.pads = [];
    this.padMeshes = [];
    const baseMat = std(0x2a2d36, 0, 0, { roughness: 0.6, metalness: 0.4 });
    for (let s = 0; s < SECTORS; s++) {
      for (const [fx, z] of [[0.3, 5.3], [0.7, -5.3]]) {
        const x = s * SL + SL * fx;
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        const base = mesh(new THREE.CylinderGeometry(1.6, 1.75, 0.2, 6), baseMat, 1, 1, 1, 0, 0.1, 0);
        const ringMat = basic(0x40c0ff);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.07, 6, 6), ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = Math.PI / 6;
        ring.position.y = 0.22;
        g.add(base, ring);
        this.scene.add(g);
        const light = new THREE.PointLight(0xffc080, 0, 28, 1.4);
        light.position.set(x, 7.5, z);
        this.scene.add(light);
        const pad = { sector: s, x, z, group: g, ring, ringMat, tower: null, light, rubble: null };
        g.userData.pad = pad;
        this.pads.push(pad);
        this.padMeshes.push(g);
      }
    }
  }

  _buildFog() {
    this.fogMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uState: { value: this.sectorState.slice() },
        uVision: { value: Array.from({ length: NV }, () => new THREE.Vector3()) },
        uCount: { value: 0 },
        uTime: { value: 0 },
        uSL: { value: SL },
      },
      vertexShader: fogVertex,
      fragmentShader: fogFragment,
    });
    const fog = new THREE.Mesh(new THREE.PlaneGeometry(L + 120, 90), this.fogMat);
    fog.rotation.x = -Math.PI / 2;
    fog.position.set(L / 2, FOG_Y, 0);
    fog.renderOrder = 5;
    this.scene.add(fog);
  }

  // ----- visibility -----
  visionSources() {
    const out = [[-3, 0, 9]];
    const S = this.stats();
    for (const p of this.pads) if (p.tower?.alive) out.push([p.x, p.z, S.range + 3]);
    return out;
  }
  inVision(x, z) {
    for (const [vx, vz, r] of this._vision) if (Math.hypot(x - vx, z - vz) < r * 0.82) return true;
    return false;
  }
  stateAtX(x) {
    const i = Math.floor(x / SL);
    if (i < 0) return 2;
    if (i >= SECTORS) return 0;
    return this.sectorState[i];
  }

  // ----- towers -----
  aliveTowers() { return this.pads.filter(p => p.tower?.alive).length; }
  towerCost() { return 20 + 15 * this.aliveTowers(); }

  buildTower(pad) {
    if (this.sectorState[pad.sector] < 1) { toast('That sector is still shrouded in darkness', 'bad'); emit('sfx', 'error'); return; }
    if (pad.tower?.alive) return;
    if (!spend(this.towerCost())) return;
    this._placeTower(pad);
    emit('sfx', 'build');
    game.flags.towerBuilt = true;
    this.selected = pad;
  }

  _placeTower(pad) {
    if (pad.rubble) { this.scene.remove(pad.rubble); pad.rubble = null; }
    const m = buildTowerMesh();
    m.group.position.set(pad.x, 0.2, pad.z);
    this.scene.add(m.group);
    const S = this.stats();
    pad.tower = { pad, mesh: m, hp: S.maxHP, maxHP: S.maxHP, cd: Math.random() * 0.5, alive: true, flash: 0 };
    pad.light.intensity = 70;
    const next = pad.sector + 1;
    if (next < SECTORS && this.sectorState[next] < 1) {
      this.sectorState[next] = 1;
      if (!this.attract) toast(`Sector ${next + 1} revealed — the darkness recedes`, 'good');
    }
  }

  _damageTower(t, dmg) {
    if (!t.alive) return;
    t.hp -= dmg;
    t.flash = 0.15;
    if (!this.attract) { this.lastTowerHit = game.time; this.lastHitSector = t.pad.sector; }
    if (t.hp <= 0) this._destroyTower(t);
  }

  _destroyTower(t) {
    t.alive = false;
    const pad = t.pad;
    this.scene.remove(t.mesh.group);
    pad.rubble = buildRubble();
    pad.rubble.position.set(pad.x, 0.2, pad.z);
    this.scene.add(pad.rubble);
    pad.light.intensity = 0;
    this._burst(pad.x, 3, pad.z, 0x8a8070, 40, 6);
    this._burst(pad.x, 3, pad.z, 0xffa040, 20, 8);
    this.shake = 0.6;
    if (this.attract) { setTimeout(() => { if (!pad.tower?.alive) this._placeTower(pad); }, 5000); return; }
    emit('sfx', 'destroyed');
    toast(`Tower in Sector ${pad.sector + 1} was destroyed! Strengthen it in the Factory.`, 'bad');
  }

  // ----- waves -----
  hpMul(w = this.wave) { return 1 + 0.15 * (w - 1) + 0.015 * (w - 1) ** 2; }
  dmgMul(w = this.wave) { return 1 + 0.06 * (w - 1); }

  composition(w) {
    const c = {};
    if (this.attract) { c.crawler = 6; c.runner = 2; if (Math.random() < 0.5) c.brute = 1; return c; }
    c.crawler = 3 + Math.floor(w * 1.5);
    if (w >= 2) c.runner = 1 + Math.floor((w - 2) * 1.1);
    if (w >= 3) c.brute = 1 + Math.floor((w - 3) / 2.5);
    if (w >= 5) c.spitter = 1 + Math.floor((w - 5) / 1.8);
    if (w % 10 === 0) c.colossus = w / 10;
    return c;
  }

  startWave() {
    this.wave++;
    if (!this.attract) game.wave = this.wave;
    const comp = this.composition(this.wave);
    const q = [];
    for (const [type, n] of Object.entries(comp)) if (type !== 'colossus') for (let i = 0; i < n; i++) q.push(type);
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    // the first few are always crawlers so the wave "announces" itself
    for (let k = 0, moved = 0; k < q.length && moved < 3; k++) {
      if (q[k] === 'crawler') { q.splice(moved, 0, q.splice(k, 1)[0]); moved++; }
    }
    for (let i = 0; i < (comp.colossus || 0); i++) q.push('colossus');
    this.spawnQueue = q;
    this.spawnTimer = 0;
    this.waveActive = true;
    this.bonusPending = 8 + this.wave * 2;
    if (!this.attract) {
      emit('sfx', 'wave');
      toast(`Wave ${this.wave} is coming out of the dark!`, 'warn');
    }
  }

  callWave() {
    if (this.waveActive || this.attract) return;
    const bonus = Math.ceil(this.waveTimer / 2);
    if (bonus > 0) { earn(bonus); toast(`Called early: +${bonus} ◈`, 'good'); }
    this.waveTimer = 0;
  }

  incomingInfo() {
    const next = this.waveActive ? this.wave : this.wave + 1;
    const comp = this.waveActive ? null : this.composition(next);
    return { wave: next, active: this.waveActive, timer: this.waveTimer, comp, alive: this.enemies.length, queued: this.spawnQueue.length };
  }

  _spawn(type) {
    const T = ENEMY_TYPES[type];
    const m = buildEnemyMesh(type);
    const lane = (Math.random() * 2 - 1) * (HW - 3);
    const hp = T.hp * this.hpMul();
    const e = {
      type, T, ...m, hp, maxHP: hp, lane, x: L + 2, z: lane * 0.3,
      atkCd: Math.random(), phase: Math.random() * 10, flash: 0, lunge: 0, dead: false,
    };
    m.body.rotation.y = Math.PI;
    m.root.position.set(e.x, 0, e.z);
    this.scene.add(m.root);
    this.enemies.push(e);
  }

  _damageEnemy(e, dmg, crit = false) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.08;
    e.bar.visible = true;
    setBar(e.bar, e.hp / e.maxHP);
    this._burst(e.x, 0.9, e.z, crit ? 0xffff60 : 0xffa060, crit ? 6 : 3, 3);
    if (e.hp <= 0) this._killEnemy(e);
    else emit('sfx', 'hit');
  }

  _killEnemy(e) {
    e.dead = true;
    this.scene.remove(e.root);
    this.enemies.splice(this.enemies.indexOf(e), 1);
    const c = new THREE.Color(e.T.color).getHex();
    this._burst(e.x, 0.8, e.z, c, e.T.boss ? 60 : 14, e.T.boss ? 9 : 5);
    if (!this.attract) {
      earn(Math.round(e.T.reward * (1 + 0.05 * (this.wave - 1))));
      game.stats.kills++;
      emit('sfx', 'kill');
    }
  }

  // ----- projectiles & effects -----
  _fire(t, e, S) {
    const crit = Math.random() < S.crit;
    const tier = Math.min(ARROW_COLORS.length - 1, S.attackTier);
    let m;
    if (tier === 0) {
      m = new THREE.Group();
      m.add(new THREE.Mesh(G.shaft, M.wood), new THREE.Mesh(G.tip, M.arrowTip));
    } else {
      m = new THREE.Mesh(G.bolt, arrowMats[tier]);
      m.scale.setScalar(1 + tier * 0.12);
    }
    m.position.set(t.pad.x, 4.8, t.pad.z);
    this.scene.add(m);
    this.arrows.push({ mesh: m, target: e, tx: e.x, tz: e.z, speed: S.projSpeed, dmg: S.damage * (crit ? S.critMul : 1), crit });
  }

  _spit(e, t) {
    const m = mesh(G.sphere, M.spit, 0.22);
    this.scene.add(m);
    const from = new THREE.Vector3(e.x, 1.2, e.z), to = new THREE.Vector3(t.pad.x, 2.5, t.pad.z);
    this.spits.push({ mesh: m, from, to, t: 0, dur: from.distanceTo(to) / 9, target: t, dmg: e.T.dmg * this.dmgMul() });
  }

  _burst(x, y, z, color, n, speed) {
    if (this.particles.length > 500) n = Math.min(n, 3);
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(G.particle, pmat(color));
      p.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u);
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.scene.add(p);
      this.particles.push({ mesh: p, vx: Math.cos(a) * r * sp, vy: Math.abs(u) * sp + 2, vz: Math.sin(a) * r * sp, life: 0.5 + Math.random() * 0.5 });
    }
  }

  _ring(x, z, color, maxR = 3, life = 0.5) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), basic(color, { transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.1, z);
    this.scene.add(m);
    this.fx.push({ mesh: m, t: 0, life, maxR });
  }

  // ----- specials -----
  useSpecial(id) {
    const sp = SPECIALS.find(s => s.id === id);
    const S = this.stats();
    if (S.energyTier < sp.req) { toast(`${sp.name} needs Energy Tier ${sp.req} (Voltarite)`, 'bad'); emit('sfx', 'error'); return; }
    if (this.energy < sp.cost) { toast(`Not enough energy for ${sp.name}`, 'bad'); emit('sfx', 'error'); return; }
    if (id === 'hail') {
      const vis = this.enemies.filter(e => this.inVision(e.x, e.z));
      if (!vis.length) { toast('No visible enemies to target', 'bad'); return; }
      let best = vis[0], bestN = -1;
      for (const e of vis) {
        const n = vis.filter(o => Math.hypot(o.x - e.x, o.z - e.z) < 4).length;
        if (n > bestN) { bestN = n; best = e; }
      }
      this.hail = { x: best.x, z: best.z, left: 20, timer: 0, dmg: Math.max(15, S.damage * 3) };
    }
    if (id === 'slow') this.slowT = 6;
    if (id === 'over') this.overT = 6;
    this.energy -= sp.cost;
    emit('sfx', 'special');
  }

  // ----- update -----
  update(dt) {
    this.time += dt;
    const S = this.stats();
    this._vision = this.visionSources();

    // waves
    if (!this.waveActive) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave();
    } else {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.spawnQueue.length) {
        this._spawn(this.spawnQueue.shift());
        this.spawnTimer = Math.max(0.3, 1.0 - this.wave * 0.025) * (0.6 + Math.random() * 0.8);
      }
      if (!this.spawnQueue.length) { this.waveActive = false; this.waveTimer = this.attract ? 8 : 45; }
    }
    if (!this.waveActive && this.bonusPending && !this.enemies.length) {
      if (!this.attract) { earn(this.bonusPending); toast(`Wave ${this.wave} cleared: +${this.bonusPending} ◈`, 'good'); }
      this.bonusPending = 0;
    }

    // energy & specials
    if (S.energyMax > 0) this.energy = Math.min(S.energyMax, this.energy + S.energyRegen * dt);
    else this.energy = 0;
    this.slowT = Math.max(0, this.slowT - dt);
    this.overT = Math.max(0, this.overT - dt);
    if (this.hail) {
      this.hail.timer -= dt;
      while (this.hail.timer <= 0 && this.hail.left > 0) {
        this.hail.timer += 0.09;
        this.hail.left--;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 4.5;
        const b = new THREE.Mesh(G.bolt, M.hailBolt);
        b.scale.set(2, 2, 3);
        b.rotation.x = Math.PI / 2;
        b.position.set(this.hail.x + Math.cos(a) * r, 22 + Math.random() * 4, this.hail.z + Math.sin(a) * r);
        this.scene.add(b);
        this.bolts.push({ mesh: b, dmg: this.hail.dmg });
      }
      if (this.hail.left <= 0) this.hail = null;
    }

    this._updateEnemies(dt, S);
    this._updateTowers(dt, S);
    this._updateProjectiles(dt);
    this._updateFx(dt);

    // pads
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 3);
    for (const p of this.pads) {
      const st = this.sectorState[p.sector];
      let col;
      if (p.tower?.alive) col = this.selected === p ? 0xffffff : 0x305878;
      else if (st < 1) col = 0x101418;
      else if (p.tower) col = new THREE.Color(0xff5030).multiplyScalar(pulse).getHex();
      else col = new THREE.Color(this.hoverPad === p ? 0xa0f0ff : 0x40c0ff).multiplyScalar(this.hoverPad === p ? 1 : pulse).getHex();
      p.ringMat.color.setHex(col);
    }

    // fog uniforms
    const u = this.fogMat.uniforms;
    u.uTime.value = this.time;
    for (let i = 0; i < SECTORS; i++) u.uState.value[i] = this.sectorState[i];
    const n = Math.min(NV, this._vision.length);
    for (let i = 0; i < n; i++) u.uVision.value[i].set(...this._vision[i]);
    u.uCount.value = n;

    this.coreCrystal.rotation.y += dt;
    this.coreCrystal.position.y = 2.4 + Math.sin(this.time * 1.5) * 0.2;
    this.coreRing.rotation.z -= dt * 0.5;
    this.portal.children[0].rotation.x += dt * 0.8;
  }

  _updateEnemies(dt, S) {
    const slow = this.slowT > 0 ? 0.4 : 1;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i], T = e.T;
      let spd = T.speed * slow;
      if (this.stateAtX(e.x) === 0) spd *= 3; // they rush through the darkness
      e.atkCd -= dt;
      let target = null, td = 1e9;
      if (!T.ignoresTowers) {
        const aggro = T.ranged ? T.range + 1.5 : (T.boss ? 8 : 5.5);
        for (const p of this.pads) {
          if (!p.tower?.alive) continue;
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (d < aggro && d < td) { td = d; target = p.tower; }
        }
      }
      let vx = 0, vz = 0;
      if (target) {
        const dx = target.pad.x - e.x, dz = target.pad.z - e.z;
        if (td > T.range + 1.4) { vx = dx / td; vz = dz / td; }
        else {
          e.body.rotation.y = Math.atan2(-dz, dx);
          if (e.atkCd <= 0) {
            e.atkCd = 1 / T.atkRate;
            e.lunge = 0.25;
            if (T.ranged) this._spit(e, target);
            else { this._damageTower(target, T.dmg * this.dmgMul()); this._burst(target.pad.x, 1.5, target.pad.z, 0x9a9080, 4, 3); }
          }
        }
      } else {
        vx = -1; vz = (e.lane - e.z) * 0.4;
        const l = Math.hypot(vx, vz); vx /= l; vz /= l;
      }
      e.x += vx * spd * dt;
      e.z = Math.max(-HW + 1, Math.min(HW - 1, e.z + vz * spd * dt));
      if (vx || vz) e.body.rotation.y = Math.atan2(-vz, vx);

      // animation
      const moving = vx || vz;
      e.phase += dt * (moving ? spd * 4 : 2);
      for (const l of e.legs) l.rotation.z = moving ? Math.sin(e.phase + (l.userData.side > 0 ? 0 : Math.PI)) * 0.6 : 0;
      e.lunge = Math.max(0, e.lunge - dt);
      const bob = moving ? Math.abs(Math.sin(e.phase)) * 0.08 : 0;
      e.root.position.set(e.x, bob, e.z);
      e.body.position.x = e.lunge * 1.2;
      e.flash = Math.max(0, e.flash - dt);
      e.body.scale.setScalar(e.flash > 0 ? 1.12 : 1);
      e.bar.quaternion.copy(this.camera.quaternion);

      const vis = this.inVision(e.x, e.z);
      e.root.visible = vis || this.stateAtX(e.x) >= 1;
      if (vis && !this.attract && !game.discovered.has(e.type)) {
        game.discovered.add(e.type);
        toast(`New enemy identified: ${T.name} — ${T.desc}`, 'warn');
        emit('discover', e.type);
      }

      if (e.x <= -1) {
        this.scene.remove(e.root);
        this.enemies.splice(i, 1);
        e.dead = true;
        this._burst(-2, 2, e.z * 0.3, 0x40e0ff, 10, 5);
        if (!this.attract) {
          game.coreHP = Math.max(0, game.coreHP - T.leak);
          emit('sfx', 'alert');
          toast(`A ${T.name} reached the core! (−${T.leak})`, 'bad');
          if (game.coreHP <= 0 && !game.over) { game.over = true; emit('gameover'); }
        }
      }
    }
  }

  _updateTowers(dt, S) {
    const rate = this.overT > 0 ? 2.5 : 1;
    const crystalCol = ARROW_COLORS[Math.min(ARROW_COLORS.length - 1, S.attackTier)];
    for (const p of this.pads) {
      const t = p.tower;
      if (!t?.alive) continue;
      if (S.maxHP > t.maxHP) t.hp += S.maxHP - t.maxHP;
      t.maxHP = S.maxHP;
      t.hp = Math.min(t.maxHP, t.hp + S.regen * dt);
      t.cd -= dt * rate;
      if (t.cd <= 0) {
        const inRange = this.enemies.filter(e => Math.hypot(e.x - p.x, e.z - p.z) <= S.range);
        if (inRange.length) {
          inRange.sort((a, b) => a.x - b.x);
          for (const e of inRange.slice(0, S.weapons)) this._fire(t, e, S);
          t.cd = 1 / S.fireRate;
          if (!this.attract) emit('sfx', 'shoot');
        }
      }
      const m = t.mesh;
      m.crystal.rotation.y += dt * (1 + S.fireRate);
      m.crystalMat.color.setHex(crystalCol);
      RES_KEYS.forEach((k, i) => {
        const tier = this.attract ? 1 : game.tier[k];
        m.rings[i].visible = tier > 0;
        m.rings[i].scale.setScalar(1 + tier * 0.05);
        m.rings[i].rotation.z += dt * (0.3 + tier * 0.2) * (i % 2 ? 1 : -1);
      });
      setBar(m.bar, t.hp / t.maxHP);
      m.bar.quaternion.copy(this.camera.quaternion);
      m.bar.visible = t.hp < t.maxHP || this.selected === p;
      t.flash = Math.max(0, t.flash - dt);
      m.group.position.x = p.x + (t.flash > 0 ? (Math.random() - 0.5) * 0.15 : 0);
      p.light.color.setHex(crystalCol);
    }
  }

  _updateProjectiles(dt) {
    const tmp = new THREE.Vector3();
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (!a.target.dead) { a.tx = a.target.x; a.tz = a.target.z; }
      tmp.set(a.tx, 0.9, a.tz);
      const d = a.mesh.position.distanceTo(tmp);
      const step = a.speed * dt;
      if (d <= step + 0.3) {
        if (!a.target.dead) this._damageEnemy(a.target, a.dmg, a.crit);
        this.scene.remove(a.mesh);
        this.arrows.splice(i, 1);
        continue;
      }
      a.mesh.lookAt(tmp);
      a.mesh.position.lerp(tmp, step / d);
    }
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      s.t += dt / s.dur;
      if (s.t >= 1) {
        this._damageTower(s.target, s.dmg);
        this._burst(s.to.x, s.to.y, s.to.z, 0x60ff40, 8, 4);
        this.scene.remove(s.mesh);
        this.spits.splice(i, 1);
        continue;
      }
      s.mesh.position.lerpVectors(s.from, s.to, s.t);
      s.mesh.position.y += Math.sin(Math.PI * s.t) * 3;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.mesh.position.y -= 45 * dt;
      if (b.mesh.position.y <= 0.5) {
        const { x, z } = b.mesh.position;
        for (const e of this.enemies.slice()) if (Math.hypot(e.x - x, e.z - z) < 2.4) this._damageEnemy(e, b.dmg);
        this._burst(x, 0.5, z, 0xa0f0ff, 8, 6);
        this._ring(x, z, 0x80e0ff, 2.6, 0.35);
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
        this.shake = Math.max(this.shake, 0.15);
        emit('sfx', 'boom');
      }
    }
  }

  _updateFx(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1); continue; }
      p.vy -= 14 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(Math.min(1, p.life * 2));
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); this.fx.splice(i, 1); continue; }
      f.mesh.scale.setScalar(0.3 + k * f.maxR);
      f.mesh.material.opacity = 1 - k;
    }
  }

  // ----- camera & input -----
  updateCamera(dt) {
    if (this.attract) {
      this.camX = L * 0.2 + Math.sin(this.time * 0.06) * L * 0.16;
      this.zoom = 1.05;
    } else {
      const pan = 40 * this.zoom * dt;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.camX -= pan;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.camX += pan;
      this.camX = Math.max(-4, Math.min(L, this.camX));
    }
    const d = 24 * this.zoom;
    this.shake = Math.max(0, this.shake - dt * 2);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(this.camX + sx, d + sy, d * 0.78 + 1);
    this.camera.lookAt(this.camX + sx, 0, 0.8);
  }

  _pick(ev) {
    this.pointer.set(ev.clientX / innerWidth * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.padMeshes, true)[0];
    let o = hit?.object;
    while (o && !o.userData.pad) o = o.parent;
    if (o) return o.userData.pad;
    // also allow clicking the tower body above the pad
    for (const p of this.pads) {
      if (!p.tower?.alive) continue;
      const hits = this.raycaster.intersectObject(p.tower.mesh.group, true);
      if (hits.length) return p;
    }
    return null;
  }

  onPointerDown(ev) { this.drag = { x: ev.clientX, y: ev.clientY, camX: this.camX, moved: false }; }
  onPointerMove(ev) {
    if (this.drag && (ev.buttons & 1)) {
      const dx = ev.clientX - this.drag.x;
      if (Math.abs(dx) > 5) this.drag.moved = true;
      const dist = 24 * this.zoom * 1.27;
      const worldW = 2 * dist * Math.tan(THREE.MathUtils.degToRad(24)) * this.camera.aspect;
      this.camX = Math.max(-4, Math.min(L, this.drag.camX - dx * worldW / innerWidth));
    }
    this.hoverPad = this._pick(ev);
    const p = this.hoverPad;
    document.body.style.cursor = p && this.sectorState[p.sector] >= 1 ? 'pointer' : '';
  }
  onPointerUp(ev) {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved || ev.button !== 0) return;
    const pad = this._pick(ev);
    if (!pad) { this.selected = null; return; }
    if (pad.tower?.alive) { this.selected = this.selected === pad ? null : pad; emit('sfx', 'click'); }
    else this.buildTower(pad);
  }
  onWheel(ev) { this.zoom = Math.max(0.6, Math.min(2.4, this.zoom * (ev.deltaY > 0 ? 1.1 : 0.9))); }
  onKey(code) {
    const sp = SPECIALS.find(s => 'Digit' + s.key === code);
    if (sp) this.useSpecial(sp.id);
    if (code === 'KeyN') this.callWave();
    if (code === 'Escape') this.selected = null;
  }
  focusSector(i) { this.camX = i * SL + SL / 2; }

  getPanel() {
    const p = this.selected;
    if (!p?.tower?.alive) return null;
    const S = this.stats(), t = p.tower;
    return {
      title: `Watchtower · Sector ${p.sector + 1}`,
      lines: [
        ['HP', `${Math.ceil(t.hp)} / ${Math.round(t.maxHP)}  (+${S.regen.toFixed(1)}/s)`],
        ['Damage', `${S.damage.toFixed(1)} per shot`],
        ['Fire rate', `${S.fireRate.toFixed(2)} /s × ${S.weapons} weapon${S.weapons > 1 ? 's' : ''}`],
        ['Range', `${S.range.toFixed(1)} m`],
        ['Crit', `${Math.round(S.crit * 100)}% for ×${S.critMul.toFixed(2)}`],
      ],
      note: 'All towers share the stats supplied by the Factory teleporter.',
      buttons: [{ label: 'Close', action: 'close' }],
    };
  }
  panelAction(a) { if (a === 'close') this.selected = null; }

  sectorInfo() {
    return this.sectorState.map((st, i) => {
      const known = this.enemies.filter(e => e.root.visible && Math.floor(e.x / SL) === i).length;
      const towers = this.pads.filter(p => p.sector === i && p.tower?.alive).length;
      return { state: st, known, towers, center: i * SL + SL / 2 };
    });
  }
}
