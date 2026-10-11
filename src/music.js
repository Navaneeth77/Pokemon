// Original chiptune background music, synthesised with Web Audio (no audio files, nothing licensed).
// Each track is a chord progression plus a lead melody; bass, arpeggio and drums are generated from the
// chords. Notes are scheduled slightly ahead of time so loops are gapless; switching tracks crossfades.
import { audioContext } from './audio.js';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const freq = name => {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  return 440 * 2 ** ((NOTE[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12);
};
const CHORD = { '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6] };
const chordNotes = (name, octave) => {
  const m = /^([A-G]#?)(m|dim)?$/.exec(name);
  const root = NOTE[m[1]] + (octave + 1) * 12;
  return CHORD[m[2] ?? ''].map(i => 440 * 2 ** ((root + i - 69) / 12));
};

// 8 steps (eighth notes) per bar. Lead: note, '-' holds the previous note, '.' rests.
// Battles pick a theme by arena; a legendary or mythical Pokémon on the field brings in its own.
const TRACKS = {
  title: {
    bpm: 132, chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'], bass: 'R.O.R.O.', drums: 'k.h.s.hh',
    lead: `C5 . E5 G5 C6 - - B5 | A5 - E5 - C5 E5 A5 G5 | F5 - A5 - C6 - A5 F5 | G5 - - D5 G5 A5 B5 -
           C6 - B5 A5 G5 - E5 G5 | A5 - G5 E5 C5 - E5 - | D5 F5 A5 - F5 - D5 F5 | G5 - - - B4 C5 D5 -`,
  },
  menu: {
    bpm: 104, chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'Am', 'D'], bass: 'R...O...', drums: 'k.h...h.',
    lead: `B4 - D5 - G5 - - - | E5 - G5 - B5 - A5 G5 | A5 - - G5 E5 - C5 - | D5 - F#5 - A5 - - -
           B5 - A5 - G5 - D5 - | E5 - F#5 G5 B5 - - - | C6 - B5 A5 E5 - A5 - | F#5 - - - D5 - . .`,
  },
  battle: {
    bpm: 160, chords: ['Am', 'F', 'G', 'Em', 'Am', 'F', 'G', 'E'], bass: 'RRORRROR', drums: 'khskkhsh',
    lead: `A5 A5 E5 A5 C6 - B5 A5 | F5 - A5 C6 F6 - E6 C6 | D6 - B5 G5 D6 - B5 D6 | E6 - - B5 G5 - E5 G5
           A5 C6 E6 - D6 C6 B5 A5 | C6 - A5 F5 A5 C6 F6 - | G6 F6 E6 D6 B5 - G5 B5 | G#5 - B5 - E6 - D6 B5`,
  },
  // Viridian Forest: bright and bouncy.
  forest: {
    bpm: 150, chords: ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'], bass: 'R.ORR.O.', drums: 'k.hsk.hs', wave: 'square', vol: 0.065,
    lead: `G5 . B5 D6 B5 . G5 A5 | F#5 - A5 - D6 - C6 A5 | G5 . E5 G5 B5 . A5 G5 | E5 - G5 - C6 - B5 A5
           B5 - D6 B5 G5 - B5 D6 | A5 - F#5 A5 D6 - E6 F#6 | G6 - E6 C6 E6 - D6 C6 | A5 - - - D6 C6 B5 A5`,
  },
  // Cinnabar Volcano: fast, driving, saw lead.
  volcano: {
    bpm: 170, chords: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B'], bass: 'RRRORROR', drums: 'khskkhss', wave: 'sawtooth', vol: 0.045,
    lead: `E5 E5 G5 E5 B5 - A5 G5 | F#5 G5 A5 - B5 - E6 - | D6 C6 B5 C6 G5 - E5 G5 | F#5 - A5 - D6 - F#6 -
           E6 - D6 B5 G5 B5 D6 E6 | G6 - F#6 E6 D6 - B5 - | C6 - E6 - G6 - E6 C6 | D#6 - - F#5 B5 - D#6 F#6`,
  },
  // Seafoam Islands: flowing and cool, soft triangle lead.
  sea: {
    bpm: 144, chords: ['F#m', 'D', 'E', 'C#m', 'F#m', 'D', 'A', 'E'], bass: 'R..OR.O.', drums: 'k.hhs.hh', wave: 'triangle', vol: 0.15,
    lead: `C#6 - A5 F#5 A5 - C#6 E6 | F#6 - - E6 D6 - A5 - | B5 - G#5 E5 G#5 - B5 E6 | G#6 - - E6 C#6 - B5 -
           A5 - C#6 - F#6 - E6 C#6 | D6 - F#6 - A6 - F#6 D6 | E6 - C#6 - A5 - C#6 E6 | G#6 - - - B5 - G#5 -`,
  },
  // Indigo Plateau: heroic league finals.
  league: {
    bpm: 172, chords: ['Cm', 'G#', 'A#', 'G', 'Cm', 'G#', 'A#', 'G'], bass: 'RORORORO', drums: 'khskkhsk', wave: 'square', vol: 0.065,
    lead: `C6 - G5 C6 D#6 - D6 C6 | D#6 - C6 D#6 G#6 - G6 F6 | F6 - D6 A#5 F6 - D#6 D6 | D6 - - B5 G5 - B5 D6
           G6 - D#6 C6 G6 - G#6 G6 | F6 - D#6 C6 G#5 - C6 D#6 | D6 - F6 A#6 G#6 - G6 F6 | G6 - F6 D#6 D6 - B5 -`,
  },
  // Legendary or mythical on the field: urgent, dramatic, saw lead over a pounding bass.
  legend: {
    bpm: 176, chords: ['Bm', 'G', 'Bm', 'A', 'Bm', 'G', 'F#', 'F#'], bass: 'RRORRROR', drums: 'kkshkhss', wave: 'sawtooth', vol: 0.05,
    lead: `B5 B5 F#5 B5 D6 - C#6 B5 | D6 - B5 D6 G6 - F#6 E6 | F#6 - D6 B5 F#6 - G6 F#6 | E6 - C#6 A5 E6 - C#6 E6
           B6 - A6 F#6 D6 - F#6 B6 | A6 - G6 D6 B5 - D6 G6 | F#6 - E6 C#6 A#5 - C#6 E6 | F#6 - - - A#5 B5 C#6 E6`,
  },
};

// Battle theme for each arena (arena.js ids).
export const ARENA_TRACK = { mtSilver: 'battle', viridian: 'forest', cinnabar: 'volcano', seafoam: 'sea', indigo: 'league' };

function compile(t) {
  const steps = t.lead.replace(/\|/g, ' ').trim().split(/\s+/);
  const lead = steps.map((tok, i) => {
    if (tok === '-' || tok === '.') return null;
    let len = 1;
    while (steps[i + len] === '-') len++;
    return { f: freq(tok), len };
  });
  return { ...t, len: steps.length, lead, stepDur: 60 / t.bpm / 2 };
}
const COMPILED = Object.fromEntries(Object.entries(TRACKS).map(([k, t]) => [k, compile(t)]));

const SAVE_KEY = 'msb.music';

export class Music {
  constructor() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {}; } catch { /* storage unavailable */ }
    this.volume = saved.volume ?? 0.3;
    this.enabled = saved.enabled ?? true;
    this.tracks = [];
    this.wanted = null;
    this.listeners = new Set();
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ volume: this.volume, enabled: this.enabled })); } catch { /* ignore */ }
    for (const fn of this.listeners) fn(this);
  }

  // Crossfades to a track; safe to call repeatedly (no-op if it is already playing).
  play(name) {
    this.wanted = name;
    const ac = audioContext();
    if (!ac || !this.enabled) return;
    if (this.tracks.some(t => t.name === name && !t.fading)) return;
    if (!this.bus) {
      this.bus = ac.createGain();
      this.bus.gain.value = this.volume;
      this.bus.connect(ac.destination);
    }
    for (const t of this.tracks) this.fadeOut(t, ac);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(1, ac.currentTime + 0.6);
    gain.connect(this.bus);
    this.tracks.push({ name, song: COMPILED[name], gain, step: 0, next: ac.currentTime + 0.08 });
    this.timer ??= setInterval(() => this.tick(), 25);
  }

  fadeOut(t, ac) {
    if (t.fading) return;
    t.fading = ac.currentTime + 0.6;
    t.gain.gain.cancelScheduledValues(ac.currentTime);
    t.gain.gain.setValueAtTime(Math.max(0.0001, t.gain.gain.value), ac.currentTime);
    t.gain.gain.exponentialRampToValueAtTime(0.0001, t.fading);
  }

  stop() {
    const ac = audioContext();
    if (ac) for (const t of this.tracks) this.fadeOut(t, ac);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.bus) this.bus.gain.value = this.volume;
    this.save();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
    else if (this.wanted) this.play(this.wanted);
    this.save();
  }

  tick() {
    const ac = audioContext();
    if (!ac) return;
    for (const t of this.tracks) {
      while (t.next < ac.currentTime + 0.15) {
        if (!t.fading || t.next < t.fading) this.scheduleStep(ac, t, t.step, t.next);
        t.next += t.song.stepDur;
        t.step = (t.step + 1) % t.song.len;
      }
    }
    this.tracks = this.tracks.filter(t => {
      if (t.fading && ac.currentTime > t.fading + 0.1) {
        t.gain.disconnect();
        return false;
      }
      return true;
    });
    if (!this.tracks.length) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  voice(ac, out, type, f, t0, dur, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.setValueAtTime(vol, t0 + Math.max(0.02, dur - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  drum(ac, out, kind, t0) {
    if (kind === 'k') {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(150, t0);
      o.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
      g.gain.setValueAtTime(0.5, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o.connect(g);
      g.connect(out);
      o.start(t0);
      o.stop(t0 + 0.15);
      return;
    }
    const len = kind === 's' ? 0.12 : 0.04;
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf;
    f.type = 'highpass';
    f.frequency.value = kind === 's' ? 1200 : 6000;
    g.gain.setValueAtTime(kind === 's' ? 0.22 : 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t0);
  }

  scheduleStep(ac, t, step, t0) {
    const s = t.song, out = t.gain, sd = s.stepDur, bar = Math.floor(step / 8), beat = step % 8;
    const note = s.lead[step];
    if (note) this.voice(ac, out, s.wave ?? 'square', note.f, t0, note.len * sd * 0.95, s.vol ?? 0.07);
    const chord = s.chords[bar % s.chords.length];
    // Arpeggio on every eighth note, root–third–fifth–octave.
    const arp = chordNotes(chord, 4);
    this.voice(ac, out, 'square', [arp[0], arp[1], arp[2], arp[0] * 2][beat % 4], t0, sd * 0.6, 0.025);
    const b = s.bass[beat];
    if (b === 'R' || b === 'O') this.voice(ac, out, 'triangle', chordNotes(chord, 2)[0] * (b === 'O' ? 2 : 1), t0, sd * 0.9, 0.16);
    const d = s.drums[beat];
    if (d !== '.') this.drum(ac, out, d, t0);
  }
}

export const music = new Music();
