import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';

import { createAudio } from '../audio.js';
import { createDieState } from '../die.js';
import { createGame } from '../game.js';
import { createHud } from '../hud.js';
import { LEVELS, loadLevel } from '../levels.js';
import { preload, ready, SCULPTED } from '../models/library.js';
import { BOARD_DETAIL } from '../monsters.js';
import { createStage } from '../stage.js';
import { createStorage } from '../storage.js';
import * as GFX from '../vendor/gfx/index.js';
import { createPilot } from '../../test/helpers/autopilot.js';
import { createRecorder } from './core.js';

/**
 * Dungeon Roller, for the reels (reel.html; the filming is core.js): the
 * game built as main.js builds it, with nobody's hands on it, the autopilot
 * at the wheel, and the battle screen carried on from once it has been up
 * long enough to read the roll.
 */

/** How long the battle screen stays up on film before the autopilot carries on, in seconds. */
const BATTLE = 2.2;

let fighting = false;

createRecorder({
  async ready() {
    preload();
    const jobs = new Map();
    for (let i = 0; i < LEVELS.length; i++) {
      const l = loadLevel(i);
      for (const m of l.mobs) jobs.set(`${m.kind}@${BOARD_DETAIL}`, [m.kind, BOARD_DETAIL]);
      for (const p of l.pickups) jobs.set(`${p.kind}@1`, [p.kind, 1]);
    }
    await Promise.all([...jobs.values()].filter(([n]) => SCULPTED[n]).map(([n, d]) => ready(n, d)));
    await Promise.all(['400 20px Cinzel', '700 40px Cinzel'].map((f) => document.fonts.load(f)));
  },

  createAudio,
  quiet: ['rolling'],

  async build({ audio }) {
    const hud = createHud(document.body, { onStart() {} });
    hud.muted(false);
    const input = {
      stick: () => ({ x: 0, y: 0 }),
      view: () => ({ turn: 0, tilt: 0, zoom: 1 }),
      take: () => [],
      get pointing() { return false; },
    };
    const stage = await createStage(document.getElementById('view'));
    const game = createGame({ stage, hud, input, audio, storage: createStorage() });
    return { game, stage, GFX };
  },

  start(game, level) {
    fighting = false;
    game.startRun(level);
    // The die carries over from level to level, and which way up it is decides every fight: from the same
    // way up every time, so the run filmed is the run scouted, whatever was played before it.
    Object.assign(game.debug.delve.die, createDieState());
  },
  pilot: (game) => createPilot(game.debug.delve),
  attach: (game, pilot) => { game.debug.pilot = pilot; },
  ball: (game) => game.debug.ball,
  name: (game) => game.debug.delve.level.name,
  state: (game) => game.state,
  phase: (game) => ({ play: 'live', battle: 'live', clear: 'end', won: 'end', over: 'end' })[game.state] ?? 'wait',
  presses: (game, since) => (game.state === 'battle' && since >= BATTLE ? ['start'] : []),
  steering: (game) => game.state === 'play',
  // A thumb on CONTINUE, just before the autopilot carries on.
  button: { selector: '#battle .go', held: (game, move, since) => game.state === 'battle' && since >= BATTLE - 0.4 },

  /** A fight starting, and whether it is with the boss: the battle screen says so. */
  notes(game) {
    const now = game.state === 'battle';
    const begun = now && !fighting;
    fighting = now;
    if (!begun) return [];
    return document.querySelector('#battle .boss')?.textContent ? ['fight', 'boss'] : ['fight'];
  },

  music: (audio, m) => audio.startMusic(...m.args),

  card: {
    logo: `<h1 class="crest"><span class="word">Dungeon</span><span class="rule" aria-hidden="true"><i></i><b>20</b><i></i></span><span class="word">Roller</span></h1>
      <p class="tag">roll into trouble</p>`,
    url: 'dungeon-roller.vercel.app',
  },
  theme: {
    display: 'Cinzel, "Palatino Linotype", Palatino, Georgia, serif',
    body: 'Cinzel, "Palatino Linotype", Palatino, Georgia, serif',
    accent: '#b5401f',
    'accent-dark': '#3a1206',
    'accent-2': '#ffcf4a',
    cool: '#ffb36b',
    dim: '#a8987e',
    'pill-top': '150px',
    'pill-size': '12px',
    'url-size': '18px',
    'cta-size': '16px',
  },
});
