/**
 * The cook's conscience: a short line when something in the kitchen wants
 * attention that the cook may not have noticed. Read off the same state the
 * food is cooked from; one note at a time, held long enough to be read.
 */

import { FILLINGS, listed } from '../food/fillings.js';
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
  const tell = (line, seconds = 2.6) => {
    told = line;
    toldFor = seconds;
    check = 0;
  };
  /** The extras by name, said as they go on the board, since on a small screen they are small. */
  const extra = (kind) => {
    const what = FILLINGS[kind]?.whole ?? 'That';
    return `${what.charAt(0).toUpperCase()}${what.slice(1)} on the board — cut it small.`;
  };
  game.on((e) => {
    if (e.type === 'season-nothing') tell('Nothing to season yet — the food in the pan, or the eggs in the bowl.');
    else if (e.type === 'yolk-break') tell('A yolk broke.');
    else if (e.type === 'yolk-soft') tell(e.yolk ? 'Not yet — the white has to set before it will turn.' : 'Not yet — let it set before it will turn over.');
    else if (e.type === 'yolk-turn') tell('Over it goes.', 1.2);
    else if (e.type === 'extra') tell(extra(e.kind), 1.8);
    else if (e.type === 'trim') tell('The top, into the bin.', 1.6);
    else if (e.type === 'board-full') tell('No room on the board — clear it into the pan first.');
    else if (e.type === 'grate') tell('Grated onto the board.', 1.6);
    else if (e.type === 'slice') tell('Sliced onto the board.', 1.6);
    else if (e.type === 'bin') tell(e.whole ? 'Back on the counter.' : 'Into the bin.', 1.6);
    else if (e.type === 'putback' && e.grater) tell('Only cheese and potato go through the grater.');
    else if (e.type === 'putback' && e.full !== undefined) tell('That ramekin is full — the rest went back.');
    else if (e.type === 'putback' && e.ramekin !== undefined) {
      tell(e.holds ? `That ramekin has the ${FILLINGS[e.holds]?.name ?? e.holds} in it — one thing to a ramekin.` : 'One thing to a ramekin — take them over one at a time.');
    }
    else if (e.type === 'scrape' && game.pan.pieces.some((p) => p.whole)) tell('In whole — it wanted cutting first.');
    else if (e.type === 'fold') tell(e.liquid > 0.45 ? 'Folded with a lot still running — it will want a moment.' : e.shape === 'roll' ? 'Rolled.' : 'Folded.', 1.8);
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
    if (game.dish.style === 'french' && !game.sheet.empty && t > 180) return 'Gentle — a French omelette takes no colour.';
    const raw = pan.pieces.filter((p) => (p.kind === 'onion' || p.kind === 'pepper') && p.core < 0.3);
    /** Eggs beaten and waiting, over onion and pepper still raw: they want a minute first. */
    const eggsReady = game.eggs.bowl.eggs > 0 && game.eggs.bowl.mix > 0.6;
    if (raw.length > 4 && game.folds() && game.sheet.empty && !pan.pieces.some((p) => p.omelette) && pan.heat.level > 0 && eggsReady) return `Give the ${listed(raw.map((p) => p.kind))} a minute to soften before the eggs go in.`;
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
