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
  nonblocking online ultimate/Mega presentation, final-hit/victory effects, ping/jitter feedback.
- Full-roster mastery search/sort/comparison, separate entered/completed counts, best results, next
  rewards and milestone history. Earned trainer frames, victory poses and send-out effects can be
  equipped. Existing badges, titles, profile, safe migration and result deduplication remain.
- Reusable summaries cover ordinary, friend-room, draft and raid matches. Results show survivors,
  damage, moves, reactions, transforms and earned XP. Bounded event replay has play/pause/scrubbing;
  it does not claim deterministic simulation playback or award progression.
- SpriteCook generated the original crest and a new transparent 64×64 impact sprite. The latter is
  integrated into ultimate hits, preloaded, inspected and recorded in spritecook-assets.json.
- Abortable readiness/retries, legacy-health compatibility, welcome gating, feature negotiation,
  bounded co-op rejoin, coalesced wake requests and unchanged protocol 2.
- Bounded decorative/event/stamp caches; hidden-page/menu render reduction; quality modes preserve
  essential warnings. Actual headless matches skip arena textures, snow, ground decoration, HUD and
  cosmetic effect lifetimes while retaining projectiles, callbacks and gameplay timers.
- Repeatable browser/Node/network profiling scripts, server diagnostic timings, one-week art/sprite
  cache headers and current documentation. No dependency, account system or monetization added.

## Verification

The focused/full test history is retained in the task. `npm test` passes all 34 tests; `npm run build` succeeds and `git diff --check` is clean.
The build retains a large-chunk warning (about 612 KB uncompressed / 199 KB gzip). No lint script is
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
than discarded. See PERFORMANCE.md for details, exact workloads and reproducible commands.

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
```

Use `?pid=a` / `?pid=b` for two local identities. For co-op choose matching boss/team size, then public
partner or Create Room/Join Room. For drafts choose matching mode, team size, ranking and pool,
make picks and confirm. Browser profiling is at `/scripts/browser-bench.html`; `?soak=60` runs a
sustained mixed-effects scenario. The benchmark uses practice state and grants no progression.
