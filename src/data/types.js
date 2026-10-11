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
};

// negateFlyingWeakness: Delta Stream's strong winds — a move that would be super effective against
// the Flying type treats that type as neutral instead.
export function typeMultiplier(moveType, defTypes, negateFlyingWeakness = false) {
  return defTypes.reduce((m, t) => {
    const k = CHART[moveType]?.[t] ?? 1;
    return m * (negateFlyingWeakness && t === 'flying' && k > 1 ? 1 : k);
  }, 1);
}
