/**
 * The cook's conscience: a short line when something in the kitchen wants
 * attention that the cook may not have noticed. Read off the same state the
 * food is cooked from; one note at a time, held long enough to be read.
 */

import { fryReport } from '../game/grade.js';

const HOLD = 2.5;

export function createNotes({ game, root = document.body }) {
  const note = document.createElement('p');
  note.id = 'note';
  note.setAttribute('role', 'status');
  note.hidden = true;
  root.appendChild(note);

  let shown = null, since = 0, check = 0;
  /** A note the cook asked for by doing something that did nothing, held for a moment. */
  let told = null, toldFor = 0;
  game.on((e) => {
    if (e.type === 'season-nothing') {
      told = 'Nothing to season yet — the food in the pan, or the eggs in the bowl.';
      toldFor = 2.6;
      check = 0;
    }
  });

  /** The most pressing thing, or nothing. In order of how much it is costing the dish. */
  function pressing() {
    const pan = game.pan;
    const t = pan.heat.temp;
    const potato = pan.pieces.filter((p) => p.kind === 'potato');
    const food = pan.pieces.length > 0 || !game.sheet.empty;
    if (game.plated) return null;
    if (food && t > 120) {
      const fry = potato.length ? fryReport(potato) : null;
      if (fry && fry.burnt > 0.08) return 'Something is catching — toss it, or turn it down.';
    }
    const butter = pan.butter;
    if (butter.burnt && butter.solids > 0.2) return 'The butter has burnt. That is bitter — start again, or live with it.';
    if (butter.solids > 0.2 && butter.brown > 1.05) return 'The butter is browning fast — turn it down.';
    if (t > 246) return 'Smoking hot. Turn it down.';
    if (!game.sheet.empty && t > 205) return 'That is hot for eggs — turn it down, they will brown.';
    if (food && pan.heat.level === 0 && t < 120) return 'The burner is off. Nothing is cooking.';
    if (potato.length && pan.oil < 0.12 && t > 130) return 'Dry pan — it is sticking. Oil it, or butter it.';
    if (potato.length && t < 140 && pan.heat.level > 0 && potato.some((p) => p.moisture > 0.8)) return 'The pan is not hot yet — the potato is steaming, not frying.';
    return null;
  }

  return {
    update(dt) {
      since += dt;
      check -= dt;
      toldFor -= dt;
      if (check > 0) return;
      check = 0.4;
      const want = toldFor > 0 ? told : pressing();
      if (want === shown) return;
      if (shown && since < HOLD) return;
      shown = want;
      since = 0;
      note.hidden = !want;
      if (want) {
        note.textContent = want;
        note.classList.remove('in');
        void note.offsetWidth;
        note.classList.add('in');
      }
    },
  };
}
