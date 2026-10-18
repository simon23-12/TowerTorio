// The factory map: Factorio-style grid with drills, belts, refineries and a teleporter.
import * as THREE from 'three';
import { game, emit, toast, spend, earn, deliver, rate, RESOURCES, RES_KEYS, MK_MULT, BELT_SPEEDS, STAT_INFO, TELE_MULT } from './state.js';
import { beltTexture, groundTexture } from './textures.js';

export const N = 64;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const GAP = 0.34;
const MAX_ITEMS = 4000;

export const BUILD = {
  belt:     { name: 'Conveyor Belt', cost: 1,  key: '1', icon: '▤', desc: 'Moves items forward. Click-drag to lay a line.' },
  miner:    { name: 'Quarry Drill',  cost: 15, key: '2', icon: '⛏', desc: 'Place on ore. Quarries endlessly and outputs forward.', upg: true, base: 30 },
  refinery: { name: 'Refinery',      cost: 25, key: '3', icon: '⚗', desc: '2 ore → 1 crystal. Accepts from any side, outputs forward.', upg: true, base: 30 },
  teleporter: { name: 'Teleporter',  cost: 150, key: '4', icon: '◎', size: 2, desc: '2×2. Beams crystals to your towers. Accepts from any side. Each extra one costs more.' },
};
const sizeOf = type => BUILD[type]?.size || 1;
const lvl = type => game.upgrades?.[type] || 0; // type-wide upgrade level, 0 = Mk1
const RAIL_COLORS = [0xc8a030, 0x40e0ff, 0xff5060];
const MK_COLORS = [0x8090a0, 0x40e0ff, 0xffc040];

const resColor = RES_KEYS.map(k => new THREE.Color(RESOURCES[k].color));
const ORE_COL = resColor.map(c => c.clone().multiplyScalar(0.75));
const CRY_COL = resColor.map(c => c.clone().multiplyScalar(2.2));
const itemName = id => `${RESOURCES[RES_KEYS[id >> 1]].name} ${id & 1 ? 'Crystal' : 'Ore'}`;

const std = (color, emissive = 0, ei = 1, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.6, metalness: 0.3, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

const beltTex = beltTexture();
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 4),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  beltTop: new THREE.PlaneGeometry(0.98, 0.84).rotateX(-Math.PI / 2),
  arrow: new THREE.ConeGeometry(0.1, 0.22, 4).rotateZ(-Math.PI / 2),
};
const M = {
  beltBase: std(0x1b1e24), beltTop: std(0xffffff, 0, 0, { map: beltTex, roughness: 0.8 }), rail: std(0xc8a030, 0, 0, { metalness: 0.6 }),
  steel: std(0x50586a), steelDark: std(0x2c313c), drill: std(0x9aa2b0, 0, 0, { metalness: 0.8, roughness: 0.3 }),
  arrow: basic(0xffffff), teleBase: std(0x252a38, 0, 0, { metalness: 0.7 }),
};
const mkMats = MK_COLORS.map(c => basic(c));

function mesh(geo, mat, sx = 1, sy = sx, sz = sx, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

export class Factory {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080c);
    this.scene.fog = new THREE.Fog(0x07080c, 40, 90);
    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.3, 200);
    this.cx = 32; this.cz = 33; this.dist = 22;
    this.yaw = 0; this.yawCur = 0;
    this.rect = { x: 0, y: 0, w: innerWidth, h: innerHeight };
    this.grid = new Array(N * N).fill(null);
    this.ore = new Int8Array(N * N).fill(-1);
    this.buildings = [];
    this.tool = null; this.rot = 0;
    this.hover = null; this.selected = null;
    this.keys = new Set();
    this.time = 0;
    this.warned = {};
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const s = this.scene;
    s.add(new THREE.AmbientLight(0x6070a0, 1.2));
    const sun = new THREE.DirectionalLight(0xffe8c8, 2.2);
    sun.position.set(20, 40, 10);
    s.add(sun);
    s.add(new THREE.HemisphereLight(0x8090c0, 0x201810, 0.6));

    this._genOre();
    this._buildGround();
    this._initItems();
    this._buildGhost();
    this.teleporter = this._place('teleporter', 31, 31, 0);
    this.teleporter.fixed = true;
    this.teleporter.spent = 0;
    this.updateCamera(0);
  }

  // ----- world -----
  _genOre() {
    let seed = 1234;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const patches = [
      ['alcamanium', 38, 29, 2.6], ['alcamanium', 24, 38, 2.2], ['alcamanium', 46, 48, 3],
      ['vitrium', 26, 22, 2.8], ['vitrium', 50, 16, 3.2],
      ['quicksilite', 43, 40, 2.6], ['quicksilite', 12, 20, 3],
      ['voltarite', 17, 44, 3], ['voltarite', 52, 34, 2.6],
    ];
    for (const [res, px, py, r] of patches) {
      const ri = RES_KEYS.indexOf(res);
      for (let y = Math.floor(py - r - 1); y <= py + r + 1; y++) for (let x = Math.floor(px - r - 1); x <= px + r + 1; x++) {
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        if (Math.hypot(x - px, y - py) < r + rnd() * 0.9 - 0.3) this.ore[y * N + x] = ri;
      }
    }
  }

  _buildGround() {
    const cols = RES_KEYS.map(k => { const c = new THREE.Color(RESOURCES[k].color); return [c.r * 255, c.g * 255, c.b * 255].map(Math.round); });
    const tex = groundTexture(N, this.ore, cols);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(N, N), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(N / 2, 0, N / 2);
    this.scene.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(N / 2, -0.02, N / 2);
    this.scene.add(outer);
    // boundary
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(N, 0.01, N)), new THREE.LineBasicMaterial({ color: 0x3050a0 }));
    edge.position.set(N / 2, 0.01, N / 2);
    this.scene.add(edge);

    // ore rocks
    const tiles = [];
    for (let i = 0; i < N * N; i++) if (this.ore[i] >= 0) tiles.push(i);
    const count = tiles.length * 3;
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.16), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 }), count);
    const d = new THREE.Object3D();
    let k = 0, seed = 99;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const i of tiles) {
      const x = i % N, y = Math.floor(i / N), ri = this.ore[i];
      for (let j = 0; j < 3; j++) {
        d.position.set(x + 0.2 + rnd() * 0.6, 0.05, y + 0.2 + rnd() * 0.6);
        d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        d.scale.setScalar(0.6 + rnd() * 0.9);
        d.updateMatrix();
        rocks.setMatrixAt(k, d.matrix);
        rocks.setColorAt(k, resColor[ri].clone().multiplyScalar(0.5 + rnd() * 0.6));
        k++;
      }
    }
    this.scene.add(rocks);
  }

  _initItems() {
    const mk = (geo, mat) => {
      const im = new THREE.InstancedMesh(geo, mat, MAX_ITEMS);
      for (let i = 0; i < MAX_ITEMS; i++) im.setColorAt(i, new THREE.Color(1, 1, 1));
      im.count = 0;
      im.frustumCulled = false;
      this.scene.add(im);
      return im;
    };
    this.oreIM = mk(new THREE.DodecahedronGeometry(0.13), new THREE.MeshStandardMaterial({ roughness: 0.5 }));
    this.cryIM = mk(new THREE.OctahedronGeometry(0.15), new THREE.MeshBasicMaterial());
    this.dummy = new THREE.Object3D();
  }

  _buildGhost() {
    const g = new THREE.Group();
    this.ghostMat = new THREE.LineBasicMaterial({ color: 0x40ff80 });
    this.ghostBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.5, 0.98)), this.ghostMat);
    this.ghostBox.position.y = 0.25;
    this.ghostArrowMat = basic(0x40ff80, { transparent: true, opacity: 0.8 });
    this.ghostArrow = mesh(new THREE.ConeGeometry(0.18, 0.4, 4).rotateZ(-Math.PI / 2), this.ghostArrowMat, 1, 1, 1, 0.3, 0.5, 0);
    g.add(this.ghostBox, this.ghostArrow);
    g.visible = false;
    this.ghost = g;
    this.scene.add(g);
    this.selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.1, 1.04)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.selBox.visible = false;
    this.scene.add(this.selBox);
  }

  _buildMesh(b) {
    const g = new THREE.Group();
    b.parts = {};
    switch (b.type) {
      case 'belt':
        g.add(mesh(G.box, M.beltBase, 1, 0.1, 0.92, 0, 0.05, 0));
        g.add(mesh(G.beltTop, M.beltTop, 1, 1, 1, 0, 0.105, 0));
        g.add(mesh(G.box, M.rail, 1, 0.14, 0.05, 0, 0.07, 0.46));
        g.add(mesh(G.box, M.rail, 1, 0.14, 0.05, 0, 0.07, -0.46));
        break;
      case 'miner': {
        const col = RESOURCES[RES_KEYS[b.res]].color;
        g.add(mesh(G.box, M.steelDark, 0.94, 0.3, 0.94, 0, 0.15, 0));
        g.add(mesh(G.box, M.steel, 0.8, 0.35, 0.8, 0, 0.45, 0));
        const drill = new THREE.Group();
        drill.add(mesh(G.cyl, M.drill, 0.26, 0.4, 0.26, 0, 0, 0));
        for (let i = 0; i < 3; i++) {
          const t = mesh(G.box, M.drill, 0.08, 0.32, 0.6, 0, 0, 0);
          t.rotation.y = i * Math.PI / 3;
          drill.add(t);
        }
        drill.position.y = 0.82;
        g.add(drill);
        b.parts.drill = drill;
        b.parts.lamp = mesh(G.sphere, basic(col), 0.08, 0.08, 0.08, -0.3, 0.68, 0.3);
        g.add(b.parts.lamp);
        b.parts.band = mesh(G.box, mkMats[0], 0.82, 0.06, 0.82, 0, 0.6, 0);
        g.add(b.parts.band);
        g.add(mesh(G.arrow, M.arrow, 1, 1, 1, 0.5, 0.35, 0));
        break;
      }
      case 'refinery': {
        g.add(mesh(G.box, M.steelDark, 0.94, 0.25, 0.94, 0, 0.125, 0));
        g.add(mesh(G.box, M.steel, 0.86, 0.5, 0.86, 0, 0.5, 0));
        b.parts.coreMat = basic(0x404040);
        b.parts.core = mesh(G.sphere, b.parts.coreMat, 0.24, 0.24, 0.24, 0.05, 0.85, 0);
        g.add(b.parts.core);
        g.add(mesh(G.cyl, M.steelDark, 0.08, 0.6, 0.08, -0.28, 1.0, 0.28));
        g.add(mesh(G.cyl, M.steelDark, 0.08, 0.45, 0.08, -0.28, 0.95, -0.28));
        b.parts.band = mesh(G.box, mkMats[0], 0.88, 0.06, 0.88, 0, 0.7, 0);
        g.add(b.parts.band);
        g.add(mesh(G.arrow, M.arrow, 1, 1, 1, 0.5, 0.35, 0));
        break;
      }
      case 'teleporter': {
        g.add(mesh(new THREE.CylinderGeometry(0.98, 1.02, 0.3, 32), M.teleBase, 1, 1, 1, 0, 0.15, 0));
        const ringMat = basic(0x60e8ff);
        const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.06, 8, 40), ringMat);
        r1.rotation.x = Math.PI / 2; r1.position.y = 0.36;
        const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 40), ringMat);
        r2.position.y = 1.2;
        const r3 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 40), ringMat);
        r3.position.y = 1.2; r3.rotation.y = Math.PI / 2;
        const beamMat = basic(0x60e8ff, { transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 8, 24, 1, true), beamMat);
        beam.position.y = 4.3;
        g.add(r1, r2, r3, beam);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          g.add(mesh(G.box, M.steel, 0.14, 0.9, 0.14, Math.cos(a) * 0.82, 0.6, Math.sin(a) * 0.82));
          g.add(mesh(G.sphere, ringMat, 0.08, 0.08, 0.08, Math.cos(a) * 0.82, 1.1, Math.sin(a) * 0.82));
        }
        b.parts = { r1, r2, r3, beam, beamMat, ringMat };
        break;
      }
    }
    const size = sizeOf(b.type);
    g.position.set(b.x + size / 2, 0, b.y + size / 2);
    g.rotation.y = -b.dir * Math.PI / 2;
    g.userData.building = b;
    return g;
  }

  // ----- grid helpers -----
  at(x, y) { return x < 0 || y < 0 || x >= N || y >= N ? null : this.grid[y * N + x]; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }

  _place(type, x, y, dir) {
    const b = { type, x, y, dir, mk: 1, spent: BUILD[type]?.cost || 0 };
    if (type === 'belt') b.items = [];
    if (type === 'miner') { b.res = this.ore[y * N + x]; b.timer = 0; b.out = -1; b.status = 'Starting'; }
    if (type === 'refinery') { b.inKind = -1; b.inCount = 0; b.outKind = -1; b.outCount = 0; b.prog = 0; b.work = -1; b.status = 'Waiting for ore'; }
    if (type === 'teleporter') { b.pulse = 0; b.received = 0; }
    b.mesh = this._buildMesh(b);
    this.scene.add(b.mesh);
    if (b.parts.band) b.parts.band.material = mkMats[lvl(type)];
    b.mesh.scale.setScalar(1 + lvl(type) * 0.04);
    const size = sizeOf(type);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) this.grid[(y + j) * N + x + i] = b;
    this.buildings.push(b);
    return b;
  }

  _canPlace(type, x, y, silent) {
    const fail = msg => { if (!silent) { toast(msg, 'bad'); emit('sfx', 'error'); } return false; };
    const size = sizeOf(type);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      if (!this.inBounds(x + i, y + j)) return false;
      if (this.at(x + i, y + j)) return silent ? false : fail('Tile is occupied');
    }
    if (type === 'miner') {
      const o = this.ore[y * N + x];
      if (o < 0) return fail('Quarry Drills must be placed on ore');
      if (!game.unlocked[RES_KEYS[o]]) return fail(`Research ${RESOURCES[RES_KEYS[o]].name} Refining first (Research, U)`);
    }
    return true;
  }

  tryPlace(x, y, silent = false) {
    const type = this.tool;
    if (!type || !this._canPlace(type, x, y, silent)) return null;
    const cost = this.costOf(type);
    if (!spend(cost)) { this.placing = false; return null; }
    const b = this._place(type, x, y, this.rot);
    b.spent = cost;
    emit('sfx', 'place');
    if (type === 'miner') game.flags.minerPlaced = true;
    if (type === 'refinery') game.flags.refineryPlaced = true;
    return b;
  }

  costOf(type) {
    if (type !== 'teleporter') return BUILD[type].cost;
    return BUILD.teleporter.cost + 100 * (this.buildings.filter(b => b.type === 'teleporter').length - 1);
  }

  remove(b) {
    if (!b || b.fixed) return;
    this.scene.remove(b.mesh);
    for (let i = 0; i < N * N; i++) if (this.grid[i] === b) this.grid[i] = null;
    this.buildings.splice(this.buildings.indexOf(b), 1);
    // half of its build price; belts refund 0.5 ◈ each
    const refund = b.spent * 0.5;
    game.credits += refund;
    if (this.selected === b) this.selected = null;
    emit('sfx', 'remove');
  }

  setDir(b, dir) {
    if (b.type === 'teleporter') return;
    b.dir = dir;
    b.mesh.rotation.y = -dir * Math.PI / 2;
  }

  // re-skin buildings after a type-wide upgrade
  _applyLevels() {
    const key = JSON.stringify(game.upgrades);
    if (key === this._lvlKey) return;
    this._lvlKey = key;
    M.rail.color.setHex(RAIL_COLORS[lvl('belt')]);
    for (const b of this.buildings) {
      const l = lvl(b.type);
      if (b.parts.band) b.parts.band.material = mkMats[l];
      b.mesh.scale.setScalar(1 + l * 0.04);
    }
  }

  // ----- item transfer -----
  _beltAccept(t, kind, fromDir) {
    if ((t.dir + 2) % 4 === fromDir) return false;
    const p = t.dir === fromDir ? 0 : 0.5;
    for (const it of t.items) if (Math.abs(it.p - p) < GAP) return false;
    let i = 0;
    while (i < t.items.length && t.items[i].p < p) i++;
    t.items.splice(i, 0, { kind, p });
    return true;
  }

  _accept(b, kind) {
    const res = RES_KEYS[kind >> 1];
    if (b.type === 'refinery') {
      if (kind & 1) return false;
      if (!game.unlocked[res]) { this._warn('lock' + res, `Refineries can't process ${RESOURCES[res].name} yet — research it first`); return false; }
      if (b.inCount >= 6 || (b.inKind >= 0 && b.inKind !== kind)) return false;
      b.inKind = kind; b.inCount++;
      return true;
    }
    if (b.type === 'teleporter') {
      if (!(kind & 1)) { this._warn('teleOre', 'The Teleporter only accepts refined crystals — route ore through a Refinery first'); return false; }
      deliver(res, TELE_MULT[lvl('teleporter')]);
      b.received++;
      b.pulse = 1;
      game.flags.delivered = true;
      emit('delivered', res);
      emit('sfx', 'deliver');
      return true;
    }
    return false;
  }

  _warn(key, msg) {
    if (this.warned[key] && game.time - this.warned[key] < 20) return;
    this.warned[key] = game.time;
    toast(msg, 'warn');
  }

  _push(b, kind) {
    const t = this.at(b.x + DX[b.dir], b.y + DY[b.dir]);
    if (!t || t === b) return false;
    if (t.type === 'belt') return this._beltAccept(t, kind, b.dir);
    return this._accept(t, kind);
  }

  // ----- simulation -----
  update(dt) {
    this.time += dt;
    this._applyLevels();
    const v = BELT_SPEEDS[game.beltTier];
    beltTex.offset.x -= v * dt;
    for (const b of this.buildings) {
      if (b.type === 'belt') {
        const its = b.items;
        for (let i = its.length - 1; i >= 0; i--) {
          const lim = i === its.length - 1 ? 1 : its[i + 1].p - GAP;
          its[i].p = Math.min(its[i].p + v * dt, Math.max(its[i].p, lim));
        }
        const f = its[its.length - 1];
        if (f && f.p >= 1 && this._push(b, f.kind)) its.pop();
      } else if (b.type === 'miner') {
        if (b.out < 0) {
          b.timer += dt * MK_MULT[lvl(b.type)] * BUILD.miner.base / 60;
          if (b.timer >= 1) { b.timer -= 1; b.out = b.res * 2; }
          b.status = 'Quarrying';
        }
        if (b.out >= 0) {
          if (this._push(b, b.out)) b.out = -1;
          else b.status = 'Output blocked';
        }
        if (b.status === 'Quarrying') b.parts.drill.rotation.y += dt * 6 * MK_MULT[lvl(b.type)];
      } else if (b.type === 'refinery') {
        if (b.work < 0 && b.inCount >= 2 && (b.outCount === 0 || b.outKind === b.inKind + 1) && b.outCount < 3) {
          b.work = b.inKind + 1;
          b.inCount -= 2;
          if (b.inCount === 0) b.inKind = -1;
          b.prog = 0;
        }
        if (b.work >= 0) {
          b.prog += dt * MK_MULT[lvl(b.type)] * BUILD.refinery.base / 60;
          b.status = 'Refining';
          if (b.prog >= 1) { b.outCount++; b.outKind = b.work; b.work = -1; game.flags.refined = true; }
        } else b.status = b.outCount >= 3 ? 'Output blocked' : 'Waiting for ore';
        if (b.outCount > 0 && this._push(b, b.outKind)) b.outCount--;
        const ri = b.work >= 0 ? b.work >> 1 : b.inKind >= 0 ? b.inKind >> 1 : -1;
        const glow = b.work >= 0 ? 1.4 + Math.sin(this.time * 10) * 0.5 : 0.3;
        if (ri >= 0) b.parts.coreMat.color.copy(resColor[ri]).multiplyScalar(glow);
        else b.parts.coreMat.color.setHex(0x303030);
      } else if (b.type === 'teleporter') {
        b.pulse = Math.max(0, b.pulse - dt * 2);
        const p = b.parts;
        p.r1.rotation.z += dt * (0.5 + b.pulse * 4);
        p.r2.rotation.x += dt * 1.3;
        p.r3.rotation.z += dt * 1.7;
        p.beamMat.opacity = 0.1 + b.pulse * 0.4;
        p.ringMat.color.setRGB(0.4 + b.pulse * 1.5, 0.9 + b.pulse, 1 + b.pulse);
      }
    }
    this._renderItems();
    const sb = this.selected;
    this.selBox.visible = !!sb;
    if (sb) {
      const size = sizeOf(sb.type);
      this.selBox.position.set(sb.x + size / 2, 0.55, sb.y + size / 2);
      this.selBox.scale.set(size, size === 2 ? 1.6 : 1, size);
    }
  }

  _renderItems() {
    let oi = 0, ci = 0;
    const d = this.dummy, t = this.time;
    for (const b of this.buildings) {
      if (b.type !== 'belt') continue;
      for (const it of b.items) {
        const off = it.p - 0.5;
        d.position.set(b.x + 0.5 + DX[b.dir] * off, 0.24, b.y + 0.5 + DY[b.dir] * off);
        d.rotation.set(t * 2 + it.p, t * 1.5, 0);
        d.updateMatrix();
        const ri = it.kind >> 1;
        if (it.kind & 1) {
          if (ci >= MAX_ITEMS) continue;
          this.cryIM.setMatrixAt(ci, d.matrix); this.cryIM.setColorAt(ci, CRY_COL[ri]); ci++;
        } else {
          if (oi >= MAX_ITEMS) continue;
          this.oreIM.setMatrixAt(oi, d.matrix); this.oreIM.setColorAt(oi, ORE_COL[ri]); oi++;
        }
      }
    }
    for (const [im, n] of [[this.oreIM, oi], [this.cryIM, ci]]) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  // ----- camera & input -----
  // screen-up and screen-right directions on the ground for the current view rotation
  _axes() {
    const c = Math.cos(this.yawCur), s = Math.sin(this.yawCur);
    return { fx: -s, fz: -c, rx: c, rz: -s, c, s };
  }

  rotateView() { this.yaw += Math.PI / 2; emit('sfx', 'click'); }

  updateCamera(dt) {
    this.yawCur += (this.yaw - this.yawCur) * Math.min(1, dt * 8);
    const A = this._axes();
    const pan = this.dist * 1.2 * dt;
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.cx += (A.fx * f + A.rx * r) * pan;
    this.cz += (A.fz * f + A.rz * r) * pan;
    this.cx = Math.max(0, Math.min(N, this.cx));
    this.cz = Math.max(0, Math.min(N, this.cz));
    const back = this.dist * 0.65;
    this.camera.position.set(this.cx + back * A.s, this.dist, this.cz + back * A.c);
    this.camera.lookAt(this.cx, 0, this.cz);
  }

  _tileAt(ev) {
    const R = this.rect;
    this.pointer.set((ev.clientX - R.x) / R.w * 2 - 1, -((ev.clientY - R.y) / R.h) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, p)) return null;
    return { x: Math.floor(p.x), y: Math.floor(p.z), wx: p.x, wz: p.z };
  }

  _updateGhost() {
    const h = this.hover;
    if (!this.tool || !h || !this.inBounds(h.x, h.y)) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    const size = sizeOf(this.tool);
    this.ghost.position.set(h.x + size / 2, 0, h.y + size / 2);
    this.ghost.scale.set(size, 1, size);
    this.ghostArrow.visible = size === 1;
    this.ghost.rotation.y = size === 1 ? -this.rot * Math.PI / 2 : 0;
    const ok = this._canPlace(this.tool, h.x, h.y, true) && game.credits >= this.costOf(this.tool);
    const c = ok ? 0x40ff80 : 0xff4040;
    this.ghostMat.color.setHex(c);
    this.ghostArrowMat.color.setHex(c);
  }

  setTool(t) {
    this.tool = this.tool === t ? null : t;
    this.selected = null;
    this._updateGhost();
  }

  onPointerDown(ev) {
    const t = this._tileAt(ev);
    if (!t) return;
    if (ev.button === 2) { this.deleting = true; this.remove(this.at(t.x, t.y)); return; }
    if (ev.button === 1) { this.pan = { x: ev.clientX, y: ev.clientY, cx: this.cx, cz: this.cz }; return; }
    if (this.tool) {
      const existing = this.at(t.x, t.y);
      if (existing && this.tool !== 'belt') { this.selected = existing; return; }
      this.placing = true;
      this.dragPlaced = new Set();
      this.lastTile = null;
      this._dragTo(t);
    } else {
      const b = this.at(t.x, t.y);
      if (b) { this.selected = b; emit('sfx', 'click'); }
      else { this.selected = null; this.pan = { x: ev.clientX, y: ev.clientY, cx: this.cx, cz: this.cz }; }
    }
  }

  _dragTo(t) {
    if (this.tool !== 'belt') {
      if (!this.lastTile || this.lastTile.x !== t.x || this.lastTile.y !== t.y) this.tryPlace(t.x, t.y, !!this.lastTile);
      this.lastTile = { x: t.x, y: t.y };
      return;
    }
    // walk tile by tile from the last tile so fast drags don't leave gaps
    const steps = [];
    if (!this.lastTile) steps.push({ x: t.x, y: t.y });
    else {
      let { x, y } = this.lastTile;
      while (x !== t.x || y !== t.y) {
        if (Math.abs(t.x - x) >= Math.abs(t.y - y)) x += Math.sign(t.x - x); else y += Math.sign(t.y - y);
        steps.push({ x, y });
      }
    }
    for (const s of steps) {
      const last = this.lastTile;
      if (last) {
        const dir = s.x > last.x ? 0 : s.y > last.y ? 1 : s.x < last.x ? 2 : 3;
        this.rot = dir;
        const lb = this.at(last.x, last.y);
        if (lb && lb.type === 'belt' && this.dragPlaced.has(lb)) this.setDir(lb, dir);
      }
      const ex = this.at(s.x, s.y);
      if (ex && ex.type === 'belt' && last) { this.setDir(ex, this.rot); this.dragPlaced.add(ex); }
      else if (!ex) { const b = this.tryPlace(s.x, s.y, !!last); if (b) this.dragPlaced.add(b); }
      this.lastTile = s;
      if (!this.placing) break;
    }
  }

  onPointerMove(ev) {
    const t = this._tileAt(ev);
    if (this.pan && (ev.buttons & 5)) {
      const k = this.dist / this.rect.h * 1.6, A = this._axes();
      const dx = (ev.clientX - this.pan.x) * k, dy = (ev.clientY - this.pan.y) * k * 1.4;
      this.cx = this.pan.cx - A.rx * dx + A.fx * dy;
      this.cz = this.pan.cz - A.rz * dx + A.fz * dy;
    }
    if (!t) return;
    const changed = !this.hover || this.hover.x !== t.x || this.hover.y !== t.y;
    this.hover = t;
    if (changed) {
      if (this.placing && (ev.buttons & 1)) this._dragTo(t);
      if (this.deleting && (ev.buttons & 2)) this.remove(this.at(t.x, t.y));
    }
    this._updateGhost();
    const hb = this.at(t.x, t.y);
    document.body.style.cursor = !this.tool && hb ? 'pointer' : '';
  }

  onPointerUp() { this.placing = false; this.deleting = false; this.pan = null; }
  onPointerLeave() { this.hover = null; this.ghost.visible = false; }
  onWheel(ev) { this.dist = Math.max(7, Math.min(48, this.dist * (ev.deltaY > 0 ? 1.1 : 0.9))); }

  onKey(code) {
    if (code === 'Digit1') this.setTool('belt');
    if (code === 'Digit2') this.setTool('miner');
    if (code === 'Digit3') this.setTool('refinery');
    if (code === 'Digit4') this.setTool('teleporter');
    if (code === 'KeyT') this.rotateView();
    if (code === 'KeyQ' || code === 'Escape') { this.tool = null; this.selected = null; this._updateGhost(); }
    if (code === 'KeyR') {
      const hb = this.hover && this.at(this.hover.x, this.hover.y);
      if (!this.tool && hb) this.setDir(hb, (hb.dir + 1) % 4);
      else this.rot = (this.rot + 1) % 4;
      this._updateGhost();
    }
    if ((code === 'Delete' || code === 'KeyX') && this.selected) this.remove(this.selected);
  }

  // ----- UI panel -----
  _info(b) {
    const def = BUILD[b.type];
    if (b.type === 'teleporter') {
      return {
        title: 'Teleporter',
        lines: [
          ['Level', `Mk${lvl('teleporter') + 1} · ×${TELE_MULT[lvl('teleporter')]} per crystal`],
          ['Crystals sent', `${b.received}`],
          ...RES_KEYS.map(k => [`Total ${STAT_INFO[RESOURCES[k].stat].name}`, `${rate(k).toFixed(1)} /min`]),
        ],
        note: 'Every crystal is beamed to your towers. The combined steady flow of all teleporters (crystals/min) sets each stat\'s tier.',
      };
    }
    const lines = [];
    const mult = MK_MULT[lvl(b.type)];
    if (b.type === 'belt') {
      lines.push(['Speed', `${BELT_SPEEDS[game.beltTier].toFixed(1)} tiles/s`], ['Items', `${b.items.length}`]);
    } else {
      lines.push(['Level', `Mk${lvl(b.type) + 1} (all ${def.name}s)`], ['Status', b.status]);
      if (b.type === 'miner') lines.push(['Mining', RESOURCES[RES_KEYS[b.res]].name], ['Output', `${(def.base * mult).toFixed(0)} ore/min`]);
      if (b.type === 'refinery') {
        lines.push(['Output', `up to ${(def.base * mult).toFixed(0)} crystals/min`]);
        lines.push(['Input', b.inKind >= 0 ? `${b.inCount}× ${itemName(b.inKind)}` : 'empty']);
      }
    }
    lines.push(['Refund if removed', `${+(b.spent * 0.5).toFixed(1)} ◈`]);
    return { title: `${def.name} Mk${lvl(b.type) + 1}`, lines, note: def.desc };
  }

  getHoverInfo() {
    if (!this.hover || this.placing || this.pan || this.deleting) return null;
    const b = this.at(this.hover.x, this.hover.y);
    if (b && b !== this.selected) return this._info(b);
    if (!b && this.tool) {
      const def = BUILD[this.tool];
      return { title: def.name, lines: [['Cost', `${this.costOf(this.tool)} ◈`]], note: def.desc };
    }
    return null;
  }

  getPanel() {
    const b = this.selected;
    if (!b) return null;
    const info = this._info(b);
    const def = BUILD[b.type];
    const buttons = [];
    buttons.push({ label: `Upgrade all ${def.name}s… (U)`, action: 'upgrades' });
    if (b.type !== 'teleporter') buttons.push({ label: 'Rotate (R)', action: 'rotate' });
    if (!b.fixed) buttons.push({ label: `Remove (+${+(b.spent * 0.5).toFixed(1)} ◈ refund)`, action: 'remove' });
    buttons.push({ label: 'Close', action: 'close' });
    return { ...info, buttons };
  }

  // ----- save / load -----
  serialize() {
    return {
      cam: [this.cx, this.cz, this.dist, this.yaw],
      buildings: this.buildings.map(b => [b.type, b.x, b.y, b.dir, 1, b.spent, b.fixed ? 1 : 0]),
    };
  }
  load(d) {
    for (const b of this.buildings) this.scene.remove(b.mesh);
    this.buildings = [];
    this.grid.fill(null);
    for (const [type, x, y, dir, mk, spent, fixed] of d.buildings) {
      const b = this._place(type, x, y, dir);
      b.spent = spent;
      if (fixed) { b.fixed = true; this.teleporter = b; }
    }
    [this.cx, this.cz, this.dist, this.yaw] = d.cam;
    this.yawCur = this.yaw;
  }

  panelAction(a) {
    const b = this.selected;
    if (!b) return;
    if (a === 'close') this.selected = null;
    if (a === 'upgrades') emit('openModal', 'upgrades');
    if (a === 'rotate') this.setDir(b, (b.dir + 1) % 4);
    if (a === 'remove') this.remove(b);
  }
}
