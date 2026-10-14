# Mt. Silver Battle — Phase 1 prototype

Unofficial, non-commercial fan prototype. Pokémon and all related names are © Nintendo / Game Freak / The Pokémon Company; this project is not affiliated with them.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Online battles (matchmaking server)

**Online Battles** pairs random players through a small Node WebSocket server (`server/index.js`). The
server runs the battle itself with the game's own engine: browsers only send movement and button
presses, and the server decides hits, faints and the winner. **Bot Battles** and **Friend Room**
(peer-to-peer room codes) don't need it.

Local (two players on one machine: use two different browsers, or in dev `?pid=a` / `?pid=b` tabs):

```bash
npm run server   # ws://localhost:8787, health check at http://localhost:8787/health
npm run dev      # the game finds the local server automatically on localhost / LAN addresses
```

Production: the server needs a host that keeps WebSocket connections open (Vercel functions can't),
for example a Render / Railway / Fly.io web service:

1. Create a web service from this repository (Node 18+). Build: `npm install`. Start: `npm run server`.
   Health check path: `/health`. The host sets `PORT`.
2. On that service set `ALLOWED_ORIGINS=https://<your-vercel-domain>` (comma-separated if several).
3. In Vercel → Project → Settings → Environment Variables add
   `VITE_MATCH_SERVER_URL=wss://<your-server-host>` and redeploy (Vite bakes it in at build time).
4. Check `https://<your-server-host>/health` returns `{"ok":true,…}`, then queue from two devices.

Without `VITE_MATCH_SERVER_URL` the deployed site shows "matchmaking not available" instead of searching.
No secrets are involved: players are identified by an anonymous random id kept in their browser.
Queues, matches and win/loss records live in the server's memory (one instance; a restart clears them).
`MATCH_TEST_HP=0.15` (testing only) starts every Pokémon at 15 % HP so matches end quickly.

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
