import './styles.css';
import './vendor/gfx/stage.js';

import { createGame } from './game/game.js';
import { buildKitchen } from './scene/kitchen.js';
import { createHud } from './ui/hud.js';

const stage = document.querySelector('three-d-stage');
const { GFX } = await stage.ready;

const kitchen = buildKitchen({ stage, GFX });
const game = createGame({ stage, GFX, kitchen });
const hud = createHud({ game });

stage.onFrame = (dt, time) => {
  game.update(dt, time);
  hud.update();
};

/** For poking at from the console, and for the screenshots. */
window.kitchen = kitchen;
window.game = game;
