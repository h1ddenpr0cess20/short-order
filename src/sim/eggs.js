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
 * scramble.
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

export function createBowl() {
  const state = { eggs: 0, mix: 0, yolks: [] };

  return {
    state,
    get eggs() { return state.eggs; },
    get mix() { return state.mix; },
    get volume() { return state.eggs * EGG_VOLUME; },

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
    },

    /** Empties the bowl: what came out, and how well beaten it was. */
    pour() {
      const out = { volume: state.eggs * EGG_VOLUME, mix: state.mix, eggs: state.eggs };
      state.eggs = 0;
      state.mix = 0;
      state.yolks = [];
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
  let torn = 0, tornSet = 0, tornYolk = 0, tornBrown = 0;
  let poured = 0;

  const index = (x, z) => {
    const i = Math.floor((x + FLAT) / size), j = Math.floor((z + FLAT) / size);
    if (i < 0 || j < 0 || i >= N || j >= N) return -1;
    return j * N + i;
  };

  /** Liquid egg landing at (x, z), spreading out from there; `yolky` is how much of it is yolk. */
  function pour(x, z, volume, yolky = 0.33) {
    const r = 1.1;
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
      /** Fresh liquid on top of setting egg dilutes how set the patch is. */
      set[k] = total > 0 ? (set[k] * amount[k]) / total : 0;
      amount[k] = total;
    }
    poured += volume;
  }

  /** One step: heat sets and browns it, and what still runs, runs. */
  function update(dt, temp) {
    for (let k = 0; k < cells; k++) {
      if (amount[k] <= 1e-5) continue;
      const i = k % N, j = Math.floor(k / N);
      const r = Math.hypot(-FLAT + (i + 0.5) * size, -FLAT + (j + 0.5) * size);
      const t = spread(temp, r, FLAT);
      /** A thin film sets at once; a deep puddle takes longer to set through. */
      const depth = Math.max(0.12, amount[k]);
      set[k] = Math.min(1.6, set[k] + (setting(t) / SET_TIME) * (0.14 / depth) ** 0.6 * dt);
      if (set[k] > 0.85) brown[k] += (browning(t) / BROWN_TIME) * dt;
    }

    /** Liquid levels out: each patch shares with its neighbours as far as both still run. */
    for (let pass = 0; pass < 2; pass++) {
      scratch.set(amount);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          if (!inside[k] || amount[k] <= 1e-5) continue;
          const runs = Math.max(0, 1 - set[k] / RUNS);
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
          }
        }
      }
      amount.set(scratch);
    }
  }

  /**
   * The spatula pushed from `a` to `b` through the egg, its blade `width`
   * across. Liquid is shoved along and stirred together; egg that has begun
   * to set comes away from the iron and gathers on the blade until there is
   * a curd's worth, which drops off.
   */
  function stir(a, b, width = 2.4, dt = 1 / 60) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return 0;
    /** Slow, patient strokes make big soft curds; a frantic spatula makes small ones. */
    const speed = len / Math.max(dt, 1e-3);
    const big = Math.max(0.5, Math.min(2.2, 9 / Math.max(3, speed)));
    const ux = dx / len, uz = dz / len;
    const reach = width / 2;
    let made = 0;
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

  /** How deep liquid egg is at a point on the floor — set egg does not count. */
  function liquidAt(x, z) {
    const k = index(x, z);
    if (k < 0 || set[k] >= RUNS) return 0;
    return amount[k];
  }

  /** The curds made since the last call, for the game to turn into pieces. */
  function takeCurds() {
    return curds.splice(0);
  }

  /** How much egg is on the floor as a sheet, and in what state, for the grade and the plate. */
  function summary() {
    let volume = 0, setSum = 0, brownSum = 0, yolkSum = 0, liquid = 0;
    for (let k = 0; k < cells; k++) {
      const v = amount[k] * size * size;
      if (v <= 0) continue;
      volume += v;
      setSum += set[k] * v;
      brownSum += brown[k] * v;
      yolkSum += yolk[k] * v;
      if (set[k] < RUNS) liquid += v;
    }
    return {
      volume,
      set: volume ? setSum / volume : 0,
      brown: volume ? brownSum / volume : 0,
      yolk: volume ? yolkSum / volume : 0,
      liquid,
    };
  }

  /** Lifts the whole sheet off the floor, in a few big pieces, for the plate. */
  function lift(pieces = 6) {
    const s = summary();
    const out = [];
    if (s.volume <= 0.05) return out;
    for (let n = 0; n < pieces; n++) {
      out.push({ x: (random() - 0.5) * 4, z: (random() - 0.5) * 4, volume: s.volume / pieces, set: s.set, yolk: s.yolk, brown: s.brown, sheet: true });
    }
    amount.fill(0);
    set.fill(0);
    brown.fill(0);
    return out;
  }

  function clear() {
    amount.fill(0);
    set.fill(0);
    yolk.fill(0);
    brown.fill(0);
    curds.length = 0;
    torn = tornSet = tornYolk = tornBrown = 0;
    poured = 0;
  }

  return {
    N, size, amount, set, yolk, brown, inside,
    pour, update, stir, toss, takeCurds, summary, lift, clear, liquidAt,
    get poured() { return poured; },
    get empty() { return summary().volume < 0.02; },
  };
}
