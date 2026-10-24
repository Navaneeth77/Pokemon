# Pokémon: Chaos Arena: brief for a coding agent

Read this before changing anything. Part 1 is what exists today, part 2 is the rules, part 3 is the
list of features and improvements to pick from.

---

## Part 1: What the game is right now

**The game.** A real-time 2D action battler in the browser, played top-down. Each trainer brings a team of 3 or 6
Pokémon and fights one at a time. You move freely around the arena, use 4 moves (auto-aimed), build
up an ultimate, dodge, switch Pokémon (shared cooldown) and Mega Evolve once per battle. A side wins
when every Pokémon on the other side has fainted. It is an unofficial, non-commercial fan project.

**Content (counted from the code):**
- 220 playable Pokémon (172 regular, 32 legendary, 16 mythical); 17 have Mega forms.
- 183 moves: 91 ultimates, each with a cutscene; 25 hold-to-charge moves (⚡).
- 91 abilities (damage, evasion, weather, cooldown and other hooks), 7 status conditions (burn, poison,
  paralysis, freeze, slow, stun, sleep), stat buffs, weather, combo chains, knockback, launches and juggles.
- 5 arenas: Mt. Silver, Viridian, Cinnabar, Seafoam, Indigo.
- 13 named opponents: the 8 Kanto Gym Leaders, the Elite Four, Lance and Blue.

**Modes on the title menu:**
1. **Bot Battles**: 3v3 or 6v6 against a bot (Easy / Medium / Hard). The opponent is a random team or a
   Gym Leader / Elite Four / Champion with a themed team.
2. **Online Battles**: random matchmaking through the match server. It shows how many players are
   online per format, has Elo ratings (everyone starts at 1000, K = 32) and a top-10 leaderboard.
3. **Friend Room**: peer-to-peer battles using a 5-letter room code (PeerJS / WebRTC, no server).
4. **My Teams**: build, edit, delete and quick-start saved teams (up to 20, stored in the browser).
5. **Edit Trainer**: name and trainer look.
6. **Tutorial**: a guided practice battle.

Two story campaigns exist in the code but have **no menu entry right now**:
- Kanto Story Mode (`src/story.js`)
- "Echoes of the Sky", a 10-chapter campaign with cutscenes (`src/echoes.js`, `src/cutscene.js`, `src/data/echoes.js`)

**Controls:**

| Platform | Controls |
|---|---|
| Keyboard | WASD or arrow keys move · 1–4 moves · R or 5 ultimate · Space dodge · Q switch (then 1–6) · M Mega · P / Esc pause · Enter start |
| Phone | Floating joystick on the left half of the screen (it follows the thumb). 4 move buttons arranged around the ULT button, with cooldown sweeps. Separate Dodge and Mega buttons. Team portraits switch Pokémon. Light vibration on press. |

**Tech stack:**
- Vite 6 with vanilla JavaScript ES modules and Canvas 2D. No framework, no TypeScript, no CSS framework.
- Sound effects are synthesised in code. Fonts: Pixelify Sans and Luckiest Guy (via Fontsource).
- Sprites: `public/sprites/<id>/` holds one `AnimData.xml` plus PNG sheets per animation. There are 239
  sets (about 61 MB in total), all from PMD SpriteCollab under the **CC BY-NC 4.0** licence. Only the
  teams in a battle are loaded.
- Trainers and arenas are drawn in code.

**Key files:**

| File | What it does |
|---|---|
| `src/game.js` | Battle engine: state machine, update loop, moves, switching, Mega, ultimates, faints |
| `src/pokemon.js` | A Pokémon on the field: movement, dodge, hits, status, cooldowns |
| `src/moves.js` | All moves and their Action classes, cooldowns, charged versions |
| `src/combat.js`, `src/status.js` | Damage and hits; status conditions and buffs |
| `src/data/species.js`, `src/data/abilities.js`, `src/data/types.js` | Species, abilities, type chart |
| `src/ai.js`, `src/leaders.js` | Bot AI and Gym Leader teams |
| `src/flow.js` | Menus and screens (title, format, arena, My Teams, trainer, tutorial) |
| `src/ui.js`, `src/hud.js`, `src/touch.js` | Team-select screen and saved teams, in-battle HUD, phone controls |
| `src/matchmaking.js` | Online Battles client (see "Netcode" below) |
| `src/online.js` | Friend Room (PeerJS, peer to peer) |
| `server/index.js`, `server/shim.js` | Match server; the shim lets the engine run in Node without a browser |

**Online architecture (Online Battles):**
- **Server-authoritative.** `server/index.js` (Node with the `ws` package) runs the *same engine*
  (`src/game.js`) headless, using `server/shim.js`. Browsers only send their stick direction and
  button presses. The server decides every hit, every faint and the winner, and validates everything
  clients send (team legality, rate limiting).
- **Timing.** The engine steps at 60 Hz. The server wakes 30 times a second and sends each player one
  message: `{t:'b', e:[events], s:{A,B}, ts}`, where `ts` is the battle clock in ms. `PROTOCOL = 2`,
  defined in both `server/index.js` and `src/matchmaking.js`.
- **Netcode already in place** (don't redo or break it):
  - **Prediction.** Your own attacks, charges and dodges start on screen instantly. The server's copy
    is skipped when it arrives, and the attack is called off if the server never confirms it.
  - **Position matching.** Your own position is compared with where you were when the server got that
    input. Each input carries a number `q`, and the server echoes `[q, ms since]` in every snapshot.
  - **Opponent smoothing.** The opponent is drawn slightly in the past, interpolated between server
    updates. The delay adapts to the connection's jitter (35–180 ms).
  - **Rates.** Direction changes are sent immediately (at most 40 per second). Pings go out every second.
- **Server endpoints.**
  - `GET /health`: load, storage status and the keep-awake flag.
  - `POST /lobby`: online counts, top 10 and your rank. The anonymous player id goes in the body;
    ids are never sent to other players.
- **Ratings storage.** Upstash Redis (REST API), stored as the hash `chaos-arena:records`. The server
  falls back to a JSON file when no Redis is configured.
- **Players.** Each player is an anonymous random id saved in the browser (`msb.pid`). There are no
  accounts yet.
- **Keep-awake.** The server requests its own public address every 10 minutes so Render's free plan
  doesn't put it to sleep. The client also wakes the server on page load and keeps retrying for up to
  75 seconds while it starts.

**Hosting and deploys:**
- Repository: GitHub `Navaneeth77/Pokemon`, branch `master`. **Pushing to master deploys both parts:**
  - Vercel hosts the static game at https://pokemon-gules-delta.vercel.app. Its build-time setting
    `VITE_MATCH_SERVER_URL=wss://chaos-arena-haf5.onrender.com` tells the game where the match server is.
  - Render runs the match server: a free web service in Singapore, started with `npm run server`.
    Its environment variables are `ALLOWED_ORIGINS` (the Vercel domain), `UPSTASH_REDIS_REST_URL` and
    `UPSTASH_REDIS_REST_TOKEN`. Render sets `RENDER_EXTERNAL_URL` itself.
- Saved in the browser (localStorage): `msb.save` (settings, name, look), `msb.teams` (saved teams),
  `msb.pid`, `msb.music`, `msb.story`, `msb.echoes`.

**Running it locally:**

```bash
npm install
npm run server   # match server on ws://localhost:8787 (/health shows its status)
npm run dev      # game on http://localhost:5173 — finds the local server automatically
```

- In dev, open two tabs with `?pid=a` and `?pid=b` to get two different online players.
- Setting `MATCH_TEST_HP=0.15` on the server makes matches end quickly.

**Measured facts (October 2026):**
- From India, the round trip to the Singapore server is about 100 ms on average, with spikes past
  300 ms. Part of that jitter is the player's own network.
- One online match costs the server about 20 ms of CPU per second (measured on an Apple M4). Render's
  free plan allows 100 ms per second on a slower CPU, so 2–3 matches at once will stutter.
- On some Indian networks, `*.vercel.app` is intercepted (a self-signed certificate was seen), which
  makes the site slow or unreachable.
- The README is out of date: it still describes the early "Mt. Silver" prototype.

---

## Part 2: Rules (please follow these)

1. **Non-commercial fan project.** Do not add ads, payments, paid items or loot boxes. Keep the credits
   and the "not affiliated with Nintendo" line. The sprite licence (CC BY-NC) forbids commercial use.
2. **The server stays the authority.** Never let a client decide damage, faints, results or ratings.
   Validate every new message on the server and keep the rate limit.
3. **The engine must stay headless-safe.** `src/game.js`, `pokemon.js`, `moves.js`, `combat.js`,
   `status.js` and the data files also run on the server. Don't touch the DOM or `window` in them without
   a guard. Anything visual-only must still work through `server/shim.js`.
4. **Protocol changes.** Adding optional fields is fine. Anything that breaks the message format needs
   `PROTOCOL` bumped in **both** `server/index.js` and `src/matchmaking.js`, shipped in one push.
5. **No secrets in front-end code.** Only `VITE_*` values reach the browser. Redis tokens and any
   future auth secrets stay on the server.
6. **Keep both keyboard and phone working.** Check every UI change at phone width (about 375 px)
   and with touch controls (`?touch` in the URL forces them on).
7. **Don't break saved data.** If you change the shape of anything stored under `msb.*`, migrate the old data.
8. **Test online changes with two players**, ideally with added network delay (around 100 ms with
   jitter), before pushing. A push to master goes live immediately.
9. Match the existing code style: small classes, plain JavaScript and short explanatory comments.
10. The folder `../pokemon-gamejam` is a separate game-jam copy. Leave it alone.

---

## Part 3: What to add

Each item is tagged with its effort (S / M / L) and 💰 if it needs a paid service or a new account,
which the owner sets up themselves.

### A. Less lag, faster loading (do these first)

1. **Custom domain** (S, 💰 ₹500–1,500 per year). Some Indian networks intercept `*.vercel.app`, so
   a real domain avoids that block and loads faster for those players. The owner buys it; you add it in
   Vercel and update `ALLOWED_ORIGINS` on Render.
2. **Cache sprites hard** (S). Add a `vercel.json` header so `/sprites/*` gets a long
   `Cache-Control` (for example `public, max-age=604800, stale-while-revalidate=86400`). Today a repeat
   visit may re-check every sprite file. Add a version query or folder if sprites ever change.
3. **Smaller sprites** (M). Compress the PNGs losslessly (oxipng) and consider sprite atlases, so a
   battle needs one file per Pokémon instead of about 10. Load your saved teams' sprites while the
   player is idle on the menu.
4. **Installable offline app** (M). Add a service worker that caches the app and the sprites
   already seen, so returning players start instantly.
5. **Client frame rate** (M).
   - Limit the canvas pixel ratio on phones and add a "Low effects" setting (fewer particles, no
     screen shake).
   - Lower the effects automatically when frames take longer than about 20 ms.
   - Stop drawing while the tab is hidden.
6. **Smaller network messages** (M). Send only the snapshot fields that changed. Statuses,
   buffs, abilities and cooldowns rarely change but go out 30 times a second today. This helps players on mobile data.
7. **Fairer dodges for laggy players** (M). If a player pressed dodge (by their own clock)
   shortly before a hit landed on the server (capped at about 120 ms), count the dodge. Today a dodge that
   looks clean on screen can still be hit.
8. **Reconnect instead of forfeit** (M). If a socket drops mid-match, hold the match for 15 s
   (the bot keeps the Pokémon still) and let the same player id rejoin. Today any disconnect is a
   forfeit.
9. **Connection indicator** (S). Show ping bars and a jitter warning before queueing and during
   the battle.
10. **Rating-based matchmaking** (S). Pair players with similar ratings first, and widen the
    allowed difference the longer they wait.
11. **Server headroom** (S). Skip visual-only work on the server (snowflakes, HUD timers, ground
    marks), measured with `/health` load numbers.
12. **Server in India** (M, 💰 about ₹700–1,400/month). Move the match server to a Bangalore or
    Mumbai host (for example a DigitalOcean Droplet) or a paid Render plan. This cuts the round trip
    from about 100 ms to about 20–40 ms. It is the single biggest remaining lag fix.

### B. New gameplay and modes

1. **Bring back the story campaigns** (S–M). Kanto Story Mode and Echoes of the Sky are already
   written. Add them to the title menu and check that they still work with the current engine.
2. **Ranked tiers and seasons** (S). Bronze → Master badges from the Elo rating, with a monthly
   season reset (a soft reset toward 1000). Show the tier on the leaderboard and on the result screen.
3. **Accounts** (M, 💰 free tier at first). Google / email login with Supabase Auth, so the rating,
   saved teams and trainer follow the player across devices. Map the existing anonymous `pid` to the
   account so nobody loses their record.
4. **Draft and ban for online** (M). Before team select, each player bans one Pokémon and sees
   the opponent's bans. Legendary limits per team are an option too.
5. **Battle Tower / Survival** (M). Endless bot battles that get harder each round, with HP carried
   over and a best-streak leaderboard.
6. **Daily Challenge** (M). The same fixed teams for everyone each day; the fastest win goes on a
   global leaderboard, verified by the server.
7. **Replays** (M). The server already produces the full event and snapshot stream, so save it,
   play it back in the game and share it with a code.
8. **Spectate** (M). Watch live online matches using the same stream, read-only.
9. **Quick chat and emotes** (S). Preset messages only ("GG", "Nice dodge!"), never free text, so
   nothing needs moderating.
10. **Rematch** (S). After an online match, both players can press Rematch to fight again
    immediately.
11. **Training room** (M). Practise against a target dummy, with optional hitbox and range display
    and cooldown and damage readouts, to learn each Pokémon.
12. **Team helper** (S). In the team builder, show the team's type weaknesses and coverage, and
    warn about a team that is weak to one type.
13. **Co-op raid** (L). Two players against a giant legendary boss with phases. The server must
    support more than two fighters.
14. **2v2 tag battles** (L). Two players per side, also needing more than two fighters.
15. **Achievements and cosmetics** (M). Unlock trainer outfits, card frames and titles by
    playing (no purchases).
16. **Balance tools** (M). A script that runs thousands of bot-vs-bot battles headless in Node
    (the engine already runs there) and reports win rates per Pokémon and move, to find overpowered
    picks (Psychic needed a nerf before).

### C. Polish

1. **Settings screen**:
   - key remapping;
   - screen-shake and flash toggles (accessibility);
   - a colour-blind-friendly type palette;
   - separate music and sound-effect volume.
2. **Tutorial update.** Cover the phone controls and add short tips on loading screens.
3. **Rewrite the README** to match the current game.
4. **Engine tests** in Node for core rules, for example "at most 2 moves on cooldown",
   "dodge gives brief invincibility" and "switch cooldown", so changes don't silently break them.
5. **Error reporting** (S, 💰 free tier). Sentry or similar for crashes on players' devices.
