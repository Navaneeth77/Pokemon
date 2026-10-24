# Expansion: progress and handoff (read this first, Astra)

Spec: the "Major Feature Expansion" prompt (Prompot.pdf). Astra did the first pass; Claude continued.

**Where the work lives:** the local git branch `expansion`, in this folder (`git log --oneline` shows
every step). GitHub `master`, the live site, is untouched, and nothing here is pushed or deployed.
Deploy only when the spec's release gate passes: merge `expansion` into `master` and push. Vercel and
Render then redeploy on their own.

**How to run it:**

```bash
npm install
npm run server   # local match server (ws://localhost:8787)
npm run dev      # game on http://localhost:5173
npm test         # 14 node tests (engine, drafts, raids, mastery, server)
```

For two online players on one machine, open two tabs with `?pid=a` and `?pid=b`.

Status values:
- **DONE**: built and verified.
- **PARTIAL**: works, but parts of the spec are missing (listed below).
- **TODO**: not started.

The "verified" column says *how* each feature was checked:
- "browser" = played through the real UI in headless Chrome;
- "2 windows" = two separate browser instances against the local match server;
- "node" = `npm test`.

## Status

| Feature | Status | Verified | Main files |
|---|---|---|---|
| Elemental reactions: registry, 7 reactions, HUD callout, guide page | PARTIAL | node; browser (water → ice freezes; Lugia's tidal → storm triggers Conduction) | `src/reactions.js` (HIT_REACTIONS), `src/elemental.js`, `game.reactFx` |
| Mega stats: 17 forms, effective-stat model, HP kept | DONE (data) | node; values match Showdown base stats | `src/data/mega-stats.js`, `src/data/species.js` |
| Solo legendary raids (Rayquaza, Mewtwo, Lugia) | DONE except the boss ultimate (see "In progress") | browser: all 3 bosses, all stages, 4 difficulties; node | `src/bosses.js`, `src/expansion-ui.js` |
| Online co-op raids (public queue + private room code) | DONE (same caveat) | 2 windows: shared boss HP, difficulty and boss scale on both | `server/raids.js`, `src/matchmaking.js` |
| Draft A: shared-pool snake, 3v3 and 6v6 | DONE | 2 windows: teams agree on both clients, battle starts | `src/draft-rules.js`, `server/drafts.js`, `src/expansion-ui.js` (`renderDraft`) |
| Draft B: blind trade, 6v6 | DONE | 2 windows: 6 distinct each, origins shown, battle starts | same files |
| Mastery, trainer profile, 14 badges, wearable titles | DONE | node (v1 → v2 migration, dedupe); browser (win → badge → title on menu) | `src/mastery.js`, `src/expansion-ui.js` (`mastery`) |
| Match summaries | DONE | browser | `src/mastery.js` (`newSummary`, `recordCombat`, `resultSummary`) |
| Effects quality (High / Balanced / Performance, auto-downgrade) | PARTIAL | menu works; the effect on slow devices hasn't been measured | `src/quality.js` |
| Sprite audit (do the poses make sense?) | PARTIAL (see "In progress") | all 239 sets checked: files complete; 42 flyers measured | `src/assets.js` (`ALIASES`) |
| Replays | TODO | | |
| Presentation upgrade (title, battle intro, ultimate sequences, KO) | TODO | | |
| Cold start: `/ready`, backoff with jitter, cancel (Astra) | PARTIAL | node test; real Render not tested | `server/index.js`, `src/matchmaking.js` (`connectReady`) |
| README update | TODO | | |

## In progress when Claude stopped (the owner's latest requests, in their words)

1. **"Lugia looks weird when charging, flapping weirdly; the spin is so weird; its move animations got bad."**
   - *Cause:* `ALIASES` in `src/assets.js` maps Lugia's Charge to its 2-frame Walk flap, which jitters,
     and its Rotate to Swing. For Lugia, Swing is a full-body spin, and it's also used by Air Slash.
   - *Fix being made:*
     - Charge becomes a held spread-wing pose (frames 2–9 of Lugia's Shoot sheet). This needs a frame
       `offset` in `AnimatedSprite.draw`.
     - Swing and Rotate become Lugia's Attack (wing beat), so Lugia never spins.
     - Idle stays Walk at 0.4 speed (calm hover).
     - The boss animation tables in `src/bosses.js` (`WIND` / `STRIKE`) get per-boss overrides, so no
       boss uses a spin.
2. **"The boss has to use its ult sometimes: it gains a shield, you have to break the shield to stop
   the ult, and the ult has to deal a lot of damage."** Planned design:
   - A new rotation entry `ultimate` in each boss's `attacks` (from stage 2).
   - **Channel:** about 6.5 s × difficulty `tele`. The boss gains a shield of about 5.5 % of its max HP.
   - **Absorbing hits:** in `src/combat.js` `applyHit`, hits on `target.boss` while
     `game.raid.ult.shield > 0` reduce the shield instead of HP. This runs on the server too.
   - **Shield broken:** the ultimate is cancelled, and the boss is staggered for 4 s and takes ×1.3
     damage.
   - **Timer runs out:** the ultimate hits every player for a large share of max HP (Normal ~55 %,
     Legendary ~85 %), even through dodges.
   - **View:** `view()` gains `ul: { k, t, d, sh, shm }`. HUD: "BREAK THE SHIELD!" bar and countdown.
     World: a shield bubble around the boss that cracks as it weakens. Presenter cues for start,
     shield break and fire.

## Raids (how they work now)

- **Authority.** `BossEncounter` (src/bosses.js) owns the boss's movement, stages, attack choice and
  hits. It runs in the browser for solo raids and on the match server for co-op (`server/raids.js`).
- **Visuals.** `BossPresenter`, `drawBossGround` and `drawBossHud` only draw that state:
  - wind-up animation, charge glow and incoming energy during each warning;
  - the strike animation and projectiles on impact;
  - floor cracks and craters, debris, shake;
  - the aura;
  - the entrance, stage banners, boss bar and attack hints.

  Co-op screens build all of this from the server's raid state; the server does no visual work.
- **Stages.** There are 4 HP stages (75 / 50 / 25 %), each with its own attack rotation. The boss is
  briefly untouchable during each stage break. Stage 4 opens with the boss's cataclysm: everything is
  hit except 1–2 green safe circles.
- **Attacks.** 13 patterns in `ATTACKS`, all telegraphed for at least 0.9 s. Lugia's tidal wave makes
  targets Wet, so its thunderstorm then triggers a real Conduction reaction.
- **Staggered windows.** After dives, meteors, Aeroblast and the cataclysm the boss is "STAGGERED"
  for about 2–3 s. It takes ×1.3 damage then and doesn't attack.
- **Difficulty** (`RAID_DIFFICULTY`): Easy / Normal / Hard / Legendary scale HP, damage, warning
  time, pace and extra hazards. Boss HP is `base × (4.5 + 0.6 × your team's Pokémon) × difficulty`;
  for example, solo 3-Pokémon Normal Rayquaza has 9,576 HP.
- **Results.** Co-op results come from the server (each player's boss damage, share, reactions,
  survived), and a win counts for both players. Solo results have "Raid Again", which goes back to
  team select with the same boss and difficulty.
- **Performance** (headless Chrome, M4): 1,080 frames through stages 2 → 4 plus the cataclysm, none
  over 25 ms; p95 16.8 ms for every boss. Ground marks cost under 0.3 ms each.

## Known gaps (spec items not met yet)

- **Raids:** no dedicated defeat cinematic (the normal finishing sequence plays), no boss music, no
  online hit-timing compensation.
- **Reactions:** no dedicated sound per reaction. Freeze diminishing returns rely on the existing
  6-second freeze guard.
- **Drafts:** unranked only, by design.
- **Presentation:** the title screen, battle intro, ultimate sequences and KO haven't been reworked.
- **Title menu:** it has 11 entries now (scrollable). Consider grouping them.

## Log

- **Astra:** first pass of every system. Simulation microbenchmark baseline (node, 18,000 headless
  updates, one 3v3 match, particles off): mean 0.00461 ms, p95 0.00717 ms, max 0.90 ms per update.
  This is not a browser FPS measurement; see `docs/performance-final.json` (`node scripts/profile.mjs`).
- **Claude:**
  - Audited everything in real browsers; all of Astra's online systems work across two windows.
  - Rebuilt raids (stages, difficulty, 13 attacks, boss animations, arena damage, results).
  - Rewrote mastery (profile, badges, titles, migration).
  - Rebuilt the draft screen: whose turn, snake order, countdown from the server's time, origins.
  - Lugia flight fix (first version; being refined, see "In progress").

  Bugs fixed:
  - the solo boss kept attacking while paused;
  - the panel said "vs Gold";
  - "Rayquaza sent out Rayquaza!" appeared in the log;
  - "Restart Battle" after a raid started a normal battle;
  - Mewtwo's orb attack crashed.
