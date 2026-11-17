// One short content hash per folder of public/ (e.g. "sprites/gyarados"), from its file names and bytes.
// vite.config.js bakes these into production builds so assetUrl() can add ?v=<hash>: browsers cache sprites
// for a week, and a folder whose files change gets a new URL and is fetched again, while the rest stay cached.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function assetVersions(root) {
  const versions = {};
  const walk = rel => {
    const hash = createHash('sha1');
    let files = 0;
    const entries = readdirSync(join(root, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path);
      else if (e.isFile() && !e.name.startsWith('.')) {
        hash.update(e.name).update('\0').update(readFileSync(join(root, path))).update('\0');
        files++;
      }
    }
    if (rel && files) versions[rel] = hash.digest('base64url').slice(0, 8);
  };
  walk('');
  return versions;
}
