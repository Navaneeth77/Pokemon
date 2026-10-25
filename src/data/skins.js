// Cosmetic folder changes only: species IDs, hitboxes, types and form stats stay stable.
export const LEGENDARY_SKINS = {
  lugia:'lugia-shadow',mewtwo:'mewtwo-armored',rayquaza:'rayquaza-dark',
  'rayquaza-mega':'rayquaza-mega-dark','mewtwo-mega-y':'mewtwo-armored-mega-y',
};
export const SKIN_NAMES = {
  lugia:'Shadow Lugia',mewtwo:'Armored Mewtwo',rayquaza:'Dark Rayquaza',
  rayquazaMega:'Mega Dark Rayquaza',mewtwoMegaY:'Mega Armored Mewtwo',
};
export const SHADOW_LUGIA = {
  color:'#b16cfa',rgb:[177,108,250],core:'#f4dfff',mist:'#d3b1f5',
  colors:['#f4dfff','#cf9dff','#9452d2','#35154e'],dim:'21,8,36',
};
export const isShadowLugia = mon => mon?.boss === 'lugia';
export const bossSpritesFor = id => id ? [LEGENDARY_SKINS[id], ...({rayquaza:['rayquaza-mega-dark'],mewtwo:['mewtwo-armored-mega-y']}[id]??[])].filter(Boolean) : [];
