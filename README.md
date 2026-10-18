# TowerTorio

A browser game crossover of **tower defense** and **Factorio-style automation**, built entirely with three.js (procedural geometry, no Blender, no build step).

**Play:** https://simon23-12.github.io/TowerTorio/

## The idea
- **The Corridor** – a very long, pitch-black corridor split into 8 sectors. Only Sector 1 is visible, through fog. Towers burn away the fog, reveal the next sector and identify the enemies they see. Kills earn credits.
- **The Factory** – a separate map. Quarry endless ore, refine it, and belt the crystals into the teleporter, which beams them to your towers.
- Each resource powers one stat: Alcamanium → Attack, Vitrium → HP, Quicksilite → Dexterity, Voltarite → Energy (fire rate, extra weapons, special attacks).
- Stat tiers depend on the **steady delivery rate** (crystals/min), so the factory has to keep running.
- Credits buy machines, Mk2/Mk3 machine upgrades and research.

## Controls
| | |
|---|---|
| `Tab` | switch Corridor / Factory |
| Corridor | click pad = build tower, drag / `A` `D` pan, wheel zoom, `1` `2` `3` specials, `N` call wave early |
| Factory | `1` belt, `2` drill, `3` refinery, `R` rotate, right-click remove, `Q` deselect, `WASD` pan, `T` research |
| Global | `P` pause, `F` speed, `M` mute, `K` codex |

## Run locally
Any static server works, e.g. `python -m http.server` then open http://localhost:8000.

Menu music is compressed to Opus (48 kbps, ~1.3 MB) with an MP3 fallback for Safari.
