import './styles.css';
import './vendor/gfx/stage.js';

import { buildKitchen } from './scene/kitchen.js';

const stage = document.querySelector('three-d-stage');
const { GFX } = await stage.ready;

const kitchen = buildKitchen({ stage, GFX });
window.kitchen = kitchen;

let level = 0.8;
stage.onFrame = (dt, time) => {
  kitchen.stove.update(level, time, dt);
};
window.setHeat = (v) => { level = v; };
