/**
 * The first screen: the menu — which ticket goes on the rail — and how the
 * hands work, over the kitchen, and the button that starts it, which is also
 * what lets the page make sound.
 */

import { DISHES, MENU } from '../game/dishes.js';

const CHOSEN = 'short-order:dish';

const POINTER = `
  <li><b>Knife</b><span>over the board: click to chop where the blade is. Right-click or <kbd>R</kbd> turns the pile. Drag the pile to carry it to the pan.</span></li>
  <li><b>Burner</b><span>click the knob, or <kbd>Q</kbd> <kbd>E</kbd>. Cast iron is slow — let it heat. Oil first: click the bottle. Butter is for gentler heat: on a hot pan it burns.</span></li>
  <li><b>Pan</b><span>drag to stir with the spatula, click to flip, <kbd>space</kbd> to toss — or grab the handle, shake, and flick it up. Food browns on the side that is down.</span></li>
  <li><b>Eggs</b><span>click the carton to crack one into the bowl, drag round in the bowl to whisk, <kbd>P</kbd> to pour. Fried eggs go straight into the pan: click one to turn it over. Freestyle, drag an egg to the pan, or <kbd>H</kbd>, to fry it.</span></li>
  <li><b>Omelette</b><span>pour, let it set, then <i>fold</i> or <kbd>L</kbd> — anything lying on the egg is folded inside.</span></li>
  <li><b>Extras</b><span>click a ramekin — cheese, tomato, ham, pepper, onion, chives, <kbd>1</kbd>–<kbd>6</kbd> — and it goes on the board whole. Cut it small, then into the pan. Onion and pepper want cooking; cheese wants melting.</span></li>
  <li><b>Season</b><span>click the salt for a pinch, the mill for a twist — over the pan, or drag either to the bowl to season the eggs. Potatoes and eggs both want it.</span></li>
  <li><b>Keys</b><span><kbd>↑</kbd> <kbd>↓</kbd> aim the knife and <kbd>C</kbd> chops, <kbd>S</kbd> scrapes the board into the pan, hold <kbd>W</kbd> to whisk and <kbd>X</kbd> to stir, <kbd>G</kbd> cracks an egg, <kbd>L</kbd> folds, <kbd>B</kbd> butters, <kbd>A</kbd> salts, <kbd>F</kbd> peppers, <kbd>enter</kbd> plates.</span></li>
`;

/** The same, for a finger: no right button, no keys, and the bar along the bottom for everything. */
const TOUCH = `
  <li><b>Knife</b><span>tap the board to chop where you tap. Twist two fingers on the kitchen — or tap <i>↻ turn</i> — to turn the pile a quarter turn. Drag the pile to carry it to the pan, or <i>into pan</i>.</span></li>
  <li><b>Burner</b><span>tap the knob, or <i>+</i> and <i>−</i>. Cast iron is slow — let it heat. Oil first: tap the bottle. Butter is for gentler heat: on a hot pan it burns.</span></li>
  <li><b>Pan</b><span>drag to stir with the spatula, tap to flip, <i>toss</i> to toss — or grab the handle, shake, and flick it up. Food browns on the side that is down.</span></li>
  <li><b>Eggs</b><span>tap the carton to crack one into the bowl, drag round in the bowl to whisk, <i>pour</i> to pour. Fried eggs go straight into the pan: tap one to turn it over. Freestyle, drag an egg to the pan, or <i>egg → pan</i>, to fry it.</span></li>
  <li><b>Omelette</b><span>pour, let it set, then tap <i>fold</i> — anything lying on the egg is folded inside.</span></li>
  <li><b>Extras</b><span>tap a ramekin — cheese, tomato, ham, pepper, onion, chives — and it goes on the board whole. Cut it small, then into the pan. Onion and pepper want cooking; cheese wants melting.</span></li>
  <li><b>Season</b><span>tap the salt for a pinch, the mill for a twist — over the pan, or drag either to the bowl to season the eggs. Potatoes and eggs both want it.</span></li>
`;

/** The last dish ordered on this browser, if it remembers. */
function remembered() {
  try {
    const id = localStorage.getItem(CHOSEN);
    return DISHES[id] ? id : 'hash';
  } catch {
    return 'hash';
  }
}

/** `onStart(dish)` is called with the id of the dish picked; `current()` says which is on the rail now, if any. */
export function createIntro({ root = document.body, onStart, current = () => null }) {
  /** A screen with no mouse over it is read the touch instructions. */
  const touch = globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  const scrim = document.createElement('section');
  scrim.id = 'intro';
  scrim.setAttribute('aria-label', 'Short Order');
  scrim.innerHTML = `
    <div class="sheet">
      <p class="scrawl left" aria-hidden="true">We don't count calories.<br>We count curds.</p>
      <p class="scrawl right" aria-hidden="true">Cracking eggs<br>&amp; dicing spuds<br>since 6 a.m.</p>
      <svg class="crest" viewBox="0 0 120 64" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <path d="M40 54 C 22 48, 16 30, 22 12" />
          <path d="M80 54 C 98 48, 104 30, 98 12" />
        </g>
        <g fill="currentColor">
          <ellipse cx="22" cy="20" rx="2.6" ry="6" transform="rotate(-24 22 20)" />
          <ellipse cx="21" cy="32" rx="2.6" ry="6" transform="rotate(-44 21 32)" />
          <ellipse cx="27" cy="43" rx="2.6" ry="6" transform="rotate(-62 27 43)" />
          <ellipse cx="98" cy="20" rx="2.6" ry="6" transform="rotate(24 98 20)" />
          <ellipse cx="99" cy="32" rx="2.6" ry="6" transform="rotate(44 99 32)" />
          <ellipse cx="93" cy="43" rx="2.6" ry="6" transform="rotate(62 93 43)" />
        </g>
        <text x="60" y="44" text-anchor="middle">SO</text>
      </svg>
      <h1>Short Order</h1>
      <p class="kicker"><span>eggs any style · one cast iron pan</span></p>
      <p class="motto">Hand diced · Cast-iron fried · Softly scrambled</p>
      <div class="page">
        <p class="lede">The breakfast rush, one ticket at a time. What is on the rail?</p>
        <ul class="menu" role="radiogroup" aria-label="The menu">
          ${MENU.map((id) => {
    const d = DISHES[id];
    return `<li><button type="button" role="radio" aria-checked="false" data-dish="${id}"><span class="no">${d.no}</span><b>${d.menu}</b><i>${d.blurb}</i></button></li>`;
  }).join('')}
        </ul>
        <details class="hands"><summary>How the hands work</summary><ul class="how">${touch ? TOUCH : POINTER}</ul></details>
      </div>
      <button class="start" type="button">start cooking</button>
      <p class="small chip">service: quick <i>|</i> salt: to taste <i>|</i> butter: brown, never burnt</p>
    </div>
  `;
  root.appendChild(scrim);
  for (const type of ['pointerdown', 'pointerup', 'pointermove']) scrim.addEventListener(type, (e) => e.stopPropagation());

  const button = scrim.querySelector('.start');
  let chosen = remembered();
  /** The dish picked, lit, and the button saying what pressing it does: start that, or go back to the one cooking. */
  function pick(id) {
    chosen = id;
    for (const b of scrim.querySelectorAll('[data-dish]')) b.setAttribute('aria-checked', String(b.dataset.dish === id));
    button.textContent = current() === id ? 'back to the stove' : `start · ${DISHES[id].menu}`;
  }
  scrim.querySelector('.menu').addEventListener('click', (event) => {
    const b = event.target.closest('[data-dish]');
    if (b) pick(b.dataset.dish);
  });
  pick(chosen);

  button.addEventListener('click', () => {
    scrim.hidden = true;
    try {
      localStorage.setItem(CHOSEN, chosen);
    } catch {
    }
    onStart?.(chosen);
  });
  requestAnimationFrame(() => button.focus({ preventScroll: true }));

  return {
    get open() { return !scrim.hidden; },
    show() {
      scrim.hidden = false;
      pick(current() ?? chosen);
      button.focus({ preventScroll: true });
    },
  };
}
