// Which browser pages may use the match server (HTTP and WebSocket).
// - ALLOWED_ORIGINS (comma separated; '*' allows any) replaces the default, the deployed game.
// - This project's own Vercel deployments are always allowed: every preview and branch build
//   (pokemon-<id>-navaneeth77s-projects.vercel.app, pokemon-git-<branch>-…), since only this account can
//   create addresses under that suffix.
// - Local development pages (localhost / 127.0.0.1 / [::1]) are always allowed.
// - Requests with no Origin (health checks, scripts, tests) are not browser cross-site requests and are allowed.
export const DEFAULT_ORIGINS = ['https://pokemon-gules-delta.vercel.app'];
const PROJECT_DEPLOYMENT = /^https:\/\/pokemon-[a-z0-9-]+-navaneeth77s-projects\.vercel\.app$/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function originChecker(allowed = '') {
  const list = String(allowed ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const origins = list.length ? list : DEFAULT_ORIGINS;
  return origin => !origin || origins.includes('*') || origins.includes(origin)
    || PROJECT_DEPLOYMENT.test(origin) || LOCAL_ORIGIN.test(origin);
}
