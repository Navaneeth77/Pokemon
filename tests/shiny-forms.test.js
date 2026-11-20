import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SHINY_FORMS } from '../src/assets.js';
import { SPECIES } from '../src/data/species.js';

test('every Mega that stays shiny has a shiny palette that only recolours its own sheet colours', () => {
  const sprites = new Set(Object.values(SPECIES).filter(s => s.megaOf).map(s => s.sprite));
  for (const sp of SHINY_FORMS) {
    assert.ok(sprites.has(sp), `${sp} is a Mega form`);
    const pal = JSON.parse(fs.readFileSync(`public/sprites/${sp}/shiny.json`, 'utf8'));
    assert.ok(Object.keys(pal).length >= 4, `${sp} palette changes some colours`);
    for (const [a, b] of Object.entries(pal)) assert.match(a + b, /^[0-9a-f]{12}$/, `${sp} palette entry ${a}`);
  }
});
