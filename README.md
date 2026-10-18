# TowerTorio

A browser game crossover of **tower defense** and **Factorio-style automation**, built entirely with three.js (procedural geometry, no Blender, no build step).

**Play:** https://simon23-12.github.io/TowerTorio/

## The idea
- **The Corridor** – a very long corridor running bottom (core) to top (enemy portal), split into 8 sectors. At the start Sectors 1–2 are foggy and the rest is pitch black. Each sector holds one tower, placed anywhere inside it (placement doesn't matter). Only the front tower is active: beat its sector's 3 waves and enemies stop, the next sector lights up and the fog moves on. Build in the next sector to advance; the previous tower shuts down for good. Clear all 8 sectors to win. Towers identify the enemies they see; kills earn credits.
- **The Factory** – a separate map. Quarry endless ore, refine it, and belt the crystals into a teleporter, which beams them to your towers. Extra teleporters can be bought.
- Each resource powers one stat: Alcamanium → Attack, Vitrium → HP, Quicksilite → Dexterity, Voltarite → Energy (fire rate, extra weapons, special attacks).
- Stat tiers depend on the **steady delivery rate** (crystals/min), so the factory has to keep running.
- Credits buy machines, Mk2/Mk3 machine upgrades and research.

## Controls
| | |
|---|---|
| `Tab` | switch Corridor / Factory (in split view: switch focus) |
| `V` | split view – both maps side by side |
| Corridor | click inside the lit front sector = build tower, drag / `WASD` pan, `T` rotate view 90°, wheel zoom, `1` `2` `3` specials, `N` call wave early |
| Factory | `1` belt, `2` drill, `3` refinery, `4` teleporter, `R` rotate building, `T` rotate view 90°, right-click remove, `Q` deselect, `WASD` pan, `U` research |
| Global | `P` pause, `F` speed, `M` mute, `K` codex |

Hover any building or tower for its stats. The game autosaves; **Continue** on the main menu resumes.

## Run locally
Any static server works, e.g. `python -m http.server` then open http://localhost:8000.

Menu music is compressed to Opus (48 kbps, ~1.3 MB) with an MP3 fallback for Safari and only plays in the menus. In-game music is a shuffled playlist of 10 OpenGameArt tracks (see [CREDITS.md](CREDITS.md)); the list lives in `GAME_MUSIC` at the top of `src/audio.js`.
