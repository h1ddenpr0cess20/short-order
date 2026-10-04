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

import { FILLINGS } from '../food/fillings.js';
import { COOK_RADIUS, FLAT, LIP_RADIUS, floorHeight, floorSlope } from '../scene/pan.js';
import { browning, cooking, createHeat, spread } from './heat.js';
import { SIDES, dimensions, extents, sideDown, sideWeights } from './piece.js';
import { axisAngle, conjugate, multiply, normalize, rotate, slerp } from './quat.js';

export const GRAVITY = 60;

/** How long it takes to brown a side golden, and to cook a dice-sized piece through, at 200°. */
export const BROWN_TIME = 17;

/**
 * How browning shares out round a piece: the face on the iron takes it all;
 * the faces standing up from it are half in the oil and take some (less on
 * dry iron); every face, even the top one, catches a trace.
 */
const IRON = 0.97;
const IN_OIL = { oiled: 0.2, dry: 0.06 };
const TRACE = 0.02;
export const CORE_TIME = 32;

/** The thickness the core time is for; thicker takes longer, by more than the ratio. */
const DICE = 0.6;

/** Water cooks out of a piece over about this long, in a hot pan. */
const DRY_TIME = 40;

/** Sliding on dry iron stops quickly; on oil it carries. Per second. */
const FRICTION = { dry: 9, oiled: 3.6 };

/**
 * And the drag that does not fade with speed, the way friction does not: a
 * piece let go of slows by this much a second, so it comes to a stop rather
 * than creeping on across the oil. Diced potato in a film of oil does not skate.
 */
const GRIP = { dry: 14, oiled: 6 };

/** How quickly a piece that has landed rocks onto its nearest face. */
const SETTLE_TIME = 0.09;

/**
 * Butter. A pat gives the pan about two thirds of a pour of oil's worth of
 * fat; it melts at a pace set by the iron's heat — seconds on a hot pan, not
 * at all on a cold one — foaming as its water cooks off. Its milk solids
 * brown from 140°, nutty at one, and past `BURNT` they are burnt. Egg or food
 * over the floor keeps them from the iron and they brown far slower.
 */
export const BUTTER = Object.freeze({ fat: 0.4, melt: 600, brownFrom: 140, brownTime: 14, burnt: 1.6 });

/**
 * Cheese does not cook, it melts: it starts to give well below anything
 * frying, and a bit of it on a hot pan runs in a few seconds. In liquid egg,
 * or folded inside an omelette, it only gets as hot as the egg does.
 */
export const MELT = Object.freeze({ from: 50, span: 60, time: 20, egg: 78 });
const melting = (t) => Math.max(0, (t - MELT.from) / MELT.span);
const melts = (piece) => Boolean(FILLINGS[piece.kind]?.melts);

/** Melted far enough that it slumps and sticks rather than tumbling over like a block. */
export const runny = (piece) => melts(piece) && piece.core > 0.5;

/** Pieces further out than this are over the edge of the pan. */
const OUT = COOK_RADIUS + 0.4;

/**
 * `liquid(x, z)`, if given, says how deep any liquid egg is on the floor there:
 * a piece sitting in it is held at the egg's temperature and barely browns.
 */
export function createPan({ random = Math.random, liquid = null, covered = null } = {}) {
  const heat = createHeat();
  const pieces = [];
  const events = [];
  let oil = 0;
  /** Pats still melting, where they sit; and of the fat in the pan, how much is butter, its milk solids and how brown. */
  const butter = { pats: [], fat: 0, solids: 0, brown: 0, foam: 0, burnt: false };
  let sizzle = 0;
  let steam = 0;
  let smoke = 0;
  let dropped = 0;
  let load = 0;

  const state = (piece) => {
    if (!piece.pan) {
      piece.pan = {
        vel: [0, 0, 0], air: false, spin: null, settle: null, stuck: 0, landed: 0,
        /** A shred lies a little over or under the ones it crosses: they tangle into a layer, not one sheet. */
        layer: piece.shred ? random() * Math.min(...dimensions(piece)) * 1.5 : 0,
      };
    }
    return piece.pan;
  };

  /**
   * Half the piece's width across the floor, as it now lies: what it bumps
   * others with. A shred is limp and thin: it only bumps with its width, and
   * shreds do not bump each other at all — they tangle together into a layer,
   * the way hash browns do, rather than shoving one another round the pan.
   */
  function reach(piece) {
    if (piece.shred) return dimensions(piece).sort((a, b) => a - b)[1] / 2;
    const e = extents(piece);
    return ((e.max[0] - e.min[0]) + (e.max[2] - e.min[2])) * 0.25;
  }

  /**
   * How a piece lies on the floor where it is: how high its middle sits, and
   * how far it leans. Out by the wall the floor under its outer edge is higher
   * than under its inner one, so it rests on both and tips in toward the
   * middle, rather than sinking its outer edge into the iron.
   */
  function lie(piece) {
    const e = extents(piece);
    const r = Math.hypot(piece.pos[0], piece.pos[2]);
    const rho = reach(piece);
    const inner = floorHeight(Math.max(0, r - rho));
    const outer = floorHeight(Math.min(r + rho, COOK_RADIUS));
    const angle = Math.atan2(outer - inner, 2 * rho);
    return { height: (inner + outer) / 2 - e.min[1] * Math.cos(angle), angle, r };
  }

  function rest(piece) {
    return lie(piece).height + state(piece).layer;
  }

  /**
   * A piece in the air that has run into the wall below the rim, or come down
   * on the rim, is put back where it clears the iron: inside the pan if it is
   * still more in than out, over the outside if not. Returns which way it went.
   */
  function offWall(piece, s) {
    const e = extents(piece);
    const r = Math.hypot(piece.pos[0], piece.pos[2]);
    const rho = reach(piece);
    if (r < 1e-6 || r + rho <= COOK_RADIUS || r - rho >= LIP_RADIUS) return 0;
    const bottom = piece.pos[1] + e.min[1];
    const clear = (x) => floorHeight(Math.min(x + rho, LIP_RADIUS)) <= bottom;
    if (clear(r)) return 0;
    const nx = piece.pos[0] / r, nz = piece.pos[2] / r;
    let to, way;
    if (r < LIP_RADIUS) {
      /** Back in: the furthest out it can be at this height without touching the wall. */
      let lo = COOK_RADIUS - rho, hi = r;
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2;
        if (clear(mid)) lo = mid;
        else hi = mid;
      }
      to = lo;
      way = -1;
    } else {
      to = LIP_RADIUS + rho;
      way = 1;
    }
    piece.pos[0] = nx * to;
    piece.pos[2] = nz * to;
    const vr = s.vel[0] * nx + s.vel[2] * nz;
    if (vr * way < 0) {
      s.vel[0] -= 1.45 * vr * nx;
      s.vel[2] -= 1.45 * vr * nz;
    }
    return way;
  }

  /**
   * Keeps a piece on the floor inside the wall — its whole footprint, not just
   * its middle — and sits it on the floor, leaning where the floor curves up.
   */
  function contain(piece, s) {
    const rho = reach(piece);
    const limit = COOK_RADIUS - rho;
    const r = Math.hypot(piece.pos[0], piece.pos[2]);
    if (r > limit && r > 1e-6) {
      const nx = piece.pos[0] / r, nz = piece.pos[2] / r;
      piece.pos[0] = nx * limit;
      piece.pos[2] = nz * limit;
      const vr = s.vel[0] * nx + s.vel[2] * nz;
      if (vr > 0) {
        s.vel[0] -= 1.3 * vr * nx;
        s.vel[2] -= 1.3 * vr * nz;
      }
    }
    const { height, angle, r: at } = lie(piece);
    piece.pos[1] = height;
    s.lean = angle > 0.01 && at > 1e-6 ? axisAngle([-piece.pos[2] / at, 0, piece.pos[0] / at], angle) : null;
  }

  /**
   * Turns a piece so that its side most nearly facing down — of those it can
   * lie on: a shred lands on its face, never stands on its end — faces
   * straight down, keeping which way round it is otherwise. Animated.
   */
  function settleOnto(piece, s) {
    const best = sideDown(piece);
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
    s.vel[0] *= 0.3;
    s.vel[2] *= 0.3;
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
      if (!s.settle && !runny(piece) && random() < Math.min(0.9, len * 0.5)) {
        /** Rolled forward onto the side it was being pushed toward — if it is a side it can lie on; a long strip is pushed along, not stood on its end. */
        const roll = normalize(multiply(axisAngle([uz, 0, -ux], Math.PI / 2), piece.rot));
        if (sideDown({ ...piece, rot: roll }, true) === sideDown({ ...piece, rot: roll })) {
          s.settle = { from: [...piece.rot], to: roll, t: 0 };
        }
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
    const grip = oil > 0.12 ? GRIP.oiled : GRIP.dry;
    const slip = oil > 0.12 ? 0.85 : 0.45;
    for (const piece of [...pieces]) {
      const s = state(piece);
      if (s.landed > 0) s.landed -= dt;
      if (shove && !s.air) {
        s.vel[0] -= shove[0] * slip * dt;
        s.vel[2] -= shove[1] * slip * dt;
      }

      if (s.air) {
        s.lean = null;
        s.vel[1] -= GRAVITY * dt;
        piece.pos[0] += s.vel[0] * dt;
        piece.pos[1] += s.vel[1] * dt;
        piece.pos[2] += s.vel[2] * dt;
        if (s.spin && s.spin.rate) {
          piece.rot = normalize(multiply(axisAngle(s.spin.axis, s.spin.rate * dt), piece.rot));
        }
        /** Below the rim the wall is in the way: it comes off it, back in toward the middle. */
        offWall(piece, s);
        const r = Math.hypot(piece.pos[0], piece.pos[2]);
        if (r - reach(piece) >= LIP_RADIUS) {
          /** Over the rim and gone: on the stove, and in the bin. */
          if (piece.pos[1] < -1) {
            remove(piece);
            dropped += 1;
            events.push({ type: 'drop', piece });
          }
          continue;
        }
        /** Coming down by the wall, it lands as soon as its outer edge meets the curve of the iron, not once its middle is down. */
        const rho = reach(piece);
        const edge = r + rho > FLAT && piece.pos[1] + extents(piece).min[1] <= floorHeight(Math.min(r + rho, COOK_RADIUS));
        if (s.vel[1] < 0 && (piece.pos[1] <= rest(piece) || edge)) {
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

      /**
       * Sliding: the curve of the wall pushes it back in, and friction slows
       * it — after the push, so a piece the slope is too gentle to move stays
       * where it is, rather than creeping down it forever.
       */
      const r = Math.hypot(piece.pos[0], piece.pos[2]);
      const rho = reach(piece);
      if (r > FLAT - rho * 0.5 && r > 1e-6) {
        const slope = floorSlope(r);
        const push = GRAVITY * Math.min(1.2, slope + (r - FLAT) * 0.4);
        s.vel[0] -= (piece.pos[0] / r) * push * dt;
        s.vel[2] -= (piece.pos[2] / r) * push * dt;
      }
      const speed = Math.hypot(s.vel[0], s.vel[2]);
      const k = speed > 0 ? Math.max(0, speed * Math.exp(-friction * dt) - grip * dt) / speed : 0;
      s.vel[0] *= k;
      s.vel[2] *= k;
      piece.pos[0] += s.vel[0] * dt;
      piece.pos[2] += s.vel[2] * dt;
      contain(piece, s);
    }
    collide();
    /** Bumping can push a piece out against the wall again: back inside, and down onto the floor. */
    for (const piece of pieces) {
      const s = state(piece);
      if (!s.air) contain(piece, s);
    }
  }

  /** Pieces on the floor keep out of each other: discs, pushed apart, a little bounce. */
  const grid = new Map();
  const radii = new Map();
  const CELL = 1.2;
  const cellKey = (gx, gz) => (gx + 512) * 1024 + (gz + 512);
  function collide() {
    for (const list of grid.values()) list.length = 0;
    radii.clear();
    const floor = [];
    for (const p of pieces) {
      if (state(p).air) continue;
      floor.push(p);
      radii.set(p, reach(p));
      const k = cellKey(Math.floor(p.pos[0] / CELL), Math.floor(p.pos[2] / CELL));
      const list = grid.get(k);
      if (list) list.push(p);
      else grid.set(k, [p]);
    }
    for (const p of floor) {
      const gx = Math.floor(p.pos[0] / CELL), gz = Math.floor(p.pos[2] / CELL);
      const rp = radii.get(p);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const list = grid.get(cellKey(gx + i, gz + j));
          if (!list) continue;
          for (let n = 0; n < list.length; n++) {
            const q = list[n];
            if (q.id <= p.id || (p.shred && q.shred)) continue;
            const dx = q.pos[0] - p.pos[0], dz = q.pos[2] - p.pos[2];
            const min = (rp + radii.get(q)) * 0.92;
            const d2 = dx * dx + dz * dz;
            if (d2 >= min * min || d2 < 1e-12) continue;
            const d = Math.sqrt(d2);
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
      /** What of it is on the iron: its box across, or, for something thin and curled — a shred, a strip — its own area. */
      const footprint = Math.min((e.max[0] - e.min[0]) * (e.max[2] - e.min[2]), piece.volume / Math.max(0.05, Math.min(...dimensions(piece))));
      const down = rotate(conjugate(piece.rot), [0, -1, 0]);
      sideWeights(down[0], down[1], down[2], weights);

      const dry = 1 - 0.55 * piece.moisture;
      const oiled = oil > 0.12 ? 1 : 0.8;
      const bathed = liquid ? Math.min(1, liquid(piece.pos[0], piece.pos[2]) / 0.06) : 0;
      const brown = (browning(t) / BROWN_TIME) * dry * oiled * (1 - 0.75 * bathed) * dt;
      const fry = oil > 0.12 ? IN_OIL.oiled : IN_OIL.dry;
      for (let k = 0; k < 6; k++) {
        /** How upright this face stands: one for a wall of the cube, none for its top or bottom. */
        const wall = 1 - down[k >> 1] ** 2;
        piece.brown[k] += brown * (weights[k] ** 2 * IRON + wall * fry + TRACE);
      }

      const thick = Math.min(e.max[0] - e.min[0], e.max[1] - e.min[1], e.max[2] - e.min[2]);
      const pace = Math.min(2.5, (DICE / Math.max(0.15, thick)) ** 1.6);
      if (melts(piece)) {
        const warm = t + (Math.min(t, MELT.egg) - t) * bathed;
        piece.core = Math.min(1.5, piece.core + (melting(warm) / MELT.time) * Math.sqrt(pace) * dt);
      } else piece.core = Math.min(1.5, piece.core + (cooking(t) / CORE_TIME) * pace * dt);
      /** Whatever is folded inside an omelette keeps warming with it. */
      for (const bit of piece.inside ?? []) {
        if (melts(bit)) bit.core = Math.min(1.5, bit.core + (melting(Math.min(t, MELT.egg)) / MELT.time) * 0.6 * dt);
      }
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
    melt(dt);
  }

  function pour(amount = 0.6) {
    oil = Math.min(1.3, oil + amount);
    events.push({ type: 'oil', amount });
  }

  /** A pat of butter dropped in at (x, z) on the floor. */
  function addButter(x = 0, z = 0) {
    butter.pats.push({ x, z, left: 1 });
    events.push({ type: 'butter' });
  }

  /** How much of the floor is under food or egg, 0 to 1. */
  function cover() {
    let area = covered ? covered() : 0;
    for (const p of pieces) {
      const e = extents(p);
      area += (e.max[0] - e.min[0]) * (e.max[2] - e.min[2]);
    }
    return Math.min(1, area / (Math.PI * COOK_RADIUS * COOK_RADIUS));
  }

  /** Butter melting, foaming, browning, burning. */
  function melt(dt) {
    const t = heat.temp;
    for (const pat of butter.pats) {
      const gone = Math.min(pat.left, (Math.max(0, t - 32) / BUTTER.melt) * dt);
      pat.left -= gone;
      oil = Math.min(1.6, oil + gone * BUTTER.fat);
      butter.fat += gone * BUTTER.fat;
      butter.solids += gone;
      butter.foam = Math.min(1.2, butter.foam + gone * 0.9);
    }
    for (let i = butter.pats.length - 1; i >= 0; i--) if (butter.pats[i].left <= 1e-3) butter.pats.splice(i, 1);
    /** The foam is water boiling off: it dies away the faster the hotter the iron, once the melting stops feeding it. */
    if (t > 100) butter.foam *= Math.exp(-dt * (t - 100) / 200);
    butter.fat = Math.min(butter.fat, oil);
    if (butter.solids > 0 && t > BUTTER.brownFrom) {
      const shielded = 1 - 0.75 * cover();
      butter.brown += (((t - BUTTER.brownFrom) / 45) ** 1.2 / BUTTER.brownTime) * shielded * dt;
      if (!butter.burnt && butter.brown >= BUTTER.burnt) {
        butter.burnt = true;
        events.push({ type: 'butter-burnt' });
      }
    }
    if (butter.burnt) smoke = Math.min(1, smoke + Math.min(1, butter.solids) * Math.min(0.6, (butter.brown - BUTTER.burnt + 0.4)));
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
    Object.assign(butter, { pats: [], fat: 0, solids: 0, brown: 0, foam: 0, burnt: false });
    sizzle = steam = smoke = 0;
    dropped = 0;
    load = 0;
    heat.set(0);
    heat.state.temp = 22;
  }

  return {
    pieces, heat, events,
    add, remove, toss, stir, flip, update, pour, addButter, takeAll, clear,
    /** The butter in the pan: pats still melting, its foam, how brown, whether burnt, and its share of the fat. */
    get butter() {
      return { pats: butter.pats, foam: butter.foam, brown: butter.brown, burnt: butter.burnt, solids: butter.solids, share: oil > 0 ? Math.min(1, butter.fat / oil) : 0 };
    },
    get oil() { return oil; },
    get sizzle() { return sizzle; },
    get steam() { return steam; },
    get smoke() { return smoke; },
    get dropped() { return dropped; },
    get airborne() { return pieces.some((p) => state(p).air); },
    state,
  };
}
