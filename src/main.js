import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { game, on, resetGame, updateEconomy } from './state.js';
import { Defense } from './defense.js';
import { Factory } from './factory.js';
import { UI } from './ui.js';
import { audio } from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.45, 0.82);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let mode = 'splash';      // splash | menu | playing
let defense = null, factory = null;
let attract = new Defense(true);
let modal = false;

const ui = new UI({
  defense: () => defense,
  factory: () => factory,
  active: () => (game.view === 'defense' ? defense : factory),
  setView,
  toggleSpeed,
  toggleMute,
  pause: p => setPause(p),
  modalOpen: open => { modal = open; },
});

function setView(v) {
  if (mode !== 'playing' || game.view === v) return;
  game.view = v;
  if (v === 'factory') game.flags.visitedFactory = true;
  document.body.style.cursor = '';
  ui.setView(v);
  audio.sfx('click');
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
  else modal = true;
}

function newGame() {
  resetGame();
  defense = new Defense(false);
  factory = new Factory();
  mode = 'playing';
  modal = false;
  ui.objIdx = -1;
  ui.setView('defense');
  ui.renderCodex();
  $('menu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('pausemenu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('btn-speed').textContent = '×1';
  audio.setMusicLevel(0.22);
  setTimeout(() => ui.toast('The corridor is dark. Build a tower on a glowing pad in Sector 1.', 'warn'), 600);
}

function toMenu() {
  mode = 'menu';
  defense = factory = null;
  attract = new Defense(true);
  game.paused = false;
  ui.closeModals();
  $('hud').classList.add('hidden');
  $('gameover').classList.add('hidden');
  $('menu').classList.remove('hidden');
  audio.setMusicLevel(0.6);
}

on('gameover', () => {
  $('go-stats').innerHTML = `Survived to wave <b>${game.wave}</b><br>Enemies slain <b>${game.stats.kills}</b><br>Crystals teleported <b>${game.stats.delivered}</b><br>Credits earned <b>${game.stats.earned}</b>`;
  $('gameover').classList.remove('hidden');
  audio.sfx('destroyed');
});

// ---------- menu wiring ----------
$('splash').addEventListener('click', () => {
  audio.unlock();
  audio.playMusic();
  audio.setMusicLevel(0.6);
  $('splash').classList.add('hidden');
  $('menu').classList.remove('hidden');
  mode = 'menu';
});
$('btn-new').onclick = () => { audio.sfx('click'); newGame(); };
$('btn-howto').onclick = () => ui.openModal('howto');
$('btn-howto2').onclick = () => { $('pausemenu').classList.add('hidden'); ui.openModal('howto'); };
$('btn-music').onclick = toggleMute;
$('btn-resume').onclick = () => setPause(false);
$('btn-quit').onclick = toMenu;
$('btn-quit2').onclick = toMenu;
$('btn-retry').onclick = newGame;
// closing the how-to modal from the pause menu should un-pause
const origClose = ui.closeModals.bind(ui);
ui.closeModals = (notify = true) => { origClose(notify); if (notify && mode === 'playing') game.paused = false; };
const origOpen = ui.openModal.bind(ui);
ui.openModal = id => { origOpen(id); if (mode === 'playing') game.paused = true; };

// ---------- input ----------
const activeView = () => (mode === 'playing' ? (game.view === 'defense' ? defense : factory) : null);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => { if (!modal && !game.paused) activeView()?.onPointerDown(e); });
addEventListener('pointermove', e => { if (e.target === canvas || e.buttons) activeView()?.onPointerMove(e); });
addEventListener('pointerup', e => activeView()?.onPointerUp(e));
canvas.addEventListener('wheel', e => { e.preventDefault(); activeView()?.onWheel(e); }, { passive: false });

addEventListener('keydown', e => {
  if (mode !== 'playing') return;
  if (e.code === 'Tab') { e.preventDefault(); if (!game.paused) setView(game.view === 'defense' ? 'factory' : 'defense'); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    const anyModal = ['howto', 'codex', 'research'].some(id => !$(id).classList.contains('hidden'));
    if (anyModal) { ui.closeModals(); return; }
    if (e.code === 'Escape' && game.view === 'factory' && (factory.tool || factory.selected)) { factory.onKey('Escape'); return; }
    if (e.code === 'Escape' && game.view === 'defense' && defense.selected) { defense.onKey('Escape'); return; }
    setPause(!game.paused);
    return;
  }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (game.paused || game.over) return;
  if (e.code === 'KeyF') { toggleSpeed(); return; }
  if (e.code === 'KeyK') { ui.openModal('codex'); return; }
  if (e.code === 'KeyT') { ui.openModal('research'); return; }
  const v = activeView();
  v.keys.add(e.code);
  v.onKey(e.code);
});
addEventListener('keyup', e => { defense?.keys.delete(e.code); factory?.keys.delete(e.code); });
addEventListener('blur', () => { defense?.keys.clear(); factory?.keys.clear(); });

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  for (const v of [defense, factory, attract]) if (v) { v.camera.aspect = innerWidth / innerHeight; v.camera.updateProjectionMatrix(); }
});

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  audio.update(dt);

  let view;
  if (mode === 'playing') {
    if (!game.paused && !game.over) {
      const steps = game.speed;
      for (let i = 0; i < steps; i++) {
        game.time += dt;
        updateEconomy(dt);
        defense.update(dt);
        factory.update(dt);
      }
    }
    defense.updateCamera(dt);
    factory.updateCamera(dt);
    ui.update(defense, factory);
    view = game.view === 'defense' ? defense : factory;
  } else {
    attract.update(dt);
    attract.updateCamera(dt);
    view = attract;
  }
  if (view.camera.aspect !== innerWidth / innerHeight) { view.camera.aspect = innerWidth / innerHeight; view.camera.updateProjectionMatrix(); }
  renderPass.scene = view.scene;
  renderPass.camera = view.camera;
  composer.render();
}
requestAnimationFrame(frame);

// handy for debugging from the console
window.towertorio = { game, get defense() { return defense; }, get factory() { return factory; } };
