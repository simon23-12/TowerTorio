# TowerTorio

A browser game crossover of **tower defense** and **Factorio-style automation**, built entirely with three.js (procedural geometry, no Blender, no build step).

**Play:** https://simon23-12.github.io/TowerTorio/

## The idea
- **The Corridor** – a very long corridor running bottom (core) to top (enemy portal), split into 8 sectors. At the start Sectors 1–2 are foggy and the rest is pitch black. Each sector holds one tower, placed anywhere inside it (placement doesn't matter). Only the front tower is active: beat its sector's 5 waves and enemies stop, the next sector lights up and the fog moves on. Build in the next sector to advance; the previous tower shuts down for good. Clear all 8 sectors to win. Towers identify the enemies they see; kills earn credits.
- **The Factory** – a separate map. Quarry endless ore, refine it, and belt the crystals into a teleporter, which beams them to your towers. Extra teleporters can be bought.
- Each resource powers one stat: Alcamanium → Attack, Vitrium → HP, Quicksilite → Dexterity, Voltarite → Energy (fire rate, extra weapons, special attacks).
- Stat tiers depend on the **steady delivery rate** (crystals/min), so the factory has to keep running.
- **Tower upgrades** (Upgrades → Tower tab, or the button in the corridor): Rapid Fire, Twin Laser, Chain Laser, Precision Optics, Nanite Repair (regen + block chance), Cryo Rounds (slow) and Bounty Protocol (double credits) — mostly chances that grow per level.
- **Stages:** the 8 sectors are Stage 1. Clearing it unlocks special attacks (Time Warp, Energy Hail, Overdrive — hidden until then, kept for future runs), a third rune slot and epic runes; Stage 2 starts harder and keeps everything. More stages are planned.
- **Runes:** choose Ember or Stone at the start (one slot). Runes drop after Sectors 2, 4 and 6; a second slot opens after Sector 4. Manage them with `E`.
- The tower visibly bulks up with its upgrades (buttresses, crown, plinth, and a part per upgrade) and shows its runes as gems.
- Lose the core and you can **start over from Sector 1 with your factory intact**.
- Credits buy machines, **Upgrades** (Mk2/Mk3 for every building of a type at once, shown as visual cards) and **Research** (unlocks new elements to quarry).

## Controls
| | |
|---|---|
| `Tab` | switch Corridor / Factory (in split view: switch focus) |
| `V` | split view – both maps side by side |
| Corridor | click inside the lit front sector = build tower, drag / `WASD` pan, `T` rotate view 90°, wheel zoom, `1` `2` `3` specials, `N` call wave early |
| Factory | `1` belt, `2` drill, `3` refinery, `4` teleporter, `R` rotate building, `T` rotate view 90°, right-click remove, `Q` deselect, `WASD` pan, `U` upgrades, `Y` research |
| Global | `E` runes, `P` pause, `F` speed, `M` mute, `K` codex |

Hover any building or tower for its stats. The game autosaves; **Continue** on the main menu resumes.

## Run locally
Any static server works, e.g. `python -m http.server` then open http://localhost:8000.

Menu music is compressed to Opus (48 kbps, ~1.3 MB) with an MP3 fallback for Safari and only plays in the menus. In-game music is a shuffled playlist of 10 OpenGameArt tracks (see [CREDITS.md](CREDITS.md)); the list lives in `GAME_MUSIC` at the top of `src/audio.js`.
