/**
 * Eggs, from the bowl to the pan.
 *
 * In the bowl they are a count and a measure of how well they have been
 * beaten: whites and yolks to begin with, one even yellow once whisked.
 *
 * In the pan they are a sheet — how much liquid egg lies on each patch of the
 * floor, how set it is, how much of it is yolk, how brown its underside has
 * gone — on a grid over the flat of the pan. Liquid runs downhill into the
 * patches round it; heat sets it from the bottom; a patch that has started to
 * set no longer runs. Drag the spatula through egg that is setting and it
 * comes away in curds, which are pieces like any other and fry like them;
 * leave it, and it sets into one flat sheet, which is an omelette, not a
 * scramble — and folded, it is one.
 *
 * An egg broken straight into the pan is its white, run into the sheet, and
 * its yolk, kept apart: a dome sitting on the white that sets far slower than
 * it does, cooked only from below, until it is broken — a spatula through
 * it — or turned face down onto the iron.
 */

import { FLAT } from '../scene/pan.js';
import { browning, setting, spread } from './heat.js';

/** One egg, out of its shell, in the pan's units: about 50 ml. */
export const EGG_VOLUME = 3.6;

/** Whisking a bowl of eggs smooth takes about this much travel of the whisk, per egg. */
const BEAT = 22;

/** How long a thin layer takes to set at 200°, and to brown underneath once it has. */
const SET_TIME = 9;
const BROWN_TIME = 22;

/** Below this much set the egg still runs; above it, a spatula tears it into curds. */
const RUNS = 0.32;

/** How much egg goes into one curd, roughly. */
const CURD = 0.16;

/** How much of an egg is yolk, by volume. */
export const YOLK_SHARE = 0.36;

/**
 * How long a yolk takes to set at 200°, sitting on its white: cooked through
 * the white from below, it takes minutes. Face down on the iron, a fraction.
 */
const YOLK_TIME = 150;
const FACE_DOWN = 5;

/** How far an egg's white reaches from its yolk, for telling one fried egg from the next. */
export const EGG_REACH = 3.2;

/** The white close round a yolk that has not been turned: deep, and slow to set on top. */
const NEAR_YOLK = 1.15;

export function createBowl() {
  const state = { eggs: 0, mix: 0, yolks: [], salt: 0, pepper: 0 };

  return {
    state,
    get eggs() { return state.eggs; },
    get mix() { return state.mix; },
    get volume() { return state.eggs * EGG_VOLUME; },
    get salt() { return state.salt; },
    get pepper() { return state.pepper; },

    /** Salt or pepper into the eggs, to go into the pan with them. */
    season(kind, amount) {
      if (state.eggs === 0) return 0;
      state[kind] += amount;
      return amount;
    },

    /** One egg in. Where its yolk lands is the view's business; it is kept here so it stays put. */
    crack(random = Math.random) {
      const a = random() * Math.PI * 2, r = 0.25 + random() * 0.7;
      state.eggs += 1;
      state.yolks.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
      /** A new egg is a new lump of white and yolk in whatever was beaten before. */
      state.mix *= (state.eggs - 1) / state.eggs;
      return state.eggs;
    },

    /** The whisk moved `distance` through the eggs. */
    whisk(distance) {
      if (state.eggs === 0) return state.mix;
      state.mix = Math.min(1, state.mix + distance / (BEAT * state.eggs));
      return state.mix;
    },

    clear() {
      state.eggs = 0;
      state.mix = 0;
      state.yolks = [];
      state.salt = state.pepper = 0;
    },

    /** Empties the bowl: what came out, how well beaten it was, and what it was seasoned with. */
    pour() {
      const out = { volume: state.eggs * EGG_VOLUME, mix: state.mix, eggs: state.eggs, salt: state.salt, pepper: state.pepper };
      state.eggs = 0;
      state.mix = 0;
      state.yolks = [];
      state.salt = state.pepper = 0;
      return out;
    },
  };
}

/**
 * The sheet of egg in the pan. `N` patches across the flat of the floor.
 * `spawn(curd)` is how curds leave the sheet: the game turns each into a piece.
 */
export function createSheet({ N = 40, random = Math.random } = {}) {
  const size = (FLAT * 2) / N;
  const cells = N * N;
  const amount = new Float32Array(cells);
  const set = new Float32Array(cells);
  const yolk = new Float32Array(cells);
  const brown = new Float32Array(cells);
  /** How much of a patch is thick white from an egg broken in whole, which barely runs. */
  const thick = new Float32Array(cells);
  /** Browning on the face that is up, which only an egg turned over has. */
  const top = new Float32Array(cells);
  const inside = new Uint8Array(cells);
  const scratch = new Float32Array(cells);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -FLAT + (i + 0.5) * size, z = -FLAT + (j + 0.5) * size;
      inside[j * N + i] = Math.hypot(x, z) < FLAT - size * 0.5 ? 1 : 0;
    }
  }

  /** Egg that has left the sheet as curds, waiting to be collected. */
  const curds = [];
  /** Yolks broken in whole: where each sits, how set it is, whether it is still whole and which way up. */
  const yolks = [];
  /** What happened to the yolks since the game last asked: 'break', 'flip' and 'tear'. */
  const events = [];
  /** Salt and pepper in the egg on the floor, all through it. */
  const seasoning = { salt: 0, pepper: 0 };
  /** The summary, until something changes the sheet: it is asked for many times a frame. */
  let summed = null;
  let torn = 0, tornSet = 0, tornYolk = 0, tornBrown = 0;
  let poured = 0;

  const index = (x, z) => {
    const i = Math.floor((x + FLAT) / size), j = Math.floor((z + FLAT) / size);
    if (i < 0 || j < 0 || i >= N || j >= N) return -1;
    return j * N + i;
  };

  /** Liquid egg landing at (x, z), spreading out from there; `yolky` is how much of it is yolk. */
  function pour(x, z, volume, yolky = 0.33, r = 1.1, viscous = 0) {
    summed = null;
    let weight = 0;
    const share = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (!inside[k]) continue;
        const cx = -FLAT + (i + 0.5) * size, cz = -FLAT + (j + 0.5) * size;
        const d = Math.hypot(cx - x, cz - z);
        if (d > r * 2) continue;
        const w = Math.exp(-(d * d) / (r * r));
        share.push([k, w]);
        weight += w;
      }
    }
    if (weight === 0) return;
    for (const [k, w] of share) {
      const add = (volume * w) / weight / (size * size);
      const total = amount[k] + add;
      yolk[k] = total > 0 ? (yolk[k] * amount[k] + yolky * add) / total : yolky;
      thick[k] = total > 0 ? (thick[k] * amount[k] + viscous * add) / total : viscous;
      /** Fresh liquid on top of setting egg dilutes how set the patch is. */
      set[k] = total > 0 ? (set[k] * amount[k]) / total : 0;
      amount[k] = total;
    }
    poured += volume;
  }

  /**
   * A whole egg broken in at (x, z): the white runs into the sheet round
   * where it lands, the yolk sits on it, whole.
   */
  function crack(x, z) {
    pour(x, z, EGG_VOLUME * (1 - YOLK_SHARE), 0.02, 1.3, 1);
    const yolk = { id: yolks.length, x, z, volume: EGG_VOLUME * YOLK_SHARE, set: 0, whole: true, flips: 0, down: 0 };
    yolks.push(yolk);
    return yolk;
  }

  /** The yolk turned face down, or back up. */
  const faceDown = (yolk) => yolk.flips % 2 === 1;

  /** The yolk broken: what is not yet set runs out into the sheet. */
  function breakYolk(yolk) {
    if (!yolk.whole) return;
    yolk.whole = false;
    pour(yolk.x, yolk.z, yolk.volume, 0.95, 0.7);
    events.push({ type: 'break', yolk });
  }

  /** How slowly the white at (x, z) sets on top: close round a whole yolk, still face up, it lags. */
  function lag(x, z) {
    for (const y of yolks) {
      if (!y.whole || faceDown(y)) continue;
      if (Math.hypot(x - y.x, z - y.z) < NEAR_YOLK) return 0.55;
    }
    return 1;
  }

  /** One step: heat sets and browns it, and what still runs, runs. */
  function update(dt, temp) {
    summed = null;
    for (let k = 0; k < cells; k++) {
      if (amount[k] <= 1e-5) continue;
      const i = k % N, j = Math.floor(k / N);
      const x = -FLAT + (i + 0.5) * size, z = -FLAT + (j + 0.5) * size;
      const r = Math.hypot(x, z);
      const t = spread(temp, r, FLAT);
      /** A thin film sets at once; a deep puddle takes longer to set through. */
      const depth = Math.max(0.12, amount[k]);
      const slow = yolks.length ? lag(x, z) : 1;
      set[k] = Math.min(1.6, set[k] + (setting(t) / SET_TIME) * (0.14 / depth) ** 0.6 * slow * dt);
      if (set[k] > 0.85) brown[k] += (browning(t) / BROWN_TIME) * dt;
    }

    /** Liquid levels out: each patch shares with its neighbours as far as both still run. */
    for (let pass = 0; pass < 2; pass++) {
      scratch.set(amount);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          if (!inside[k] || amount[k] <= 1e-5) continue;
          /** Thick white holds together round its yolk; beaten egg runs freely. */
          const runs = Math.max(0, 1 - set[k] / RUNS) * (1 - 0.85 * thick[k]);
          if (runs <= 0) continue;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di, nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
            const n = nj * N + ni;
            if (!inside[n]) continue;
            const diff = amount[k] - amount[n];
            if (diff <= 0) continue;
            const takes = Math.max(0, 1 - set[n] / RUNS) * 0.5 + 0.5;
            const flow = Math.min(diff * 0.2, diff * runs * takes * dt * 7);
            scratch[k] -= flow;
            scratch[n] += flow;
            const total = amount[n] + flow;
            yolk[n] = (yolk[n] * amount[n] + yolk[k] * flow) / total;
            set[n] = (set[n] * amount[n] + set[k] * flow) / total;
            thick[n] = (thick[n] * amount[n] + thick[k] * flow) / total;
          }
        }
      }
      amount.set(scratch);
    }

    /** The yolks: from below through the white, or straight off the iron once turned onto it. */
    for (const y of yolks) {
      if (!y.whole) continue;
      const t = spread(temp, Math.hypot(y.x, y.z), FLAT);
      const down = faceDown(y);
      if (down) y.down += dt;
      y.set = Math.min(1.6, y.set + (setting(t) / YOLK_TIME) * (down ? FACE_DOWN : 1) * dt);
    }
  }

  /**
   * The spatula pushed from `a` to `b` through the egg, its blade `width`
   * across. Liquid is shoved along and stirred together; egg that has begun
   * to set comes away from the iron and gathers on the blade until there is
   * a curd's worth, which drops off.
   */
  function stir(a, b, width = 2.4, dt = 1 / 60) {
    summed = null;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return 0;
    /** Slow, patient strokes make big soft curds; a frantic spatula makes small ones. */
    const speed = len / Math.max(dt, 1e-3);
    const big = Math.max(0.5, Math.min(2.2, 9 / Math.max(3, speed)));
    const ux = dx / len, uz = dz / len;
    const reach = width / 2;
    let made = 0;
    /** A blade through a whole yolk breaks it. */
    for (const y of yolks) {
      if (!y.whole) continue;
      const along = Math.max(0, Math.min(len, (y.x - a[0]) * ux + (y.z - a[1]) * uz));
      const near = Math.hypot(a[0] + ux * along - y.x, a[1] + uz * along - y.z);
      if (near < reach * 0.75) breakYolk(y);
    }
    const steps = Math.max(1, Math.ceil(len / (size * 0.7)));
    for (let s = 1; s <= steps; s++) {
      const px = a[0] + dx * (s / steps), pz = a[1] + dz * (s / steps);
      const i0 = Math.floor((px - reach + FLAT) / size), i1 = Math.floor((px + reach + FLAT) / size);
      const j0 = Math.floor((pz - reach + FLAT) / size), j1 = Math.floor((pz + reach + FLAT) / size);
      for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
          const k = j * N + i;
          if (!inside[k] || amount[k] <= 1e-4) continue;
          const cx = -FLAT + (i + 0.5) * size, cz = -FLAT + (j + 0.5) * size;
          /** Across the blade, not along it: the blade is a line, `reach` either side of the path. */
          const ox = cx - px, oz = cz - pz;
          const across = Math.abs(ox * uz - oz * ux);
          const along = ox * ux + oz * uz;
          if (across > reach || Math.abs(along) > size) continue;
          if (set[k] < RUNS) {
            /** Still liquid: pushed ahead of the blade, and mixed as it goes. */
            const ahead = index(cx + ux * size * 1.5, cz + uz * size * 1.5);
            if (ahead < 0 || !inside[ahead]) continue;
            const move = amount[k] * 0.35;
            const total = amount[ahead] + move;
            yolk[ahead] = (yolk[ahead] * amount[ahead] + yolk[k] * move) / total;
            set[ahead] = (set[ahead] * amount[ahead] + set[k] * move) / total;
            amount[ahead] = total;
            amount[k] -= move;
            const m = (yolk[k] + yolk[ahead]) / 2;
            yolk[k] += (m - yolk[k]) * 0.3;
            yolk[ahead] += (m - yolk[ahead]) * 0.3;
          } else {
            /** Setting: lifted off the iron onto the blade. */
            const take = amount[k] * size * size;
            torn += take;
            tornSet += set[k] * take;
            tornYolk += yolk[k] * take;
            tornBrown += brown[k] * take;
            amount[k] = 0;
            set[k] = 0;
            brown[k] = 0;
          }
        }
      }
      const want = CURD * big * (0.6 + random() * 0.8);
      while (torn >= want) {
        const share = want / torn;
        curds.push({
          x: px + ux * 0.6 + (random() - 0.5) * 0.5,
          z: pz + uz * 0.6 + (random() - 0.5) * 0.5,
          volume: want,
          set: tornSet / torn,
          yolk: tornYolk / torn,
          brown: tornBrown / torn,
        });
        tornSet -= tornSet * share;
        tornYolk -= tornYolk * share;
        tornBrown -= tornBrown * share;
        torn -= want;
        made += 1;
      }
    }
    return made;
  }

  /**
   * A toss: everything that has begun to set leaves the iron at once and
   * comes down in big folds, the way a sheet of egg breaks when the pan is
   * jerked up under it. Liquid stays where it is.
   */
  function toss() {
    summed = null;
    let made = 0;
    let gathered = 0, s = 0, y = 0, b = 0, cx = 0, cz = 0;
    const flush = () => {
      if (gathered <= 0) return;
      curds.push({ x: cx / gathered, z: cz / gathered, volume: gathered, set: s / gathered, yolk: y / gathered, brown: b / gathered });
      made += 1;
      gathered = s = y = b = cx = cz = 0;
    };
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (!inside[k] || set[k] < RUNS || amount[k] <= 1e-4) continue;
        const v = amount[k] * size * size;
        const x = -FLAT + (i + 0.5) * size, z = -FLAT + (j + 0.5) * size;
        gathered += v;
        s += set[k] * v;
        y += yolk[k] * v;
        b += brown[k] * v;
        cx += x * v;
        cz += z * v;
        amount[k] = set[k] = brown[k] = 0;
        if (gathered >= CURD * (1.6 + random() * 1.2)) flush();
      }
      /** A fold never spans more than a couple of rows of the floor. */
      if (j % 3 === 2) flush();
    }
    flush();
    return made;
  }

  /** The cells that are each yolk's egg: nearer that yolk than any other, and within reach of it. */
  function eggCells() {
    const owner = new Int16Array(cells).fill(-1);
    if (!yolks.length) return owner;
    for (let k = 0; k < cells; k++) {
      if (!inside[k] || amount[k] <= 1e-4) continue;
      const x = -FLAT + ((k % N) + 0.5) * size, z = -FLAT + (Math.floor(k / N) + 0.5) * size;
      let best = -1, near = EGG_REACH;
      for (const y of yolks) {
        const d = Math.hypot(x - y.x, z - y.z);
        if (d < near) { near = d; best = y.id; }
      }
      owner[k] = best;
    }
    return owner;
  }

  /**
   * Each egg broken in whole, as it is now: its white — how much, how set,
   * how much still runs, how brown on either face — and its yolk.
   */
  function fried() {
    const owner = eggCells();
    const out = yolks.map((y) => ({
      id: y.id, x: y.x, z: y.z,
      white: { volume: 0, set: 0, runny: 0, brown: 0, crisp: 0, radius: 0 },
      yolk: { whole: y.whole, set: y.set, flipped: faceDown(y), flips: y.flips, down: y.down, volume: y.volume },
    }));
    for (let k = 0; k < cells; k++) {
      const o = owner[k];
      if (o < 0) continue;
      const v = amount[k] * size * size;
      const w = out[o].white;
      const x = -FLAT + ((k % N) + 0.5) * size, z = -FLAT + (Math.floor(k / N) + 0.5) * size;
      w.volume += v;
      w.set += Math.min(1.6, set[k]) * v;
      w.brown += (brown[k] + top[k]) * v;
      if (set[k] < 0.8) w.runny += v;
      if (brown[k] + top[k] > 0.9) w.crisp += v;
      w.radius = Math.max(w.radius, Math.hypot(x - out[o].x, z - out[o].z) + size / 2);
    }
    for (const e of out) {
      const w = e.white;
      if (w.volume > 0) {
        w.set /= w.volume;
        w.brown /= w.volume;
        w.runny /= w.volume;
        w.crisp /= w.volume;
      }
    }
    return out;
  }

  /**
   * The spatula under the egg nearest (x, z), and over it goes. White that
   * has not set enough to hold together tears, and the yolk breaks with it.
   * Returns what happened: 'flip', 'tear', or null with no egg there.
   */
  function flipEgg(x, z) {
    let egg = null, near = 2.6;
    for (const y of yolks) {
      const d = Math.hypot(x - y.x, z - y.z);
      if (d < near) { near = d; egg = y; }
    }
    return egg ? turnOver(egg, eggCells()) : null;
  }

  /** Every egg in the pan over at once: what a toss does to fried eggs. */
  function flipAll() {
    const owner = eggCells();
    return yolks.map((y) => turnOver(y, owner));
  }

  function turnOver(egg, owner) {
    summed = null;
    let v = 0, s = 0;
    for (let k = 0; k < cells; k++) {
      if (owner[k] !== egg.id) continue;
      const w = amount[k];
      v += w;
      s += set[k] * w;
    }
    if (v <= 0) return null;
    if (s / v < RUNS * 1.25) {
      breakYolk(egg);
      events.push({ type: 'tear', yolk: egg });
      return 'tear';
    }
    /** The face that was down comes up, browned as it is; the one that was up goes down to the iron. */
    for (let k = 0; k < cells; k++) {
      if (owner[k] !== egg.id) continue;
      const b = brown[k];
      brown[k] = top[k];
      top[k] = b;
    }
    egg.flips += 1;
    events.push({ type: 'flip', yolk: egg });
    return 'flip';
  }

  /** The whole sheet off the floor at once, folded or rolled — an omelette — or null with too little to fold. */
  function fold() {
    const s = summary();
    if (s.volume < 1.2) return null;
    let b = 0;
    for (let k = 0; k < cells; k++) b += (brown[k] + top[k]) * amount[k] * size * size;
    const out = { volume: s.volume, set: s.set, yolk: s.yolk, brown: b / s.volume, liquid: s.liquid / s.volume, salt: seasoning.salt, pepper: seasoning.pepper };
    amount.fill(0);
    set.fill(0);
    brown.fill(0);
    top.fill(0);
    thick.fill(0);
    seasoning.salt = seasoning.pepper = 0;
    summed = null;
    return out;
  }

  /** Every egg broken in whole, lifted off the floor one by one, for the plate. */
  function liftFried() {
    const out = fried();
    const s = summary();
    for (const e of out) {
      const share = s.volume > 0 ? (e.white.volume + (e.yolk.whole ? e.yolk.volume : 0)) / (s.volume + yolks.reduce((a, y) => a + (y.whole ? y.volume : 0), 0)) : 0;
      e.salt = seasoning.salt * share;
      e.pepper = seasoning.pepper * share;
    }
    amount.fill(0);
    set.fill(0);
    brown.fill(0);
    top.fill(0);
    thick.fill(0);
    yolks.length = 0;
    seasoning.salt = seasoning.pepper = 0;
    summed = null;
    return out;
  }

  /** How deep the egg is at a point on the floor, set or not. */
  function depthAt(x, z) {
    const k = index(x, z);
    return k < 0 ? 0 : amount[k];
  }

  /** How deep liquid egg is at a point on the floor — set egg does not count. */
  function liquidAt(x, z) {
    const k = index(x, z);
    if (k < 0 || set[k] >= RUNS) return 0;
    return amount[k];
  }

  /**
   * The curds made since the last call, for the game to turn into pieces,
   * each with its share of whatever the egg was seasoned with.
   */
  function takeCurds() {
    const out = curds.splice(0);
    if (out.length) summed = null;
    if (out.length && (seasoning.salt > 0 || seasoning.pepper > 0)) {
      const gone = out.reduce((sum, c) => sum + c.volume, 0);
      const whole = summary().volume + gone;
      for (const kind of ['salt', 'pepper']) {
        const share = whole > 0 ? (seasoning[kind] * gone) / whole : 0;
        for (const c of out) c[kind] = gone > 0 ? (share * c.volume) / gone : 0;
        seasoning[kind] -= share;
      }
      summed = null;
    }
    return out;
  }

  /** How much of the floor the egg covers. */
  function area() {
    let n = 0;
    for (let k = 0; k < cells; k++) if (amount[k] > 0.002) n += 1;
    return n * size * size;
  }

  /** Salt or pepper onto the egg on the floor. */
  function season(kind, amount) {
    summed = null;
    seasoning[kind] += amount;
  }

  /** How much egg is on the floor as a sheet, and in what state, for the grade and the plate. */
  function summary() {
    if (summed) return summed;
    let volume = 0, setSum = 0, brownSum = 0, yolkSum = 0, liquid = 0;
    for (let k = 0; k < cells; k++) {
      const v = amount[k] * size * size;
      if (v <= 0) continue;
      volume += v;
      setSum += set[k] * v;
      brownSum += (brown[k] + top[k]) * v;
      yolkSum += yolk[k] * v;
      if (set[k] < RUNS) liquid += v;
    }
    summed = {
      volume,
      set: volume ? setSum / volume : 0,
      brown: volume ? brownSum / volume : 0,
      yolk: volume ? yolkSum / volume : 0,
      liquid,
      salt: seasoning.salt,
      pepper: seasoning.pepper,
    };
    return summed;
  }

  /** Lifts the whole sheet off the floor, in a few big pieces, for the plate. */
  function lift(pieces = 6) {
    summed = null;
    const s = summary();
    const out = [];
    if (s.volume <= 0.05) return out;
    for (let n = 0; n < pieces; n++) {
      out.push({
        x: (random() - 0.5) * 4, z: (random() - 0.5) * 4, volume: s.volume / pieces, set: s.set, yolk: s.yolk, brown: s.brown, sheet: true,
        salt: seasoning.salt / pieces, pepper: seasoning.pepper / pieces,
      });
    }
    seasoning.salt = seasoning.pepper = 0;
    summed = null;
    amount.fill(0);
    set.fill(0);
    brown.fill(0);
    top.fill(0);
    thick.fill(0);
    yolks.length = 0;
    return out;
  }

  function clear() {
    summed = null;
    amount.fill(0);
    set.fill(0);
    yolk.fill(0);
    brown.fill(0);
    top.fill(0);
    thick.fill(0);
    curds.length = 0;
    yolks.length = 0;
    events.length = 0;
    seasoning.salt = seasoning.pepper = 0;
    torn = tornSet = tornYolk = tornBrown = 0;
    poured = 0;
  }

  return {
    N, size, amount, set, yolk, brown, top, inside, yolks, events,
    pour, crack, update, stir, toss, takeCurds, summary, lift, clear, liquidAt, area, season,
    fried, flipEgg, flipAll, fold, liftFried, breakYolk, depthAt,
    get poured() { return poured; },
    get empty() { return summary().volume < 0.02; },
  };
}
