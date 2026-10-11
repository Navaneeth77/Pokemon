export const TYPE_COLORS = {
  fire: ['#f2833a', '#b8461c'],
  flying: ['#9b8cf2', '#5c4cc2'],
  dragon: ['#7a4cf2', '#4322ad'],
  water: ['#5a8ef0', '#2b57bd'],
  ice: ['#62c9d3', '#2b8794'],
  normal: ['#a8a878', '#6c6c4c'],
  electric: ['#f2c21c', '#a8820a'],
  grass: ['#62b947', '#2f7a22'],
  ground: ['#c9a05a', '#8a6630'],
  steel: ['#a3b1c4', '#5f6d84'],
  fighting: ['#c8402c', '#802414'],
  dark: ['#6a5848', '#3a2e26'],
  ghost: ['#7a5aa8', '#45346a'],
  poison: ['#a848a8', '#682a68'],
  psychic: ['#f2588a', '#b02e58'],
  rock: ['#b8a038', '#7a6a20'],
  fairy: ['#ea8cb0', '#b05a80'],
  bug: ['#a8b820', '#6a7a10'],
};

const CHART = {
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
  grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
  ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
  steel: { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
  fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
  dark: { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
  ghost: { psychic: 2, ghost: 2, dark: 0.5, normal: 0 },
  poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
  rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
  fairy: { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
  bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
};

// negateFlyingWeakness: Delta Stream's strong winds — a move that would be super effective against
// the Flying type treats that type as neutral instead.
export function typeMultiplier(moveType, defTypes, negateFlyingWeakness = false) {
  return defTypes.reduce((m, t) => {
    const k = CHART[moveType]?.[t] ?? 1;
    return m * (negateFlyingWeakness && t === 'flying' && k > 1 ? 1 : k);
  }, 1);
}
