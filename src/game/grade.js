/**
 * How the plate went. Everything a cook would look at, measured off the food
 * itself: how evenly the potato was diced, how golden it got and whether it
 * cooked through, whether the eggs were beaten, scrambled and set soft.
 *
 * Plain numbers and plain data — the same functions mark the plate at the end
 * and keep the recipe card's running commentary while the cooking goes on.
 */

import { FILLINGS, PORTION, isFilling, listed } from '../food/fillings.js';
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
export function eggReport({ curds = [], sheet = null, beaten = 0, eggs = 0, buttered = false, want = 3 }) {
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
  const light = Math.max(0, (want - eggs) * 0.08);
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
  /**
   * The egg, and anything cooked in with it — salt on the onion before the
   * eggs went over it is still in the dish. Until there is egg, the extras are
   * cooking with the potato, and tasted with it: an onion is not the eggs.
   */
  const hasEgg = pieces.some((p) => p.kind === 'egg') || (sheet?.volume ?? 0) > 0;
  const withEgg = (p) => p.kind !== 'potato' && (hasEgg || !pieces.some((q) => q.kind === 'potato'));
  const potato = part(pieces.filter((p) => !withEgg(p)));
  const egg = part(pieces.filter(withEgg), hasEgg ? sheet : null);
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

/**
 * Quick is good, up to a point: inside `par` is full marks, and it falls to
 * half by two and a half times par. Four minutes is par for the scramble.
 */
export function timeReport(seconds, par = 240) {
  const score = seconds <= par ? 100 : Math.max(20, Math.round(100 - ((seconds - par) / (par * 1.5)) * 50));
  return { seconds, par, score };
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
  /** Rounded once, to the second, before it is split: 119.6 seconds is 2:00, not 1:60. */
  const whole = Math.round(t.seconds);
  const m = Math.floor(whole / 60), s = whole % 60;
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

// ------------------------------------------------------------ the other plates

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const pct = (v) => Math.round(100 * clamp01(v));

/**
 * Fried eggs, one report per egg as it came off the iron (see the sheet's
 * `fried()`), marked for the way the ticket asked for them: 'sunny' — never
 * turned, the yolk runny under a white set right up to it — or 'easy' — turned
 * once, briefly, the yolk still runny.
 */
export function friedReport(eggs, style = 'sunny', want = 2) {
  if (!eggs.length) return { eggs: 0, whites: { score: 0 }, yolks: { score: 0 }, set: 0, runnyWhite: 0, browned: 0, whole: 0, runny: 0, turned: 0 };
  const each = eggs.map((e) => {
    const w = e.white, y = e.yolk;
    /** Set through, not glassy; a lacy brown edge is fine, a brown egg is not. */
    const set = clamp01((w.set - 0.6) / 0.35) * (w.set > 1.45 ? 0.7 : 1);
    const runnyWhite = w.runny;
    const browned = clamp01((w.brown - 0.7) / 0.6);
    const whites = clamp01(set - 0.9 * runnyWhite - 0.45 * browned + 0.08 * clamp01(w.crisp * 3));
    /** A whole yolk, still runny — warm through but not set. */
    const runny = y.whole ? (y.set < 0.5 ? 1 : clamp01(1 - (y.set - 0.5) / 0.45)) : 0;
    /** Turned and turned back is still turned: its yolk has been face down on the iron. */
    const turned = style === 'easy' ? (y.flips > 0 ? 1 : 0) : (y.flips > 0 ? 0 : 1);
    const yolks = clamp01((y.whole ? 0.25 : 0) + 0.55 * runny + 0.2 * turned);
    return { set, runnyWhite, browned, whites, runny, whole: y.whole ? 1 : 0, turned, yolks };
  });
  const mean = (k) => each.reduce((a, e) => a + e[k], 0) / each.length;
  /** Two eggs is the order; one is half of it. */
  const short = Math.max(0, want - eggs.length) * 0.3;
  return {
    eggs: eggs.length, style,
    set: mean('set'), runnyWhite: mean('runnyWhite'), browned: mean('browned'), whole: mean('whole'), runny: mean('runny'), turned: mean('turned'),
    whites: { score: pct(mean('whites') - short) },
    yolks: { score: pct(mean('yolks') - short) },
  };
}

/**
 * An omelette, off the plate: the one folded piece, any egg torn off it as
 * curds before it was folded, and how it was beaten. 'french' wants it pale,
 * smooth and soft inside; 'american' wants it set through, golden at most.
 */
export function omeletteReport({ omelette = null, curds = [], beaten = 0, eggs = 0, style = 'french', buttered = false, want = 3 }) {
  if (!omelette) return { eggs, folded: false, omelette: { score: 0 }, colour: { score: 0 }, core: 0, brown: 0, torn: 0, beaten };
  const core = omelette.core;
  const brown = surfaceOf(omelette).mean;
  const curdVolume = curds.reduce((a, p) => a + p.volume, 0);
  const torn = curdVolume / (curdVolume + omelette.volume);
  const short = Math.max(0, want - eggs) * 0.1;
  let texture, colour;
  if (style === 'french') {
    /** Baveuse: just set, still soft in the middle — neither running out nor dry. */
    const soft = core < 0.6 ? clamp01(core / 0.6) * 0.4 : core <= 1.1 ? 1 : clamp01(1 - (core - 1.1) / 0.4);
    texture = 0.55 * soft + 0.25 * beaten + 0.2 * (1 - clamp01(torn * 3)) + (buttered ? 0.06 : 0);
    colour = brown < 0.25 ? 1 : clamp01(1 - (brown - 0.25) / 0.6);
  } else {
    const set = core < 0.85 ? clamp01(core / 0.85) * 0.6 : core <= 1.45 ? 1 : clamp01(1 - (core - 1.45) / 0.3);
    texture = 0.6 * set + 0.25 * beaten + 0.15 * (1 - clamp01(torn * 3));
    colour = brown <= 0.9 ? 1 : clamp01(1 - (brown - 0.9) / 0.6);
  }
  return {
    eggs, folded: true, style, core, brown, torn, beaten, buttered,
    omelette: { score: pct(texture - short) },
    colour: { score: pct(colour) },
  };
}

/** Which extras go with which dish, beyond what anyone would raise an eyebrow at. */
const SUITS = Object.freeze({
  hash: ['cheese', 'tomato', 'ham', 'pepper', 'onion', 'chives'],
  scramble: ['cheese', 'chives', 'tomato', 'ham'],
  fried: ['chives', 'cheese', 'tomato', 'ham'],
  french: ['chives', 'cheese'],
  american: ['cheese', 'tomato', 'ham', 'pepper', 'onion', 'chives'],
  free: ['cheese', 'tomato', 'ham', 'pepper', 'onion', 'chives'],
});

/**
 * The extras on the plate: what went in, how much, how small it was cut,
 * whether the ones that want cooking were cooked and the cheese melted, and —
 * for an omelette that wants filling — how much of it ended up folded inside.
 * `inside` is the bits folded in. Everything is weighed by volume: one whole
 * onion thrown in uncut is a lot of onion, not one bit of it.
 */
export function extrasReport(bits, { dish = 'hash', inside = [], wants = false } = {}) {
  const all = [...bits, ...inside];
  const count = {}, volume = {};
  for (const b of all) {
    count[b.kind] = (count[b.kind] ?? 0) + 1;
    volume[b.kind] = (volume[b.kind] ?? 0) + b.volume;
  }
  const kinds = Object.keys(count);
  if (!all.length) return { kinds, handfuls: 0, wants, score: wants ? 0 : null, inside: 0, melted: 0, raw: 0, burnt: 0, odd: 0, chunky: 0, whole: 0 };
  /** How much went in, in portions: one is what comes off the counter — a tomato, half an onion, a block of cheese. */
  const handfuls = kinds.reduce((a, k) => a + volume[k] / PORTION[k], 0);
  const raw = share(all.filter((b) => FILLINGS[b.kind].cooks), (b) => b.core < 0.45);
  const rawKinds = [...new Set(all.filter((b) => FILLINGS[b.kind].cooks && b.core < 0.45).map((b) => b.kind))];
  const cheese = all.filter((b) => b.kind === 'cheese');
  const melted = share(cheese, (b) => b.core >= 0.5);
  const burnt = share(all, (b) => Math.max(...b.brown) >= 1.6);
  /** Cut too big to eat in a mouthful — or not cut at all. */
  const chunky = share(all, (b) => Math.max(...dimensions(b)) > FILLINGS[b.kind].bite);
  const whole = share(all, (b) => b.whole === true);
  const heavy = clamp01((handfuls - 3) / 2);
  const suits = SUITS[dish] ?? SUITS.hash;
  const odd = kinds.filter((k) => !suits.includes(k)).length / kinds.length;
  const folded = share(all, (b) => inside.includes(b));
  let raw01;
  if (wants) {
    const others = kinds.filter((k) => k !== 'cheese').length;
    raw01 = (cheese.length ? 0.3 * (0.5 + 0.5 * melted) : 0) + (others ? 0.25 : 0) + 0.25 * folded + 0.1 * (1 - raw) + 0.1 * (1 - heavy) - 0.4 * burnt - 0.35 * chunky;
  } else {
    raw01 = 0.55 + 0.15 * (1 - raw) + 0.15 * (1 - heavy) + 0.15 * (cheese.length ? melted : 1) - 0.4 * odd - 0.4 * burnt - 0.35 * chunky;
  }
  return { kinds, count, handfuls, wants, inside: folded, melted, raw, rawKinds, burnt, heavy, odd, chunky, whole, score: pct(raw01) };
}

function extrasNote(r) {
  if (!r.kinds.length) return r.wants ? 'No filling — a diner omelette wants one.' : '';
  const what = listed(r.kinds);
  const cap = what.charAt(0).toUpperCase() + what.slice(1);
  if (r.burnt > 0.3) return `${cap}, scorched.`;
  if (r.whole > 0.5) return `${cap}, in whole. It wanted cutting first.`;
  if (r.wants && r.inside < 0.4) return `${cap} — mostly on the outside, not folded in.`;
  if (r.chunky > 0.4) return `${cap}, in big pieces. Cut it smaller.`;
  if (r.raw > 0.5) return `${cap}. The ${listed(r.rawKinds)} wanted cooking first.`;
  if (r.heavy > 0.3) return `${cap}, and a lot of it.`;
  if (r.odd > 0.4) return `${cap} — an odd thing to put on it.`;
  if (r.kinds.includes('cheese') && r.melted < 0.5) return `${cap}. The cheese never melted.`;
  return r.wants ? `${cap}, folded in.` : `${cap} — a good addition.`;
}

/** A part of the plate as the verdict lists it. */
const part = (key, label, score, note) => ({ key, label, score, note });

/**
 * The plate, marked for the dish that was ordered: `dish` from dishes.js,
 * the rest whatever the game kept of the cooking. Every dish comes back with
 * `parts` — label, score, note — a total, stars and a verdict.
 */
export function gradeDish(dish, data) {
  const { pieces = [], seconds = 0, burntButter = false } = data;
  const time = timeReport(seconds, dish.par);
  const parts = [];
  const add = (key, label, score, note, weight) => parts.push({ ...part(key, label, score, note), weight });

  if (dish.kind === 'hash') {
    const g = grade(data);
    add('dice', 'dice', g.dice.score, g.notes.dice, WEIGHTS.dice);
    add('fry', 'fry', g.fry.score, g.notes.fry, WEIGHTS.fry);
    add('eggs', 'eggs', g.eggs.score, g.notes.eggs, WEIGHTS.eggs);
    add('season', 'season', g.season.score, g.notes.season, WEIGHTS.season);
    add('time', 'time', g.time.score, g.notes.time, WEIGHTS.time);
    const extras = extrasReport(pieces.filter(isFilling), { dish: 'hash' });
    if (extras.score === null) return { ...g, dish: dish.id, parts };
    for (const p of parts) p.weight *= 0.9;
    add('extras', 'extras', extras.score, extrasNote(extras), 0.1);
    const total = Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0));
    /** The verdict is for the plate as marked, extras and all. */
    const potato = pieces.filter((p) => p.kind === 'potato').length;
    return { ...g, dish: dish.id, parts, extras, total, stars: stars(total), verdict: verdict({ dice: g.dice, fry: g.fry, egg: g.eggs, season: g.season, total, potato }) };
  }
  if (dish.kind === 'free') return gradeFree(data);

  const folded = pieces.filter((p) => p.omelette).flatMap((p) => p.inside ?? []);
  const season = seasonReport({ pieces: [...pieces, ...folded], sheet: data.sheet ?? null, burntButter });
  let verdictLine;
  if (dish.kind === 'scramble') {
    const curds = pieces.filter((p) => p.kind === 'egg');
    const eggs = eggReport({ curds, sheet: data.sheet ?? null, beaten: data.beaten ?? 0, eggs: data.eggs ?? 0, buttered: data.buttered });
    add('eggs', 'eggs', eggs.score, eggNote(eggs).replace('It was meant to be a scramble.', 'It was meant to be scrambled eggs.'), 0.65);
    verdictLine = (total) => (total >= 92 ? 'Soft as anything. Order up.' : total >= 78 ? 'Proper scrambled eggs.' : total >= 62 ? 'Scrambled eggs. Fine ones.' : eggs.eggs === 0 ? 'No eggs. Bold, for scrambled eggs.' : 'Eggs, technically. Lower and slower.');
  } else if (dish.kind === 'fried') {
    const r = friedReport(data.fried ?? [], dish.style);
    add('whites', 'whites', r.whites.score, whitesNote(r), 0.4);
    add('yolks', 'yolks', r.yolks.score, yolksNote(r, dish.style), 0.4);
    verdictLine = (total) => {
      if (r.eggs === 0) return 'No eggs. It was meant to be eggs.';
      if (total >= 92) return dish.style === 'easy' ? 'Over easy, done right.' : 'Sunny side up, done right.';
      if (total >= 78) return 'Two good eggs.';
      if (total >= 62) return 'Eggs, fried. Someone would eat them.';
      return r.whole < 0.5 ? 'Broken yolks. Gentler with the spatula.' : 'Eggs, technically. Mind the heat.';
    };
  } else {
    const omelette = pieces.find((p) => p.omelette) ?? null;
    const curds = pieces.filter((p) => p.kind === 'egg' && !p.omelette);
    const r = omeletteReport({ omelette, curds, beaten: data.beaten ?? 0, eggs: data.eggs ?? 0, style: dish.style, buttered: data.buttered });
    add('omelette', 'omelette', r.omelette.score, omeletteNote(r), dish.style === 'french' ? 0.45 : 0.4);
    add('colour', 'colour', r.colour.score, colourNote(r), dish.style === 'french' ? 0.25 : 0.15);
    if (dish.style === 'american') {
      const extras = extrasReport(pieces.filter(isFilling), { dish: 'american', inside: omelette?.inside ?? [], wants: true });
      add('fillings', 'filling', extras.score, extrasNote(extras), 0.2);
    }
    verdictLine = (total) => {
      if (!r.folded) return curds.length ? 'That is scrambled eggs. It was meant to be an omelette.' : 'No omelette on the plate.';
      if (total >= 92) return dish.style === 'french' ? 'Pale, soft, rolled. Escoffier would nod.' : 'A proper diner omelette.';
      if (total >= 78) return 'A good omelette.';
      if (total >= 62) return 'An omelette. Someone would eat it.';
      return 'Omelette, technically. Mind the heat.';
    };
  }
  /** Extras nobody asked for are marked too, when there are any: a tenth of the plate. */
  if (!parts.some((p) => p.key === 'fillings')) {
    const omelette = pieces.find((p) => p.omelette);
    const extras = extrasReport(pieces.filter(isFilling), { dish: dish.kind === 'omelette' ? dish.style : dish.kind, inside: omelette?.inside ?? [] });
    if (extras.score !== null) {
      for (const p of parts) p.weight *= 0.9;
      add('extras', 'extras', extras.score, extrasNote(extras), 0.1);
    }
  }
  const left = 1 - parts.reduce((a, p) => a + p.weight, 0);
  add('season', 'season', season.score, seasonNote(season).replace(/The potatoes are seasoned, the eggs are not\.|The eggs are seasoned, the potatoes are not\./, 'Unevenly seasoned.'), left * 0.6);
  add('time', 'time', time.score, timeNote(time), left * 0.4);
  const total = Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0));
  return { dish: dish.id, parts, season, time, total, stars: stars(total), verdict: verdictLine(total) };
}

/**
 * Freestyle: no ticket, so the plate is marked on whatever it turns out to
 * be. Every part of it that is there is marked the way the dish it belongs
 * to would mark it — potato diced and fried, eggs scrambled, fried or folded,
 * the extras, the seasoning — and weighed by how much of a plate it makes.
 * Nothing is short: one egg is as right as three. No clock, either.
 */
function gradeFree(data) {
  const { pieces = [], fried = [], burntButter = false, beaten = 0, eggs = 0, buttered = false, seconds = 0 } = data;
  const sheet = data.sheet ?? null;
  const parts = [];
  const add = (key, label, score, note, weight) => parts.push({ ...part(key, label, score, note), weight });
  const potato = pieces.filter((p) => p.kind === 'potato');
  const omelette = pieces.find((p) => p.omelette) ?? null;
  const folded = pieces.filter((p) => p.omelette).flatMap((p) => p.inside ?? []);
  const curds = pieces.filter((p) => p.kind === 'egg' && !p.omelette && !p.fried);

  if (potato.length) {
    const dice = diceReport(potato), fry = fryReport(potato);
    add('dice', 'dice', dice.score, diceNote(dice, potato.length), 0.16);
    add('fry', 'fry', fry.score, fryNote(fry, potato.length), 0.24);
  }
  if (fried.length) {
    /** Turned or not, whichever most of them were: that is how they were meant. */
    const style = fried.filter((e) => e.yolk.flips > 0).length * 2 > fried.length ? 'easy' : 'sunny';
    const r = friedReport(fried, style, fried.length);
    add('whites', 'whites', r.whites.score, whitesNote(r), 0.15);
    add('yolks', 'yolks', r.yolks.score, yolksNote(r, style), 0.15);
  }
  /** Egg left set flat and never folded is an open omelette, and marked as a diner one would be. */
  const flat = !omelette && !curds.length && sheet && sheet.volume > 0.5
    ? { core: sheet.set, volume: sheet.volume, area: new Float32Array(6).fill(1), brown: new Float32Array(6).fill(sheet.brown) }
    : null;
  if (omelette || flat) {
    const shape = omelette ?? flat;
    /** Pale and soft is a French one; anything else is marked as a diner one. */
    const style = surfaceOf(shape).mean < 0.25 && shape.core <= 1.2 ? 'french' : 'american';
    const r = omeletteReport({ omelette: shape, curds, beaten, eggs, style, buttered, want: 0 });
    const label = omelette ? 'omelette' : 'eggs';
    add(label, label, Math.round(0.7 * r.omelette.score + 0.3 * r.colour.score), omeletteNote(r), 0.3);
  } else if (curds.length || sheet) {
    const r = eggReport({ curds, sheet, beaten, eggs, buttered, want: 0 });
    add('eggs', 'eggs', r.score, eggNote(r), 0.3);
  }
  const extras = extrasReport(pieces.filter(isFilling), { dish: 'free', inside: folded });
  if (extras.score !== null) add('extras', 'extras', extras.score, extrasNote(extras), 0.12);
  const season = seasonReport({ pieces: [...pieces, ...folded], sheet, burntButter });
  if (parts.length) add('season', 'season', season.score, seasonNote(season), 0.12);
  else add('plate', 'plate', 0, 'Nothing on it.', 1);

  const weight = parts.reduce((a, p) => a + p.weight, 0);
  for (const p of parts) p.weight /= weight || 1;
  const total = Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0));
  let line;
  if (parts[0].key === 'plate') line = 'An empty plate. Bold.';
  else if (total >= 92) line = 'Order up. Whatever it was, that is the one.';
  else if (total >= 78) line = 'The regulars would ask for that by name.';
  else if (total >= 62) line = 'Solid. Someone would eat that happily.';
  else {
    const worst = [...parts].sort((a, b) => a.score - b.score)[0].key;
    const hint = { dice: 'Work on the knife.', fry: 'Watch the pan.', extras: 'Mind the extras.', season: 'Season it.' }[worst] ?? 'Mind the eggs.';
    line = `Breakfast, technically. ${hint}`;
  }
  /** Timed, for the ticket's clock to stop at, but not marked. */
  return { dish: 'free', parts, season, time: { seconds, par: null, score: null }, total, stars: stars(total), verdict: line };
}

function whitesNote(r) {
  if (r.eggs === 0) return 'No eggs.';
  if (r.runnyWhite > 0.25) return 'The whites are still glassy round the yolk.';
  if (r.browned > 0.5) return 'Brown and leathery underneath — too hot.';
  if (r.set < 0.6) return 'Underdone whites.';
  if (r.browned > 0.15) return 'Set, with crisp brown edges.';
  return 'Tender whites, set right through.';
}

function yolksNote(r, style) {
  if (r.eggs === 0) return 'No yolks.';
  if (r.whole < 1) {
    const broken = Math.round((1 - r.whole) * r.eggs);
    if (r.eggs === 1) return 'The yolk broke.';
    if (broken === r.eggs) return r.eggs === 2 ? 'Both yolks broken.' : 'Every yolk broken.';
    return broken === 1 ? 'One yolk broken.' : `${broken} yolks broken.`;
  }
  if (style === 'easy' && r.turned < 1) return 'Never turned — that is sunny side up.';
  if (style === 'sunny' && r.turned < 1) return 'Turned over — that is over easy.';
  if (r.runny < 0.5) return 'The yolks set hard.';
  if (r.runny < 0.9) return 'Jammy rather than runny.';
  return 'Whole and runny.';
}

function omeletteNote(r) {
  if (!r.folded) return 'Never folded.';
  if (r.torn > 0.3) return 'Broken up before it was folded.';
  if (r.style === 'french') {
    if (r.core < 0.6) return 'Raw in the middle.';
    if (r.core > 1.2) return 'Dry inside — it wanted to come off sooner.';
    if (r.beaten < 0.6) return 'Streaky — beat them longer.';
    return 'Soft and just set inside.';
  }
  if (r.core < 0.85) return 'Runny inside.';
  if (r.core > 1.5) return 'Rubbery.';
  if (r.beaten < 0.6) return 'Streaky — beat them longer.';
  return 'Set right through.';
}

function colourNote(r) {
  if (!r.folded) return '';
  if (r.style === 'french') {
    if (r.brown < 0.25) return 'Pale gold, no colour on it.';
    if (r.brown < 0.6) return 'Some colour — a French one has none.';
    return 'Brown. Gentler heat for a French omelette.';
  }
  if (r.brown < 0.3) return 'Pale.';
  if (r.brown <= 0.9) return 'Lightly golden.';
  return 'Brown and tough outside.';
}
