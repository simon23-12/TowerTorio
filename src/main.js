import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { game, on, resetGame, updateEconomy, TOWER_UPGRADES } from './state.js';
import { Defense } from './defense.js';
import { Factory } from './factory.js';
import { UI } from './ui.js';
import { audio, GAME_MUSIC } from './audio.js';

const SAVE_KEY = 'towertorio-save-v1';
const SPLIT_DEFENSE = 0.42; // share of the screen the corridor gets in split view

const $ = id => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// one post-processing chain per viewport so split view keeps the bloom
function makeComposer() {
  const c = new EffectComposer(renderer);
  c.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  c.addPass(c.renderPass);
  c.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.45, 0.82));
  c.addPass(new OutputPass());
  c.size = [0, 0];
  return c;
}
const composers = [makeComposer(), makeComposer()];

let mode = 'splash';      // splash | menu | playing
let defense = null, factory = null;
let attract = new Defense(true);
let modal = false;
let split = false;
let hoverView = null;
let saveTimer = 0;
const mouse = { x: -1, y: -1 };

const ui = new UI({
  defense: () => defense,
  factory: () => factory,
  active: () => (game.view === 'defense' ? defense : factory),
  setView,
  toggleSpeed,
  toggleMute,
  toggleSplit,
  nextTrack: () => audio.nextSong(),
  pause: p => setPause(p),
  modalOpen: open => { modal = open; },
});

// ---------- layout ----------
function layout() {
  const W = innerWidth, H = innerHeight;
  if (mode === 'playing' && split) {
    const wd = Math.round(W * SPLIT_DEFENSE);
    defense.rect = { x: 0, y: 0, w: wd, h: H };
    factory.rect = { x: wd, y: 0, w: W - wd, h: H };
  } else {
    for (const v of [defense, factory, attract]) if (v) v.rect = { x: 0, y: 0, w: W, h: H };
  }
  document.body.classList.toggle('split', mode === 'playing' && split);
  document.documentElement.style.setProperty('--split', SPLIT_DEFENSE * 100 + 'vw');
}

function setView(v) {
  if (mode !== 'playing' || game.view === v) return;
  game.view = v;
  if (v === 'factory') game.flags.visitedFactory = true;
  document.body.style.cursor = '';
  ui.setView(v, split);
  audio.sfx('click');
}
function toggleSplit() {
  if (mode !== 'playing') return;
  split = !split;
  game.flags.visitedFactory = true;
  layout();
  ui.setView(game.view, split);
}
function toggleSpeed() {
  game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 3 : 1;
  $('btn-speed').textContent = '×' + game.speed;
}
function toggleMute() {
  const m = audio.toggleMute();
  $('btn-mute').textContent = m ? '✕' : '♪';
  $('btn-music').textContent = 'Music: ' + (m ? 'Off' : 'On');
}
function setPause(p) {
  if (mode !== 'playing' || game.over) return;
  game.paused = p;
  $('pausemenu').classList.toggle('hidden', !p);
  if (!p) ui.closeModals();
  else { modal = true; saveGame(); }
}

// ---------- save / load ----------
function saveGame() {
  if (mode !== 'playing' || game.over) return;
  try {
    const g = { ...game, research: [...game.research], discovered: [...game.discovered], paused: false, over: false };
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, game: g, defense: defense.serialize(), factory: factory.serialize(), split }));
  } catch (e) { /* storage unavailable */ }
}
function readSave() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
function refreshContinue() { $('btn-continue').classList.toggle('hidden', !readSave()); }

function startGame(save) {
  resetGame();
  defense = new Defense(false);
  factory = new Factory();
  if (save) {
    Object.assign(game, save.game, { research: new Set(save.game.research), discovered: new Set(save.game.discovered), view: 'defense' });
    game.upgrades = { miner: 0, refinery: 0, belt: game.beltTier || 0, teleporter: 0, ...save.game.upgrades };
    game.towerUp = { ...Object.fromEntries(Object.keys(TOWER_UPGRADES).map(k => [k, 0])), ...(save.game.towerUp || {}) };
    defense.load(save.defense);
    factory.load(save.factory);
    split = !!save.split;
  }
  mode = 'playing';
  modal = false;
  ui.hideSectorCleared();
  ui.objIdx = -1;
  layout();
  ui.setView('defense', split);
  ui.renderCodex();
  $('menu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('pausemenu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('btn-speed').textContent = '×' + game.speed;
  audio.playTrack('game', 0.45);
  if (!save) setTimeout(() => ui.toast('The corridor is dark. Click inside Sector 1 to build your first tower.', 'warn'), 600);
  else ui.toast(`Welcome back — wave ${game.wave}`, 'good');
}

function toMenu() {
  saveGame();
  mode = 'menu';
  defense = factory = null;
  attract = new Defense(true);
  game.paused = false;
  layout();
  ui.closeModals();
  $('hud').classList.add('hidden');
  $('gameover').classList.add('hidden');
  ui.hideSectorCleared();
  $('menu').classList.remove('hidden');
  refreshContinue();
  audio.playTrack('menu', 0.6);
}

on('openModal', id => ui.openModal(id));
on('victory', () => {
  game.over = true;
  clearSave();
  $('btn-keep').classList.add('hidden');
  $('go-title').textContent = 'Corridor Secured!';
  $('go-title').classList.remove('bad');
  $('go-stats').innerHTML = `All 8 sectors cleared in <b>${game.wave}</b> waves<br>Enemies slain <b>${game.stats.kills}</b><br>Crystals teleported <b>${game.stats.delivered}</b><br>Credits earned <b>${Math.round(game.stats.earned)}</b>`;
  $('gameover').classList.remove('hidden');
  audio.sfx('tier');
});
on('gameover', () => {
  clearSave();
  $('btn-keep').classList.remove('hidden');
  $('go-title').textContent = 'The Core Has Fallen';
  $('go-title').classList.add('bad');
  $('go-stats').innerHTML = `Survived to wave <b>${game.wave}</b><br>Enemies slain <b>${game.stats.kills}</b><br>Crystals teleported <b>${game.stats.delivered}</b><br>Credits earned <b>${game.stats.earned}</b>`;
  $('gameover').classList.remove('hidden');
  audio.sfx('destroyed');
});

// ---------- menu wiring ----------
$('splash').addEventListener('click', () => {
  audio.unlock();
  audio.playTrack('menu', 0.6);
  $('splash').classList.add('hidden');
  $('menu').classList.remove('hidden');
  refreshContinue();
  mode = 'menu';
});
$('btn-continue').onclick = () => { audio.sfx('click'); const s = readSave(); if (s) startGame(s); };
$('btn-new').onclick = () => {
  if (readSave() && !confirm('Start a new game? Your saved game will be overwritten.')) return;
  clearSave();
  audio.sfx('click');
  startGame(null);
};
$('btn-howto').onclick = () => ui.openModal('howto');
$('btn-howto2').onclick = () => { $('pausemenu').classList.add('hidden'); ui.openModal('howto'); };
$('btn-music').onclick = toggleMute;
$('credits-list').innerHTML = GAME_MUSIC.map(t => `<div class="line"><span>${t.title}</span><span>${t.artist}</span><span>${t.license}</span></div>`).join('');
$('btn-credits').onclick = () => ui.openModal('credits-modal');
function toggleFullscreen() {
  const d = document;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else { const el = d.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {}); }
}
const syncFullscreenLabel = () => document.querySelectorAll('.btn-fullscreen').forEach(b => {
  b.textContent = document.fullscreenElement || document.webkitFullscreenElement ? '⛶ Exit Fullscreen' : '⛶ Fullscreen';
});
document.querySelectorAll('.btn-fullscreen').forEach(b => { b.onclick = toggleFullscreen; });
document.addEventListener('fullscreenchange', syncFullscreenLabel);
document.addEventListener('webkitfullscreenchange', syncFullscreenLabel);
$('btn-resume').onclick = () => setPause(false);
$('btn-quit').onclick = toMenu;
$('btn-quit2').onclick = toMenu;
$('btn-retry').onclick = () => startGame(null);
// lose the corridor, keep everything built in the factory (machines, upgrades, research, tower upgrades)
$('btn-keep').onclick = () => {
  audio.sfx('build');
  Object.assign(game, { over: false, paused: false, wave: 0, coreHP: game.coreMax, credits: Math.max(game.credits, 100) });
  defense = new Defense(false);
  modal = false;
  layout();
  ui.setView(game.view, split);
  ui.hideSectorCleared();
  $('gameover').classList.add('hidden');
  saveGame();
  ui.toast('A new core is online. Your factory kept running — rebuild from Sector 1.', 'good');
};
// opening a modal in-game pauses, closing it resumes
const origClose = ui.closeModals.bind(ui);
ui.closeModals = (notify = true) => { origClose(notify); if (notify && mode === 'playing') game.paused = false; };
const origOpen = ui.openModal.bind(ui);
ui.openModal = id => { origOpen(id); if (mode === 'playing') game.paused = true; };
addEventListener('beforeunload', saveGame);

// ---------- input ----------
function viewAt(x) {
  if (mode !== 'playing') return null;
  if (!split) return game.view === 'defense' ? defense : factory;
  return x < defense.rect.w ? defense : factory;
}
const focused = () => (mode === 'playing' ? (game.view === 'defense' ? defense : factory) : null);
let dragView = null;

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (modal || game.paused) return;
  const v = viewAt(e.clientX);
  if (!v) return;
  if (split) setView(v === defense ? 'defense' : 'factory');
  dragView = v;
  v.onPointerDown(e);
});
addEventListener('pointermove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (mode !== 'playing') return;
  const v = dragView || (e.target === canvas ? viewAt(e.clientX) : null);
  if (hoverView && hoverView !== v) hoverView.onPointerLeave();
  hoverView = v;
  v?.onPointerMove(e);
});
addEventListener('pointerup', e => { (dragView || focused())?.onPointerUp(e); dragView = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); viewAt(e.clientX)?.onWheel(e); }, { passive: false });

addEventListener('keydown', e => {
  if (mode !== 'playing') return;
  if (e.code === 'Tab') { e.preventDefault(); if (!game.paused) setView(game.view === 'defense' ? 'factory' : 'defense'); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    const anyModal = ['howto', 'codex', 'research', 'upgrades', 'credits-modal'].some(id => !$(id).classList.contains('hidden'));
    if (anyModal) { ui.closeModals(); return; }
    if (!$('sector-clear').classList.contains('hidden')) { ui.hideSectorCleared(); return; }
    if (e.code === 'Escape' && game.view === 'factory' && (factory.tool || factory.selected)) { factory.onKey('Escape'); return; }
    if (e.code === 'Escape' && game.view === 'defense' && defense.selected) { defense.onKey('Escape'); return; }
    setPause(!game.paused);
    return;
  }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (game.paused || game.over) return;
  if (e.code === 'KeyF') { toggleSpeed(); return; }
  if (e.code === 'KeyV') { toggleSplit(); return; }
  if (e.code === 'KeyK') { ui.openModal('codex'); return; }
  if (e.code === 'KeyU') { ui.upgTab = game.view === 'defense' ? 'tower' : 'factory'; ui.openModal('upgrades'); return; }
  if (e.code === 'KeyY') { ui.openModal('research'); return; }
  const v = focused();
  v.keys.add(e.code);
  v.onKey(e.code);
});
addEventListener('keyup', e => { defense?.keys.delete(e.code); factory?.keys.delete(e.code); });
addEventListener('blur', () => { defense?.keys.clear(); factory?.keys.clear(); });

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); layout(); });
layout();

// ---------- loop ----------
function renderView(view, composer) {
  const r = view.rect, H = innerHeight;
  const aspect = r.w / r.h;
  if (view.camera.aspect !== aspect) { view.camera.aspect = aspect; view.camera.updateProjectionMatrix(); }
  if (composer.size[0] !== r.w || composer.size[1] !== r.h) { composer.setSize(r.w, r.h); composer.size = [r.w, r.h]; }
  renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
  renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h);
  renderer.setScissorTest(true);
  composer.renderPass.scene = view.scene;
  composer.renderPass.camera = view.camera;
  composer.render();
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  audio.update(dt);

  if (mode === 'playing') {
    if (!game.paused && !game.over) {
      for (let i = 0; i < game.speed; i++) {
        game.time += dt;
        updateEconomy(dt);
        defense.update(dt);
        factory.update(dt);
      }
      saveTimer += dt;
      if (saveTimer > 15) { saveTimer = 0; saveGame(); }
    }
    defense.updateCamera(dt);
    factory.updateCamera(dt);
    audio.visible.defense = split || game.view === 'defense';
    audio.visible.factory = split || game.view === 'factory';
    ui.update(defense, factory, { split, hoverView, mouse });
    if (split) { renderView(defense, composers[0]); renderView(factory, composers[1]); }
    else renderView(game.view === 'defense' ? defense : factory, composers[0]);
  } else {
    attract.update(dt);
    attract.updateCamera(dt);
    renderView(attract, composers[0]);
  }
}
requestAnimationFrame(frame);

// handy for debugging from the console
window.towertorio = { game, get defense() { return defense; }, get factory() { return factory; } };
