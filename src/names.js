// Trainer names are shown to other players online, so offensive names are refused.
// Names are checked after undoing common disguises: number/symbol swaps (5H1T), spacing or
// dots between letters (F.U.C.K) and stretched letters (FUUUCK).
const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'l', '+': 't' };

// Refused anywhere in a name.
const ANYWHERE = [
  'fuck', 'fuk', 'fck', 'fvck', 'phuck', 'phuk', 'motherf', 'shit', 'shyt', 'cunt', 'bitch', 'biatch', 'btch', 'whore', 'slut',
  'bastard', 'bollock', 'asshole', 'arsehole', 'dick', 'cock', 'penis', 'vagina', 'pussy', 'dildo', 'boob', 'titty', 'tittie',
  'porn', 'wank', 'jizz', 'twat', 'piss', 'cumshot', 'cumming', 'blowjob', 'handjob', 'milf', 'horny', 'sexy', 'orgasm', 'scrotum',
  'testicle', 'rapist', 'molest', 'pedophile', 'paedo', 'slag', 'skank', 'nigg', 'niga', 'nigr', 'negro', 'faggot', 'fagot', 'tranny',
  'kike', 'chink', 'gook', 'wetback', 'retard', 'nazi', 'hitler', 'kkk', 'killyourself',
];

// Refused only as a whole word (they turn up inside ordinary words: CLASS, GRAPE, RACCOON, CANAL…).
const WHOLE = [
  'ass', 'arse', 'tit', 'tits', 'cum', 'sex', 'rape', 'anal', 'anus', 'hoe', 'hoes', 'thot', 'fag', 'fags', 'homo', 'dyke', 'spic',
  'coon', 'nig', 'nigs', 'pedo', 'prick', 'semen', 'nude', 'nudes', 'orgy', 'wtf', 'stfu', 'gtfo', 'kys',
];

const squeeze = s => s.replace(/(.)\1+/g, '$1'); // FUUUCK → FUCK
const trim2 = s => s.replace(/(.)\1{2,}/g, '$1$1'); // ASSSS → ASS

function forms(name) {
  const mapped = String(name ?? '').toLowerCase().replace(/[0-9@$!|+]/g, c => LEET[c] ?? c);
  const words = mapped.split(/[^\p{L}]+/u).filter(Boolean);
  return { words, joined: words.join('') };
}

export function nameAllowed(name) {
  const { words, joined } = forms(name);
  for (const bad of ANYWHERE) {
    if (joined.includes(bad) || trim2(joined).includes(bad)) return false;
    // Stretched letters, for words that have no double letters of their own.
    if (squeeze(bad) === bad && squeeze(joined).includes(bad)) return false;
  }
  const whole = new Set(WHOLE);
  for (const w of [...words, joined]) if (whole.has(w) || whole.has(trim2(w))) return false;
  return true;
}

// A name received from another player: shown as-is if it passes, otherwise replaced.
export function safeName(name, fallback = 'TRAINER') {
  const clean = String(name ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 10).toUpperCase();
  return clean && nameAllowed(clean) ? clean : fallback;
}
