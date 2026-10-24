// Synthesised sound effects (no audio files needed).
let ac = null;
let master = null;
let noiseBuffer = null;
let muted = false;
const VOLUME = 0.45;

export function initAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(ac.destination);
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : VOLUME;
}

export const isMuted = () => muted;
// The shared AudioContext once a user gesture has created it (music.js schedules on it too).
export const audioContext = () => ac;

function envelope(gain, t0, attack, hold, release, peak) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.setValueAtTime(peak, t0 + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

function noise({ dur = 0.3, filter = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 0.4, attack = 0.005, release }) {
  if (!ac) return null;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const flt = ac.createBiquadFilter();
  flt.type = filter;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain();
  const rel = release ?? dur * 0.6;
  envelope(g, t, attack, Math.max(0, dur - attack - rel), rel, gain);
  src.connect(flt).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
  return {
    stop() {
      try {
        g.gain.cancelScheduledValues(ac.currentTime);
        g.gain.setTargetAtTime(0, ac.currentTime, 0.03);
        src.stop(ac.currentTime + 0.15);
      } catch { /* already stopped */ }
    },
  };
}

function tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.15, gain = 0.2, attack = 0.005, delay = 0 }) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain();
  envelope(g, t, attack, 0, dur, gain);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + attack + 0.05);
}

export const sfx = {
  flamethrower: dur => noise({ dur, filter: 'lowpass', f0: 2400, f1: 900, q: 0.8, gain: 0.35, attack: 0.04, release: 0.2 }),
  explosion() {
    noise({ dur: 0.8, filter: 'lowpass', f0: 1800, f1: 110, q: 0.5, gain: 0.7, release: 0.6 });
    tone({ type: 'sine', f0: 120, f1: 35, dur: 0.5, gain: 0.5 });
  },
  slash: () => noise({ dur: 0.12, filter: 'highpass', f0: 2500, f1: 6000, gain: 0.3, release: 0.08 }),
  whoosh: () => noise({ dur: 0.18, filter: 'bandpass', f0: 500, f1: 2400, q: 1.5, gain: 0.25 }),
  airSlash: () => noise({ dur: 0.3, filter: 'bandpass', f0: 1200, f1: 4200, q: 2.5, gain: 0.35 }),
  hit(heavy) {
    tone({ type: 'square', f0: heavy ? 180 : 320, f1: heavy ? 60 : 120, dur: 0.09, gain: 0.14 });
    noise({ dur: 0.08, filter: 'lowpass', f0: 2500, f1: 600, gain: 0.3 });
  },
  beamCharge(dur) {
    tone({ type: 'sawtooth', f0: 90, f1: 520, dur, gain: 0.08, attack: 0.1 });
    return noise({ dur, filter: 'bandpass', f0: 400, f1: 2600, q: 4, gain: 0.18, attack: dur * 0.6, release: 0.1 });
  },
  beamFire() {
    noise({ dur: 0.65, filter: 'lowpass', f0: 4000, f1: 300, gain: 0.6, release: 0.45 });
    tone({ type: 'sawtooth', f0: 160, f1: 50, dur: 0.6, gain: 0.16 });
  },
  waterRise: () => noise({ dur: 0.45, filter: 'bandpass', f0: 300, f1: 900, q: 1.2, gain: 0.25, attack: 0.15 }),
  splash() {
    noise({ dur: 0.45, filter: 'lowpass', f0: 1400, f1: 200, q: 1.2, gain: 0.55 });
    noise({ dur: 0.3, filter: 'highpass', f0: 4000, f1: 2000, gain: 0.15 });
  },
  ice: () => [1568, 2093, 2637].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.18, gain: 0.1, delay: i * 0.05 })),
  bite: () => noise({ dur: 0.1, filter: 'bandpass', f0: 1800, f1: 700, q: 2, gain: 0.35 }),
  wind: dur => noise({ dur, filter: 'bandpass', f0: 500, f1: 900, q: 3, gain: 0.22, attack: 0.1 }),
  sendOut: () => [523, 784].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.08, gain: 0.08, delay: i * 0.07 })),
  faint: () => tone({ type: 'square', f0: 600, f1: 90, dur: 0.8, gain: 0.12 }),
  victory: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f0: f, dur: i === 3 ? 0.4 : 0.12, gain: 0.1, delay: i * 0.12 })),
  defeat: () => [392, 330, 262].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.14, delay: i * 0.22 })),
  denied: () => tone({ type: 'square', f0: 140, dur: 0.06, gain: 0.06 }),
};

sfx.megaCharge = () => {
  [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.22, gain: 0.08, delay: i * 0.12 }));
  noise({ dur: 0.9, filter: 'bandpass', f0: 600, f1: 3200, q: 3, gain: 0.12, attack: 0.5, release: 0.2 });
};
sfx.megaBurst = () => {
  noise({ dur: 0.7, filter: 'lowpass', f0: 5000, f1: 300, gain: 0.5, release: 0.5 });
  [523, 659, 784].forEach(f => tone({ type: 'square', f0: f, f1: f * 2, dur: 0.35, gain: 0.07 }));
};

// Handheld power-on chime played at PRESS START.
sfx.startup = () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'square', f0: f, dur: i === 4 ? 0.45 : 0.1, gain: 0.08, delay: i * 0.08 }));

sfx.clang = () => {
  tone({ type: 'square', f0: 1400, f1: 900, dur: 0.12, gain: 0.07 });
  tone({ type: 'triangle', f0: 2200, f1: 1800, dur: 0.3, gain: 0.06 });
  noise({ dur: 0.08, filter: 'highpass', f0: 3000, f1: 5000, gain: 0.2 });
};
sfx.dash = () => noise({ dur: 0.14, filter: 'bandpass', f0: 800, f1: 3000, q: 1.2, gain: 0.25 });
sfx.zap = dur => noise({ dur, filter: 'highpass', f0: 2500, f1: 4000, gain: 0.08, attack: 0.05 });
sfx.thunderbolt = () => {
  noise({ dur: 0.35, filter: 'highpass', f0: 1500, f1: 600, gain: 0.35 });
  tone({ type: 'sawtooth', f0: 880, f1: 220, dur: 0.25, gain: 0.07 });
};
sfx.thunder = () => {
  noise({ dur: 1.0, filter: 'lowpass', f0: 3000, f1: 80, gain: 0.7, release: 0.8 });
  tone({ type: 'sawtooth', f0: 300, f1: 40, dur: 0.6, gain: 0.12 });
};
sfx.quake = () => {
  noise({ dur: 1.1, filter: 'lowpass', f0: 400, f1: 60, q: 0.7, gain: 0.8, release: 0.8 });
  tone({ type: 'sine', f0: 70, f1: 30, dur: 0.9, gain: 0.5 });
};
sfx.hydro = dur => noise({ dur, filter: 'bandpass', f0: 1200, f1: 700, q: 0.6, gain: 0.35, attack: 0.03, release: 0.15 });
sfx.pulse = () => {
  tone({ type: 'sine', f0: 300, f1: 700, dur: 0.25, gain: 0.12 });
  noise({ dur: 0.2, filter: 'bandpass', f0: 900, f1: 2000, q: 2, gain: 0.15 });
};
sfx.shard = () => [2400, 2900].forEach((f, i) => tone({ type: 'triangle', f0: f, f1: f * 0.8, dur: 0.1, gain: 0.07, delay: i * 0.04 }));
sfx.recall = () => tone({ type: 'square', f0: 900, f1: 300, dur: 0.3, gain: 0.07 });
sfx.ascend = () => {
  noise({ dur: 0.9, filter: 'bandpass', f0: 400, f1: 2400, q: 1.5, gain: 0.3, attack: 0.2 });
  tone({ type: 'sawtooth', f0: 120, f1: 600, dur: 0.9, gain: 0.07 });
};
sfx.storm = dur => noise({ dur, filter: 'bandpass', f0: 700, f1: 1400, q: 1, gain: 0.3, attack: 0.2, release: 0.4 });
sfx.roar = () => {
  tone({ type: 'sawtooth', f0: 190, f1: 85, dur: 0.65, gain: 0.12 });
  noise({ dur: 0.65, filter: 'bandpass', f0: 520, f1: 260, q: 2, gain: 0.28, attack: 0.05 });
};

// Raid boss attack warning: a falling two-note alarm over a low rumble, so a telegraph is heard as well as seen.
sfx.bossWarn = () => {
  [880, 660].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.09, gain: 0.07, delay: i * 0.11 }));
  noise({ dur: 0.5, filter: 'lowpass', f0: 300, f1: 120, q: 0.7, gain: 0.18, attack: 0.08 });
};
