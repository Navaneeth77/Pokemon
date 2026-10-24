# Pokémon: Chaos Arena

An unofficial, non-commercial Pokémon action battler built with Vite, vanilla JavaScript and Canvas 2D. Pokémon and related names belong to Nintendo / Game Freak / The Pokémon Company. This project is not affiliated with them.

## Play locally

```sh
npm install
npm run dev
npm run server  # separate terminal, for matchmaking, drafts and co-op
```

Open http://localhost:5173. For two local players use separate browsers, or two dev tabs with `?pid=a` and `?pid=b`. Bot battles and solo raids work without the match server.

## Modes and expansion

- **Bot Battles:** 3v3 or 6v6, three difficulties, random or themed opponents, five arenas.
- **Online Battles:** server-authoritative battles, ratings and leaderboard.
- **Friend Room:** peer-to-peer battles using a room code.
- **Legendary Raids:** Rayquaza, Mewtwo and Lugia; solo or two-player online; public matchmaking or private six-character room codes. Bring three or six Pokémon. Four HP stages, telegraphed hazards, vulnerability windows and four difficulties.
- **Draft Battles:** shared-pool snake draft (3v3/6v6), or simultaneous blind trade (6v6). The server validates picks, handles timeouts and reveals, and starts the battle after confirmation. Drafts are unranked.
- **Pokémon Mastery:** species levels, statistics, discovered reactions, trainer profile, 14 badges and wearable titles. Cosmetic rewards never increase combat stats.
- **Match history:** summaries and bounded event replay timelines. These show recorded events with play/pause and scrubbing; they do not recreate the battle simulation. Old matches without recorded events retain their summaries.
- **My Teams, Edit Trainer, Tutorial, Elemental Guide and Effects Quality** remain accessible from the title menu. The existing story campaign modules remain in the codebase.

### Raid rules

A faint automatically sends out another teammate. There are no revives; co-op continues while either participant has usable Pokémon. A disconnected participant has 15 seconds to reconnect with the same identity. New players cannot join an ongoing encounter. Rooms expire, and a raid ends after 10 minutes.

Rayquaza and Mewtwo Mega Evolve once at **50% HP** into Mega Rayquaza and Mega Mewtwo Y. Remaining and maximum HP are preserved; form stats, type/ability and sprites change together. Co-op clients follow the server's form state.

From stage two, bosses periodically channel their ultimate behind a shield worth 5% of maximum HP. **Break the shield** before the countdown expires to cancel the attack and earn a four-second vulnerability window. Shield damage can overflow into HP. An uninterrupted ultimate hits active players through dodges for 40/55/70/85% of maximum HP on Easy/Normal/Hard/Legendary. Existing Dragon Ascent, Psystrike and Aeroblast choreography plays cosmetically alongside the authoritative outcome. Dragon Ascent rises above the arena before diving. Player ultimates retain their charge intro and attack animation without pausing the shared raid.

### Elemental reactions and Mega stats

Compatible hits within four seconds can trigger Flash Freeze, Conduction, Wildfire, Melt, Steam, Grounded or Fanned Flames. Shields and dodges prevent priming. Reactions consume their aura, have a 1.5-second guard and bounded chains; chains do not hit allies or recursively trigger more reactions. Freeze retains the six-second thaw guard. Ground types resist conduction. The in-game guide lists combinations.

All 17 Mega forms use verified base/form stat ratios. HP is preserved, physical/special damage uses the appropriate effective stats, and switching does not stack bonuses. See `src/data/mega-stats.js` for source data and model notes.

## Controls

| Action | Keyboard |
|---|---|
| Move | WASD / arrows |
| Four moves | 1–4; hold chargeable moves |
| Ultimate | R / 5 |
| Dodge | Space |
| Switch | Q, then 1–6 |
| Mega Evolve | M |
| Pause | P / Escape |
| Start / skip intro or finale | Enter |

Phones use the floating joystick, move/ultimate buttons, Dodge/Mega buttons and teammate portraits. `?touch` forces touch controls for layout checks.

## Architecture and saved data

The 60 Hz shared engine runs in the browser for solo play and headlessly in Node for authoritative online battles. The match server sends snapshots at 30 Hz using protocol **2**. Prediction, interpolation and reconciliation remain in `src/matchmaking.js`. `server/raids.js` owns shared raid sessions; `server/drafts.js` owns online drafts. `BossPresenter` and `src/raid-cinematics.js` add local visuals without deciding damage.

Mastery is stored under the versioned `msb.mastery` key. Version 1 saves migrate to version 2. Result IDs prevent duplicate rewards. Match history is bounded to 30 entries, event logs to 600 events per match and processed result IDs to 500. Clearing browser storage loses local progression; there is no cross-device synchronization. Existing trainer and team saves retain their keys.

## Hosting and configuration

Vercel serves the frontend; a persistent Node/WebSocket service runs `npm run server` on Render. Existing deployed frontend: https://pokemon-gules-delta.vercel.app/. Changes in the local `expansion` branch are not deployed automatically until merged/pushed to the deployment branch.

| Variable | Location | Purpose |
|---|---|---|
| `VITE_MATCH_SERVER_URL` | Vercel/build | Public `wss://` match-server URL |
| `PORT` | Server | Host's listening port; local default 8787 |
| `ALLOWED_ORIGINS` | Server | Comma-separated allowed frontend origins |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Server only | Persistent ratings; otherwise local JSON fallback |
| `LEADERBOARD_FILE` | Server | Optional fallback JSON file path |
| `MAX_MATCHES` | Server | Match capacity, default 3 |
| `MAX_RAIDS` | Server | Concurrent raid limit, default 1; a co-op raid also consumes match capacity |
| `KEEP_AWAKE`, `KEEP_AWAKE_URL`, `RENDER_EXTERNAL_URL` | Server | Optional best-effort self-ping; `KEEP_AWAKE=0` disables it |
| `MATCH_TEST_HP` | Local testing only | Reduced starting HP; never enable for production |

No new secrets or environment variables are required by the expansion. Never put Redis credentials in `VITE_*` variables. Use `/health` for liveness/load information and `/ready` for startup readiness. Storage failures are reported separately; gameplay can run with the fallback. Readiness is served only after server initialization and WebSocket setup.

The client checks readiness, retries temporary failures with bounded exponential backoff and jitter, waits for the WebSocket welcome, and aborts startup work on cancellation. Local battles do not depend on readiness. A free hosting service may still suspend the process: self-pinging cannot guarantee always-on matchmaking. Real Render sleep-to-ready timing and production capacity have not been measured in this continuation.

## Verification and performance

```sh
npm test
npm run build
node scripts/profile.mjs
```

For co-op: both tabs choose Legendary Raids, matching boss/team size, then either Online Partner or Create Room / Join Room. For drafts: both choose Draft Battles with matching mode and format, make picks, then confirm final teams. Friend Room uses its existing separate peer-to-peer room flow.

High/Balanced/Performance settings bound particles and rendering resolution. Expensive decorative overlays are suppressed in Performance mode; essential telegraphs, shield warnings and status indicators remain. Decorative effect queues and replay histories are bounded. Background tabs skip drawing and resume with a capped simulation step.

See `docs/PERFORMANCE.md` for measured results and limits, and `docs/EXPANSION.md` for the implementation checklist. There is no guarantee of 60 FPS on every device. Full deterministic battle replay, ranked drafts and network hit rewind are not implemented; event timelines, unranked drafts and existing authoritative hit timing are used instead.

## Asset credits

- Sprites and portraits: [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab), **CC BY-NC 4.0**, by its contributing artists, under `public/sprites`.
- Rayquaza: PMD2/PMD1 rips by Redblueyellow and MR.C, Dark Night repaint by Dialga22239, recoloured green for this game.
- Trainer sprites and arenas are drawn in code. Sound effects and music are synthesized in code.
- Fonts: Pixelify Sans (OFL) and Luckiest Guy (Apache 2.0), via Fontsource.
- The elemental crest was generated with SpriteCook; its provenance is retained in the asset manifest.
