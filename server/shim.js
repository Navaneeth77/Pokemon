// Minimal browser stand-ins so the game's own battle engine (src/) runs headless on the match server.
// Nothing is drawn or played on the server: canvases and audio are inert, input comes from the network.
const noop = () => {};
const gradient = () => ({ addColorStop: noop });
const ctx2d = new Proxy({}, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === 'createPattern' || key === 'createLinearGradient' || key === 'createRadialGradient') return gradient;
    if (key === 'getImageData' || key === 'createImageData') return (w = 1, h = 1) => ({ data: new Uint8ClampedArray(4 * w * h), width: w, height: h });
    if (key === 'measureText') return () => ({ width: 0 });
    return noop;
  },
  set: () => true,
});
const canvas = () => ({
  width: 0, height: 0, style: {}, parentElement: { style: {} }, getContext: () => ctx2d, toDataURL: () => '',
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
});
const classList = { contains: () => false, toggle: noop, add: noop, remove: noop };

globalThis.window = globalThis;
globalThis.addEventListener = noop;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.document = {
  createElement: canvas, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  body: { classList, dataset: {}, style: {} }, hidden: false,
};
globalThis.Image = class {};
globalThis.ImageData = class { constructor(w, h) { Object.assign(this, { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }); } };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = noop;
globalThis.location ??= { search: '', hostname: 'server', origin: '', pathname: '/' };
