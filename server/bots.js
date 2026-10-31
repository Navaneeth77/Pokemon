import crypto from 'node:crypto';

// Stand-in opponents for ranked Online Battles. When nobody compatible has queued for a while, the
// server starts an ordinary match against a computer-controlled trainer (see server/index.js). It plays
// with the same AI as Bot Battles, run on the server, and looks like any other trainer: a plausible
// name, a trainer look and a random legal team. How sharp it plays depends on the player's online win
// streak, rolled at random so it isn't predictable.

const NAMES = ['KAITO', 'RIYA', 'ARJUN', 'MAYA', 'LEO', 'NOVA', 'ISHA', 'KIRA', 'DEV', 'SAM', 'ANYA', 'RYU', 'TARA', 'JUNO', 'VIK',
  'ELI', 'NOOR', 'KENJI', 'ARYAN', 'MEERA', 'ROHAN', 'SANA', 'AIDEN', 'YUKI', 'OMAR', 'LUNA', 'NIKO', 'PRIYA', 'ZARA', 'ADI'];

// Chance of easy / medium / hard for a win streak of 0, 1–2, 3–4 and 5 or more.
export const BOT_ODDS = [[0.55, 0.4, 0.05], [0.3, 0.5, 0.2], [0.1, 0.45, 0.45], [0.05, 0.25, 0.7]];

export function botDifficulty(streak, rand = Math.random) {
  const odds = BOT_ODDS[streak >= 5 ? 3 : streak >= 3 ? 2 : streak >= 1 ? 1 : 0], r = rand();
  return r < odds[0] ? 'easy' : r < odds[0] + odds[1] ? 'medium' : 'hard';
}

function botName(rand) {
  if (rand() < 0.2) return 'TRAINER'; // the name many players never change
  const base = NAMES[Math.floor(rand() * NAMES.length)];
  return rand() < 0.35 ? `${base}${String(Math.floor(rand() * 99) + 1).padStart(2, '0')}` : base;
}

// A queue entry for the bot in the human's format. Its rating sits close to the player's, so the result
// moves their rating by an ordinary amount; the bot's own record is never saved.
export function botEntry(human, { roster, species, looks, rand = Math.random }) {
  const pool = [...roster], team = [];
  while (team.length < human.format && pool.length) team.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const mega = {};
  for (const id of team) if (species[id].mega?.length) mega[id] = species[id].mega[Math.floor(rand() * species[id].mega.length)];
  const name = botName(rand), rating = Math.round((human.player.record?.rating ?? 1000) + (rand() - 0.5) * 120);
  return {
    format: human.format, team, lead: Math.floor(rand() * team.length), mega, since: Date.now(),
    difficulty: botDifficulty(human.player.record?.streak ?? 0, rand),
    player: {
      pid: `bot-${crypto.randomBytes(6).toString('hex')}`, name, look: looks[Math.floor(rand() * looks.length)]?.id ?? null,
      ws: null, state: 'idle', entry: null, match: null, bot: true, record: { name, w: 0, l: 0, d: 0, rating, streak: 0 },
    },
  };
}
