/**
 * What happens in the pan, in the pan's own frame: the middle of the cooking
 * surface is the origin, y is up, and the floor is level out to `FLAT` and
 * rolls up into the wall beyond it.
 *
 * Every piece in here is either lying on the floor or in the air. On the
 * floor it slides, slows, bumps the others and rides up the curve of the wall
 * and back down; it browns on whichever of its sides is down, at whatever the
 * iron is doing under it; and its middle cooks through at a rate that depends
 * on how thick it is. In the air — tossed, or flipped by the spatula, or just
 * dropped in off the board — it tumbles, and wherever it comes down it settles
 * onto the face nearest the floor. That is how a toss turns everything over,
 * and why a pan that is never tossed or stirred has potatoes golden on one
 * side and raw on five.
 */

import { COOK_RADIUS, FLAT, floorHeight, floorSlope } from '../scene/pan.js';
import { browning, cooking, createHeat, spread } from './heat.js';
import { SIDES, extents, sideWeights } from './piece.js';
import { axisAngle, conjugate, dot3, multiply, normalize, rotate, slerp } from './quat.js';

export const GRAVITY = 60;

/** How long it takes to brown a side golden, and to cook a dice-sized piece through, at 200°. */
export const BROWN_TIME = 13;
export const CORE_TIME = 32;

/** The thickness the core time is for; thicker takes longer, by more than the ratio. */
const DICE = 0.6;

/** Water cooks out of a piece over about this long, in a hot pan. */
const DRY_TIME = 40;

/** Sliding on dry iron stops quickly; on oil it carries. Per second. */
const FRICTION = { dry: 9, oiled: 3.6 };

/** How quickly a piece that has landed rocks onto its nearest face. */
const SETTLE_TIME = 0.09;

/** Pieces further out than this are over the edge of the pan. */
const OUT = COOK_RADIUS + 0.4;

/**
 * `liquid(x, z)`, if given, says how deep any liquid egg is on the floor there:
 * a piece sitting in it is held at the egg's temperature and barely browns.
 */
export function createPan({ random = Math.random, liquid = null } = {}) {
  const heat = createHeat();
  const pieces = [];
  const events = [];
  let oil = 0;
  let sizzle = 0;
  let steam = 0;
  let smoke = 0;
  let dropped = 0;
  let load = 0;

  const state = (piece) => {
    if (!piece.pan) {
      piece.pan = { vel: [0, 0, 0], air: false, spin: null, settle: null, stuck: 0, landed: 0 };
    }
    return piece.pan;
  };

  /** Half the piece's width across the floor, as it now lies: what it bumps others with. */
  function reach(piece) {
    const e = extents(piece);
    return ((e.max[0] - e.min[0]) + (e.max[2] - e.min[2])) * 0.25;
  }

  /** Where the floor is under a piece's middle, and how high its middle sits off it. */
  function rest(piece) {
    const e = extents(piece);
    const r = Math.hypot(piece.pos[0], piece.pos[2]);
    return floorHeight(Math.min(r, COOK_RADIUS)) - e.min[1];
  }

  /**
   * Turns a piece so that its side most nearly facing down faces straight
   * down, keeping which way round it is otherwise. Animated.
   */
  function settleOnto(piece, s) {
    const down = rotate(conjugate(piece.rot), [0, -1, 0]);
    let best = 0, score = -Infinity;
    SIDES.forEach((side, k) => {
      const d = dot3(side, down);
      if (d > score) {
        score = d;
        best = k;
      }
    });
    /** Where that side points now, in the pan, and the turn that takes it to straight down. */
    const now = rotate(piece.rot, SIDES[best]);
    const axis = [now[2], 0, -now[0]];
    const angle = Math.acos(Math.max(-1, Math.min(1, -now[1])));
    const fix = Math.hypot(axis[0], axis[2]) < 1e-6 ? [0, 0, 0, 1] : axisAngle(axis, angle);
    s.settle = { from: [...piece.rot], to: normalize(multiply(fix, piece.rot)), t: 0 };
  }

  /** Puts pieces in, wherever they are in the pan's frame, falling from wherever they are. */
  function add(list, { area = 0 } = {}) {
    for (const piece of list) {
      const s = state(piece);
      s.air = true;
      s.vel = s.vel ?? [0, 0, 0];
      s.spin = s.spin ?? { axis: [random() - 0.5, 0, random() - 0.5], rate: (random() - 0.5) * 6 };
      pieces.push(piece);
    }
    if (area) heat.shock(area);
    events.push({ type: 'add', count: list.length });
  }

  function remove(piece) {
    const i = pieces.indexOf(piece);
    if (i !== -1) pieces.splice(i, 1);
  }

  function land(piece, s) {
    s.air = false;
    s.spin = null;
    s.vel[1] = 0;
    s.vel[0] *= 0.45;
    s.vel[2] *= 0.45;
    s.landed = 0.25;
    settleOnto(piece, s);
  }

  /** Throws everything on the floor up in the air, tumbling, to come down on other faces. */
  function toss(strength = 0.6) {
    let n = 0;
    for (const piece of pieces) {
      const s = state(piece);
      if (s.air) continue;
      const up = 9 + 9 * strength + (random() - 0.5) * 3;
      s.vel = [
        (random() - 0.5) * (2.4 + 3 * strength) - piece.pos[0] * 0.12,
        up,
        (random() - 0.5) * (2.4 + 3 * strength) - piece.pos[2] * 0.12,
      ];
      const a = random() * Math.PI * 2;
      s.spin = { axis: [Math.cos(a), 0, Math.sin(a)], rate: (5 + random() * 8) * (random() < 0.5 ? -1 : 1) };
      s.air = true;
      s.settle = null;
      n += 1;
    }
    if (n) events.push({ type: 'toss', count: n, strength });
    return n;
  }

  /**
   * The spatula dragged from `a` to `b` across the floor (x and z), its blade
   * `width` wide. Whatever is in its way is shoved along with it, and some of
   * it rolls over onto the next face.
   */
  function stir(a, b, dt, width = 2.4) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return 0;
    const ux = dx / len, uz = dz / len;
    const speed = Math.min(30, len / Math.max(dt, 1e-3));
    let moved = 0;
    for (const piece of pieces) {
      const s = state(piece);
      if (s.air) continue;
      /** Distance from the piece to the blade's path. */
      const px = piece.pos[0] - a[0], pz = piece.pos[2] - a[1];
      const t = Math.max(0, Math.min(len, px * ux + pz * uz));
      const ox = px - ux * t, oz = pz - uz * t;
      if (Math.hypot(ox, oz) > width / 2 + reach(piece)) continue;
      s.vel[0] += (ux * speed - s.vel[0]) * 0.55;
      s.vel[2] += (uz * speed - s.vel[2]) * 0.55;
      moved += 1;
      if (!s.settle && random() < Math.min(0.9, len * 0.5)) {
        /** Rolled forward onto the side it was being pushed toward. */
        const roll = axisAngle([uz, 0, -ux], Math.PI / 2);
        s.settle = { from: [...piece.rot], to: normalize(multiply(roll, piece.rot)), t: 0 };
      }
    }
    if (moved) events.push({ type: 'stir', count: moved, speed });
    return moved;
  }

  /** Flicks over whatever is under the spatula at (x, z): a little hop, half a turn. */
  function flip(x, z, radius = 1.3) {
    let n = 0;
    for (const piece of pieces) {
      const s = state(piece);
      if (s.air || Math.hypot(piece.pos[0] - x, piece.pos[2] - z) > radius + reach(piece)) continue;
      const up = 7 + random() * 1.5;
      const air = (2 * up) / GRAVITY;
      const a = random() * Math.PI * 2;
      s.vel = [(random() - 0.5) * 0.8, up, (random() - 0.5) * 0.8];
      s.spin = { axis: [Math.cos(a), 0, Math.sin(a)], rate: (Math.PI / air) * (random() < 0.5 ? -1 : 1) };
      s.air = true;
      s.settle = null;
      n += 1;
    }
    if (n) events.push({ type: 'flip', count: n });
    return n;
  }

  /**
   * `shove` is how the pan itself is being accelerated across the grate, in
   * x and z. Food on the floor is only held by friction, so in the pan's own
   * frame it is pushed the other way — shake the pan and it slides.
   */
  function physics(dt, shove = null) {
    const friction = oil > 0.12 ? FRICTION.oiled : FRICTION.dry;
    const slip = oil > 0.12 ? 0.85 : 0.45;
    for (const piece of [...pieces]) {
      const s = state(piece);
      if (s.landed > 0) s.landed -= dt;
      if (shove && !s.air) {
        s.vel[0] -= shove[0] * slip * dt;
        s.vel[2] -= shove[1] * slip * dt;
      }

      if (s.air) {
        s.vel[1] -= GRAVITY * dt;
        piece.pos[0] += s.vel[0] * dt;
        piece.pos[1] += s.vel[1] * dt;
        piece.pos[2] += s.vel[2] * dt;
        if (s.spin && s.spin.rate) {
          piece.rot = normalize(multiply(axisAngle(s.spin.axis, s.spin.rate * dt), piece.rot));
        }
        const r = Math.hypot(piece.pos[0], piece.pos[2]);
        if (r > OUT + 1.5) {
          /** Over the rim and gone: on the stove, and in the bin. */
          if (piece.pos[1] < -3) {
            remove(piece);
            dropped += 1;
            events.push({ type: 'drop', piece });
          }
          continue;
        }
        if (s.vel[1] < 0 && piece.pos[1] <= rest(piece)) {
          if (r > OUT) continue;
          piece.pos[1] = rest(piece);
          land(piece, s);
          events.push({ type: 'land', piece, speed: -s.vel[1] });
        }
        continue;
      }

      if (s.settle) {
        s.settle.t = Math.min(1, s.settle.t + dt / SETTLE_TIME);
        piece.rot = slerp(s.settle.from, s.settle.to, s.settle.t);
        if (s.settle.t >= 1) {
          piece.rot = s.settle.to;
          s.settle = null;
        }
      }

      /** Sliding: friction slows it, and the curve of the wall pushes it back in. */
      const k = Math.exp(-friction * dt);
      s.vel[0] *= k;
      s.vel[2] *= k;
      const r = Math.hypot(piece.pos[0], piece.pos[2]);
      const rho = reach(piece);
      if (r > FLAT - rho * 0.5 && r > 1e-6) {
        const slope = floorSlope(r);
        const push = GRAVITY * Math.min(1.2, slope + (r - FLAT) * 0.4);
        s.vel[0] -= (piece.pos[0] / r) * push * dt;
        s.vel[2] -= (piece.pos[2] / r) * push * dt;
      }
      piece.pos[0] += s.vel[0] * dt;
      piece.pos[2] += s.vel[2] * dt;
      const limit = COOK_RADIUS - rho * 0.6;
      const r2 = Math.hypot(piece.pos[0], piece.pos[2]);
      if (r2 > limit) {
        const nx = piece.pos[0] / r2, nz = piece.pos[2] / r2;
        piece.pos[0] = nx * limit;
        piece.pos[2] = nz * limit;
        const vr = s.vel[0] * nx + s.vel[2] * nz;
        if (vr > 0) {
          s.vel[0] -= 1.3 * vr * nx;
          s.vel[2] -= 1.3 * vr * nz;
        }
      }
      piece.pos[1] = rest(piece);
    }
    collide();
  }

  /** Pieces on the floor keep out of each other: discs, pushed apart, a little bounce. */
  function collide() {
    const floor = pieces.filter((p) => !state(p).air);
    const cell = 1.2;
    const grid = new Map();
    const radii = new Map();
    for (const p of floor) {
      radii.set(p, reach(p));
      const key = `${Math.floor(p.pos[0] / cell)},${Math.floor(p.pos[2] / cell)}`;
      const list = grid.get(key);
      if (list) list.push(p);
      else grid.set(key, [p]);
    }
    for (const p of floor) {
      const gx = Math.floor(p.pos[0] / cell), gz = Math.floor(p.pos[2] / cell);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const list = grid.get(`${gx + i},${gz + j}`);
          if (!list) continue;
          for (const q of list) {
            if (q.id <= p.id) continue;
            const dx = q.pos[0] - p.pos[0], dz = q.pos[2] - p.pos[2];
            const d = Math.hypot(dx, dz);
            const min = (radii.get(p) + radii.get(q)) * 0.92;
            if (d >= min || d < 1e-6) continue;
            const nx = dx / d, nz = dz / d;
            const push = (min - d) / 2;
            p.pos[0] -= nx * push;
            p.pos[2] -= nz * push;
            q.pos[0] += nx * push;
            q.pos[2] += nz * push;
            const sp = state(p), sq = state(q);
            const rel = (sq.vel[0] - sp.vel[0]) * nx + (sq.vel[2] - sp.vel[2]) * nz;
            if (rel < 0) {
              const j2 = -rel * 0.6;
              sp.vel[0] -= nx * j2;
              sp.vel[2] -= nz * j2;
              sq.vel[0] += nx * j2;
              sq.vel[2] += nz * j2;
            }
          }
        }
      }
    }
  }

  /**
   * The cooking. A piece on the floor browns on the sides facing down, at the
   * heat of the iron under it, slowed while it is still wet; it dries; and its
   * middle comes up to done at a pace set by how thick it is.
   */
  function cook(dt) {
    let wet = 0, hiss = 0, vapour = 0, char = 0;
    const weights = new Float32Array(6);
    for (const piece of pieces) {
      const s = state(piece);
      if (s.air) continue;
      const r = Math.hypot(piece.pos[0], piece.pos[2]);
      const t = spread(heat.temp, r, FLAT);
      const e = extents(piece);
      const footprint = (e.max[0] - e.min[0]) * (e.max[2] - e.min[2]);
      const down = rotate(conjugate(piece.rot), [0, -1, 0]);
      sideWeights(down[0], down[1], down[2], weights);

      const dry = 1 - 0.55 * piece.moisture;
      const oiled = oil > 0.12 ? 1 : 0.8;
      const bathed = liquid ? Math.min(1, liquid(piece.pos[0], piece.pos[2]) / 0.06) : 0;
      const brown = (browning(t) / BROWN_TIME) * dry * oiled * (1 - 0.75 * bathed) * dt;
      for (let k = 0; k < 6; k++) {
        /** The face on the iron takes nearly all of it; the rest get a little through the oil. */
        piece.brown[k] += brown * (weights[k] ** 2 * 0.97 + 0.03);
      }

      const thick = Math.min(e.max[0] - e.min[0], e.max[1] - e.min[1], e.max[2] - e.min[2]);
      const pace = Math.min(2.5, (DICE / Math.max(0.15, thick)) ** 1.6);
      piece.core = Math.min(1.5, piece.core + (cooking(t) / CORE_TIME) * pace * dt);
      piece.moisture = Math.max(0, piece.moisture - (cooking(t) / DRY_TIME) * pace * dt);

      if (oil <= 0.12 && Math.hypot(s.vel[0], s.vel[2]) < 0.05) s.stuck += dt * browning(t);

      wet += footprint * piece.moisture;
      hiss += footprint * (0.25 + piece.moisture) * browning(t) * (oil > 0.12 ? 1.2 : 0.7);
      vapour += footprint * piece.moisture * cooking(t);
      char += footprint * Math.max(0, Math.max(...piece.brown) - 1.45) * browning(t);
    }
    load = wet;
    sizzle = Math.min(1, hiss / 14);
    steam = Math.min(1, vapour / 10);
    smoke = Math.min(1, char / 3 + Math.max(0, heat.temp - 240) / 40 * (oil > 0.12 ? 1 : 0.3));
    /** The food soaks the oil up: a whole potato's worth drinks a pour in a couple of minutes. */
    const volume = pieces.reduce((sum, p) => sum + p.volume, 0);
    oil = Math.max(0, oil - 0.0003 * volume * dt);
  }

  /**
   * Fixed small steps, so a slow frame does not let pieces tunnel. `extra` is
   * any other wet load on the floor — egg that has not set yet — and `shove`
   * the pan's own acceleration, if somebody is shaking it.
   */
  function update(dt, extra = 0, shove = null) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) physics(h, shove);
    heat.update(dt, load + extra);
    cook(dt);
  }

  function pour(amount = 0.6) {
    oil = Math.min(1.3, oil + amount);
    events.push({ type: 'oil', amount });
  }

  function takeAll() {
    const all = [...pieces];
    pieces.length = 0;
    return all;
  }

  /** Empty, unoiled and cold, the burner off. */
  function clear() {
    pieces.length = 0;
    events.length = 0;
    oil = 0;
    sizzle = steam = smoke = 0;
    dropped = 0;
    load = 0;
    heat.set(0);
    heat.state.temp = 22;
  }

  return {
    pieces, heat, events,
    add, remove, toss, stir, flip, update, pour, takeAll, clear,
    get oil() { return oil; },
    get sizzle() { return sizzle; },
    get steam() { return steam; },
    get smoke() { return smoke; },
    get dropped() { return dropped; },
    get airborne() { return pieces.some((p) => state(p).air); },
    state,
  };
}
