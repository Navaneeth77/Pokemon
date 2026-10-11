const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const ATTACK_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

export class Input {
  constructor(game) {
    this.game = game;
    this.held = new Set();
    window.addEventListener('keydown', e => this.onDown(e));
    window.addEventListener('keyup', e => {
      this.held.delete(e.code);
      // Releasing a held move key fires a charged attack.
      if (e.code in ATTACK_KEYS && !this.game.switchMenu) this.game.playerRelease(ATTACK_KEYS[e.code]);
    });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  onDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target?.tagName === 'INPUT') return; // typing in the roster search
    const { state } = this.game;
    // Opening, trainer setup, format screens and the pause menu handle their own keys (flow.js).
    if (state === 'menu' || this.game.paused) return;
    if (this.game.switchMenu && /^(Digit|Numpad)[1-6]$/.test(e.code)) {
      e.preventDefault();
      if (!e.repeat) this.game.pickSwitch(Number(e.code.slice(-1)) - 1);
      return;
    }
    const fighting = state === 'fighting';
    // Intro showcase and finishing sequence can be skipped.
    if ((this.game.showcase || this.game.finale) && ['Enter', 'Space', 'Escape'].includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) this.game.skipCinema();
      return;
    }
    if (MOVE_KEYS[e.code]) {
      if (fighting) e.preventDefault();
      this.held.add(e.code);
    } else if (e.code in ATTACK_KEYS) {
      if (!fighting) return;
      e.preventDefault();
      if (e.repeat) return;
      // While the switch picker is open, 1–3 choose a teammate instead of a move.
      if (this.game.switchMenu) this.game.pickSwitch(ATTACK_KEYS[e.code]);
      else this.game.playerPress(ATTACK_KEYS[e.code]);
    } else if (e.code === 'KeyQ') {
      if (!fighting) return;
      e.preventDefault();
      if (!e.repeat) this.game.toggleSwitchMenu();
    } else if (e.code === 'Escape' && this.game.switchMenu) {
      e.preventDefault();
      this.game.toggleSwitchMenu(false);
    } else if (e.code === 'KeyR' || e.code === 'Digit5' || e.code === 'Numpad5') {
      if (!fighting) return;
      e.preventDefault();
      if (!e.repeat) this.game.playerUltimate();
    } else if (e.code === 'Space') {
      if (!fighting) return;
      e.preventDefault();
      if (!e.repeat) this.game.playerDodge();
    } else if (e.code === 'KeyM') {
      if (!fighting) return;
      e.preventDefault();
      if (!e.repeat) this.game.playerMega();
    } else if (e.code === 'Enter' && (state === 'select' || state === 'over')) {
      e.preventDefault();
      if (state === 'select') this.game.ui.startBattle();
      else this.game.toSelect();
    }
  }

  clear() {
    this.held.clear();
    this.touch = null;
  }

  vector() {
    // The on-screen joystick (touch.js) gives an analogue direction.
    if (this.touch) return this.touch;
    let x = 0, y = 0;
    for (const code of this.held) {
      const v = MOVE_KEYS[code];
      if (v) {
        x += v[0];
        y += v[1];
      }
    }
    return { x: Math.sign(x), y: Math.sign(y) };
  }
}
