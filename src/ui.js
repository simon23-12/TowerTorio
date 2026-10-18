// DOM HUD: stats, objectives, panels, toasts, codex, research.
import { game, on, rate, buyResearch, RESOURCES, RES_KEYS, STAT_INFO, TIERS, RESEARCH } from './state.js';
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
  { text: 'Earn credits and research <span class="c-h">Vitrium Refining</span> (<kbd>U</kbd>) for tower HP.', done: () => game.unlocked.vitrium },
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
      if (t.dataset.tool === 'research') this.openModal('research');
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
      `<button class="btn tool ghost" data-tool="research" title="Research upgrades"><kbd>U</kbd> <span class="ic">⚛</span>Research<small>unlocks</small></button>`;
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
    $(id).classList.remove('hidden');
    this.h.modalOpen(true);
  }
  closeModals(notify = true) {
    for (const id of ['howto', 'codex', 'research', 'pausemenu']) $(id).classList.add('hidden');
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
      const done = game.research.has(r.id);
      const reqOk = !r.req || game.research.has(r.req);
      return `<div class="entry ${done ? 'done' : ''}"><h5>${r.name}</h5><div>${r.desc}</div>
        ${done ? '<div class="meta" style="color:var(--good)">✓ Researched</div>' :
          `<button class="btn small" data-research="${r.id}" ${!reqOk || game.credits < r.cost ? 'disabled' : ''}>${reqOk ? `Research · ${r.cost} ◈` : 'Requires ' + RESEARCH.find(x => x.id === r.req).name}</button>`}</div>`;
    }).join('');
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
    $('credits').textContent = Math.floor(game.credits);
    $('core').textContent = `${game.coreHP}/${game.coreMax}`;
    $('core-chip').classList.toggle('low', game.coreHP <= 6);
    const inc = defense.incomingInfo();
    $('wave').textContent = game.wave;
    $('wavetimer').textContent = inc.active ? '· spawning' : `· next in ${Math.max(0, Math.ceil(inc.timer))}s`;
    $('btn-call').disabled = inc.active;

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
    let html;
    if (inc.active || inc.alive) html = `Wave <b>${game.wave}</b>: <b>${inc.alive + inc.queued}</b> enemies remaining`;
    else html = '';
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
      const cost = defense.towerCost();
      const next = defense.towers.findIndex((t, i) => defense.canBuildSector(i));
      $('towercost').innerHTML = next >= 0
        ? `Watchtower cost: <b class="${game.credits >= cost ? '' : 'bad'}">${cost} ◈</b> · buildable in Sector ${next + 1}${defense.cleared > next + 1 ? '' : ''}`
        : `All open sectors have towers · clear further by building in the next lit sector`;
      const info = defense.sectorInfo();
      const viewSector = Math.floor((defense.camX + 6) / 22);
      document.querySelectorAll('.sector').forEach((el, i) => {
        const s = info[i];
        el.classList.toggle('fog', s.state >= 1);
        el.classList.toggle('view', i === viewSector);
        el.classList.toggle('clear', s.state === 2);
        const txt = s.state >= 1 ? `S${i + 1}${s.tower ? ' <span class="tw">♜</span>' : s.ruin ? ' <span class="danger">✕</span>' : ''}${s.known ? ` <span class="danger">☠${s.known}</span>` : ''}` : '▓';
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
