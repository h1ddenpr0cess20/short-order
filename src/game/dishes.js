/**
 * The menu: every dish the kitchen can be asked for, what is on the counter
 * for it, the steps on its ticket, and how each step is read off the food as
 * it cooks. Plain data and plain functions — the game measures, this says
 * what the measurements mean for the order on the rail.
 *
 * `kind` is how the plate is marked (see grade.js): 'hash' is the potato and
 * egg scramble, 'scramble' plain scrambled eggs, 'fried' eggs broken whole
 * into the pan, 'omelette' the sheet folded. `style` is the way it was asked
 * for. `par` is how many seconds count as quick for it.
 */

const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

/** Salt and pepper in words, from how they sit against right (1). */
export function saltWord(r) {
  if (r < 0.05) return 'no salt yet';
  if (r < 0.35) return 'needs salt';
  if (r < 0.65) return 'a little more salt';
  if (r <= 1.45) return 'salted right';
  if (r <= 2) return 'well salted';
  return 'too salty';
}
/** One part's salt, in a word or two: 'potatoes salted, eggs need salt'. */
function partSalt(r) {
  if (r < 0.05) return 'no salt';
  if (r < 0.65) return 'need salt';
  if (r <= 1.45) return 'salted';
  if (r <= 2) return 'well salted';
  return 'too salty';
}
function pepperWord(r) {
  if (r < 0.05) return 'no pepper';
  if (r < 0.35) return 'a little pepper';
  if (r <= 2.2) return 'peppered';
  return 'peppery';
}

/** Salt for the dish, or for each part when the potatoes and the eggs are not alike. */
function seasonWords(s) {
  const both = s.potato.volume > 0 && s.egg.volume > 0;
  const salt = both && partSalt(s.potato.salt) !== partSalt(s.egg.salt)
    ? `potatoes ${partSalt(s.potato.salt)}, eggs ${partSalt(s.egg.salt)}`
    : saltWord(s.salt);
  return `${salt} · ${pepperWord(s.pepper)}`;
}

/** The steps every dish shares the end of. */
const season = (empty) => ({
  id: 'season', what: 'Season it', short: 'season',
  read: (p) => ({
    how: p.season.score > 0 && p.butter.burnt ? 'the butter burnt — bitter' : !p.season.food ? empty : seasonWords(p.season),
    fill: p.season.salted * 0.72 + p.season.peppered * 0.28,
    done: p.season.done,
  }),
});
const plate = {
  id: 'plate', what: 'Plate it', short: 'plate',
  read: (p) => ({ how: p.plated ? 'served' : p.ready ? 'whenever it looks right' : '', done: p.plated }),
};
const whisk = {
  id: 'whisk', what: 'Whisk three eggs', short: 'whisk',
  read: (p) => ({
    how: p.whisk.eggs === 0 ? 'crack them into the bowl, beat them smooth' : `${Math.min(p.whisk.eggs, 9)} of 3 · ${pct(p.whisk.mix)} beaten`,
    fill: (Math.min(3, p.whisk.eggs) / 3) * 0.4 + p.whisk.mix * 0.6,
    done: p.whisk.done,
  }),
};
/** Fat in the pan, and the pan at the heat the dish wants, `lo` to `hi`. */
const fat = (what, lo, hi, butterFirst = false) => ({
  id: 'fat', what, short: 'heat',
  read: (p) => {
    const fatIn = p.butter.share > 0.15 || p.oil > 0.12;
    const t = p.temp;
    const how = !fatIn ? (butterFirst ? 'a pat of butter in' : 'oil or butter in')
      : t < lo ? `${Math.round(t)}° — let it heat` : t > hi ? `${Math.round(t)}° — too hot, turn it down` : `${Math.round(t)}° — ready`;
    return { how, fill: (fatIn ? 0.4 : 0) + 0.6 * Math.min(1, Math.max(0, (t - 22) / (lo - 22))), done: p.fatDone || (fatIn && t >= lo && t <= hi + 30) };
  },
});

export const DISHES = Object.freeze({
  hash: {
    id: 'hash', kind: 'hash', no: '01', par: 240, potato: true, crack: 'bowl',
    name: 'Potato & egg scramble', menu: 'Potato & egg scramble',
    tag: 'Golden dice, soft curds, one cast iron pan.',
    blurb: 'dice a potato, fry it golden, scramble three eggs through it',
    steps: [
      {
        id: 'dice', what: 'Dice the potato', short: 'dice',
        read: (p, words) => ({
          how: p.dice.pieces <= 1 ? 'rounds, then strips, turn, then cubes'
            : `${p.dice.pieces} pieces · ${pct(p.dice.bite)} bite-size${p.dice.next ? ` — ${words.advice(p.dice.next)}` : ''}`,
          fill: p.dice.bite / 0.7,
          done: p.dice.done,
        }),
      },
      {
        id: 'fry', what: 'Fry it golden', short: 'fry',
        read: (p) => ({
          how: p.fry.inPan === 0 ? 'oil a hot pan; toss to brown every side'
            : `${pct(p.fry.golden)} golden · ${pct(p.fry.cooked)} cooked through${p.fry.burnt > 0.05 ? ` · ${pct(p.fry.burnt)} burnt` : ''}`,
          fill: p.fry.golden / 0.7,
          done: p.fry.done,
        }),
      },
      whisk,
      {
        id: 'scramble', what: 'Scramble them in', short: 'scramble',
        read: (p) => ({
          how: p.scramble.poured === 0 ? 'pour over the potatoes, gentle heat, keep it moving'
            : `${pct(p.scramble.scrambled)} in curds · ${pct(p.scramble.soft)} set soft`,
          fill: p.scramble.poured ? Math.min(p.scramble.scrambled, p.scramble.soft) / 0.6 : 0,
          done: p.scramble.done,
        }),
      },
      season('salt and pepper: some on the potatoes, some in the eggs'),
      plate,
    ],
  },

  scramble: {
    id: 'scramble', kind: 'scramble', no: '02', par: 150, potato: false, crack: 'bowl',
    name: 'Soft scrambled eggs', menu: 'Scrambled eggs',
    tag: 'Butter, low heat, patience.',
    blurb: 'three eggs, beaten smooth, stirred slowly into soft curds',
    steps: [
      whisk,
      fat('Butter, gentle heat', 110, 175, true),
      {
        id: 'scramble', what: 'Scramble them', short: 'scramble',
        read: (p) => ({
          how: p.scramble.poured === 0 ? 'pour, then keep the spatula moving, slowly'
            : `${pct(p.scramble.scrambled)} in curds · ${pct(p.scramble.soft)} set soft`,
          fill: p.scramble.poured ? Math.min(p.scramble.scrambled, p.scramble.soft) / 0.6 : 0,
          done: p.scramble.done,
        }),
      },
      season('salt and pepper, in the bowl or over the pan'),
      plate,
    ],
  },

  sunny: {
    id: 'sunny', kind: 'fried', style: 'sunny', no: '03', par: 210, potato: false, crack: 'pan',
    name: 'Two eggs sunny side up', menu: 'Sunny side up',
    tag: 'Whites set, yolks gold and runny.',
    blurb: 'two eggs broken into the pan and left alone, yolks up',
    steps: [
      fat('Fat in a medium pan', 130, 195),
      {
        id: 'crack', what: 'Break in two eggs', short: 'crack',
        read: (p) => ({ how: p.fried.eggs === 0 ? 'tap the carton — they go straight in the pan' : `${Math.min(2, p.fried.eggs)} of 2`, fill: p.fried.eggs / 2, done: p.fried.eggs >= 2 }),
      },
      {
        id: 'set', what: 'Set the whites', short: 'whites',
        read: (p) => ({
          how: p.fried.eggs === 0 ? 'leave them be — no spatula through the yolks'
            : `${pct(1 - p.fried.runnyWhite)} of the white set${p.fried.broken ? ` · ${p.fried.broken} yolk broken` : ''}`,
          fill: p.fried.eggs ? 1 - p.fried.runnyWhite : 0,
          done: p.fried.eggs >= 2 && p.fried.runnyWhite < 0.1,
        }),
      },
      season('a pinch over each, once they are in'),
      plate,
    ],
  },

  easy: {
    id: 'easy', kind: 'fried', style: 'easy', no: '04', par: 210, potato: false, crack: 'pan',
    name: 'Two eggs over easy', menu: 'Over easy',
    tag: 'Turned once, quickly. The yolks still run.',
    blurb: 'two eggs fried, flipped for a moment, yolks still runny',
    steps: [
      fat('Fat in a medium pan', 130, 195),
      {
        id: 'crack', what: 'Break in two eggs', short: 'crack',
        read: (p) => ({ how: p.fried.eggs === 0 ? 'tap the carton — they go straight in the pan' : `${Math.min(2, p.fried.eggs)} of 2`, fill: p.fried.eggs / 2, done: p.fried.eggs >= 2 }),
      },
      {
        id: 'set', what: 'Set the whites', short: 'whites',
        read: (p) => ({
          how: p.fried.eggs === 0 ? 'let the whites set before you turn them' : `${pct(1 - p.fried.runnyWhite)} of the white set`,
          fill: p.fried.eggs ? 1 - p.fried.runnyWhite : 0,
          done: p.fried.eggs >= 2 && (p.fried.runnyWhite < 0.25 || p.fried.turned >= 2),
        }),
      },
      {
        id: 'turn', what: 'Turn them over', short: 'turn',
        read: (p, words) => ({
          how: p.fried.turned === 0 ? words.flip : `${p.fried.turned} of 2 turned${p.fried.broken ? ` · ${p.fried.broken} broken` : ''} — not for long`,
          fill: p.fried.turned / 2,
          done: p.fried.turned >= 2,
        }),
      },
      season('a pinch over each'),
      plate,
    ],
  },

  french: {
    id: 'french', kind: 'omelette', style: 'french', no: '05', par: 150, potato: false, crack: 'bowl', fold: 'roll',
    name: 'French omelette', menu: 'French omelette',
    tag: 'Pale, soft inside, rolled.',
    blurb: 'three eggs in butter, stirred, settled, rolled — no colour',
    steps: [
      whisk,
      fat('Butter, gentle heat', 110, 170, true),
      {
        id: 'set', what: 'Stir, then let it set', short: 'set',
        read: (p) => ({
          how: p.omelette.poured === 0 ? 'pour; stir while it runs, then leave it'
            : p.omelette.folded ? 'folded' : `${pct(1 - p.omelette.liquid)} set${p.omelette.brown > 0.3 ? ' · colouring underneath' : ''}`,
          fill: p.omelette.folded ? 1 : p.omelette.poured ? 1 - p.omelette.liquid : 0,
          done: p.omelette.folded || (p.omelette.poured > 0 && p.omelette.liquid < 0.35),
        }),
      },
      {
        id: 'fold', what: 'Roll it', short: 'roll',
        read: (p, words) => ({ how: p.omelette.folded ? 'rolled' : words.fold('roll it while the top is still wet'), done: p.omelette.folded }),
      },
      season('salt in the bowl, before it goes in'),
      plate,
    ],
  },

  american: {
    id: 'american', kind: 'omelette', style: 'american', no: '06', par: 200, potato: false, crack: 'bowl', fold: 'half',
    name: 'Diner omelette', menu: 'Diner omelette',
    tag: 'Cheese and your pick, folded in half.',
    blurb: 'three eggs set flat, filled with cheese and more, folded over',
    steps: [
      whisk,
      fat('Butter the pan', 130, 200, true),
      {
        id: 'set', what: 'Let it set', short: 'set',
        read: (p) => ({
          how: p.omelette.poured === 0 ? 'pour and leave it — lift an edge if you like'
            : p.omelette.folded ? 'folded' : `${pct(1 - p.omelette.liquid)} set`,
          fill: p.omelette.folded ? 1 : p.omelette.poured ? 1 - p.omelette.liquid : 0,
          done: p.omelette.folded || (p.omelette.poured > 0 && p.omelette.liquid < 0.1),
        }),
      },
      {
        id: 'fill', what: 'Fill it', short: 'fill',
        read: (p) => {
          const e = p.extras;
          const how = e.kinds.length === 0 ? 'cheese and one more, onto the egg, before it is folded'
            : `${e.kinds.join(', ')}${p.omelette.folded ? (e.inside ? ' — folded in' : ' — on the outside') : e.onEgg ? ' — on the egg' : ''}${e.cheese ? '' : ' · no cheese yet'}`;
          return { how, fill: Math.min(1, e.kinds.length / 2), done: e.cheese && e.kinds.length >= 2 && e.inside + e.onEgg >= 6 };
        },
      },
      {
        id: 'fold', what: 'Fold it in half', short: 'fold',
        read: (p, words) => ({ how: p.omelette.folded ? 'folded' : words.fold('fold it once the top has set'), done: p.omelette.folded }),
      },
      season('salt in the bowl, or over it'),
      plate,
    ],
  },
});

export const MENU = Object.freeze(['hash', 'scramble', 'sunny', 'easy', 'french', 'american']);

/** The ticket's lines for `dish`, read off the game's progress. `words` says how the moves are spelled on this screen. */
export function ticket(dish, progress, words) {
  return dish.steps.map((step) => ({ id: step.id, ...step.read(progress, words) }));
}
