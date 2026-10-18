// Shared game state: economy, resources, tower stats and a tiny event bus.

export const SECTORS = 8;
export const SECTOR_LEN = 22;
export const CORRIDOR_W = 16;
export const CORRIDOR_LEN = SECTORS * SECTOR_LEN;

export const RESOURCES = {
  alcamanium:  { name: 'Alcamanium',  stat: 'attack',    color: 0xff4a36, css: '#ff5a46', unlockCost: 0 },
  vitrium:     { name: 'Vitrium',     stat: 'hp',        color: 0x36ff78, css: '#46ff88', unlockCost: 150 },
  quicksilite: { name: 'Quicksilite', stat: 'dexterity', color: 0xffc936, css: '#ffd046', unlockCost: 250 },
  voltarite:   { name: 'Voltarite',   stat: 'energy',    color: 0x36c4ff, css: '#46ccff', unlockCost: 400 },
};
export const RES_KEYS = Object.keys(RESOURCES);

export const STAT_INFO = {
  attack:    { name: 'Attack',    icon: '⚔', desc: 'Damage per shot' },
  hp:        { name: 'HP',        icon: '✚', desc: 'Tower health and regeneration' },
  dexterity: { name: 'Dexterity', icon: '➶', desc: 'Range, crit chance, projectile speed' },
  energy:    { name: 'Energy',    icon: '⚡', desc: 'Fire rate, extra weapons, special attacks' },
};

// Crystals per minute needed for each tier (index = tier).
export const TIERS = [0, 6, 15, 30, 50, 80, 120, 180, 260, 360, 500];
export const FLOW_TAU = 20; // seconds, smoothing window for the delivery rate
export const MK_MULT = [1, 1.6, 2.5];
export const BELT_SPEEDS = [1.2, 2.0, 3.2];

export const RESEARCH = [
  { id: 'vitrium',     name: 'Vitrium Refining',     cost: 150, desc: 'Mine and refine green Vitrium → tower HP.', apply: () => { game.unlocked.vitrium = true; } },
  { id: 'quicksilite', name: 'Quicksilite Refining', cost: 250, desc: 'Mine and refine yellow Quicksilite → Dexterity.', apply: () => { game.unlocked.quicksilite = true; } },
  { id: 'voltarite',   name: 'Voltarite Refining',   cost: 400, desc: 'Mine and refine blue Voltarite → Energy & specials.', apply: () => { game.unlocked.voltarite = true; } },
  { id: 'belt2',       name: 'Fast Belts',           cost: 120, desc: 'All belts move items 66% faster.', apply: () => { game.beltTier = Math.max(game.beltTier, 1); } },
  { id: 'belt3',       name: 'Express Belts',        cost: 350, req: 'belt2', desc: 'All belts move items 60% faster again.', apply: () => { game.beltTier = 2; } },
  { id: 'mk3',         name: 'Mk3 Engineering',      cost: 220, desc: 'Allows machines to be upgraded to Mk3.', apply: () => {} },
];

export const game = {};

export function resetGame() {
  Object.assign(game, {
    credits: 100,
    time: 0,
    wave: 0,
    coreHP: 30,
    coreMax: 30,
    over: false,
    paused: false,
    speed: 1,
    view: 'defense',
    flow: Object.fromEntries(RES_KEYS.map(k => [k, 0])),
    tier: Object.fromEntries(RES_KEYS.map(k => [k, 0])),
    unlocked: Object.fromEntries(RES_KEYS.map(k => [k, RESOURCES[k].unlockCost === 0])),
    research: new Set(),
    beltTier: 0,
    discovered: new Set(),
    stats: { kills: 0, delivered: 0, earned: 0 },
    flags: {},
  });
}
resetGame();

const listeners = {};
export function on(ev, fn) { (listeners[ev] ||= []).push(fn); }
export function emit(ev, data) { (listeners[ev] || []).forEach(f => f(data)); }
export function toast(text, kind = 'info') { emit('toast', { text, kind }); }

export function spend(n) {
  if (game.credits >= n) { game.credits -= n; return true; }
  toast(`Not enough credits (need ${n} ◈)`, 'bad');
  emit('sfx', 'error');
  return false;
}
export function earn(n) { game.credits += n; game.stats.earned += n; }

export function buyResearch(id) {
  const r = RESEARCH.find(r => r.id === id);
  if (!r || game.research.has(id)) return;
  if (r.req && !game.research.has(r.req)) { toast('Requires ' + RESEARCH.find(x => x.id === r.req).name, 'bad'); return; }
  if (!spend(r.cost)) return;
  game.research.add(id);
  r.apply();
  toast(`Research complete: ${r.name}`, 'good');
  emit('sfx', 'tier');
}

export function deliver(res) { game.flow[res] += 1; game.stats.delivered++; }
export function rate(res) { return game.flow[res] / FLOW_TAU * 60; }

export function updateEconomy(dt) {
  const decay = Math.exp(-dt / FLOW_TAU);
  for (const r of RES_KEYS) {
    game.flow[r] *= decay;
    const rt = rate(r);
    let t = game.tier[r];
    const old = t;
    while (t < TIERS.length - 1 && rt >= TIERS[t + 1]) t++;
    while (t > 0 && rt < TIERS[t] * 0.85) t--;
    if (t !== old) {
      game.tier[r] = t;
      const s = STAT_INFO[RESOURCES[r].stat].name;
      if (t > old) { toast(`${s} upgraded to Tier ${t}!`, 'good'); emit('sfx', 'tier'); }
      else toast(`${s} dropped to Tier ${t} — supply too low`, 'bad');
    }
  }
}

export function towerStats(t = game.tier) {
  const a = t.alcamanium, h = t.vitrium, d = t.quicksilite, e = t.voltarite;
  return {
    damage: 4 * Math.pow(1.6, a),
    maxHP: 100 + 120 * h + 25 * h * h,
    regen: 0.5 + 2.5 * h,
    range: 11 + 1.5 * d,
    crit: Math.min(0.6, 0.05 + 0.06 * d),
    critMul: 2 + 0.15 * d,
    projSpeed: 20 + 5 * d,
    fireRate: 0.8 * (1 + 0.3 * e),
    weapons: 1 + Math.floor((e + 1) / 3),
    energyMax: e > 0 ? 40 + 30 * e : 0,
    energyRegen: e > 0 ? 1.5 + e : 0,
    energyTier: e,
    attackTier: a,
  };
}
