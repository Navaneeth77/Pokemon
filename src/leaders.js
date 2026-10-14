import { STAGES, STARTERS, teamFor, aiFor } from './story.js';
import { drawBust, frontPalette } from './trainers.js';

// Bot Battles against the Kanto Gym Leaders, the Elite Four and Champion Blue (data from story.js).
// You pick any team you like; the bot difficulty decides how evolved their team is and how well they play.
export const LEADERS = STAGES;
export const leaderById = id => STAGES.find(s => s.id === id) ?? null;

const STORY_DIFF = { easy: 'easy', medium: 'normal', hard: 'hard' };
const blueStarter = STARTERS[Math.floor(Math.random() * STARTERS.length)];

export const leaderTeam = (st, n, difficulty) => teamFor(st, n, STORY_DIFF[difficulty] ?? 'normal', blueStarter);
// Later trainers play sharper, as in the original League.
export const leaderAi = (st, difficulty) => aiFor(STAGES.indexOf(st), STORY_DIFF[difficulty] ?? 'normal');
export const leaderMega = (st, difficulty) => (st.megaOn ?? []).includes(STORY_DIFF[difficulty] ?? 'normal');
export const leaderTrainer = st => ({ name: st.name, palette: frontPalette(st.look) });

const busts = {};
export const leaderBust = st => (busts[st.id] ??= drawBust(st.look).toDataURL());
