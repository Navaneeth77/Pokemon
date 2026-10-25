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
- **Draft Battles:** shared-pool snake draft (3v3/6v6), or simultaneous blind trade (6v6). The server validates picks, handles timeouts and reveals, and starts the battle after confirmation. Choose ranked or unranked queues, plus regular-only or full legal roster pools. Ranked drafts use the existing Elo rules.
- **Pokémon Mastery:** searchable species levels, side-by-side comparisons, entered/completed records, best results, discovered reactions, trainer profile, 14 badges and wearable titles. Mastery unlocks equippable trainer frames, victory poses and send-out effects. Cosmetic rewards never increase combat stats.
- **Match history:** summaries and bounded event replay timelines. These show recorded events with play/pause and scrubbing; they do not recreate the battle simulation. Old matches without recorded events retain their summaries.
- **My Teams, Tutorial and Elemental Guide** remain accessible from the title menu. **Settings** groups Edit Trainer, Effects Quality, audio and display controls, and is also available from the pause menu. The existing story campaign modules remain in the codebase.

### Raid rules

A faint automatically sends out another teammate. There are no revives; co-op continues while either participant has usable Pokémon. A disconnected participant has 15 seconds to reconnect with the same identity. New players cannot join an ongoing encounter. Rooms expire, and a raid ends after 10 minutes.

Rayquaza and Mewtwo Mega Evolve once at **50% HP** into Mega Rayquaza and Mega Mewtwo Y. Remaining and maximum HP are preserved; form stats, type/ability and sprites change together. Co-op clients follow the server's form state.

From stage two, bosses periodically channel their ultimate behind a shield worth 5% of maximum HP. **Break the shield** before the countdown expires to cancel the attack and earn a four-second vulnerability window. Shield damage can overflow into HP. An uninterrupted ultimate hits active players through dodges for 40/55/70/85% of maximum HP on Easy/Normal/Hard/Legendary. Existing Dragon Ascent, Psystrike and Aeroblast choreography plays cosmetically alongside the authoritative outcome. Dragon Ascent rises above the arena before diving. Player ultimates retain their charge intro and attack animation without pausing the shared raid.

Bosses hold their position, altitude and facing while casting. Beams attach to their mouths. Rayquaza uses wind/meteor effects and Lugia uses mist/spray. Each has one SpriteCook disc beneath it; their mouths, meteors and dive trails do not repeat that disc. Mewtwo retains its psychic sigil. Dark wisps and impact effects keep the battlefield readable. Ultimate damage lands on the signature action's impact; movement attacks such as Dragon Ascent keep their flight/dive.

Rayquaza and Lugia share layered cast, trail and impact effects across their raid patterns and playable moves. Meteors have molten rock cores, movement leaves a short slipstream, storm lightning starts at its cloud, and water waves/columns break into foam and spray. Dragon Pulse retains its travelling rings; Aeroblast uses the same layered mouth beam. Nova and cataclysm releases sustain moving pressure fronts, airborne gusts/spray or psychic shards after the warning fades. Their safe center or shelters remain visibly clear. Ultimate impacts also send pressure fronts across the floor. Visual effects do not decide damage or safe zones.

Each boss has its own raid environment and original synthesized battle theme, with a faster final-stage arrangement: Rayquaza fights above the clouds at Sky Pillar, Armored Mewtwo in a containment laboratory, and Shadow Lugia at a storm-lashed island fortress. These are lore-inspired designs; regular arena selections stay unchanged. Rayquaza's **Tempest Vortex** uses spiraling wind and mist around a calm safe eye, without dragon silhouettes. Mewtwo's cinematic throw renders one opponent and one shadow through capture, launch and return, while the server retains authority over combat.

Lugia also uses **Water Pulse**: Dragon Pulse's layered beam and travelling rings, water-blue for the fourth regular move slot and purple for the Shadow Lugia raid boss. Thunderstorm forms seven cloud clusters and seven staggered bolts on High/Balanced (four on Performance); extra visual bolts remain inside the warning circle and add no hidden damage.

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

Results include surviving team members, damage, moves, reactions, transformations and earned XP. Friend-room progression is labelled local/unverified.

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

The frontend recognizes legacy protocol-2 `/health` responses when `/ready` is absent, but waits for a WebSocket welcome before calling a connection ready. New modes check the server feature list and report an update requirement rather than searching indefinitely on older deployments.

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

Sprites and art receive one-week cache headers from `vercel.json`; version the URL or filename if an existing asset changes.

Browser profiling: open `/scripts/browser-bench.html` through the Vite dev server; add `?soak=60` for a mixed-effects soak. `node scripts/network-profile.mjs` measures two ordinary matches plus a raid against an isolated local server. These diagnostic pages are not part of the production Vite entry.

See `docs/PERFORMANCE.md` for measured results and limits, and `docs/EXPANSION.md` for the implementation checklist. There is no guarantee of 60 FPS on every device. Finishing sequences include a short visual replay of actual captured frames (raw pixel budget below 3 MB in High quality, cleared on exit). Full deterministic battle replay and network hit rewind are not implemented; match-history event timelines and existing authoritative hit timing are used instead.

Raid bosses alone use the supplied **Shadow Lugia, Armored Mewtwo and Dark Rayquaza** skins. Playable legends and their Mega forms retain their original sheets and names. Shadow Lugia has the reference sheet's red eyes, purple beams/waves/lightning and a purple SpriteCook disc restricted to the floor. Mega boss skins retain their form stats and timings; Armored Mewtwo keeps its armor after evolving. Source sheets and the reproducible import script are retained under `art/sources/legendary-skins` and `scripts/prepare-legendary-skins.py`.

## Asset credits

- Sprites and portraits: [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab), **CC BY-NC 4.0**, by its contributing artists, under `public/sprites`.
- Rayquaza: PMD2/PMD1 rips by Redblueyellow and MR.C; Dark Night repaint by Dialga22239. Playable Rayquaza retains the green recolor; raid bosses use the supplied dark palette.
- Shadow Lugia: supplied sheet by **LaPokefanatica**. Armored Mewtwo: user-supplied sheet, artist not identified in the supplied image. These are imported pixel assets, not newly generated SpriteCook characters.
- Trainer sprites and arenas are drawn in code. Sound effects and music are synthesized in code. The server skips arena textures, ground decoration, ambient particles and HUD animation while preserving gameplay callbacks.
- Fonts: Pixelify Sans (OFL) and Luckiest Guy (Apache 2.0), via Fontsource.
- Five SpriteCook assets were generated: elemental crest, ultimate-impact sprite and three legendary spell sprites. All remain active; Rayquaza/Lugia discs are restricted to the ground beneath each boss. Asset IDs, hashes and paths remain in spritecook-assets.json.

For visual review, `scripts/browser-bench.html?preview=rayquaza&audit` (also `mewtwo` / `lugia`) captures every raid pattern in the real renderer at wind-up, release and follow-through. Armor poses are extracted as connected source characters to exclude neighboring tails and body fragments.
