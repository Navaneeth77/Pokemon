# Expansion: progress and handoff

Spec: the "Major Feature Expansion" prompt (Prompot.pdf). Work so far: Astra (first pass), then Claude.

**Where the work lives:** the local git branch `expansion`, in this folder. GitHub `master` (the live
site) is untouched. Nothing here is pushed or deployed yet. Deploy only when the release gate in the
spec passes: push `expansion` into `master`, and Vercel and Render redeploy on their own.

Status values:
- **DONE**: built and verified.
- **PARTIAL**: works, but parts of the spec are missing (listed under each feature).
- **TODO**: not started.

The "verified" column says *how* each feature was checked:
- "browser" = played through the real UI in headless Chrome;
- "2 windows" = two separate browser instances against the local match server;
- "node" = `npm test`.

## Status

| Feature | Status | Verified | Main files |
|---|---|---|---|
| Elemental reactions: registry, 7 reactions, HUD callout, guide page | PARTIAL | node, browser (water → ice freezes) | `src/reactions.js` (HIT_REACTIONS), `src/elemental.js`, `game.reactFx` |
| Mega stats: 17 forms, effective-stat model, HP kept | DONE (data) | node; values match Showdown base stats | `src/data/mega-stats.js`, `src/data/species.js` |
| Solo legendary raids (Rayquaza, Mewtwo, Lugia) | DONE | browser (all 3 bosses; entrance, telegraphs, impacts, stage 2/4, cataclysm), node | `src/bosses.js`, `src/expansion-ui.js` |
| Online co-op raids (public queue + private room code) | PARTIAL | 2 windows: shared boss HP, difficulty + boss scale on both | `server/raids.js`, `src/matchmaking.js` |
| Draft A: shared-pool snake, 3v3 and 6v6 | PARTIAL | 2 windows: teams agree on both clients, battle starts | `src/draft-rules.js`, `server/drafts.js`, `src/expansion-ui.js` |
| Draft B: blind trade, 6v6 | PARTIAL | 2 windows: 6 distinct each, battle starts | same files |
| Effects quality (High / Balanced / Performance, auto-downgrade) | PARTIAL | menu opens; effect on frame time not measured | `src/quality.js` |
| Mastery and progression (per species, levels, match history) | PARTIAL | browser: a bot win recorded 2 species | `src/mastery.js`, `src/expansion-ui.js` |
| Match summaries | PARTIAL | browser | `src/mastery.js` (`newSummary`, `recordCombat`) |
| Replays | TODO | | |
| Presentation upgrade (title, intros, ultimates, KO, results) | TODO | | |
| Cold start: `/ready`, backoff with jitter, cancel | PARTIAL | node test; real Render not tested | `server/index.js`, `src/matchmaking.js` (`connectReady`) |
| README update | TODO | | |

Regression (browser, this pass): the title menu loads; Bot Battles 3v3 works through the real menus.
Moves, Mega Evolution (Charizard → Mega Charizard X) and switching all work, and a win reaches the
result screen. Online snake and trade drafts launch into normal battles. No console errors except a
missing favicon.

## Raids (how they work now)

- **Authority.** `BossEncounter` (src/bosses.js) owns the boss's movement, stages, attack choice and
  hits. It runs in the browser for solo raids and on the match server for co-op (`server/raids.js`).
- **Visuals.** `BossPresenter`, `drawBossGround` and `drawBossHud` only draw that state:
  - wind-up animation, charge glow and incoming energy during each warning;
  - the strike animation and projectiles on impact;
  - floor cracks and craters, debris, shake;
  - the aura;
  - the entrance, stage banners, boss bar and attack hints.

  Co-op screens build all of this from the server's raid state, so the server does no visual work.
- **Stages.** There are 4 HP stages (75 / 50 / 25 %), each with its own attack rotation. The boss is
  briefly untouchable during each stage break. Stage 4 opens with the boss's cataclysm: everything is
  hit except 1–2 green safe circles.
- **Attacks.** 13 patterns in `ATTACKS`, all telegraphed for at least 0.9 s. Lugia's tidal wave
  makes targets Wet, so its thunderstorm then triggers a real Conduction reaction.
- **Staggered windows.** After dives, meteors, Aeroblast and the cataclysm the boss is "STAGGERED"
  for about 2–3 s. It takes ×1.3 damage then and doesn't attack.
- **Difficulty** (`RAID_DIFFICULTY`): Easy / Normal / Hard / Legendary scale HP, damage, warning
  time, pace and extra hazards. Boss HP is `base × (4.5 + 0.6 × your team's Pokémon) × difficulty`;
  for example, a solo 3-Pokémon Normal Rayquaza has 9,576 HP.
- **Results.** Co-op results come from the server (each player's boss damage, share, reactions,
  survived), and a win counts for both players. Solo results have a "Raid Again" button.
- **Not done yet:** a dedicated defeat cinematic (the normal finishing sequence plays), boss music,
  and online player-vs-boss hit timing compensation.

## Known gaps (spec items not met yet)

- **Drafts:** the screen doesn't show whose turn it is by name, the pick order or the remaining
  picks. There is no ranked option (drafts are unranked by design for now).
- **Reactions:** no dedicated sound per reaction yet. Freeze diminishing returns rely on the existing
  6-second freeze guard.
- **Progression:** no achievements or badges, no trainer profile page, no cosmetic unlocks.
- **Presentation:** no upgrades yet to the title screen, battle intro, ultimates or KO.
- **Title menu:** it now has 11 entries, so check it on phones.

## Log

- Astra: first pass of every system above. Simulation microbenchmark baseline (node, 18,000 headless
  updates, one 3v3 match, particles off): mean 0.00461 ms, p95 0.00717 ms, max 0.90 ms per update.
  This is not a browser FPS measurement. Results are in `docs/performance-final.json`
  (`node scripts/profile.mjs`).
- Claude: audited everything above in real browsers (all of Astra's online systems work across
  two windows). Then rebuilt raids as above; commit `ed8d007` on branch `expansion`. `npm test`:
  13 pass. Frame times in stage 4 (headless Chrome, M4): p95 16.8 ms, max 16.8 ms for every boss.
  Bugs fixed:
  - the solo boss kept attacking while paused;
  - the side panel said "vs Gold";
  - "Rayquaza sent out Rayquaza!" appeared in the log;
  - "Restart Battle" after a raid started a normal battle;
  - Mewtwo's orb attack crashed.
