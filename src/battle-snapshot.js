// Compact protocol-2 snapshots are self-contained. Omitted fields have fixed defaults,
// so coalescing two updates or joining mid-match never requires a previous packet.
const emptyMap = Symbol('empty map');
const defaults = {
  i: 0, d: 0, fz: 0, ah: 0, u: 0, st: emptyMap, bf: emptyMap, sx: emptyMap,
  fr: 0, g: 0, sh: 0, fm: null, mv: 0, lx: 0, ly: 0, sg: 0, ch: 0,
  iv: 0, ph: 0, hl: 0, ab: emptyMap, mu: 0, sw: 0, cd: emptyMap, q: 0,
  ea: null, te: 0, it: 0, hz: emptyMap, wx: 0, tr: 0, fs: 0, rm: 0,
};

function compactSide(side) {
  const result = {};
  for (const key in side) {
    const value = side[key], fallback = defaults[key];
    if (value === fallback) continue;
    if (fallback === emptyMap && value && typeof value === 'object'
        && !Array.isArray(value) && !Object.keys(value).length) continue;
    result[key] = value;
  }
  return result;
}

function restoreSide(side) {
  for (const key in defaults) {
    if (!(key in side)) side[key] = defaults[key] === emptyMap ? {} : defaults[key];
  }
  return side;
}

export function compactBattle({ s, ...packet }) {
  return { ...packet, cs: [compactSide(s.A), compactSide(s.B)] };
}

export function restoreBattleSides([a, b]) {
  return { A: restoreSide(a), B: restoreSide(b) };
}
