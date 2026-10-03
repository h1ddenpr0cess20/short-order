/**
 * The corner menu: sound on and off, start over, and the how-to again.
 *
 * On a phone the corners are kitchen — the pan's handle and the knob are down
 * the right-hand side — so there the menu folds into one button at the end of
 * the bar's burner row and opens upward over the bar. On a phone on its side
 * it folds the same way, at the end of the bar.
 */

const MUTE = 'short-order:muted';

export function createMenu({ game, sound, intro, root = document.body }) {
  const nav = document.createElement('nav');
  nav.id = 'menu';
  nav.innerHTML = `
    <button class="chip round more" data-act="more" aria-expanded="false" aria-label="Menu" title="Menu">⋯</button>
    <div class="items">
      <button class="chip" data-act="sound" aria-pressed="false" title="Sound (M)">sound on</button>
      <button class="chip" data-act="restart" title="Start over">start over</button>
      <button class="chip" data-act="help" title="How to play">how to play</button>
    </div>
  `;
  root.appendChild(nav);
  for (const type of ['pointerdown', 'pointerup', 'pointermove']) nav.addEventListener(type, (e) => e.stopPropagation());

  const more = nav.querySelector('[data-act="more"]');
  const open = (on) => {
    nav.dataset.open = String(on);
    more.setAttribute('aria-expanded', String(on));
  };
  open(false);

  /** Where it lives follows the kitchen's shape: the corner when wide, the bar when tall or short. */
  const dock = () => {
    const { shape, short } = document.body.dataset;
    const bar = document.querySelector(shape === 'tall' ? '#bar .heat' : '#bar');
    const home = (shape === 'tall' || short) && bar ? bar : root;
    if (nav.parentNode !== home) home.appendChild(nav);
    open(false);
  };
  dock();
  new MutationObserver(dock).observe(document.body, { attributes: true, attributeFilter: ['data-shape', 'data-short'] });
  document.addEventListener('pointerdown', (event) => {
    if (nav.dataset.open === 'true' && !nav.contains(event.target)) open(false);
  });

  const soundButton = nav.querySelector('[data-act="sound"]');
  const show = () => {
    soundButton.textContent = sound.muted ? 'sound off' : 'sound on';
    soundButton.setAttribute('aria-pressed', String(sound.muted));
  };
  try {
    sound.muted = localStorage.getItem(MUTE) === '1';
  } catch {
  }
  show();

  function toggle() {
    sound.muted = !sound.muted;
    try {
      localStorage.setItem(MUTE, sound.muted ? '1' : '0');
    } catch {
    }
    show();
  }

  nav.addEventListener('click', (event) => {
    const act = event.target.closest('button')?.dataset.act;
    if (act === 'more') {
      open(nav.dataset.open !== 'true');
      return;
    }
    open(false);
    if (act === 'sound') toggle();
    else if (act === 'restart') game.reset();
    else if (act === 'help') {
      game.live = false;
      intro.show();
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'm' && !/^(input|textarea)$/i.test(event.target.tagName)) toggle();
  });
}
