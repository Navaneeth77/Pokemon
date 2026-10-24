# Expansion implementation and verification

The specification is the Major Feature Expansion in Prompot.pdf. Work is in the local `expansion`
branch. The deployed `master` branch has not been changed. See README.md for controls, configuration,
local co-op/draft steps and credits; PERFORMANCE.md for measurements and external verification limits.

## Implementation checklist

| Area | Delivered behavior | Verification |
|---|---|---|
| Elemental reactions | Seven central hit reactions, aura windows, consume-once behavior, bounded chains, immunity/guard handling, guide, HUD and distinct sound cues | Combat tests; earlier browser freeze/conduction checks |
| Mega stats | All 17 supported forms use verified stat ratios and preserve HP; physical/special effective stats | Data and lifecycle tests |
| Solo raids | Three bosses, four stages/difficulties, telegraphs, vulnerability windows, arena damage, results and retry | Earlier browser runs and shared-engine tests |
| Online raids | Server-owned shared boss, public/private matchmaking, contribution results, disconnect grace and reconnect | Earlier two-window checks; current local WebSocket reconnect/forged-damage tests |
| Boss ultimates | Shield, countdown, shield-break cancellation, four-second punish window; large unblockable expiry damage; original legendary choreography | Shield/damage tests, detached-visual safety test, browser review |
| Boss Mega forms | Rayquaza → Mega Rayquaza; Mewtwo → Mega Mewtwo Y at or below 50% HP, once; remaining/max HP preserved, replicated form | Exact-threshold/idempotence tests; browser Mega Rayquaza review |
| Lugia animations | Calm flight idle, cropped spread-wing Charge, wing-beat Swing/Rotate | Frame-bounds/timing test; browser review |
| Dragon Ascent | Boss visual altitude updates and rises above the arena before diving, including Mega form | Altitude/rise/dive regression test and browser launch check |
| Player ultimates in raids | Restored 1.3-second charge intro and move choreography without freezing the shared raid | Wind-up timing test; all roster ultimate runtime audit |
| Drafts | Shared-pool snake 3v3/6v6 and blind trade 6v6; timers, hidden choices, reveal, origins, confirmation | Rules and current two-client WebSocket tests; earlier two-window browser checks |
| Presentation | Arcade title mode cards/groups, arena name on intro, compact raid ultimate cards, boss defeat collapse, varied victory poses, raid/final-stage music | Browser title/mobile layout; intro/finale render test |
| Mastery | Trainer/species records, levels, milestone progress, discoveries, 14 badges, wearable titles, migration/deduplication | Migration/stat tests; earlier browser title/profile checks |
| Match history/replay | Honest event timeline, play/pause/scrub, bounded logs; no rewards from playback | Bounded-event test; mobile browser playback/layout check |
| Quality/performance | Three quality levels, automatic lowering, bounded particles/decorative effects, lighter overlays, preserved warnings | Profiling and targeted presentation checks; see PERFORMANCE.md |
| Startup | Readiness, bounded retry/backoff/jitter, welcome gating, immediate cancellation of readiness work | Startup tests and local readiness/network checks |
| Documentation | Current README, deployment configuration, credits, local verification steps and performance report | Source/diff review |

## Final behavior notes

Boss shields are 5% of maximum boss HP. Channel duration is 6.5 seconds times difficulty's telegraph
factor, with a four-second minimum. Fully blocked hits do not prime reactions or apply move statuses;
overflow reaches HP. Shield break cancels the attack and grants four seconds of ×1.3 boss damage.
Expiry hits each active visible player through dodges for 40/55/70/85% max HP by difficulty.
Stage transitions cancel pending channels. Boss ultimate animations use detached actors, so their
visual hits cannot apply extra combat damage or seize the live player.

Lugia Charge samples Shoot frames 2–9 at 0.35 speed, Idle uses Walk at 0.4 speed, and Swing/Rotate use
Attack. The renderer, afterimages and body-centre sampling all respect the cropped frame offset.

The original raid shortcut bypassed the player's ultimate intro. The continuation restored it using
an action wind-up; the arena and partner continue updating. The boss's original Dragon Ascent,
Psystrike and Aeroblast actions are reused for presentation. The visual actor now runs flight updates,
which fixes Dragon Ascent's former ground-level appearance.

## Verification boundaries and deliberate limits

- Deterministic simulation playback is not offered; the specification permits an honest event replay.
  Old matches have no retroactively fabricated event logs.
- Drafts remain unranked. The optional ranked-draft integration is deferred to preserve current ratings.
- Dedicated network hit rewind is not implemented; current authoritative timing/prediction remains.
- Mastery is local to this browser. Titles/badges are cosmetic and cannot affect battle stats.
- The current continuation did not repeat every earlier Friend Room, saved-team, physical-phone and
  two-window browser test. It retains Claude's results as historical evidence and labels new checks.
- Actual Render sleep-to-ready timing, WAN behavior and production CPU capacity remain external
  verification items. No claim of stable 60 FPS on every device or always-on free hosting is made.
- No new SpriteCook generation or credits were used in this continuation. The earlier generated crest
  and its manifest remain in the project.

## Final checks

`npm test`: 25 passed, 0 failed. `npm run build`: passed; Vite reports the existing large
JavaScript chunk warning (about 600 KB before gzip, 195 KB gzip). `git diff --check`: passed.
No new dependency, production push or deployment was performed.

## Run and release

```sh
npm test
npm run build
node scripts/profile.mjs
```

For local multiplayer run `npm run server` and `npm run dev`; use `?pid=a` / `?pid=b` in separate tabs.
Both players select compatible raid boss/team size or draft mode/format. Private raids use the
six-character code from Create Room in the other tab's Join Room screen. See README.md for details.

Before a production release, run the real-host checklist in PERFORMANCE.md. No secrets or additional
environment variables are needed by these changes. Pushing `master` deploys Vercel and Render;
this continuation leaves deployment under the owner's control.
