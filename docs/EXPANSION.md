# Expansion: progress and handoff

Spec: the "Major Feature Expansion" prompt (Prompot.pdf). Work so far: Astra (first pass), then Claude.
Status values: **DONE** (built and verified as written), **PARTIAL** (works but parts of the spec are
missing), **TODO**. "Verified" says how it was checked; "untested" means it was not exercised at all.

Nothing in this expansion is committed or deployed. `master` on GitHub is still the last live version.

## Status

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Elemental reactions (registry, 7 reactions, HUD callout, guide) | PARTIAL | node tests | `src/reactions.js` HIT_REACTIONS, `src/elemental.js`; visuals via `game.reactFx` |
| Mega stats (17 forms, effective stats) | PARTIAL | node tests | `src/data/mega-stats.js`; values need checking against real data |
| Solo legendary raids (Rayquaza, Mewtwo, Lugia) | PARTIAL | node tests | `src/bosses.js`: 3 hazard kinds, boss fixed in the centre, no entrance or defeat sequence |
| Online co-op raids (public queue + private code) | PARTIAL | node test (server) | `server/raids.js` |
| Draft: shared-pool snake (3v3 / 6v6) | PARTIAL | node tests | `src/draft-rules.js`, `server/drafts.js`, UI in `src/expansion-ui.js` |
| Draft: blind trade (6v6) | PARTIAL | node tests | same files |
| Presentation upgrade (menus, intros, ultimates, KO, results) | TODO | | |
| Effects quality setting (High / Balanced / Performance) | PARTIAL | untested | `src/quality.js` |
| Mastery and progression | PARTIAL | node test | `src/mastery.js`, page in `src/expansion-ui.js` |
| Match summaries / replays | PARTIAL | untested | summaries only; no replay |
| Cold start: readiness + backoff | PARTIAL | untested | `/ready` and `connectReady()` in `src/matchmaking.js` |
| README update | TODO | | |

## Log

- Astra: first pass of every system above (see the files listed).
- Claude: auditing in a real browser (bot battles, online, new menus). Findings go below.

## Findings and fixes

(updated as work happens)
