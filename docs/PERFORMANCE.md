# Expansion performance and verification

Recorded locally on the owner's Mac. These are measurements of the named workloads, not a guarantee
for production or every device. No new monitoring dependency was added.

## Shared-engine measurements

The comparable 18,000-step 3v3 headless workload (particles disabled, same original harness):

| Measurement | Original baseline | Continuation |
|---|---:|---:|
| Mean update | 0.00461 ms | 0.00663 ms |
| p95 update | 0.00717 ms | 0.01200 ms |
| p99 update | 0.01754 ms | 0.05467 ms |
| Worst update | 0.902 ms | 4.263 ms |

The average increase is about 0.002 ms per step. The worst sample is below the 16.67 ms frame budget,
but this measures simulation only. Neither run is a browser frame-rate test. Random combat, JIT and
GC make individual extrema noisy. Raw data: `performance-comparable.json`; original baseline values
are retained in the handoff history.

The separate `node scripts/profile.mjs` workload also sends move inputs and tests more teams:

| Workload | Steps | Mean | p95 | Worst | Effects/timers at end |
|---|---:|---:|---:|---:|---:|
| 3v3 | 18,000 | 0.00696 ms | 0.01625 ms | 1.329 ms | 1 / 0 |
| 6v6 | 18,000 | 0.00592 ms | 0.01308 ms | 0.744 ms | 13 / 0 |
| Solo raid | 18,000 | 0.00668 ms | 0.01246 ms | 0.400 ms | 5 / 0 |

Raw data: `performance-continuation.json`. Heap changes are recorded there, but without forced GC
or a prolonged heap-retention study they do not establish a leak or prove absence of leaks.
These profiles preceded the final half-HP Mega and cosmetic altitude fixes; those changes have
focused correctness checks rather than a second full benchmark.

## Browser observations

- Claude's earlier handoff records 1,080 Chrome frames covering boss stages 2–4 and cataclysms:
  p95 16.8 ms, none above 25 ms. This continuation did not reproduce that exact run.
- This continuation's logged 600-frame local raid samples show frame p95 17.5–17.6 ms and maximum
  17.7 ms, update p95 about 0.4 ms and render p95 about 0.9 ms. These samples are not an exhaustive
  worst-case or final-build 60 FPS certification; the strict 16.67 ms target is not demonstrated.
- Browser checks covered Lugia's shield/countdown and charge, Mewtwo's Psystrike choreography,
  Rayquaza's launch and Mega transition, title menu at a 375-pixel iframe viewport, and event replay
  play/pause/range layout. The iframe is a layout check, not a physical phone performance test.
- A regression check runs every roster ultimate through its existing choreography. It checks runtime
  completion, not artistic quality for every frame of all 91 moves.
- Temporary review controls and their import were removed from the delivered source.

## Budgets and mitigation

Particles are capped at 1,200/600/220 for High/Balanced/Performance. Canvas resolution follows the
selected quality level. Expensive decorative screen dim effects are skipped in Performance mode;
essential telegraphs, boss shields, countdowns and status indicators remain. Decorative effect
queues are capped separately without dropping gameplay projectiles or callbacks. Boss hazards are
capped at 18, elemental chains at their registry limit, replay events at 600 per match and retained
histories at 30. Frame-cost pressure can automatically lower quality.

Game rendering stops while the page is hidden. On resume the gameplay step is capped to avoid an
unbounded catch-up loop. The profiling log now keeps raw frame intervals separately from that cap.

## Startup and networking

- Local readiness, retry after temporary failure, cancellation of an active readiness request and
  WebSocket welcome gating are covered by targeted tests.
- Local WebSocket tests cover shared raid HP, forged damage rejection, participant disconnect and
  reconnect, plus both drafts through legal team creation and battle launch.
- Co-op presentation follows optional authoritative raid fields, including the Mega form. The actual
  legendary animation runs on detached visual actors and cannot deal a second hit or move live players.
- Readiness is served after initialization/WebSocket setup. Redis startup has a bounded request timeout;
  failures are reported and gameplay remains available with the existing fallback behavior.
- Real Render cold-start duration, DNS/TLS behavior, Indian-network routing, two-device WAN jitter,
  production server CPU and snapshot-serialization cost were **not measured**. Local tests cannot
  establish them. No production deployment was performed during this continuation.
- Capacity stays explicit: default `MAX_MATCHES=3`, `MAX_RAIDS=1`; co-op also consumes match slots.
  Do not raise these based on desktop measurements alone. Begin with one raid and measure `/health`
  load and event-loop delay on the actual host under ordinary-match traffic.
- Self-pinging is best-effort. It does not establish that free hosting will remain awake.

To verify on the host: after genuine inactivity, measure time to `/ready`, connect two distinct browser
identities, complete a raid and a normal match, interrupt one connection, and confirm recovery/results.
Watch `/health` throughout. Retain the current capacity and use Performance mode if frame pacing is
poor. A genuinely always-on requirement needs hosting with that lifecycle guarantee.
