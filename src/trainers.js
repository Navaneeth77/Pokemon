// Original pixel-art trainer looks for the trainer setup screen. Each look draws a 24×24 portrait
// and recolours the in-arena trainer sprite (trainer.js), so the choice shows up in battle too.
const OUTLINE = '#1c1b24';

export const LOOKS = [
  { id: 'ace', style: 'cap', cap: '#e0362f', hair: '#2a2630', skin: '#f2c7a0', jacket: '#e0362f', pants: '#4a6cc4' },
  { id: 'scout', style: 'cap', cap: '#3a7ad8', hair: '#7a4a2a', skin: '#e0a878', jacket: '#f0f0f6', pants: '#2f3a5a' },
  { id: 'blaze', style: 'spiky', hair: '#f2c232', skin: '#f2c7a0', jacket: '#3f9a4a', pants: '#3a3a48' },
  { id: 'storm', style: 'spiky', hair: '#24202c', skin: '#8a5a3a', jacket: '#f28a2a', pants: '#2a4a8a' },
  { id: 'bloom', style: 'long', hair: '#8a4a2a', skin: '#f6d0b0', jacket: '#ec7ab0', pants: '#5a4a8a' },
  { id: 'frost', style: 'long', hair: '#e8eef6', skin: '#d8a070', jacket: '#7a4ac8', pants: '#2a2a3a' },
  { id: 'tide', style: 'bun', hair: '#24202c', skin: '#e0a878', jacket: '#2aa8a0', pants: '#3a3a48' },
  { id: 'spark', style: 'bun', hair: '#f070b0', skin: '#f2c7a0', jacket: '#f2c232', pants: '#4a5aa8' },
  { id: 'trail', style: 'beanie', cap: '#3f9a4a', hair: '#c8502a', skin: '#f2c7a0', jacket: '#2a3a6a', pants: '#5a4a3a' },
  { id: 'ember', style: 'beanie', cap: '#6a6a7a', hair: '#24202c', skin: '#6a402a', jacket: '#9a2a3a', pants: '#2a2a3a' },
  { id: 'wave', style: 'bob', hair: '#3a6ad8', skin: '#f6d0b0', jacket: '#e8e8f0', pants: '#3a4a7a' },
  { id: 'dusk', style: 'bob', hair: '#f28a2a', skin: '#c88a5a', jacket: '#3a3a48', pants: '#7a3a3a' },
];

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

const cache = new Map();

// 24×24 front-facing portrait with a 1px outline, drawn from simple pixel blocks.
export function drawBust(look) {
  if (cache.has(look.id)) return cache.get(look.id);
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const g = c.getContext('2d');
  const px = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const { skin, hair, jacket } = look, cap = look.cap ?? hair;
  const skinD = shade(skin, 0.82), hairD = shade(hair, 0.72), hairL = shade(hair, 1.3), jacD = shade(jacket, 0.72), capD = shade(cap, 0.72);

  if (look.style === 'long') {
    px(5, 8, 14, 13, hairD);
  }
  // Shoulders and jacket with a collar.
  px(4, 19, 16, 5, jacket);
  px(3, 21, 18, 3, jacket);
  px(4, 23, 16, 1, jacD);
  px(10, 19, 4, 2, '#f4f4f4');
  px(11, 21, 2, 3, jacD);
  // Neck, head, ears.
  px(10, 17, 4, 2, skinD);
  px(7, 7, 10, 10, skin);
  px(6, 9, 12, 6, skin);
  px(7, 16, 10, 1, skinD);
  px(5, 11, 1, 3, skin);
  px(18, 11, 1, 3, skin);
  // Eyes with highlights, cheeks, mouth.
  px(9, 11, 2, 2, OUTLINE);
  px(13, 11, 2, 2, OUTLINE);
  px(9, 11, 1, 1, '#ffffff');
  px(13, 11, 1, 1, '#ffffff');
  px(8, 13, 1, 1, shade(skin, 0.9));
  px(15, 13, 1, 1, shade(skin, 0.9));
  px(11, 14, 2, 1, shade(skin, 0.6));

  switch (look.style) {
    case 'cap':
      px(6, 4, 12, 4, cap);
      px(7, 3, 10, 1, cap);
      px(4, 8, 16, 1, capD);
      px(10, 5, 4, 2, '#f4f4f4');
      px(6, 9, 2, 3, hair);
      px(16, 9, 2, 3, hair);
      px(8, 9, 3, 1, hair);
      break;
    case 'spiky':
      px(6, 5, 12, 4, hair);
      px(6, 3, 2, 2, hair);
      px(9, 2, 2, 3, hair);
      px(12, 1, 2, 4, hair);
      px(15, 2, 2, 3, hair);
      px(17, 4, 2, 3, hair);
      px(5, 8, 2, 4, hair);
      px(17, 8, 2, 4, hair);
      px(8, 9, 2, 1, hair);
      px(12, 9, 3, 1, hair);
      px(10, 4, 3, 1, hairL);
      break;
    case 'long':
      px(6, 4, 12, 5, hair);
      px(7, 3, 10, 1, hair);
      px(4, 8, 3, 11, hair);
      px(17, 8, 3, 11, hair);
      px(7, 9, 4, 1, hair);
      px(13, 9, 4, 1, hair);
      px(9, 4, 4, 1, hairL);
      break;
    case 'bun':
      px(6, 5, 12, 4, hair);
      px(9, 1, 6, 4, hair);
      px(10, 0, 4, 1, hair);
      px(10, 2, 2, 1, hairL);
      px(5, 8, 2, 3, hair);
      px(17, 8, 2, 3, hair);
      px(8, 9, 8, 1, hair);
      break;
    case 'beanie':
      px(6, 3, 12, 5, cap);
      px(7, 2, 10, 1, cap);
      px(5, 7, 14, 2, shade(cap, 1.25));
      px(10, 0, 4, 2, '#f4f4f4');
      px(6, 9, 2, 3, hair);
      px(16, 9, 2, 3, hair);
      px(8, 9, 8, 1, hair);
      break;
    default: // bob
      px(6, 4, 12, 5, hair);
      px(7, 3, 10, 1, hair);
      px(5, 7, 3, 8, hair);
      px(16, 7, 3, 8, hair);
      px(7, 8, 10, 2, hair);
      px(9, 4, 4, 1, hairL);
  }

  // 1px outline around everything drawn.
  const img = g.getImageData(0, 0, 24, 24), d = img.data, solid = i => d[i * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      if (solid(y * 24 + x)) continue;
      if ((x > 0 && solid(y * 24 + x - 1)) || (x < 23 && solid(y * 24 + x + 1)) || (y > 0 && solid((y - 1) * 24 + x)) || (y < 23 && solid((y + 1) * 24 + x))) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) px(x, y, 1, 1, OUTLINE);
  cache.set(look.id, c);
  return c;
}

// Colours for the in-arena trainer sprite (seen from behind): cap or hair on top, jacket, trousers, skin.
export function backPalette(look) {
  const top = look.cap ?? look.hair;
  return {
    c: top, C: shade(top, 0.72), W: look.cap ? '#f4f4f4' : shade(look.hair, 0.72),
    r: look.jacket, R: shade(look.jacket, 0.72), h: look.hair, H: shade(look.hair, 1.3),
    b: look.pants, B: shade(look.pants, 0.72), s: look.skin, S: shade(look.skin, 0.82),
  };
}

export const lookById = id => LOOKS.find(l => l.id === id) ?? LOOKS[0];
