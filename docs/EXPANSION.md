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
| Solo legendary raids (Rayquaza, Mewtwo, Lugia) | PARTIAL | browser | `src/bosses.js`, `src/expansion-ui.js` |
| Online co-op raids (public queue + private room code) | PARTIAL | 2 windows: shared boss HP 8258/9075 on both, ally shown | `server/raids.js`, `src/matchmaking.js` |
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

## Known gaps (spec items not met yet)

- **Raids:** the boss stays fixed in the centre and never attacks with its own patterns beyond 3
  hazard shapes. There is no entrance, phase-transition or defeat sequence and no reward screen. The
  log says "Rayquaza sent out Rayquaza!". In raids the Mega and ultimate cutscenes are skipped
  (a deliberate choice, so co-op timing stays shared).
- **Drafts:** the screen doesn't show whose turn it is by name, the pick order or the remaining
  picks. There is no ranked option (drafts are unranked by design for now).
- **Reactions:** no dedicated sound per reaction yet. Freeze diminishing returns rely on the existing
  6-second freeze guard.
- **Progression:** no achievements or badges, no trainer profile page, no cosmetic unlocks.
- **Title menu:** it now has 11 entries, so check it on phones.

## Log

- Astra: first pass of every system above. Simulation microbenchmark baseline (node, 18,000 headless
  updates, one 3v3 match, particles off): mean 0.00461 ms, p95 0.00717 ms, max 0.90 ms per update.
  This is not a browser FPS measurement. Results are in `docs/performance-final.json`
  (`node scripts/profile.mjs`).
- Claude: audited everything above in real browsers. Next up: the raid boss overhaul (movement,
  signature patterns, entrance, phases, defeat, results).
