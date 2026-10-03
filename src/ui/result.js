/**
 * The verdict, when the plate goes up: stars, a mark out of a hundred, and a
 * line on each part of the dish. Remembers the best plate this browser has
 * served, when the browser lets it.
 */

const BEST = 'short-order:best';

function readBest() {
  try {
    return Number(localStorage.getItem(BEST)) || 0;
  } catch {
    return 0;
  }
}

function writeBest(total) {
  try {
    localStorage.setItem(BEST, String(total));
  } catch {
  }
}

export function createResult({ game, root = document.body }) {
  const panel = document.createElement('section');
  panel.id = 'result';
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
    const best = readBest();
    const record = report.total > best;
    if (record) writeBest(report.total);
    const stars = '★★★★★'.slice(0, report.stars) + '☆☆☆☆☆'.slice(0, 5 - report.stars);
    panel.innerHTML = `
      <header><span class="chip">order up</span><span class="chip">${record ? 'best yet' : `best ${Math.max(best, report.total)}`}</span></header>
      <p class="stars" aria-label="${report.stars} of 5 stars">${stars}</p>
      <p class="total"><b>${report.total}</b><span>/100</span></p>
      <p class="verdict">${report.verdict}</p>
      <ul>
        ${row('dice', 'dice', report.dice, report.notes.dice)}
        ${row('fry', 'fry', report.fry, report.notes.fry)}
        ${row('eggs', 'eggs', report.eggs, report.notes.eggs)}
        ${row('season', 'season', report.season, report.notes.season)}
        ${row('time', 'time', report.time, report.notes.time)}
      </ul>
      <button class="again" type="button">cook again</button>
    `;
    panel.querySelector('.again').addEventListener('click', () => {
      panel.hidden = true;
      game.reset();
    });
    panel.hidden = false;
    panel.querySelector('.again').focus({ preventScroll: true });
  }

  game.on((e) => {
    if (e.type === 'plated') show(e.report);
    if (e.type === 'reset') panel.hidden = true;
  });

  return { show, get open() { return !panel.hidden; } };
}
