export const QUALITY = {
  high: { label: 'HIGH', particles: 1200, ratio: 2 },
  balanced: { label: 'BALANCED', particles: 600, ratio: 1.5 },
  performance: { label: 'PERFORMANCE', particles: 220, ratio: 1 },
};
let selected = 'balanced';
try { const saved = localStorage.getItem('msb.quality'); if (QUALITY[saved]) selected = saved; } catch {}
export const qualityName = () => selected;
export const quality = () => QUALITY[selected];
export function setQuality(name) { if (!QUALITY[name]) return; selected = name; try { localStorage.setItem('msb.quality', name); } catch {} }
let pressure=0;
export function observeFrame(costMs) {
  pressure=Math.max(0,pressure+(costMs>14?1:-.25));
  if(pressure<90||selected==='performance')return false;
  selected=selected==='high'?'balanced':'performance';pressure=0;return true;
}
