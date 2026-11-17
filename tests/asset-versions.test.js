import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetVersions } from '../scripts/asset-versions.js';
import { assetUrl } from '../src/asset-url.js';

test('asset versions change only for the folder whose files changed', () => {
  const root = mkdtempSync(join(tmpdir(), 'assets-'));
  mkdirSync(join(root, 'sprites/a'), { recursive: true });
  mkdirSync(join(root, 'sprites/b'), { recursive: true });
  writeFileSync(join(root, 'sprites/a/portrait.png'), 'one');
  writeFileSync(join(root, 'sprites/b/portrait.png'), 'two');
  const before = assetVersions(root);
  assert.deepEqual(Object.keys(before).sort(), ['sprites/a', 'sprites/b']);
  assert.match(before['sprites/a'], /^[\w-]{8}$/);
  assert.deepEqual(assetVersions(root), before, 'stable across runs');
  writeFileSync(join(root, 'sprites/a/portrait.png'), 'changed');
  const after = assetVersions(root);
  assert.notEqual(after['sprites/a'], before['sprites/a']);
  assert.equal(after['sprites/b'], before['sprites/b']);
  writeFileSync(join(root, 'sprites/b/Idle-Anim.png'), 'new sheet');
  assert.notEqual(assetVersions(root)['sprites/b'], before['sprites/b'], 'an added file changes the version too');
});

test('outside a production build asset URLs stay plain', () => {
  assert.equal(assetUrl('/sprites/gyarados/portrait.png'), '/sprites/gyarados/portrait.png');
});
