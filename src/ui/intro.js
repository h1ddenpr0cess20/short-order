/**
 * The first screen: what the game is and how the hands work, over the kitchen,
 * and the button that starts it — which is also what lets the page make sound.
 */

const POINTER = `
  <li><b>Knife</b><span>over the board: click to chop where the blade is. Right-click or <kbd>R</kbd> turns the pile. Drag the pile to carry it to the pan.</span></li>
  <li><b>Burner</b><span>click the knob, or <kbd>Q</kbd> <kbd>E</kbd>. Cast iron is slow — let it heat. Oil first: click the bottle. Butter is for gentler heat: on a hot pan it burns.</span></li>
  <li><b>Pan</b><span>drag to stir with the spatula, click to flip, <kbd>space</kbd> to toss — or grab the handle, shake, and flick it up. Food browns on the side that is down.</span></li>
  <li><b>Eggs</b><span>click the carton to crack one into the bowl, drag round in the bowl to whisk, <kbd>P</kbd> to pour.</span></li>
  <li><b>Season</b><span>click the salt for a pinch, the mill for a twist — over the pan, or drag either to the bowl to season the eggs. Potatoes and eggs both want it.</span></li>
  <li><b>Keys</b><span><kbd>↑</kbd> <kbd>↓</kbd> aim the knife and <kbd>C</kbd> chops, <kbd>S</kbd> scrapes the board into the pan, hold <kbd>W</kbd> to whisk and <kbd>X</kbd> to stir, <kbd>G</kbd> cracks an egg, <kbd>B</kbd> butters, <kbd>A</kbd> salts, <kbd>F</kbd> peppers, <kbd>enter</kbd> plates.</span></li>
`;

/** The same, for a finger: no right button, no keys, and the bar along the bottom for everything. */
const TOUCH = `
  <li><b>Knife</b><span>tap the board to chop where you tap. Twist two fingers on the kitchen — or tap <i>↻ turn</i> — to turn the pile a quarter turn. Drag the pile to carry it to the pan, or <i>into pan</i>.</span></li>
  <li><b>Burner</b><span>tap the knob, or <i>+</i> and <i>−</i>. Cast iron is slow — let it heat. Oil first: tap the bottle. Butter is for gentler heat: on a hot pan it burns.</span></li>
  <li><b>Pan</b><span>drag to stir with the spatula, tap to flip, <i>toss</i> to toss — or grab the handle, shake, and flick it up. Food browns on the side that is down.</span></li>
  <li><b>Eggs</b><span>tap the carton to crack one into the bowl, drag round in the bowl to whisk, <i>pour</i> to pour.</span></li>
  <li><b>Season</b><span>tap the salt for a pinch, the mill for a twist — over the pan, or drag either to the bowl to season the eggs. Potatoes and eggs both want it.</span></li>
`;

export function createIntro({ root = document.body, onStart }) {
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
      <p class="kicker"><span>one potato · three eggs · one cast iron pan</span></p>
      <p class="motto">Hand diced · Cast-iron fried · Softly scrambled</p>
      <div class="page">
        <p class="lede">The breakfast rush has one ticket on it: a potato and egg scramble. Dice it,
        fry it golden, beat the eggs and scramble them in, season it — and plate it before it goes cold.</p>
        <ul class="how">${touch ? TOUCH : POINTER}</ul>
      </div>
      <button class="start" type="button">start cooking</button>
      <p class="small chip">service: quick <i>|</i> salt: to taste <i>|</i> butter: brown, never burnt</p>
    </div>
  `;
  root.appendChild(scrim);
  for (const type of ['pointerdown', 'pointerup', 'pointermove']) scrim.addEventListener(type, (e) => e.stopPropagation());

  const button = scrim.querySelector('.start');
  button.addEventListener('click', () => {
    scrim.hidden = true;
    onStart?.();
  });
  requestAnimationFrame(() => button.focus({ preventScroll: true }));

  return {
    get open() { return !scrim.hidden; },
    show() {
      scrim.hidden = false;
      button.textContent = 'back to the stove';
      button.focus({ preventScroll: true });
    },
  };
}
