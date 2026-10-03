/**
 * How the plate went. Everything a cook would look at, measured off the food
 * itself: how evenly the potato was diced, how golden it got and whether it
 * cooked through, whether the eggs were beaten, scrambled and set soft.
 *
 * Plain numbers and plain data — the same functions mark the plate at the end
 * and keep the recipe card's running commentary while the cooking goes on.
 */

import { dimensions } from '../sim/piece.js';
import { ratio, taste } from '../sim/season.js';

/** What counts as a bite: no side shorter than a sliver, none longer than a mouthful. */
export const BITE = Object.freeze({ min: 0.24, max: 1.15 });

/** How the potato's surface did, area-weighted over its six sides. */
export function surfaceOf(piece) {
  let area = 0, sum = 0;
  for (let k = 0; k < 6; k++) {
    area += piece.area[k];
    sum += piece.area[k] * piece.brown[k];
  }
  const mean = area > 0 ? sum / area : 0;
  /** The worst side and the palest that are any real size: a burnt corner is a burnt piece, a raw face a raw-looking one. */
  let worst = 0, least = Infinity;
  for (let k = 0; k < 6; k++) {
    if (piece.area[k] <= area * 0.08) continue;
    worst = Math.max(worst, piece.brown[k]);
    least = Math.min(least, piece.brown[k]);
  }
  return { mean, worst, least: Number.isFinite(least) ? least : mean };
}

/** Golden is golden on every face: none still flesh-coloured, none burnt. */
export const GOLDEN = Object.freeze({ mean: [0.5, 1.5], least: 0.3, worst: 1.8 });

const share = (list, test) => {
  const total = list.reduce((s, p) => s + p.volume, 0);
  if (total <= 0) return 0;
  return list.filter(test).reduce((s, p) => s + p.volume, 0) / total;
};

/** How well it was cut: what share of the potato is a good bite, and how alike the bites are. */
export function diceReport(potato) {
  if (potato.length === 0) return { pieces: 0, bite: 0, even: 0, whole: 0, score: 0 };
  const bite = share(potato, (p) => {
    const d = dimensions(p);
    return Math.max(...d) <= BITE.max && Math.min(...d) >= BITE.min;
  });
  const whole = share(potato, (p) => Math.max(...dimensions(p)) > 2.2);
  /** Evenness: how little the bite-size pieces vary in size. */
  const sizes = potato.map((p) => Math.max(...dimensions(p))).filter((s) => s <= BITE.max);
  let even = 0;
  if (sizes.length > 1) {
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const sd = Math.sqrt(sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / sizes.length);
    even = Math.max(0, 1 - (sd / mean) * 1.6);
  }
  const score = Math.round(100 * Math.max(0, Math.min(1, 0.78 * bite + 0.22 * even)));
  return { pieces: potato.length, bite, even, whole, score };
}

/** How it fried: golden all over and cooked through, against pale, burnt and raw. */
export function fryReport(potato) {
  if (potato.length === 0) return { golden: 0, pale: 0, burnt: 0, sided: 0, raw: 0, crisp: 0, score: 0 };
  const look = new Map(potato.map((p) => [p, surfaceOf(p)]));
  const golden = share(potato, (p) => {
    const s = look.get(p);
    return s.mean >= GOLDEN.mean[0] && s.mean <= GOLDEN.mean[1] && s.least >= GOLDEN.least && s.worst < GOLDEN.worst && p.core >= 0.8;
  });
  const pale = share(potato, (p) => look.get(p).mean < GOLDEN.mean[0]);
  const burnt = share(potato, (p) => look.get(p).worst >= GOLDEN.worst || look.get(p).mean > GOLDEN.mean[1]);
  /** Brown enough overall but with a face never turned to the iron. */
  const sided = share(potato, (p) => {
    const s = look.get(p);
    return s.mean >= GOLDEN.mean[0] && s.least < GOLDEN.least && s.worst < GOLDEN.worst;
  });
  const raw = share(potato, (p) => p.core < 0.65);
  /** Crisp: how much of the surface is properly browned, not just touched. */
  const crisp = share(potato, (p) => look.get(p).mean >= 0.8);
  const score = Math.round(100 * Math.max(0, Math.min(1, golden + 0.15 * crisp - 0.6 * burnt - 0.35 * raw)));
  return { golden, pale, burnt, sided, raw, crisp, score };
}

/**
 * How the eggs came out. `curds` are the egg pieces; `sheet` is whatever was
 * left set flat on the floor — omelette, as far as a scramble is concerned.
 * `beaten` is how smooth they were whisked before they went in.
 */
export function eggReport({ curds = [], sheet = null, beaten = 0, eggs = 0, buttered = false }) {
  const sheetVolume = sheet?.volume ?? 0;
  const curdVolume = curds.reduce((s, p) => s + p.volume, 0);
  const total = curdVolume + sheetVolume;
  if (eggs === 0 || total <= 0.05) return { eggs, scrambled: 0, soft: 0, runny: 0, rubbery: 0, browned: 0, beaten, buttered, score: 0 };

  const weigh = (test) => {
    let v = curds.filter((p) => test(p.core, surfaceOf(p).mean)).reduce((s, p) => s + p.volume, 0);
    if (sheet && sheetVolume > 0 && test(sheet.set, sheet.brown)) v += sheetVolume;
    return v / total;
  };
  const scrambled = curdVolume / total;
  const soft = weigh((set, brown) => set >= 0.75 && set <= 1.32 && brown < 0.5);
  const runny = weigh((set) => set < 0.55);
  const rubbery = weigh((set) => set > 1.42);
  const browned = weigh((_set, brown) => brown >= 0.5);
  /** Three eggs to the potato is the dish; fewer is a potato hash with some egg in it. */
  const light = Math.max(0, (3 - eggs) * 0.08);
  /** Eggs scrambled in butter are richer for it. */
  const rich = buttered ? 0.07 : 0;
  const raw = 0.25 * beaten + 0.3 * scrambled + 0.45 * soft - 0.5 * runny - 0.25 * rubbery - 0.3 * browned - light + rich;
  return { eggs, scrambled, soft, runny, rubbery, browned, beaten, buttered, score: Math.round(100 * Math.max(0, Math.min(1, raw))) };
}

/**
 * How it is seasoned: salt and pepper on the potato and on the egg, each
 * against how much of it there is, so salting only the potatoes and not the
 * eggs shows. `sheet` is the egg left flat, with its own salt and pepper.
 * Burnt butter makes the whole plate bitter.
 */
export function seasonReport({ pieces, sheet = null, burntButter = false }) {
  const part = (list, extra = null) => {
    const volume = list.reduce((s, p) => s + p.volume, 0) + (extra?.volume ?? 0);
    const salt = list.reduce((s, p) => s + (p.salt ?? 0), 0) + (extra?.salt ?? 0);
    const pepper = list.reduce((s, p) => s + (p.pepper ?? 0), 0) + (extra?.pepper ?? 0);
    return { volume, salt: ratio('salt', salt, volume), pepper: ratio('pepper', pepper, volume) };
  };
  const potato = part(pieces.filter((p) => p.kind === 'potato'));
  const egg = part(pieces.filter((p) => p.kind === 'egg'), sheet);
  const volume = potato.volume + egg.volume;
  if (volume <= 0) return { salt: 0, pepper: 0, potato, egg, burntButter, score: 0 };
  /** Each part tasted on its own, then weighed by how much of the plate it is. */
  const weigh = (fn) => (potato.volume * fn(potato) + egg.volume * fn(egg)) / volume;
  const salted = weigh((p) => (p.volume > 0 ? taste('salt', p.salt) : 0));
  const peppered = weigh((p) => (p.volume > 0 ? taste('pepper', p.pepper) : 0));
  const raw = (0.72 * salted + 0.28 * peppered) * (burntButter ? 0.45 : 1);
  return {
    salt: weigh((p) => p.salt), pepper: weigh((p) => p.pepper), salted, peppered, potato, egg, burntButter,
    score: Math.round(100 * Math.max(0, Math.min(1, raw))),
  };
}

/** Quick is good, up to a point: four minutes is full marks, ten is half. */
export function timeReport(seconds) {
  const score = seconds <= 240 ? 100 : Math.max(20, Math.round(100 - ((seconds - 240) / 360) * 50));
  return { seconds, score };
}

export const WEIGHTS = Object.freeze({ dice: 0.22, fry: 0.3, eggs: 0.28, season: 0.1, time: 0.1 });

export function stars(total) {
  if (total >= 92) return 5;
  if (total >= 78) return 4;
  if (total >= 62) return 3;
  if (total >= 45) return 2;
  if (total >= 25) return 1;
  return 0;
}

/**
 * The whole plate. `pieces` is everything on it; the rest is what the pan and
 * the bowl remember. Returns every report, the total out of a hundred, the
 * stars, and a line for each part and for the plate as a whole.
 */
export function grade({ pieces, sheet = null, beaten = 0, eggs = 0, seconds = 0, buttered = false, burntButter = false }) {
  const potato = pieces.filter((p) => p.kind === 'potato');
  const curds = pieces.filter((p) => p.kind === 'egg');
  const dice = diceReport(potato);
  const fry = fryReport(potato);
  const egg = eggReport({ curds, sheet, beaten, eggs, buttered });
  const season = seasonReport({ pieces, sheet, burntButter });
  const time = timeReport(seconds);
  const total = Math.round(dice.score * WEIGHTS.dice + fry.score * WEIGHTS.fry + egg.score * WEIGHTS.eggs
    + season.score * WEIGHTS.season + time.score * WEIGHTS.time);
  const notes = {
    dice: diceNote(dice, potato.length),
    fry: fryNote(fry, potato.length),
    eggs: eggNote(egg),
    season: seasonNote(season),
    time: timeNote(time),
  };
  return {
    dice, fry, eggs: egg, season, time, total, stars: stars(total), notes,
    verdict: verdict({ dice, fry, egg, season, total, potato: potato.length }),
  };
}

function diceNote(d, n) {
  if (n === 0) return 'No potato on the plate.';
  if (d.whole > 0.4) return 'That is most of a potato, uncut.';
  if (d.bite >= 0.85 && d.even >= 0.6) return 'Neat, even dice.';
  if (d.bite >= 0.7) return 'Good dice, a few odd sizes.';
  if (d.bite >= 0.45) return 'Some big chunks in there.';
  return 'Hacked rather than diced.';
}

function fryNote(f, n) {
  if (n === 0) return 'Nothing fried.';
  if (f.burnt > 0.3) return 'Burnt in a lot of places.';
  if (f.raw > 0.3) return 'Raw in the middle — it needed longer.';
  if (f.golden >= 0.8) return f.crisp > 0.6 ? 'Golden and crisp all round.' : 'Golden all round.';
  if (f.pale > 0.4) return 'Pale. Hotter, or longer, and turn it more.';
  if (f.sided > 0.3) return 'Brown on one side, pale on the rest — toss it more.';
  if (f.burnt > 0.1) return 'Mostly golden, a few scorched.';
  return 'Patchy — some golden, some pale.';
}

function eggNote(e) {
  if (e.eggs === 0) return 'No eggs. It was meant to be a scramble.';
  if (e.runny > 0.35) return 'Still runny.';
  if (e.scrambled < 0.4) return 'That set flat — more omelette than scramble.';
  if (e.browned > 0.3) return 'The eggs browned. Lower heat for eggs.';
  if (e.rubbery > 0.3) return 'Rubbery: too long, too hot.';
  if (e.beaten < 0.6) return 'Streaky — beat them longer.';
  if (e.soft >= 0.75) return e.buttered ? 'Soft, buttery curds.' : 'Soft, glossy curds.';
  return 'Decent curds.';
}

function seasonNote(s) {
  if (s.burntButter) return 'Burnt butter — bitter. Butter wants a gentler heat.';
  const salt = (p) => (p.volume > 0 ? p.salt : null);
  const ps = salt(s.potato), es = salt(s.egg);
  if (s.salt === 0 && s.pepper === 0) return 'Not seasoned at all. Salt and pepper.';
  if (s.salt < 0.35) return 'Bland — it needed salt.';
  if (s.salt > 2) return 'Too salty.';
  if (ps !== null && es !== null && ps > 0.5 && es < 0.3) return 'The potatoes are seasoned, the eggs are not.';
  if (ps !== null && es !== null && es > 0.5 && ps < 0.3) return 'The eggs are seasoned, the potatoes are not.';
  if (s.salt < 0.65) return 'Could take a little more salt.';
  if (s.pepper > 4) return 'A lot of pepper.';
  if (s.pepper < 0.1) return 'Well salted. A twist of pepper would not hurt.';
  return 'Well seasoned.';
}

function timeNote(t) {
  const m = Math.floor(t.seconds / 60), s = Math.round(t.seconds % 60);
  const clock = `${m}:${String(s).padStart(2, '0')}`;
  if (t.score >= 100) return `${clock} — quick.`;
  if (t.score >= 75) return `${clock}.`;
  return `${clock} — the ticket was waiting.`;
}

function verdict({ dice, fry, egg, season, total, potato }) {
  if (potato === 0 && egg.eggs === 0) return 'An empty plate. Bold.';
  if (total >= 92) return 'Order up. That is the one.';
  if (total >= 78) return 'A proper diner scramble.';
  if (total >= 62) return 'Solid. Someone would eat that happily.';
  const worst = [['dice', dice.score], ['fry', fry.score], ['eggs', egg.score], ['season', season.score + 25]].sort((a, b) => a[1] - b[1])[0][0];
  if (worst === 'dice') return 'Breakfast, technically. Work on the knife.';
  if (worst === 'fry') return 'Breakfast, technically. Watch the pan.';
  if (worst === 'season') return 'Breakfast, technically. Season it.';
  return 'Breakfast, technically. Mind the eggs.';
}
