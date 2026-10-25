# Expansion coverage and release evidence

Work is on the local `expansion` branch. The complete PDF requirement-by-requirement accounting is
in REQUIREMENTS.md. README.md gives controls, configuration, credits and local multiplayer steps;
PERFORMANCE.md separates measurements from deployment/device limits.

## Implemented

- Seven shared-engine elemental reactions, immunity/guard handling, bounded enemy-only chains,
  combo windows, terrain cleanup, guide, HUD and distinct procedural sound cues.
- Verified effective stats for all 17 Mega forms; HP/form lifecycle correctness. Raid Rayquaza and
  Mewtwo transform once at half HP; Mega form state is authoritative and replicated.
- Three solo/co-op bosses, four phases/difficulties, telegraphed attacks, reaction-compatible patterns,
  vulnerability windows, shielded interruptible ultimates, original legendary choreography, unique
  entrances/defeat effects, raid music, contribution/survivor/reward results and reconnect handling.
- Both draft formats with private/reveal rules, legal pools, timers, confirmation and battle launch.
  Ranked/unranked queues and regular/full-roster choices are separate; ranked results use server Elo.
- Arcade mode menu/visual previews, trainer/team/arena intro, restored player ultimate charge scenes,
  nonblocking online ultimate/Mega presentation, final-hit/victory effects, short captured-frame final-hit replay, ping/jitter feedback.
- Full-roster mastery search/sort/comparison, separate entered/completed counts, best results, next
  rewards and milestone history. Earned trainer frames, victory poses and send-out effects can be
  equipped. Existing badges, titles, profile, safe migration and result deduplication remain.
- Reusable summaries cover ordinary, friend-room, draft and raid matches. Results show survivors,
  damage, moves, reactions, transforms and earned XP. Bounded event replay has play/pause/scrubbing;
  it does not claim deterministic simulation playback or award progression.
- SpriteCook crest, impact and all three legendary sprites remain in use. Rayquaza/Lugia each have
  one ground disc; their air effects use natural wind, spray, longer meteor trails and beam pressure
  streaks. Casts hold position, facing and altitude until release; the next attack waits for recovery.
  Intentional Dragon Dive/Ascent movement remains. No further generation credits were spent.
- Re-entering a raid clears the prior BossPresenter and cancels its detached ultimate; reused hazard
  IDs and ultimate counters now trigger the entrance, charge and attack animations again.
  Rayquaza/Lugia's move-name overlay leaves their faces visible; Mewtwo's presentation is unchanged.
- Rayquaza/Lugia's complete raid rotations and four playable moves each use attached cast energy,
  layered pulse beams, bounded trails and physical impact fronts. Rayquaza has molten meteor cores,
  slipstreams, pressure pillars and matching Skyfall landing points; Lugia has rolling foam, cloud-origin
  lightning and water columns that break into spray. Both base and Mega Dragon Ascent retain their
  skyward flight and gain movement trails. Ground discs remain confined to the caster's floor aura.
- Lugia's Water Pulse uses Dragon Pulse's layered beam/rings in water blue and primes water reactions;
  it joins the raid rotation and replaces the playable Dragon Pulse slot. Other Pokémon keep their
  existing Water Pulse orb. Thunderstorm now creates five cloud clusters and staggered bolts (three
  at Performance quality), with per-target clouds for co-op and no additional untelegraphed damage.
- Abortable readiness/retries, legacy-health compatibility, welcome gating, feature negotiation,
  bounded co-op rejoin, coalesced wake requests and unchanged protocol 2.
- Bounded decorative/event/stamp caches; hidden-page/menu render reduction; quality modes preserve
  essential warnings. Actual headless matches skip arena textures, snow, ground decoration, HUD and
  cosmetic effect lifetimes while retaining projectiles, callbacks and gameplay timers.
- Repeatable browser/Node/network profiling scripts, server diagnostic timings, one-week art/sprite
  cache headers and current documentation. No dependency, account system or monetization added.

## Verification

The focused/full test history is retained in the task. `npm test` passes all 38 tests; `npm run build` succeeds and `git diff --check` is clean.
The build retains a large-chunk warning (about 620 KB uncompressed / 202 KB gzip). No lint script is
defined. Exact measurements are recorded in PERFORMANCE.md. Coverage includes all roster ultimate action completion, raid shield
break/expiry, half-HP Mega state, skyward Dragon Ascent, immunity/switch/faint/chain behavior, mastery
migration/rewards, bounded queues, ranked Elo, actual two-client drafts/co-op and reconnect.

Browser checks cover title/phone layout, mastery roster search/comparison/cosmetic controls, replay
playback, boss charge/shield/reveal/choreography and actual Canvas performance. Earlier Claude
checks cover the pre-existing full mode flows across separate windows; they are historical evidence,
not a claim that every old test was repeated in this continuation.

A CPU profile found unnecessary visual work on the server. In the measured six-player workload,
local CPU changed from 52 to 40 ms/second after removing it. Browser measurements and a sustained
mixed-effects run are retained in JSON. An anomalous slow Node sample is explicitly reported rather
than discarded. `lifecycle-profile.mjs` additionally runs 24 menu/select/battle/reset cycles,
48 switches, 24 Megas and 24 forced replacements across ordinary and raid engines.
It checks cooldowns, form retention, fresh next-battle stats and empty exit timers/effects.
This is shared-engine lifecycle coverage, not a rendered-menu or physical-device claim. See PERFORMANCE.md for details, exact workloads and reproducible commands.

## Release gate still external

The deployed frontend and /health responded successfully. The live older server returned 404 for
/ready; it does not yet include this expansion. The frontend's compatibility path can still establish
ordinary protocol-2 connections, but new modes require the updated server and advertise that fact.
No production push/deployment was performed by this continuation.

Deploy server/frontend together, then verify real Render sleep-to-ready, WAN play and host capacity.
There is no Render management connection among the available tools, so a genuine provider suspension
was not forced. Physical-phone performance is also unverified. The strict 16.67 ms p95 target is not
established in this browser environment, and no universal 60 FPS guarantee is made. These limits are
explicitly allowed to be reported by the PDF; they are not labelled successful tests.

## Local run

```sh
npm run server
npm run dev
npm test
npm run build
node scripts/profile.mjs
node scripts/network-profile.mjs
node scripts/lifecycle-profile.mjs
```

Use `?pid=a` / `?pid=b` for two local identities. For co-op choose matching boss/team size, then public
partner or Create Room/Join Room. For drafts choose matching mode, team size, ranking and pool,
make picks and confirm. Browser profiling is at `/scripts/browser-bench.html`; `?soak=60` runs a
sustained mixed-effects scenario. The benchmark uses practice state and grants no progression. `?preview=rayquaza`, `?preview=mewtwo`
and `?preview=lugia` expose real casting/ultimate/half-HP/final-hit controls for visual review; the
preview UI does not persist results. These diagnostic pages are not production app entry points.

## Main implementation files

| Area | Files |
|---|---|
| Shared combat and forms | `src/reactions.js`, `src/elemental.js`, `src/combat.js`, `src/data/mega-stats.js` |
| Boss authority and visuals | `src/bosses.js`, `src/raid-art.js`, `src/legendary-effects.js`, `src/raid-cinematics.js` |
| Real online raids and drafts | `server/raids.js`, `server/drafts.js`, `src/draft-rules.js`, `src/matchmaking.js` |
| Presentation and integration | `src/cinema.js`, `src/final-hit-replay.js`, `src/moves.js`, `src/game.js`, `src/flow.js` |
| Progression and results | `src/mastery.js`, `src/results.js`, `src/expansion-ui.js` |
| Assets and performance evidence | `spritecook-assets.json`, `scripts/browser-bench.js`, `scripts/lifecycle-profile.mjs`, `docs/PERFORMANCE.md` |

No new environment variable or secret is required. Preserve `VITE_MATCH_SERVER_URL`,
`ALLOWED_ORIGINS` and existing Redis/file storage configuration. Defaults are `MAX_MATCHES=3` and
`MAX_RAIDS=1`. Deploy the frontend and match server together; existing production is still older code.
See README.md for the full variable table and deployment commands. Local multiplayer: start the
server and Vite, use `?pid=a` and `?pid=b`, choose the same raid boss/team size (public partner or
Create/Join Room), or matching draft mode/format/ranking/pool; finish picks and confirm both teams.
