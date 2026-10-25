# PDF requirement matrix

Specification: Prompot.pdf, Major Feature Expansion (sections 1–13). This matrix distinguishes
implemented behavior from the evidence used to verify it. It does not treat a successful build as
proof of artistic quality, internet reliability, or universal device performance.

## 1. Existing project and safety constraints

- Existing Vite/JavaScript/Canvas project, 60 Hz engine and protocol 2 retained; no framework,
  TypeScript, account system, monetization or new dependency added.
- Bot Battles, Online Battles, Friend Room, saved teams, trainer and tutorial menu paths retained.
  Historical browser checks from Claude are in the handoff; current shared-engine/network tests
  protect the changed paths. The existing campaign modules remain intact.
- Server-authoritative damage, statuses, phases, draft choices, results and rating updates.
  Forged damage messages are rejected by the authoritative raid path.
- Existing save keys retained; optional mastery fields safely migrate older records. Corrupt counters
  and milestone lists are normalized. No CLAUDE.md or game-jam-copy changes.

## 2. Elemental reactions

- Central registry covers water/ice, water/electric, fire/grass, fire/ice, water/fire, ground/electric
  and fire/wind-like special Flying moves. Four-second aura window, consume-once reaction state,
  1.5-second reaction guard, combo amplification followed by diminishing bonus, existing thaw guard.
- Damage/status changes execute in shared combat logic. Shields/dodges block priming; type/ability
  immunity and boss status resistance remain effective. Switching and fainting clear priming.
- Conduction chains only to nearby wet enemies; chain count/distance/damage are bounded and chains
  cannot recursively trigger reactions. Ground types are excluded. Fire spreading is similarly bounded.
- Melt/steam clear applicable freeze/burn state and nearby wet/frost/burn ground marks.
- Distinct procedural sounds, particle types, reaction name callouts and in-game guide.
- Evidence: reaction regression checks include immunity, switch/faint cleanup, shield/dodge behavior,
  nearby wet/dry/ally chain selection; historical browser freeze/conduction checks; shared online engine.

## 3. Mega Evolution

- Verified data for all 17 forms, physical/special effective stats, movement speed, ability/type changes,
  HP preservation and once-per-team rule. Form definitions do not accumulate per-frame bonuses.
- Form survives switching and resets between battles. Optional authoritative species field restores
  the actual form from snapshots. Online transformations use nonblocking effects rather than pausing
  the authoritative clock.
- Rayquaza and Mewtwo raid bosses additionally transform once at 50% HP, preserving raid max/current
  HP. The Mega form is replicated to both players. Dragon Ascent's visual altitude is updated.
- Evidence: stat/lifecycle, half-HP/idempotence, online-clock and ascent/dive tests; browser Mega reveal.

## 4. Legendary raids

- Solo and actual two-client online encounters; public matchmaking and private room codes; teams
  of three or six; Rayquaza, Mewtwo and Lugia; four stages/difficulties; distinct attack rotations,
  telegraphs, area attacks, reaction-compatible attacks and vulnerability windows.
- Boss HP and damage scale with participants/team sizes/difficulty. Status/launch/knockback limits,
  shielded interruptible ultimates, phase cancellation, authoritative HP/results and contribution reports.
- Distinct sky/psychic/tidal entrance effects, phase reveals, original legendary ultimate choreography,
  dedicated boss collapse variations, procedural raid/rage music, readable HUD and reward/results UI.
- Independent controls, switching and Mega usage; auto replacement on faint, no revives, team
  elimination, disconnect grace/rejoin, room/loading expiry, host-independent sessions and time limit.
- Optional feature negotiation prevents endless queues against a server that has not been updated.
- Evidence: historical separate-window browser runs; current two-client socket tests, forged-input
  rejection/reconnect and shared HP; all-stage engine tests; renderer profiling. Across-WAN co-op of
  the new deployment remains a release check, since production currently runs older code.

## 5. Both draft formats

- Snake 3v3/6v6 with a common unique pool, A–B–B–A order, visible picks, current turn/countdown,
  deterministic timeout picks, final team confirmation and battle launch.
- Blind trade 6v6: three private two-choice rounds, one kept/one transferred, simultaneous reveal,
  origins shown, distinct teams and authoritative choices.
- Cryptographic server shuffle, illegal/out-of-turn/repeated pick rejection, cancellation and expiry.
- Ranked and unranked queues are isolated. Ranked results use existing server Elo; unranked results
  do not change ratings. Regular-only and full legal roster pools are separate queue choices.
- Evidence: rules tests, queue isolation test and actual two-client ranked Elo/result test; both formats
  complete over WebSockets; historical two-window UI checks.

## 6. Presentation

- Arcade title cards/groups, animated existing title backdrop, selected/hover feedback, arena previews,
  boss cards and draft-format visual previews. Narrow-phone layout is supported.
- Existing skippable trainer/team VS intro now names the arena. Online player ultimate intros and
  Mega effects do not stop the shared clock. All roster ultimate actions are runtime-audited; existing
  identity-specific choreography is preserved, with a SpriteCook impact sprite integrated into hits.
  Mewtwo retains its SpriteCook psychic effects. Rayquaza and Lugia use natural wind/spray with
  mouth-attached beams. Their SpriteCook discs appear only beneath each boss; casts hold position,
  altitude and facing while released movement attacks retain their choreography.
  A second consecutive raid now resets presenter state, with first/second-run coverage for all bosses.
- Boss defeat variations, finishing hit emphasis, a brief skippable final-hit visual capture,
  varied/equippable victory poses, survivor/stat/XP
  results, rematch paths, health/ultimate/Mega/status/switch/dodge indicators and online ping/jitter cues.
- Procedural reaction, boss, transformation and existing menu/impact audio respects existing settings.
- Evidence: browser title/mastery/phone/replay checks, intro/finale render tests, all-ultimate action audit,
  online nonblocking-clock test and real Canvas benchmarks. Every artistic frame is not individually
  certified by an automated test.

## 7. Mastery and rewards

- Separate entered/completed counts, wins/losses, KOs/faints, damage dealt/received, hits, ultimates,
  Megas, switches, reactions, boss contribution, raids, drafts and streaks.
- Data-driven XP/levels, progress/next cosmetic, milestone history, best damage/fastest win/best raid,
  discovered reactions, full-roster search/sort and two-species comparison.
- Trainer totals/win rate/favourites/top mastery/arena/moves, achievement badges/titles, unlockable
  equippable trainer frames, victory poses and send-out effects. No gameplay/stat advantages.
- Local entry persistence does not award completion XP. Authoritative online results replace provisional
  events; result IDs deduplicate rewards. Friend-room history is explicitly local/unverified.
- Versioned browser storage, older-save migration, corrupt-value normalization, bounded history and
  clear local-only/no-cross-device-sync explanation.
- Evidence: migration/deduplication, entry/completion, unlock/equip and event-history tests; browser
  roster search, cosmetics controls, comparison and next-reward display.

## 8. Results and replay

- Reusable summaries: outcome, duration, damage, moves/ultimates, KOs/faints/switches, reactions,
  Megas, boss contribution, survivors and earned XP across standard, friend, draft and raid modes.
- Automatic finishing-blow playback uses a bounded in-memory capture of actual rendered frames
  (12 at 180×320, six smaller frames in Performance mode), releases buffers on exit and grants no XP.
- Honest event replay with play/pause and scrubbing. This is authoritative/local event history, not
  deterministic simulation playback; the PDF explicitly allows that alternative. Playback grants no XP.
- Event logs capped at 600, histories at 30, result/entry dedupe at 500 IDs. No invented old-match logs.
- Evidence: summary bounds/received-damage tests, actual replay UI playback and result helpers.

## 9–12. Architecture, integration, verification and delivery

- Focused modules for reactions, Mega stats, bosses, raids, drafts, mastery, results, bounded events and
  cosmetic legendary playback. Shared engine remains headless-safe. Optional protocol-2 fields carry
  feature support and Mega species; clients never submit damage or rewards.
- No new secrets. Existing Vercel/Render variables and run commands remain supported. Sprite/art cache
  headers are added in vercel.json. Asset loading remains on demand and decoded before battle.
- README documents the complete modes, controls, storage, architecture, configuration, local raid/draft
  steps and credits. SpriteCook asset IDs/paths/credit cost are preserved in the project manifest.
- Tests/build and exact performance evidence are documented separately; no fabricated hosting or
  physical-device results. No claim that a preview/local commit has updated production.

## 13. Performance and cold-start release gate

- Original shared-engine baseline retained. Current 3v3/6v6/ultimate/reaction/boss frame distributions,
  render/update cost, scripted input-to-render latency, loading, particles/effects and heap samples are
  recorded. This includes High/Performance paths and a repeatable mixed-effects soak.
- Actual local six-player traffic measures two ordinary matches plus a co-op raid, startup, CPU,
  simulation/snapshot cost, event-loop delay, memory, snapshot counts and cleanup.
- Measured CPU profile identified arena/HUD/visual work on the server; headless matches now skip
  textures, decoration, snow, HUD/particle animation and decorative effect lifetimes. Gameplay callbacks
  remain active and regression-tested. Menu background arenas also stop redundant redraws.
- Repeated lifecycle stress covers 24 menu/select/battle/reset cycles, 48 switches, 24 Megas and
  24 faint replacements, with cooldown/form/reset and exit queue assertions (`lifecycle-profile.json`).
  This is headless state-machine coverage; historical browser menu checks remain separately identified.
- Three quality modes, auto lowering, particle/effect/hazard/chain/cache/event/history caps, preserved
  essential telegraphs, hidden-page rendering stop and bounded catch-up. Background event backlogs
  retain KO/Mega events instead of growing indefinitely.
- Readiness/live distinction, legacy-health fallback followed by WebSocket welcome, bounded retries,
  jitter, deadlines, abortable cancellation, wake-request coalescing and explicit feature negotiation.
  Co-op reconnection is bounded by its grace period and cannot leave an indefinitely paused client.
- Production was probed: frontend and /health returned 200; /ready returned 404 on the older server.
  That is a deployment mismatch, not a successful new-server cold-start test.
- Remaining external gate: deploy the completed server/frontend together and measure genuine Render
  sleep-to-ready, WAN jitter, real-device performance and capacity on that host. No Render management connection is configured in the available tools, so provider suspension
  was not forced.
  A strict 16.67 ms p95/universal 60 FPS guarantee is not claimed; measured results and mitigations are
  in PERFORMANCE.md. The specification permits explicitly identifying these unexecuted host checks.
