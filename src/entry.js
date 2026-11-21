import { warmServer } from './server-connection.js';

// Keep this entry small: wake the host while the much larger game and its CSS download.
void warmServer();
// The boot RETRY button (no inline handler, so the page works under a strict Content Security Policy).
document.getElementById('boot-retry')?.addEventListener('click', () => location.reload());
import('./main.js').then(({ main }) => main()).catch(err => {
  console.error(err);
  document.getElementById('boot-status').textContent = `Unable to load the arena. ${err.message}`;
  document.getElementById('boot-retry').hidden = false;
});
