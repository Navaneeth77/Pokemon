# Multiplayer performance

Target: 10–20 simultaneous players across matches. The server still defaults to three match slots; production capacity must be validated on its actual host before raising `MAX_MATCHES`.

## Player diagnostics

Enable **Settings → Display → Performance**, press **F3**, or add `?perf` to the URL. The preference is saved in that browser; the panel's × button turns it off. Statistics are opt-in, use a bounded 180-frame window, and refresh four times per second.

- FPS / frame p95 describe browser frame intervals, not network latency. Hidden-tab time is excluded.
- RTT and jitter describe application ping to the match server; stale pings show a dash.
- **Since snapshot** measures time since the last valid snapshot arrived on this browser. It is not one-way network latency or authoritative state age.
- Interpolation is the deliberate remote-animation smoothing delay.
- Correction is positional reconciliation error, in world units.
- Upload queue is this client's WebSocket outbound buffer, not the server's queue.

Match-server statistics show unavailable outside an authoritative online match, including offline battles and PeerJS friend rooms. Physical-phone performance still requires testing on those devices.

## Slow readers

All server WebSocket application sends share a per-connection outbox. At most one application write is in flight. Adjacent queued battle packets retain only the newest state, while their combat events remain ordered. Raid hazard deltas are retained. Match lifecycle messages form barriers: state is not merged across them.

A connection exceeding 64 KiB of queued/socket-buffered data or two seconds of outstanding delivery is closed with code 1013. This bounds backlog and lets the existing reconnect flow take over. It cannot remove bytes already accepted by the operating system or fix the player's network RTT. Event delivery is not guaranteed across a disconnected connection; reconnect still relies on existing recovery behavior.

## Local capacity test

No new packages are needed. These commands start a temporary local server, isolate its economy/leaderboard files, disable Redis and bot fallback, and clean up afterwards:

```sh
npm run test:load -- --players 20 --duration 60 --output load-20.json
npm run test:load -- --players 20 --raids 2 --duration 60 --output load-mixed.json
npm run test:load -- --players 20 --raids 2 --duration 1800 --output load-soak.json
```

Defaults are 10 seconds of warmup and 60 seconds of measurement. Completed matches automatically requeue; `activeFraction` reports any downtime. The tool sends movement, move attempts, dodges and pings through actual WebSockets. It reports snapshot rate/gaps, RTT, payload bandwidth and periodic server health. It exits unsuccessfully on unexpected disconnections/errors, scheduling interruptions or insufficient sustained workload. Keep the machine awake (on macOS prefix with `caffeinate -i`).

Long runs keep bounded latency samples, while byte/frame counters stay exact. Match outcomes and roster coverage are synthetic and limited; a passing short local run does not establish maximum capacity.

## Production-equivalent staging

Use a dedicated staging backend with separate Redis keys/database or isolated files. Set `MAX_MATCHES=10` and `MAX_RAIDS=2` there for the mixed workload. Pointing this tool at a remote server creates synthetic player identities and may write leaderboard results. It therefore requires both a target URL and explicit opt-in:

```sh
npm run test:load -- --url https://YOUR-STAGING-HOST --allow-remote --players 20 --raids 2 --duration 1800 --output staging-20.json
```

Before changing the live limit, inspect the full report for stable delivery near 30 snapshots/second, CPU headroom, no sustained backlog, healthy persistence and expected match turnover. Repeat from the intended players' region. Compare latency with the server idle and busy. The existing health CPU/timing values are rolling windows, not peaks; event-loop histogram values include the monitor's 10 ms sampling resolution.

## Wallet health

`economy.pending` counts distinct wallets queued **or in flight**, without double-counting a wallet with both versions. `oldestPendingMs` preserves the age of unresolved saves across queued replacements/retries. `oldestUnstoredMs` also includes refused writes awaiting recovery. `lastOkAt` advances only when at least one write was stored or confirmed as an identical retry; an entirely refused batch leaves it unchanged. `lastErrorAt` records the most recent failure even after recovery.
