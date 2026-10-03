import './styles.css';
import './vendor/gfx/stage.js';

import { wireSound } from './audio/cues.js';
import { createSound } from './audio/sound.js';
import { createGame } from './game/game.js';
import { buildKitchen } from './scene/kitchen.js';
import { createCard } from './ui/card.js';
import { createHud } from './ui/hud.js';
import { createIntro } from './ui/intro.js';
import { createMenu } from './ui/menu.js';
import { createNotes } from './ui/notes.js';
import { createResult } from './ui/result.js';
import { createParticles } from './view/particles.js';

const stage = document.querySelector('three-d-stage');
const { GFX } = await stage.ready;

const kitchen = buildKitchen({ stage, GFX });
const game = createGame({ stage, GFX, kitchen });
const hud = createHud({ game });
const card = createCard({ game });
const notes = createNotes({ game });
const sound = createSound();
const cues = wireSound({ game, sound });
const particles = createParticles({ GFX, room: kitchen.room });

/** A random patch of the pan where egg is still wet, for the steam to come off. */
function wetEgg() {
  const sheet = game.sheet;
  for (let tries = 0; tries < 12; tries++) {
    const k = Math.floor(Math.random() * sheet.amount.length);
    if (sheet.amount[k] > 0.02 && sheet.set[k] < 0.7) {
      const i = k % sheet.N, j = Math.floor(k / sheet.N);
      return [-sheet.size * sheet.N / 2 + (i + 0.5) * sheet.size, sheet.amount[k], -sheet.size * sheet.N / 2 + (j + 0.5) * sheet.size];
    }
  }
  return null;
}

game.on((e) => {
  const hot = game.pan.heat.temp > 150;
  if (!hot) return;
  if (e.type === 'add') particles.spatter(kitchen.panRig, [0, 0, 0], 10);
  if (e.type === 'land' && e.speed > 6 && Math.random() < 0.3) particles.spatter(kitchen.panRig, e.piece.pos, 2);
  if (e.type === 'oil') particles.spatter(kitchen.panRig, [0, 0, 0], 6);
});
createResult({ game });
game.on((e) => {
  if (e.type === 'plating') document.body.dataset.plated = 'true';
  if (e.type === 'reset') delete document.body.dataset.plated;
});
const intro = createIntro({
  onStart() {
    sound.start();
    game.live = true;
    document.body.dataset.playing = 'true';
  },
});
createMenu({ game, sound, intro });

/**
 * A button pressed with a mouse or a finger hands the keys straight back to
 * the kitchen: space and enter are the game's — toss, plate — not a second
 * press of whatever was clicked last. Tabbed to with the keys, it keeps them.
 */
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('button');
  if (button && event.detail > 0) button.blur();
}, true);

/** Full rate while anything is happening; a few frames a second while nothing is. */
stage.pace = () => (game.quiet ? 12 : 60);

stage.onFrame = (dt, time) => {
  game.update(dt, time);
  cues.update(dt);
  const egg = game.sheet.empty ? null : game.sheet.summary();
  particles.update(dt, {
    pan: game.pan,
    frame: kitchen.panRig,
    eggSteam: egg ? Math.min(1, egg.liquid / 3) * Math.max(0, (game.pan.heat.temp - 90) / 120) : 0,
    sheetPoint: wetEgg,
  });
  hud.update();
  card.update();
  notes.update(dt);
};

/** For poking at from the console, and for the screenshots. */
window.kitchen = kitchen;
window.game = game;
window.sound = sound;
window.particles = particles;
