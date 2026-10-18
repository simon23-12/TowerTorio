# TowerTorio

A browser game crossover of **tower defense** and **Factorio-style automation**, built entirely with three.js (procedural geometry, no Blender, no build step).

**Play:** https://simon23-12.github.io/TowerTorio/

## The idea
- **The Corridor** – a very long corridor running bottom (core) to top (enemy portal), split into 8 sectors. At the start Sectors 1–2 are foggy and the rest is pitch black. Each sector holds one tower, placed anywhere inside it (placement doesn't matter). Only the front tower is active: beat its sector's 5 waves and enemies stop, the next sector lights up and the fog moves on. Build in the next sector to advance; the previous tower shuts down for good. Clear all 8 sectors to win. Towers identify the enemies they see; kills earn credits.
- **The Factory** – a separate map. Quarry endless ore, refine it, and belt the crystals into a teleporter, which beams them to your towers. Extra teleporters can be bought.
- Each resource powers one stat: Alcamanium → Attack, Vitrium → HP, Quicksilite → Dexterity, Voltarite → Energy (fire rate, extra weapons, special attacks).
- Stat tiers depend on the **steady delivery rate** (crystals/min), so the factory has to keep running.
- **Tower upgrades** (Upgrades → Tower tab, or the button in the corridor): Rapid Fire, Twin Laser, Chain Laser, Precision Optics, Nanite Repair (regen + block chance), Cryo Rounds (slow) and Bounty Protocol (double credits) — mostly chances that grow per level.
- **Stages:** the 8 sectors (40 waves) are one stage. Each stage raises the **level cap** by one (everything — tower, factory, specials, game speed — can be upgraded once per stage) and the **stat-tier cap** (T6 → T8 → T9 → T10). Elements open up by stage: Stage 1 Alcamanium only, Stage 2 Vitrium, Stage 3 Quicksilite, Stage 4 Voltarite.
- After clearing a stage you can **pick any stage you've reached** and replay it with everything you've bought.
- **Runes:** choose Ember or Stone at the start (one slot). Runes drop after Sectors 2, 4 and 6; a second slot opens after Sector 4, a third after Stage 1.
- **Special attacks** (Time Warp, Energy Hail, Overdrive) are discovered after Stage 1, bought once in the Loadout (`E`) and dragged into special slots (one per stage cleared, max 3). They run on cooldowns that Energy shortens, and stay available when you replay earlier stages.
- **Game speed** ×2 from the start; ×3/×4/×5 are bought in Upgrades → General.
- The tower visibly bulks up with its upgrades and shows its runes as gems; old towers turn grey when shut down.
- Credits needed for the next Watchtower are **reserved**, and a beacon marks where the next tower goes.
- Lose the core and you can **start over from Sector 1 with your factory intact**.
- Credits buy machines, **Upgrades** (Mk2/Mk3 for every building of a type at once, shown as visual cards) and **Research** (unlocks new elements to quarry).

## Controls
| | |
|---|---|
| `Tab` | switch Corridor / Factory (in split view: switch focus) |
| `V` | split view – both maps side by side |
| Corridor | click inside the lit front sector = build tower, drag / `WASD` pan, `T` rotate view 90°, wheel zoom, `1` `2` `3` specials, `N` call wave early |
| Factory | `1` belt, `2` drill, `3` refinery, `4` teleporter, `R` rotate building, `T` rotate view 90°, right-click remove, `Q` deselect, `WASD` pan, `U` upgrades, `Y` research |
| Global | `E` loadout (runes & specials), `O` options (music / effects volume), `P` pause, `F` speed, `M` mute, `K` codex |

Hover any building or tower for its stats. The game autosaves; **Continue** on the main menu resumes.

## Run locally
Any static server works, e.g. `python -m http.server` then open http://localhost:8000.

Menu music is compressed to Opus (48 kbps, ~1.3 MB) with an MP3 fallback for Safari and only plays in the menus. In-game music is a shuffled playlist of 10 OpenGameArt tracks (see [CREDITS.md](CREDITS.md)); the list lives in `GAME_MUSIC` at the top of `src/audio.js`.
