/**
 * The first screen: what the game is and how the hands work, over the kitchen,
 * and the button that starts it — which is also what lets the page make sound.
 */

export function createIntro({ root = document.body, onStart }) {
  const scrim = document.createElement('section');
  scrim.id = 'intro';
  scrim.setAttribute('aria-label', 'Short Order');
  scrim.innerHTML = `
    <div class="sheet">
      <p class="chip kicker">one potato · three eggs · one cast iron pan</p>
      <h1>Short Order</h1>
      <p class="lede">The breakfast rush has one ticket on it: a potato and egg scramble. Dice it,
      fry it golden, beat the eggs and scramble them in, season it — and plate it before it goes cold.</p>
      <ul class="how">
        <li><b>Knife</b><span>over the board: click to chop where the blade is. Right-click or <kbd>R</kbd> turns the pile. Drag the pile to carry it to the pan.</span></li>
        <li><b>Burner</b><span>click the knob, or <kbd>Q</kbd> <kbd>E</kbd>. Cast iron is slow — let it heat. Oil first: click the bottle. Butter is for gentler heat: on a hot pan it burns.</span></li>
        <li><b>Pan</b><span>drag to stir with the spatula, click to flip, <kbd>space</kbd> to toss — or grab the handle, shake, and flick it up. Food browns on the side that is down.</span></li>
        <li><b>Eggs</b><span>click the carton to crack one into the bowl, drag round in the bowl to whisk, <kbd>P</kbd> to pour.</span></li>
        <li><b>Season</b><span>click the salt for a pinch, the mill for a twist — over the pan, or drag either to the bowl to season the eggs. Potatoes and eggs both want it.</span></li>
        <li><b>Keys</b><span><kbd>↑</kbd> <kbd>↓</kbd> aim the knife and <kbd>C</kbd> chops, <kbd>S</kbd> scrapes the board into the pan, hold <kbd>W</kbd> to whisk and <kbd>X</kbd> to stir, <kbd>G</kbd> cracks an egg, <kbd>B</kbd> butters, <kbd>A</kbd> salts, <kbd>F</kbd> peppers, <kbd>enter</kbd> plates.</span></li>
      </ul>
      <button class="start" type="button">start cooking</button>
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
