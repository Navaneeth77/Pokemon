// Adds the folder's content version to a public/ asset URL: '/sprites/gyarados/portrait.png' →
// '/sprites/gyarados/portrait.png?v=Ab3dE9xQ'. Versions only exist in production builds (vite.config.js,
// scripts/asset-versions.js); in dev, node tests and the match server URLs stay as they are.
// eslint-disable-next-line no-undef
const VERSIONS = typeof __ASSET_VERSIONS__ === 'undefined' ? {} : __ASSET_VERSIONS__;

export function assetUrl(path) {
  const v = VERSIONS[path.slice(1, path.lastIndexOf('/'))];
  return v ? `${path}?v=${v}` : path;
}
