/**
 * The corner menu: sound on and off, start over, and the how-to again.
 */

const MUTE = 'short-order:muted';

export function createMenu({ game, sound, intro, root = document.body }) {
  const nav = document.createElement('nav');
  nav.id = 'menu';
  nav.innerHTML = `
    <button class="chip" data-act="sound" aria-pressed="false" title="Sound (M)">sound on</button>
    <button class="chip" data-act="restart" title="Start over">start over</button>
    <button class="chip" data-act="help" title="How to play">how to play</button>
  `;
  root.appendChild(nav);
  for (const type of ['pointerdown', 'pointerup', 'pointermove']) nav.addEventListener(type, (e) => e.stopPropagation());

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
