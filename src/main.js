import '@fontsource/caveat/latin-500.css';
import '@fontsource/oswald/latin-400.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/playfair-display/latin-700.css';
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

/**
 * The labels on the bottle and the carton are painted with the page's own
 * faces, so they are fetched first — from here, not the network — and a
 * moment is all they get: a slow load paints them in Georgia rather than wait.
 */
await Promise.race([
  Promise.all(['700 40px "Playfair Display"', 'italic 400 40px "Playfair Display"', '500 40px Oswald'].map((f) => document.fonts.load(f))),
  new Promise((resolve) => setTimeout(resolve, 1500)),
]).catch(() => {});

const kitchen = buildKitchen({ stage, GFX });
const game = createGame({ stage, GFX, kitchen });
const hud = createHud({ game });
const card = createCard({ game });
const notes = createNotes({ game });
const sound = createSound();
const cues = wireSound({ game, sound });
const particles = createParticles({ GFX, room: kitchen.room });

/**
 * The camera frames the kitchen round the ticket and the bar, wherever they
 * are, and again whenever either changes shape — a new ticket, a bar that
 * wraps onto another row.
 */
kitchen.covers = () => [...card.covers(), ...hud.covers()];
{
  let queued = false;
  const reframe = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      kitchen.frame({ glide: true });
    });
  };
  const panels = new ResizeObserver(reframe);
  for (const el of [document.getElementById('ticket'), document.getElementById('bar')]) panels.observe(el);
}

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
  if (e.type === 'egg-in-pan') particles.spatter(kitchen.panRig, [e.x, 0, e.z], 5);
});
game.on((e) => {
  if (e.type === 'plating') document.body.dataset.plated = 'true';
  if (e.type === 'reset') delete document.body.dataset.plated;
});
/** Whether a ticket has been started at all: until then the kitchen behind the title is only to look at. */
let started = false;
const intro = createIntro({
  /** The dish being cooked, if one is: picking it again goes back to it rather than starting over. */
  current: () => (started && !game.plated ? game.dish.id : null),
  onStart(id) {
    sound.start();
    if (!started || game.plated || id !== game.dish.id) game.order(id);
    started = true;
    game.live = true;
    document.body.dataset.playing = 'true';
  },
});
/** Back to the menu for another order — from the verdict, or the ticket's name. */
function menu() {
  game.live = false;
  intro.show();
}
const result = createResult({ game, onMenu: menu });
/** At the plate, the camera keeps it clear of the verdict, and of the ticket while it is showing. */
const showing = (el) => Number(getComputedStyle(el).opacity) > 0.05;
kitchen.awayCovers = () => [...(showing(document.getElementById('ticket')) ? card.covers() : []), ...result.covers()];
{
  const panel = document.getElementById('result');
  new ResizeObserver(() => kitchen.frame({ glide: true })).observe(panel);
  panel.addEventListener('animationend', () => kitchen.frame({ glide: true }));
}
card.onChange = menu;
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
