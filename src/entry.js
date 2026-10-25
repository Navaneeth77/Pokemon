import { warmServer } from './server-connection.js';

// Keep this entry small: wake the host while the much larger game and its CSS download.
void warmServer();
import('./main.js').then(({ main }) => main()).catch(err => {
  console.error(err);
  document.getElementById('boot-status').textContent = `Unable to load the arena. ${err.message}`;
  document.getElementById('boot-retry').hidden = false;
});
