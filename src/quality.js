export const QUALITY = {
  high: { label: 'HIGH', particles: 1200, ratio: 2 },
  balanced: { label: 'BALANCED', particles: 600, ratio: 1.5 },
  performance: { label: 'PERFORMANCE', particles: 220, ratio: 1 },
};
let selected = 'balanced';
try { const saved = localStorage.getItem('msb.quality'); if (Object.hasOwn(QUALITY, saved)) selected = saved; } catch {}
export const qualityName = () => selected;
export const quality = () => QUALITY[selected];
let pressure = 0;
let frameBudget = 1000 / 60;
const cadence = [];

export function setQuality(name) {
  if (!Object.hasOwn(QUALITY, name)) return;
  selected = name;
  pressure = 0;
  try { localStorage.setItem('msb.quality', name); } catch {}
}

export function observeFrame(costMs, frameMs) {
  // A low percentile approximates the display cadence without reacting to a single fast frame.
  if (frameMs >= 4) cadence.push(frameMs);
  if (cadence.length === 48) {
    cadence.sort((a, b) => a - b);
    frameBudget = Math.min(1000 / 60, cadence[9]);
    cadence.length = 0;
  }
  const overBudget = costMs > frameBudget * 0.78 || (costMs > frameBudget * 0.45 && frameMs > frameBudget * 1.4);
  pressure = Math.max(0, pressure + (overBudget ? 1 : -0.5));
  if (pressure < 24 || selected === 'performance') return false;
  selected = selected === 'high' ? 'balanced' : 'performance';
  pressure = 0;
  return true;
}
