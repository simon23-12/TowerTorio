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
  dexterity: { name: 'Dexterity', icon: '➶', desc: 'Reach beyond its sector, crit chance, projectile speed' },
  energy:    { name: 'Energy',    icon: '⚡', desc: 'Fire rate, extra weapons, special attacks' },
};

// Crystals per minute needed for each tier (index = tier).
export const TIERS = [0, 6, 15, 30, 50, 80, 120, 180, 260, 360, 500];
export const FLOW_TAU = 20; // seconds, smoothing window for the delivery rate
export const MK_MULT = [1, 1.6, 2.5];
export const BELT_SPEEDS = [1.2, 2.0, 3.2];

// Research unlocks new elements to quarry and refine.
export const RESEARCH = [
  { id: 'vitrium',     res: 'vitrium',     cost: 150, desc: 'Quarry and refine green Vitrium. Powers tower HP and regeneration.', apply: () => { game.unlocked.vitrium = true; } },
  { id: 'quicksilite', res: 'quicksilite', cost: 250, desc: 'Quarry and refine yellow Quicksilite. Powers Dexterity: reach, crits, projectile speed.', apply: () => { game.unlocked.quicksilite = true; } },
  { id: 'voltarite',   res: 'voltarite',   cost: 400, desc: 'Quarry and refine blue Voltarite. Powers Energy: fire rate, extra weapons, special attacks.', apply: () => { game.unlocked.voltarite = true; } },
];

// Upgrades improve every building of a type at once (level 0 = Mk1).
export const TELE_MULT = [1, 1.25, 1.5];
export const UPGRADES = {
  miner:      { name: 'Quarry Drill',  costs: [80, 240],  stat: l => `${Math.round(30 * MK_MULT[l])} ore/min per drill` },
  refinery:   { name: 'Refinery',      costs: [120, 320], stat: l => `up to ${Math.round(30 * MK_MULT[l])} crystals/min each` },
  belt:       { name: 'Conveyor Belt', costs: [120, 350], stat: l => `${BELT_SPEEDS[l].toFixed(1)} tiles/s` },
  teleporter: { name: 'Teleporter',    costs: [200, 500], stat: l => `each crystal counts ×${TELE_MULT[l]}` },
};

export function buyUpgrade(type) {
  const u = UPGRADES[type], lvl = game.upgrades[type];
  if (lvl >= u.costs.length) return;
  if (!spend(u.costs[lvl])) return;
  game.upgrades[type] = lvl + 1;
  if (type === 'belt') game.beltTier = lvl + 1;
  toast(`${u.name}s upgraded to Mk${lvl + 2}: ${u.stat(lvl + 1)}`, 'good');
  emit('sfx', 'upgrade');
  emit('upgraded', type);
}

// Tower upgrades are bought with credits and stack on top of the factory-supplied stats.
// Most of them are chances that grow a little with every level.
export const TOWER_UPGRADES = {
  rapid:  { name: 'Rapid Fire',      icon: 'rapid',  base: 60,  desc: l => `+${l * 12}% fire rate` },
  twin:   { name: 'Twin Laser',      icon: 'twin',   base: 90,  desc: l => `${l * 12}% chance to fire a second laser at another enemy` },
  chain:  { name: 'Chain Laser',     icon: 'chain',  base: 110, desc: l => l ? `${l * 10}% chance a hit hops on to ${1 + Math.floor(l / 2)} more enem${l > 1 ? 'ies' : 'y'} (60% damage)` : 'Hits can hop to nearby enemies' },
  crit:   { name: 'Precision Optics', icon: 'crit',  base: 70,  desc: l => `+${l * 5}% crit chance, +${(l * 0.25).toFixed(2)}× crit damage` },
  regen:  { name: 'Nanite Repair',   icon: 'regen',  base: 60,  desc: l => `+${(l * 1.5).toFixed(1)} HP/s repair, ${l * 6}% chance to block a hit` },
  frost:  { name: 'Cryo Rounds',     icon: 'frost',  base: 80,  desc: l => `${l * 9}% chance to slow the target by 50% for 2.5s` },
  bounty: { name: 'Bounty Protocol', icon: 'bounty', base: 100, desc: l => `${l * 8}% chance for double credits on a kill` },
};
export const TOWER_UP_MAX = 5;
export const towerUpCost = (id, l = game.towerUp[id]) => Math.round(TOWER_UPGRADES[id].base * Math.pow(1.7, l));

export function buyTowerUpgrade(id) {
  const l = game.towerUp[id];
  if (l >= TOWER_UP_MAX) return;
  if (!spend(towerUpCost(id))) return;
  game.towerUp[id] = l + 1;
  toast(`${TOWER_UPGRADES[id].name} level ${l + 1}: ${TOWER_UPGRADES[id].desc(l + 1)}`, 'good');
  emit('sfx', 'upgrade');
}

// ---------- runes ----------
// Equipable modifiers for the tower. Two basic ones to pick from at the start,
// better ones drop when sectors are cleared, epic ones only from Stage 2 on.
export const RUNES = {
  ember:     { name: 'Ember Rune',     tier: 'basic',  color: '#ff7040', desc: '+15% damage',                 mod: { dmg: 0.15 } },
  stone:     { name: 'Stone Rune',     tier: 'basic',  color: '#c8b8a0', desc: '+25% max HP, +1 HP/s',        mod: { hp: 0.25, regen: 1 } },
  swift:     { name: 'Swift Rune',     tier: 'common', color: '#60e0ff', desc: '+15% fire rate',              mod: { fire: 0.15 } },
  hawk:      { name: 'Hawk Eye Rune',  tier: 'common', color: '#ffff70', desc: '+8% crit chance',             mod: { crit: 0.08 } },
  rime:      { name: 'Rime Rune',      tier: 'common', color: '#a8dcff', desc: '10% chance to slow the target', mod: { frost: 0.1 } },
  greed:     { name: 'Greed Rune',     tier: 'common', color: '#ffd046', desc: '+15% credits from kills',      mod: { credits: 0.15 } },
  storm:     { name: 'Storm Rune',     tier: 'rare',   color: '#b070ff', desc: '12% chance a hit chains to another enemy', mod: { chain: 0.12 } },
  twinfang:  { name: 'Twinfang Rune',  tier: 'rare',   color: '#60ffe0', desc: '12% chance to fire a twin laser', mod: { twin: 0.12 } },
  aegis:     { name: 'Aegis Rune',     tier: 'rare',   color: '#70a0ff', desc: '10% chance to block a hit',    mod: { block: 0.1 } },
  titan:     { name: 'Titan Rune',     tier: 'rare',   color: '#46ff88', desc: '+50% max HP',                  mod: { hp: 0.5 } },
  inferno:   { name: 'Inferno Rune',   tier: 'epic',   color: '#ff3020', desc: '+40% damage',                  mod: { dmg: 0.4 } },
  chronos:   { name: 'Chronos Rune',   tier: 'epic',   color: '#e070ff', desc: '+30% fire rate',               mod: { fire: 0.3 } },
};
export const RUNE_TIER_COLORS = { basic: '#9aa4b8', common: '#46c8ff', rare: '#b070ff', epic: '#ffb030' };

export function runeMods() {
  const m = {};
  for (const id of game.runes?.slots || []) {
    if (!id) continue;
    for (const [k, v] of Object.entries(RUNES[id].mod)) m[k] = (m[k] || 0) + v;
  }
  return m;
}

export function grantRune(id) {
  if (!game.runes.owned.includes(id)) game.runes.owned.push(id);
  const empty = game.runes.slots.indexOf(null);
  if (empty >= 0) game.runes.slots[empty] = id;
  emit('sfx', 'upgrade');
  toast(`${RUNES[id].name} acquired${empty >= 0 ? ' and equipped' : ' — equip it in Runes (E)'}`, 'good');
}
export function equipRune(id, slot) {
  const r = game.runes;
  const cur = r.slots.indexOf(id);
  if (cur >= 0) r.slots[cur] = null;
  if (slot == null) slot = r.slots.indexOf(null);
  if (slot < 0 || slot >= r.slots.length) { toast('All rune slots are full — remove a rune first', 'bad'); return; }
  r.slots[slot] = id;
  emit('sfx', 'click');
}
export function unequipRune(slot) { game.runes.slots[slot] = null; emit('sfx', 'click'); }
export function setRuneSlots(n) {
  while (game.runes.slots.length < n) game.runes.slots.push(null);
}

// pick `n` rune offers the player doesn't own yet, from the allowed tiers
export function rollRunes(tiers, n = 2) {
  let pool = Object.keys(RUNES).filter(id => tiers.includes(RUNES[id].tier) && !game.runes.owned.includes(id));
  if (pool.length < n) pool = Object.keys(RUNES).filter(id => RUNES[id].tier !== 'basic' && RUNES[id].tier !== 'epic' && !game.runes.owned.includes(id));
  return pool.sort(() => Math.random() - 0.5).slice(0, n);
}

// ---------- special attack upgrades (available after Stage 1) ----------
export const SPECIAL_UPGRADES = {
  slow: { name: 'Time Warp',   base: 150, desc: l => `${(6 + 1.5 * l).toFixed(1)}s, slows enemies by ${60 + 5 * l}%` },
  hail: { name: 'Energy Hail', base: 180, desc: l => `${20 + 5 * l} bolts at ×${(3 + 0.5 * l).toFixed(1)} tower damage` },
  over: { name: 'Overdrive',   base: 160, desc: l => `${(6 + 1.5 * l).toFixed(1)}s of ×${(2.5 + 0.25 * l).toFixed(2)} fire rate` },
};
export const specialUpCost = (id, l = game.specialUp[id]) => Math.round(SPECIAL_UPGRADES[id].base * Math.pow(1.7, l));
export function buySpecialUpgrade(id) {
  const l = game.specialUp[id];
  if (l >= TOWER_UP_MAX || !meta.stagesCleared) return;
  if (!spend(specialUpCost(id))) return;
  game.specialUp[id] = l + 1;
  toast(`${SPECIAL_UPGRADES[id].name} level ${l + 1}: ${SPECIAL_UPGRADES[id].desc(l + 1)}`, 'good');
  emit('sfx', 'upgrade');
}

// ---------- progress that survives between runs ----------
const META_KEY = 'towertorio-meta-v1';
export const meta = (() => {
  try { return { stagesCleared: 0, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') }; } catch (e) { return { stagesCleared: 0 }; }
})();
export function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ } }

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
    upgrades: { miner: 0, refinery: 0, belt: 0, teleporter: 0 },
    towerUp: Object.fromEntries(Object.keys(TOWER_UPGRADES).map(k => [k, 0])),
    specialUp: { slow: 0, hail: 0, over: 0 },
    runes: { owned: [], slots: [null] },
    stage: 1,
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
  if (!spend(r.cost)) return;
  game.research.add(id);
  r.apply();
  toast(`Research complete: ${RESOURCES[r.res].name} can now be quarried`, 'good');
  emit('sfx', 'upgrade');
}

export function deliver(res, amount = 1) { game.flow[res] += amount; game.stats.delivered++; }
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

export function towerStats(t = game.tier, u = game.towerUp, r = runeMods()) {
  const a = t.alcamanium, h = t.vitrium, d = t.quicksilite, e = t.voltarite;
  return {
    damage: 4 * Math.pow(1.6, a) * (1 + (r.dmg || 0)),
    maxHP: (100 + 120 * h + 25 * h * h) * (1 + (r.hp || 0)),
    regen: 0.5 + 2.5 * h + 1.5 * u.regen + (r.regen || 0),
    block: Math.min(0.6, 0.06 * u.regen + (r.block || 0)),
    reach: 1 + 1.5 * d,
    crit: Math.min(0.75, 0.05 + 0.06 * d + 0.05 * u.crit + (r.crit || 0)),
    critMul: 2 + 0.15 * d + 0.25 * u.crit,
    projSpeed: 20 + 5 * d,
    fireRate: 0.8 * (1 + 0.3 * e) * (1 + 0.12 * u.rapid) * (1 + (r.fire || 0)),
    twin: 0.12 * u.twin + (r.twin || 0),
    chain: 0.1 * u.chain + (r.chain || 0),
    chainHops: 1 + Math.floor(u.chain / 2),
    frost: 0.09 * u.frost + (r.frost || 0),
    bounty: 0.08 * u.bounty,
    creditMul: 1 + (r.credits || 0),
    weapons: 1 + Math.floor((e + 1) / 3),
    energyMax: e > 0 ? 40 + 30 * e : 0,
    energyRegen: e > 0 ? 1.5 + e : 0,
    energyTier: e,
    attackTier: a,
  };
}
