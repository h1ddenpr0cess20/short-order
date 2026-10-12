import '@fontsource/caveat/latin-500.css';
import '@fontsource/oswald/latin-400.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/playfair-display/latin-700.css';
import '../styles.css';
import '../vendor/gfx/stage.js';

import { wireSound } from '../audio/cues.js';
import { createSound } from '../audio/sound.js';
import { createGame } from '../game/game.js';
import { buildKitchen } from '../scene/kitchen.js';
import { createCard } from '../ui/card.js';
import { createHud } from '../ui/hud.js';
import { createMenu } from '../ui/menu.js';
import { createNotes } from '../ui/notes.js';
import { createResult } from '../ui/result.js';
import { createParticles } from '../view/particles.js';
import { createRecorder } from './core.js';

/**
 * Short Order, for the reels (reel.html; the filming is core.js): the
 * kitchen built as main.js builds it, its own loop stopped so the frames
 * come one at a time, and a cook at the counter in place of a player. There
 * is no autopilot in this game, so the cook is a script: it presses the
 * keys a player would (the game is all playable from the keys), each when
 * the kitchen is ready for it, and names the moments a reel cuts to.
 */

const key = (k, type) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
const press = (k) => { key(k, 'keydown'); key(k, 'keyup'); };

/** What the cook has got to: the moments reached, and what its hands are on (for the thumb). */
const cook = { marks: new Set(), hands: null, steps: [], time: 0 };

/** A step that does `fn` and is done. */
const now = (fn) => () => { fn(); return true; };
/** A step that waits `s` seconds. */
const pause = (s) => { let left = s; return (dt) => (left -= dt) <= 0; };
/** A step that names a moment, and says what the hands are on from then. */
const mark = (name, hands = cook.hands) => now(() => { cook.marks.add(name); cook.hands = hands; });

let game = null, kitchen = null;

/** The camera on `name` ('all', 'board', 'pan'): V until it is. */
const look = (name) => {
  let gap = 0;
  return (dt) => {
    if (game.view === name) return true;
    if ((gap -= dt) <= 0) { press('v'); gap = 0.35; }
    return false;
  };
};

/**
 * One pass of the knife down the pile: from the near end, a dice's width at a
 * time (two presses of ↑, half a dice each), till it runs off the far end.
 */
const pass = () => {
  let started = false, gap = 0;
  return (dt) => {
    gap -= dt;
    const k = game.knife;
    if (gap > 0 || k.chop) return false;
    const pile = game.board.bounds();
    if (!pile) return true;
    if (!started) {
      k.manual = false;
      press('c');
      started = true;
      gap = 0.4;
      return false;
    }
    if (k.z - 0.62 < pile.z0 + 0.25) return true;
    press('ArrowUp');
    press('ArrowUp');
    press('c');
    gap = 0.4;
    return false;
  };
};

/** A step that waits until `test()`, or `most` seconds, whichever comes first. */
const until = (test, most) => { let left = most; return (dt) => test() || (left -= dt) <= 0; };

/** Steps that do `act` every `every` seconds until `test()`, or `most` seconds. */
const keepAt = (act, every, test, most) => {
  let left = most, next = every;
  return (dt) => {
    if (test() || (left -= dt) <= 0) return true;
    if ((next -= dt) <= 0) { act(); next = every; }
    return false;
  };
};

/** The burner to setting `level` (0 off … 5 high), a click of the knob at a time. */
const burner = (level) => {
  let gap = 0;
  return (dt) => {
    const now = game.pan.heat.level;
    if (now === level) return true;
    if ((gap -= dt) <= 0) { press(now < level ? 'e' : 'q'); gap = 0.2; }
    return false;
  };
};

/**
 * Potato & egg scramble, as a cook at the pass would make it: cooked to what
 * the ticket says, not to a clock. Golden potato at medium-high, the eggs at
 * medium-low in slow strokes till they are soft curds.
 */
function hash() {
  const progress = () => game.progress;
  let stroke = 0;
  return [
    pause(0.6),
    // The burner up, oil in, and on to the board while the iron heats.
    burner(4), pause(0.3), now(() => press('o')), pause(0.5),
    look('board'),
    mark('dice', 'knife'),
    // Rounds; across them into strips; the pile turned, and across the strips into dice.
    pass(), pause(0.8), pass(), pause(0.6), now(() => press('r')), pause(0.9), pass(), pause(0.6),
    mark('diced', null),
    // In when the pan is hot, and fried golden, tossed every few seconds.
    until(() => game.pan.heat.temp > 205, 40),
    look('pan'),
    mark('pan'), now(() => press('s')), pause(1.5),
    keepAt(() => press(' '), 3.5, () => progress().fry.golden >= 0.4, 90),
    now(() => press('a')), now(() => press('f')),
    mark('fry'),
    keepAt(() => press(' '), 3.5, () => progress().fry.golden >= 0.72, 90),
    // Down for the eggs: three into the bowl, beaten smooth, poured.
    burner(2),
    look('all'),
    mark('crack'),
    ...[0, 1, 2].flatMap(() => [now(() => press('g')), pause(0.3), () => !game.eggs.cracking, pause(0.2)]),
    mark('whisk', 'whisk'), now(() => key('w', 'keydown')),
    until(() => progress().whisk.mix >= 0.95, 8), pause(0.4), now(() => key('w', 'keyup')),
    mark('whisked', null), pause(0.3),
    look('pan'),
    mark('pour'), now(() => press('p')), until(() => !game.eggs.pouring, 6), pause(1),
    // Slow strokes, for big soft curds, till they are.
    mark('stir', 'spatula'),
    keepAt(() => key('x', (stroke++ % 2) ? 'keyup' : 'keydown'), 1.4, () => progress().scramble.done, 80),
    now(() => key('x', 'keyup')),
    mark('stirred', null),
    now(() => press('a')), pause(0.3), now(() => press('a')), pause(0.3), now(() => press('f')), pause(0.6),
    mark('plate'), now(() => press('Enter')),
    () => Boolean(game.report), mark('verdict'),
    pause(30),
  ];
}

const RECIPES = { hash };

/** Where a thing in the kitchen is, as the scene has it. */
const where = (thing) => {
  const object = thing?.group ?? thing;
  if (!object?.getWorldPosition) return null;
  object.updateMatrixWorld?.(true);
  return object.getWorldPosition(new kitchen.GFX.Vector3());
};

let sound = null, cues = null, particles = null, hud = null, card = null, notes = null;

createRecorder({
  async ready() {
    await Promise.all(['700 40px "Playfair Display"', 'italic 400 40px "Playfair Display"', '500 40px Oswald', '400 40px Oswald', '500 40px Caveat'].map((f) => document.fonts.load(f)));
  },

  createAudio() {
    sound = createSound();
    return sound;
  },
  wake: (audio) => audio.start(),
  nowhere: ['start'],

  async build({ audio }) {
    const el = document.querySelector('three-d-stage');
    const { GFX } = await el.ready;
    // The stage's own loop stopped: the frames come from the recorder, one at a time (and at a crawl, which
    // would otherwise have the stage lower its resolution).
    el._renderer.setAnimationLoop(null);
    kitchen = buildKitchen({ stage: el, GFX });
    kitchen.GFX = GFX;
    game = createGame({ stage: el, GFX, kitchen });
    hud = createHud({ game });
    card = createCard({ game });
    notes = createNotes({ game });
    cues = wireSound({ game, sound: audio });
    particles = createParticles({ GFX, room: kitchen.room });
    kitchen.covers = () => [...card.covers(), ...hud.covers()];
    const result = createResult({ game, onMenu() {} });
    const showing = (e) => Number(getComputedStyle(e).opacity) > 0.05;
    kitchen.awayCovers = () => [...(showing(document.getElementById('ticket')) ? card.covers() : []), ...result.covers()];
    createMenu({ game, sound: audio, intro: { show() {}, hide() {} } });
    game.on((e) => {
      if (e.type === 'plating') document.body.dataset.plated = 'true';
      if (e.type === 'reset') delete document.body.dataset.plated;
    });
    const stage = {
      renderer: el._renderer,
      camera: el._camera,
      look() {},
      render() {
        el._controls.update();
        el._renderer.render(el._scene, el._camera);
      },
    };
    return { game, stage, GFX };
  },

  start(g, dish) {
    cook.marks = new Set();
    cook.hands = null;
    cook.time = 0;
    cook.waited = 0;
    cook.steps = RECIPES[dish]();
    g.order(dish);
    g.live = true;
    document.body.dataset.playing = 'true';
    kitchen.frame({ glide: false });
  },
  pilot: () => ({ next: () => ({}), saw() {}, stuck: null }),
  attach() {},
  ball: () => ({ x: 0, y: 0, z: 0, vx: 0, vz: 0 }),
  name: (g) => g.dish.name ?? g.dish.id,
  state: (g) => (g.plated ? 'plated' : 'cooking'),
  phase: (g) => (g.plated ? 'end' : 'live'),
  reached: (g, name) => cook.marks.has(name),

  /** The cook's turn at the counter, then the kitchen's frame, as main.js runs it. */
  update(g, dt) {
    cook.time += dt;
    while (cook.steps.length && cook.steps[0](dt)) cook.steps.shift();
    g.update(dt, cook.time);
    cues.update(dt);
    const egg = g.sheet.empty ? null : g.sheet.summary();
    particles.update(dt, {
      pan: g.pan,
      frame: kitchen.panRig,
      eggSteam: egg ? Math.min(1, egg.liquid / 3) * Math.max(0, (g.pan.heat.temp - 90) / 120) : 0,
      sheetPoint: () => null,
    });
    hud.update();
    card.update();
    notes.update(dt);
  },

  /** A thumb on whatever the cook's hands are on: the knife over the board, the whisk, the spatula. */
  touch(g, at) {
    if (!cook.hands) return null;
    const p = where(kitchen[cook.hands]);
    if (!p) return null;
    const [x, y] = at(p.x, p.y, p.z);
    return [x, y + 26];
  },

  music() {},

  card: {
    logo: '<h1>Short Order</h1><p class="kicker"><span>eggs any style · one cast iron pan</span></p>',
    url: 'short-order.vercel.app',
  },
  theme: {
    display: '"Playfair Display", Georgia, serif',
    body: 'Oswald, "Arial Narrow", sans-serif',
    accent: '#2f5a40',
    'accent-dark': '#0f1813',
    'accent-2': '#e4c584',
    cool: '#c9a45c',
    dim: 'rgba(244, 236, 218, 0.72)',
  },
});
