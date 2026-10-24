# Performance and hosting evidence

Local continuation measurements, 25 October 2026. Raw JSON files are retained beside this report.
No new profiling dependency was added. Measurements apply to the named workloads and environment.

## Baseline and shared-engine profiles

Original 18,000-step 3v3 baseline, no scripted inputs and particles disabled: mean 0.00461 ms,
p95 0.00717 ms, p99 0.01754 ms, max 0.902 ms. The comparable continuation run recorded mean
0.00663 ms, p95 0.012 ms and max 4.263 ms (`performance-comparable.json`). These are simulation
costs, not browser FPS. Random combat/JIT/GC make individual extrema noisy.

`node scripts/profile.mjs` additionally sends move inputs and runs 3v3, 6v6 and a raid for 18,000
steps each. `performance-completion.json` retains the first final run, including a **93.75 ms** raid
outlier. An instrumented repeat (`performance-repeat.json`) did not reproduce it:

| Repeat workload | Mean | p95 | p99 | Max |
|---|---:|---:|---:|---:|
| 3v3 | 0.00642 ms | 0.01442 ms | 0.05021 ms | 0.794 ms |
| 6v6 | 0.00599 ms | 0.01192 ms | 0.03296 ms | 0.714 ms |
| Raid | 0.00682 ms | 0.01142 ms | 0.03438 ms | 0.804 ms |

The single outlier is not explained conclusively and is not erased. Profiling identified arena,
Pokémon, game updates, startup file reads and texture painting among sampled costs. The actual server
now skips texture creation and decorative updates; client visual quality can be lowered. Monitor host
CPU/frame distributions rather than treating a fast repeat as a guarantee. Heap deltas without forced
GC do not establish retained growth or prove absence of leaks.

## Real Canvas renderer

`browser-profile.json` records six scenarios, about 370 measured frames per scenario, after warm-up:

| Scenario | Quality | Frame p95 | Max interval | Update p95 | Render p95 | Peak particles |
|---|---|---:|---:|---:|---:|---:|
| 3v3 | Balanced | 17.6 ms | 17.7 ms | 0.3 ms | 0.8 ms | 83 |
| 6v6 | Balanced | 17.6 ms | 17.7 ms | 0.3 ms | 0.8 ms | 83 |
| Repeated ultimates | High | 17.6 ms | 17.7 ms | 0.5 ms | 0.9 ms | 155 |
| Reaction combinations | High | 17.6 ms | 17.7 ms | 0.3 ms | 1.0 ms | 116 |
| Stage-4 raid + ultimate | High | 17.6 ms | 17.7 ms | 0.6 ms | 1.6 ms | 502 |
| Stage-4 raid + ultimate | Performance | 17.6 ms | 17.7 ms | 0.5 ms | 1.6 ms | 219 |

No recurring >33.3 ms intervals occurred in these samples. The **strict 16.67 ms p95 target is not
established**: this environment delivered roughly 17.6 ms frame cadence even when game work was
under 2 ms. It would be misleading to present this as a universal 60 FPS certification.

Scripted input-call-to-render p95 was about 1–3.2 ms where sampled. It excludes hardware/OS input
latency. Zero values in the original JSON's unsampled ultimate-only cases mean no samples, not
zero input latency; the profiler now emits null for empty samples. Sprite-loading/decode preparation
was about 141 ms in that cached run and is not a cold-network download guarantee.

The mixed-effects soak uses real raid, player ultimate and reaction code in practice state. It can run
60–300 seconds via `?soak=60` or `?soak=300`. Raw sustained results, including sampled heap data,
are saved as `browser-soak.json`; an initial run is also retained. The final 60-second run recorded 3,581 frames: frame p95 17.6 ms, maximum 17.8 ms, update p95
0.4 ms, render p95 1.3 ms, peak 57 effects and 535 particles. Its 61 heap samples started at
22.38 MB, ranged from 22.38 to 26.68 MB and ended at 24.73 MB. Short runs and approximate browser
heap counters cannot certify behavior over hours or GPU memory retention.

## Final visual pass

`browser-visual-profile.json` repeats the six real-Canvas scenarios after the SpriteCook cast sprites,
tapered mouth-attached beams, dark aura and final-hit capture were integrated. About 370 frames per
scenario were measured. Frame p95 was 18.1–18.3 ms; the maximum interval was 18.7 ms. Update p95
was 0.3–0.4 ms and render p95 1.2–1.5 ms. No runtime errors were captured. This is a different browser
session from the earlier table: the stricter 16.67 ms target remains unproven. Ordinary render p95
increased from 0.8 to 1.2 ms with the added capture/presentation work, while staying well within the
per-frame work budget. No universal FPS claim follows from these short runs.

The High raid peaked at 447 particles; Performance mode peaked at 218 and omits decorative beam
orbits. Required hazard warnings remain. Approximate JS heap ended between 32.36 and 33.27 MB
across scenarios; this does not measure all GPU memory. The final-hit buffer has at most twelve
180×320 canvases (2.76 MB raw RGBA pixels), or six 120×214 canvases in Performance mode. Browser
allocation overhead is additional. Buffers are zeroed/released on battle exit and never run on the server.

`node scripts/lifecycle-profile.mjs` ran 24 ordinary/raid state lifecycles, 48 manual switches, 24 Megas
and 24 forced faint replacements over 38,160 updates in 84.79 ms. Exit effects/timers were both zero;
heap delta was 1.14 MB without forced GC. The script asserts switch cooldowns, retained Mega forms
on re-entry and fresh next-battle stats. This covers shared-engine menu/select/battle/reset state, not
DOM layout, physical devices or a proof of retained-memory stability over hours.

## Actual local match-server workload

`node scripts/network-profile.mjs` starts an isolated server, six real WebSocket clients, two ordinary
matches and one two-player Hard raid. It sends movement/move inputs for 12 seconds and measures
/health, traffic and cleanup. It uses a temporary ratings file, no production Redis, and closes its own
server/clients afterward. Test capacity is four sessions; the workload uses three.

| Measurement | Before visual-work removal | After |
|---|---:|---:|
| Startup to readiness | 279 ms | 119 ms |
| Process CPU | 52 ms/second | 40 ms/second |
| Simulation | 16.312 ms/second | 11.207 ms/second |
| Snapshot work | 11.771 ms/second | 10.691 ms/second |
| Event-loop maximum delay | 13 ms | 12 ms |

The before values came from the earlier run of the same script; `network-profile.json` contains the
after run. These descriptive comparisons include different random combat and process scheduling.
They are not production capacity estimates. Snapshot rates stayed near 30 Hz; after all clients left,
active matches and queue entries were zero. No server errors were captured.

The default remains `MAX_MATCHES=3`, `MAX_RAIDS=1`; raid sessions consume match capacity. Do not
increase limits based on this desktop result. A slower/throttled host needs its own load measurement.

## Bounds and resource handling

- Particles: High/Balanced/Performance 1,200/600/220; rendering resolution follows the selected mode.
- Decorative lifetimes capped separately; actual headless server skips known decorative classes.
  Projectiles and landing callbacks still run and have a regression check.
- Boss hazards capped at 18, elemental chains at their registry limits, cached ground stamps at 256.
- Background battle event buffers capped while retaining KO/Mega events; histories 30 matches,
  replay logs 600 events, processed result/entry IDs 500.
- Expensive decorative dim overlays are suppressed in Performance mode. Shields, countdowns,
  essential telegraphs and status information remain visible. Frame-cost pressure lowers quality.
- Hidden tabs skip rendering; resumed steps are capped. Title/team menus stop redundant arena
  redraws while the separate animated title backdrop continues.
- Art is preloaded/decoded; roster sheets remain on-demand. Vercel art/sprite headers cache for a week.
- Wake requests coalesce across tabs for 30 seconds. Readiness/startup/rejoin retries have deadlines,
  cancellation aborts in-flight work, and expired rejoin cannot leave a permanently paused client.

## Real hosting probe and remaining gate

`hosting-probe.json` is an actual HTTPS probe of the current deployment:

- Frontend: HTTP 200, about 0.673 seconds.
- Render /health: HTTP 200, about 0.540 seconds; Redis connected, no active players/matches,
  reported idle CPU 3 ms/second and event-loop maximum 13 ms.
- Render /ready: HTTP 404, about 0.539 seconds. The running server is the older deployment.

This was a warm availability check, **not** a measured Render cold start. The frontend now falls back
from a missing /ready to legacy /health but still waits for a protocol-2 WebSocket welcome. New modes
check advertised server features and explain an update requirement instead of hanging.

No Render management connection is configured in the available tools, so provider suspension was not
forced. No production deployment was performed. Real sleep-to-ready duration, active production CPU,
WAN two-device jitter, physical-phone GPU performance and long-duration retention remain unverified.
The benchmark/scripts and limits make those checks reproducible; no unsupported guarantee is made.

Release: deploy server and frontend together, use two real devices to complete raid/draft/normal
matches, interrupt/rejoin one connection, and observe /health. After genuine host inactivity, measure
/ready and matchmaking startup. Self-pinging cannot prove an always-on free-host lifecycle. Start with
the current capacity, lower quality if frame pacing fails, and use hosting with an always-on guarantee
if sleep delays are unacceptable.
