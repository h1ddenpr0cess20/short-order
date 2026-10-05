/**
 * The verdict, when the plate goes up: stars, a mark out of a hundred, and a
 * line on each part of the dish. Remembers the best plate this browser has
 * served, when the browser lets it.
 */

/** The best plate of each dish; the scramble keeps the key it has always had. */
const bestKey = (dish) => (!dish || dish === 'hash' ? 'short-order:best' : `short-order:best:${dish}`);

function readBest(dish) {
  try {
    return Number(localStorage.getItem(bestKey(dish))) || 0;
  } catch {
    return 0;
  }
}

function writeBest(dish, total) {
  try {
    localStorage.setItem(bestKey(dish), String(total));
  } catch {
  }
}

export function createResult({ game, onMenu = null, root = document.body }) {
  const panel = document.createElement('section');
  panel.id = 'result';
  panel.className = 'framed';
  panel.hidden = true;
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-label', 'How it went');
  root.appendChild(panel);
  for (const type of ['pointerdown', 'pointerup', 'pointermove']) panel.addEventListener(type, (e) => e.stopPropagation());

  const row = (name, label, part, note) => `
    <li data-part="${name}">
      <span class="label chip">${label}</span>
      <span class="score">${part.score}</span>
      <span class="note">${note}</span>
    </li>`;

  function show(report) {
    const best = readBest(report.dish);
    const record = report.total > best;
    if (record) writeBest(report.dish, report.total);
    const stars = '★★★★★'.slice(0, report.stars) + '☆☆☆☆☆'.slice(0, 5 - report.stars);
    panel.innerHTML = `
      <header><span class="chip"><i class="star" aria-hidden="true">★</i> order up</span><span class="chip">${record ? 'best yet' : `best ${Math.max(best, report.total)}`}</span></header>
      <p class="stars" aria-label="${report.stars} of 5 stars">${stars}</p>
      <p class="total"><b>${report.total}</b><span>/100</span></p>
      <p class="verdict">${report.verdict}</p>
      <ul>
        ${report.parts.map((p) => row(p.key, p.label, p, p.note)).join('')}
      </ul>
      <div class="next">
        <button class="again" type="button">cook again</button>
        ${onMenu ? '<button class="menu-again" type="button">new order</button>' : ''}
      </div>
    `;
    panel.querySelector('.menu-again')?.addEventListener('click', (event) => {
      event.currentTarget.blur();
      panel.hidden = true;
      onMenu();
    });
    panel.querySelector('.again').addEventListener('click', (event) => {
      /** Off the button before it goes, or the next enter would press it again and throw the next plate away. */
      event.currentTarget.blur();
      panel.hidden = true;
      game.reset();
    });
    panel.hidden = false;
    panel.querySelector('.again').focus({ preventScroll: true });
  }

  game.on((e) => {
    if (e.type === 'plated') show(e.report);
    if (e.type === 'reset') {
      if (panel.contains(document.activeElement)) document.activeElement.blur();
      panel.hidden = true;
    }
  });

  return {
    show,
    get open() { return !panel.hidden; },
    /** Where the verdict is, for the camera to keep the plate clear of it — once it has dropped in and is where it stays. */
    covers: () => (panel.getAnimations?.().some((a) => a.playState === 'running') ? [] : [panel.getBoundingClientRect()]),
  };
}
