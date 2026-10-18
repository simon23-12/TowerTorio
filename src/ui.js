// DOM HUD: stats, objectives, panels, toasts, codex, research.
import { game, on, rate, buyResearch, buyUpgrade, RESOURCES, RES_KEYS, STAT_INFO, TIERS, RESEARCH, UPGRADES } from './state.js';
import { buildingIcon, oreIcon } from './icons.js';
import { ENEMY_TYPES, SPECIALS } from './defense.js';
import { BUILD } from './factory.js';

const $ = id => document.getElementById(id);

const OBJECTIVES = [
  { text: 'Click anywhere inside <b>Sector 1</b> to build your first Watchtower.', done: () => game.flags.towerBuilt },
  { text: 'Your tower is weak and will fall. Press <kbd>Tab</kbd> to open the <b>Factory</b> (or <kbd>V</kbd> for split view).', done: () => game.flags.visitedFactory },
  { text: 'Select the <b>Quarry Drill</b> (<kbd>2</kbd>) and place it on red <span class="c-a">Alcamanium</span> ore, east of the teleporter.', done: () => game.flags.minerPlaced },
  { text: 'Place a <b>Refinery</b> (<kbd>3</kbd>) and connect the drill\'s arrow side to it with <b>belts</b> (<kbd>1</kbd>, click-drag).', done: () => game.flags.refined },
  { text: 'Belt the glowing crystals into the <b>Teleporter</b> in the center.', done: () => game.flags.delivered },
  { text: 'Reach <span class="c-a">Attack Tier 1</span>: a steady 6 crystals/min.', done: () => game.tier.alcamanium >= 1 },
  { text: 'Earn credits and research <span class="c-h">Vitrium</span> (<kbd>Y</kbd>) for tower HP.', done: () => game.unlocked.vitrium },
  { text: 'Clear sector after sector with towers and push all four stats. Survive!', done: () => false },
];

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.toastEls = [];
    this.lastPanel = null;
    this.slow = 0;
    on('toast', t => this.toast(t.text, t.kind));
    on('discover', () => this.renderCodex());
    on('song', song => { $('np-title').textContent = `${song.title} — ${song.artist}`; $('np-title').title = `Now playing: ${song.title} by ${song.artist}`; });
    on('sectorCleared', info => this.showSectorCleared(info));
    $('btn-next-track').onclick = () => handlers.nextTrack();
    $('upgrades-list').addEventListener('click', ev => {
      const a = ev.target.closest('[data-upgrade]');
      if (a) { buyUpgrade(a.dataset.upgrade); this.renderUpgrades(); }
    });
    $('sector-clear').addEventListener('click', ev => {
      const a = ev.target.closest('[data-sc]');
      if (!a) return;
      const act = a.dataset.sc;
      this.hideSectorCleared();
      if (act === 'goto') { handlers.setView('defense'); handlers.defense().focusSector(handlers.defense().cleared); }
      if (act === 'upgrades' || act === 'research') this.openModal(act);
      if (act === 'factory') handlers.setView('factory');
    });

    $('tab-defense').onclick = () => handlers.setView('defense');
    $('tab-factory').onclick = () => handlers.setView('factory');
    $('btn-call').onclick = () => handlers.defense().callWave();
    $('btn-speed').onclick = () => handlers.toggleSpeed();
    $('btn-pause').onclick = () => handlers.pause(true);
    $('btn-mute').onclick = () => handlers.toggleMute();
    $('btn-split').onclick = () => handlers.toggleSplit();
    $('btn-codex').onclick = () => this.openModal('codex');
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.closeModals());
    $('panel').addEventListener('click', ev => {
      const a = ev.target.closest('[data-action]');
      if (a && !a.disabled) handlers.active().panelAction(a.dataset.action);
      this.lastPanel = null;
    });
    $('research-list').addEventListener('click', ev => {
      const a = ev.target.closest('[data-research]');
      if (a) { buyResearch(a.dataset.research); this.renderResearch(); }
    });
    $('sectors').addEventListener('click', ev => {
      const s = ev.target.closest('[data-sector]');
      if (s) handlers.defense().focusSector(+s.dataset.sector);
    });
    $('specials').addEventListener('click', ev => {
      const s = ev.target.closest('[data-special]');
      if (s) handlers.defense().useSpecial(s.dataset.special);
    });
    $('hotbar').addEventListener('click', ev => {
      const t = ev.target.closest('[data-tool]');
      if (!t) return;
      if (t.dataset.tool === 'research' || t.dataset.tool === 'upgrades') this.openModal(t.dataset.tool);
      else handlers.factory().setTool(t.dataset.tool);
    });
    this._buildStatic();
  }

  _buildStatic() {
    $('stats').innerHTML = RES_KEYS.map(k => {
      const r = RESOURCES[k], s = STAT_INFO[r.stat];
      return `<div class="stat" id="stat-${k}">
        <div class="row"><span class="name" style="color:${r.css}">${s.icon} ${s.name}</span><span class="tier"></span></div>
        <div class="bar"><i style="background:${r.css}"></i></div>
        <div class="sub"><span class="rate"></span><span class="next"></span></div>
      </div>`;
    }).join('');
    $('sectors').innerHTML = Array.from({ length: 8 }, (_, i) => `<div class="sector" data-sector="${i}"></div>`).reverse().join('');
    $('specials').innerHTML = `<div title="Energy (from Voltarite)"><div class="energy"><i></i></div></div>` +
      SPECIALS.map(s => `<button class="btn small special" data-special="${s.id}" title="${s.desc}"><kbd>${s.key}</kbd> ${s.name}<small></small></button>`).join('');
    $('hotbar').innerHTML = Object.entries(BUILD).map(([id, b]) =>
      `<button class="btn tool" data-tool="${id}" title="${b.desc}"><kbd>${b.key}</kbd> <span class="ic">${b.icon}</span>${b.name}<small>${b.cost} ◈</small></button>`).join('') +
      `<button class="btn tool ghost" data-tool="upgrades" title="Upgrade every building of a type"><kbd>U</kbd> <span class="ic">⇪</span>Upgrades<small>machines</small></button>` +
      `<button class="btn tool ghost" data-tool="research" title="Unlock new elements to quarry"><kbd>Y</kbd> <span class="ic">⚛</span>Research<small>elements</small></button>`;
    this.renderCodex();
    this.renderResearch();
  }

  toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = text;
    $('toasts').appendChild(el);
    this.toastEls.push(el);
    while (this.toastEls.length > 5) this.toastEls.shift().remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); this.toastEls = this.toastEls.filter(e => e !== el); }, 400); }, kind === 'warn' ? 6000 : 3800);
  }

  openModal(id) {
    this.closeModals(false);
    if (id === 'codex') this.renderCodex();
    if (id === 'research') this.renderResearch();
    if (id === 'upgrades') this.renderUpgrades();
    $(id).classList.remove('hidden');
    this.h.modalOpen(true);
  }
  closeModals(notify = true) {
    for (const id of ['howto', 'codex', 'research', 'upgrades', 'pausemenu', 'credits-modal']) $(id).classList.add('hidden');
    if (notify) this.h.modalOpen(false);
  }

  renderCodex() {
    $('codex-list').innerHTML = Object.entries(ENEMY_TYPES).map(([id, T]) => {
      if (!game.discovered.has(id)) return `<div class="entry unknown"><h5>??? Unknown</h5><div>Not yet identified. Light its path with a tower.</div></div>`;
      return `<div class="entry"><h5 style="color:${T.color}">${T.name}</h5><div>${T.desc}</div>
        <div class="meta">Base HP ${T.hp} · Speed ${T.speed} · ${T.ignoresTowers ? 'Ignores towers' : `Tower dmg ${T.dmg}`} · Core dmg ${T.leak} · Bounty ${T.reward} ◈</div></div>`;
    }).join('');
  }

  renderResearch() {
    $('research-list').innerHTML = RESEARCH.map(r => {
      const R = RESOURCES[r.res], st = STAT_INFO[R.stat], done = game.research.has(r.id);
      return `<div class="upg-card ${done ? 'done' : ''}">
        <div class="upg-icon" style="border-color:${R.css}">${oreIcon(R.css)}<span class="mk-badge" style="background:${R.css}">${st.icon}</span></div>
        <div class="upg-body"><h5 style="color:${R.css}">${R.name}</h5>
          <div class="upg-stat">Powers <b>${st.name}</b></div>
          <div class="meta">${r.desc}</div>
          ${done ? '<div class="upg-done">✓ Unlocked — place drills on it</div>'
            : `<button class="btn small" data-research="${r.id}" ${game.credits < r.cost ? 'disabled' : ''}>Unlock · ${r.cost} ◈</button>`}</div></div>`;
    }).join('');
  }

  renderUpgrades() {
    const f = this.h.factory();
    const owned = t => f ? f.buildings.filter(b => b.type === t).length : 0;
    $('upgrades-list').innerHTML = Object.entries(UPGRADES).map(([type, u]) => {
      const l = game.upgrades[type], max = l >= u.costs.length;
      const pips = [0, 1, 2].map(i => `<i class="${i <= l ? 'on' : ''}" style="${i <= l ? `background:${['#8090a0', '#40e0ff', '#ffc040'][i]}` : ''}"></i>`).join('');
      return `<div class="upg-card mk${l}">
        <div class="upg-icon">${buildingIcon(type, l)}<span class="mk-badge">Mk${l + 1}</span></div>
        <div class="upg-body"><h5>${u.name}</h5><div class="pips">${pips}</div>
          <div class="upg-stat">Now: <b>${u.stat(l)}</b></div>
          ${max ? '<div class="upg-done">✓ Fully upgraded</div>' : `<div class="upg-stat next">Mk${l + 2}: <b>${u.stat(l + 1)}</b></div>`}
          <div class="meta">You own ${owned(type)} · applies to all, including future ones</div>
          ${max ? '' : `<button class="btn small" data-upgrade="${type}" ${game.credits < u.costs[l] ? 'disabled' : ''}>Upgrade → Mk${l + 2} · ${u.costs[l]} ◈</button>`}</div></div>`;
    }).join('');
  }

  // ----- sector cleared popup -----
  showSectorCleared({ sector, bounty, nextCost, last }) {
    const tips = this._suggestions(nextCost);
    $('sector-clear').innerHTML = `<div class="sc-box">
      <div class="sc-rays"></div>
      <div class="sc-kicker">Sector ${sector + 1}</div>
      <div class="sc-title">CLEARED</div>
      <div class="sc-bounty">+${bounty} ◈ bounty</div>
      ${last ? '' : `<div class="sc-next">The corridor is quiet. <b>Build a tower in Sector ${sector + 2}</b> to bring the next wave — it costs <b>${nextCost} ◈</b>. Your current tower shuts down when you do.</div>`}
      <div class="sc-tips"><h4>Before you advance</h4>${tips.map(t => `<div class="sc-tip"><span>${t.text}</span>${t.act ? `<button class="btn small" data-sc="${t.act}">${t.label}</button>` : ''}</div>`).join('')}</div>
      <div class="sc-buttons">${last ? '' : `<button class="btn" data-sc="goto">Go to Sector ${sector + 2}</button>`}<button class="btn ghost" data-sc="close">Continue</button></div>
    </div>`;
    $('sector-clear').classList.remove('hidden');
  }
  hideSectorCleared() { $('sector-clear').classList.add('hidden'); }

  _suggestions(nextCost) {
    const out = [], spare = game.credits - nextCost;
    const f = this.h.factory();
    // weakest unlocked stat
    const unlocked = RES_KEYS.filter(k => game.unlocked[k]);
    const weakest = unlocked.sort((a, b) => game.tier[a] - game.tier[b])[0];
    if (weakest) {
      const R = RESOURCES[weakest], t = game.tier[weakest];
      out.push({ text: `<b style="color:${R.css}">${STAT_INFO[R.stat].name}</b> is your weakest stat (T${t}, ${rate(weakest).toFixed(0)}/min). Next tier needs ${TIERS[t + 1]} ${R.name} crystals/min — add drills and refineries.`, act: 'factory', label: 'Factory' });
    }
    const up = Object.entries(UPGRADES).filter(([t, u]) => game.upgrades[t] < u.costs.length).sort((a, b) => a[1].costs[game.upgrades[a[0]]] - b[1].costs[game.upgrades[b[0]]])
      .find(([t]) => t !== 'belt' || (f && f.buildings.some(b => b.type === 'belt')));
    if (up) {
      const [t, u] = up, c = u.costs[game.upgrades[t]];
      out.push({ text: `Upgrade all <b>${u.name}s</b> to Mk${game.upgrades[t] + 2} (${u.stat(game.upgrades[t] + 1)}) for ${c} ◈${spare >= c ? '' : ' — save up for it'}.`, act: 'upgrades', label: 'Upgrades' });
    }
    const r = RESEARCH.find(r => !game.research.has(r.id));
    if (r) out.push({ text: `Research <b style="color:${RESOURCES[r.res].css}">${RESOURCES[r.res].name}</b> (${r.cost} ◈) to start powering <b>${STAT_INFO[RESOURCES[r.res].stat].name}</b>.`, act: 'research', label: 'Research' });
    out.push({ text: `Credits only come from kills — keep <b>${nextCost} ◈</b> for the next tower, or you can't advance (removing buildings refunds 50%).` });
    return out.slice(0, 4);
  }

  setView(v, split = false) {
    $('tab-defense').classList.toggle('active', v === 'defense');
    $('tab-factory').classList.toggle('active', v === 'factory');
    $('defense-bar').classList.toggle('hidden', !split && v !== 'defense');
    $('sectors').classList.toggle('hidden', !split && v !== 'defense');
    $('factory-bar').classList.toggle('hidden', !split && v !== 'factory');
    $('btn-split').classList.toggle('active', split);
    document.body.classList.toggle('view-factory', v === 'factory');
    this.lastPanel = null;
  }

  update(defense, factory, { split, hoverView, mouse }) {
    $('credits').textContent = game.credits % 1 ? game.credits.toFixed(1) : game.credits;
    $('core').textContent = `${game.coreHP}/${game.coreMax}`;
    $('core-chip').classList.toggle('low', game.coreHP <= 6);
    const inc = defense.incomingInfo();
    $('wave').textContent = game.wave;
    $('wavetimer').textContent = inc.active ? '· spawning' : inc.waiting ? '· halted' : !inc.moreWaves ? '· last wave' : `· next in ${Math.max(0, Math.ceil(inc.timer))}s`;
    $('btn-call').disabled = inc.active || inc.waiting || !inc.moreWaves;

    // stats
    for (const k of RES_KEYS) {
      const el = $('stat-' + k), t = game.tier[k], r = rate(k);
      const next = TIERS[t + 1], prev = TIERS[t];
      el.classList.toggle('locked', !game.unlocked[k]);
      el.querySelector('.tier').textContent = game.unlocked[k] ? `T${t}` : '🔒';
      el.querySelector('.rate').textContent = game.unlocked[k] ? `${r.toFixed(1)} ${RESOURCES[k].name}/min` : `${RESOURCES[k].name} — research needed`;
      el.querySelector('.next').textContent = next ? `next ${next}` : 'max';
      el.querySelector('.bar i').style.width = (next ? Math.max(0, Math.min(1, (r - prev) / (next - prev))) * 100 : 100) + '%';
    }

    // objective
    const idx = OBJECTIVES.findIndex(o => !o.done());
    if (idx !== this.objIdx) {
      this.objIdx = idx;
      $('objective').innerHTML = `<div class="step">STEP ${idx + 1} / ${OBJECTIVES.length}</div>${OBJECTIVES[idx].text}`;
    }

    // incoming
    let html = '';
    if (inc.waiting) html = defense.cleared === 0 && defense.front < 0
      ? 'Quiet… enemies arrive once your first tower stands.'
      : `<b>Sector ${defense.cleared} cleared.</b> No enemies until you build a tower in <b>Sector ${defense.cleared + 1}</b>.`;
    else html = `Sector <b>${inc.sector + 1}</b> · wave <b>${Math.min(inc.sectorWave, inc.perSector)}/${inc.perSector}</b>`;
    if (inc.active || inc.alive) html += `<br>Wave <b>${game.wave}</b>: <b>${inc.alive + inc.queued}</b> enemies remaining`;
    if (inc.comp) {
      html += `${html ? '<br>' : ''}Wave <b>${inc.wave}</b>: ` + Object.entries(inc.comp).map(([t, n]) =>
        game.discovered.has(t) ? `${n}× <span style="color:${ENEMY_TYPES[t].color}">${ENEMY_TYPES[t].name}</span>` : `${n}× <span class="unknown">???</span>`).join(', ');
    }
    $('incoming').innerHTML = html;

    // panel
    const p = (game.view === 'defense' ? defense : factory).getPanel();
    const ph = p ? `<h3>${p.title}</h3>${p.lines.map(([a, b]) => `<div class="line"><span>${a}</span><span>${b}</span></div>`).join('')}
      ${p.note ? `<div class="note">${p.note}</div>` : ''}<div class="btns">${p.buttons.map(b => `<button class="btn small" data-action="${b.action}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('')}</div>` : '';
    if (ph !== this.lastPanel) {
      this.lastPanel = ph;
      $('panel').innerHTML = ph;
      $('panel').classList.toggle('hidden', !p);
    }

    // hover tooltip
    const info = hoverView?.getHoverInfo?.();
    const tip = $('tooltip');
    if (info) {
      const th = `<h4>${info.title}</h4>${info.lines.map(([a, b]) => `<div class="line"><span>${a}</span><span>${b}</span></div>`).join('')}${info.note ? `<div class="note">${info.note}</div>` : ''}`;
      if (tip._h !== th) { tip._h = th; tip.innerHTML = th; }
      tip.classList.remove('hidden');
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(innerWidth - w - 8, mouse.x + 18) + 'px';
      tip.style.top = Math.min(innerHeight - h - 8, mouse.y + 18) + 'px';
    } else tip.classList.add('hidden');

    // defense bottom bar
    if (game.view === 'defense' || split) {
      const next = defense.cleared, cost = defense.towerCost(next);
      $('towercost').innerHTML = defense.canBuildSector(next)
        ? `Watchtower cost: <b class="${game.credits >= cost ? '' : 'bad'}">${cost} ◈</b> · build in Sector ${next + 1}`
        : `Hold Sector ${next + 1}: beat ${inc.perSector - Math.min(inc.sectorWave, inc.perSector) + (inc.active || inc.alive ? 1 : 0)} more wave(s) · next tower <b>${defense.towerCost(next + 1)} ◈</b>`;
      const info = defense.sectorInfo();
      const viewSector = Math.floor((defense.camX + 6) / 22);
      document.querySelectorAll('.sector').forEach(el => {
        const i = +el.dataset.sector, s = info[i];
        el.classList.toggle('fog', s.state >= 1);
        el.classList.toggle('view', i === viewSector);
        el.classList.toggle('clear', s.state === 2);
        const txt = s.state >= 1 ? `S${i + 1}${s.tower ? ' <span class="tw">♜</span>' : s.offline ? ' <span class="off">♜</span>' : s.ruin ? ' <span class="danger">✕</span>' : ''}${s.known ? ` <span class="danger">☠${s.known}</span>` : ''}` : '▓';
        if (el._t !== txt) { el._t = txt; el.innerHTML = txt; }
      });
      const S = defense.stats();
      document.querySelector('.energy i').style.width = (S.energyMax ? defense.energy / S.energyMax * 100 : 0) + '%';
      document.querySelectorAll('.special').forEach(b => {
        const sp = SPECIALS.find(s => s.id === b.dataset.special);
        const locked = S.energyTier < sp.req;
        b.disabled = locked || defense.energy < sp.cost;
        const sub = locked ? `needs Energy T${sp.req}` : `${sp.cost} energy`;
        const sm = b.querySelector('small');
        if (sm.textContent !== sub) sm.textContent = sub;
      });
    }
    if (game.view === 'factory' || split) {
      document.querySelectorAll('.tool').forEach(b => {
        b.classList.toggle('active', factory.tool === b.dataset.tool);
        const def = BUILD[b.dataset.tool];
        if (!def) return;
        const cost = factory.costOf(b.dataset.tool);
        b.disabled = game.credits < cost;
        const sm = b.querySelector('small');
        if (sm.textContent !== cost + ' ◈') sm.textContent = cost + ' ◈';
      });
    }
    $('slowfx').classList.toggle('on', defense.slowT > 0);

    // tower under attack alert
    const attacked = game.time - defense.lastTowerHit < 1.5;
    $('alert').classList.toggle('hidden', !(attacked && game.view === 'factory' && !split));
    if (attacked) $('alert').textContent = `⚠ Tower under attack in Sector ${defense.lastHitSector + 1} — press Tab`;
    $('tab-defense').classList.toggle('flash', attacked && game.view === 'factory' && !split);
  }
}
