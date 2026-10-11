# Mt. Silver Battle — Phase 1 prototype

Unofficial, non-commercial fan prototype. Pokémon and all related names are © Nintendo / Game Freak / The Pokémon Company; this project is not affiliated with them.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Controls

- Move: `W` `A` `S` `D` or arrow keys
- Moves: `1`–`4` or click the move buttons (attacks auto-aim at the opponent)
- Switch: `Q` opens the picker, then `1`–`3` (or click a teammate) — one shared 15 s cooldown, first switch is free
- Mega Evolve: `M` (or `5`, or the Mega Evolve button) — Charizard → Mega Charizard X or Rayquaza → Mega Rayquaza, one Mega per battle
- `Enter` starts the battle from the team screen, or returns to it after a battle

## Asset credits

- Pokémon sprites and portraits: [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab), CC BY-NC 4.0, by its contributing artists (stored in `public/sprites`).
- Rayquaza: PMD2/PMD1 rips by Redblueyellow and MR.C, Dark Night repaint by Dialga22239, recoloured back to green for this game.
- Red and Gold trainer sprites are original pixel art drawn in code (`src/trainer.js`).
- Fonts: Pixelify Sans (OFL) and Luckiest Guy (Apache 2.0), via Fontsource.
- Sound effects are synthesised in code; the arena is drawn procedurally.
