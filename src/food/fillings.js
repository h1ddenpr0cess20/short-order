/**
 * The extras, whole, waiting on the counter to be cut: a block of cheddar, a
 * tomato, a thick slice of ham, a quarter of a green pepper, half an onion
 * and a bunch of chives. One goes onto the board at a time, where the knife
 * takes it to bits like the potato; scraped into the pan, the bits go over
 * the food as a topping, or onto the egg to be folded inside an omelette — and
 * from then on each is a piece like any other: it slides, it is tossed, it
 * cooks. Onion and pepper soften, ham crisps, cheese melts.
 *
 * Plain numbers, no GFX: each extra is one or more closed solids with their
 * colours, and a colour for the inside wherever a knife goes through.
 */

import { hex, mix } from './colour.js';
import { vnoise } from './noise.js';
import { vertexNormals } from './potato.js';
import { measure, solidFromBuffers, split } from '../geometry/slice.js';

/**
 * Each extra: its name, its key, the colour it reads as, what comes off the
 * counter (`whole`), how wet it is cut, and the longest side a bit of it can
 * have and still be cut small enough (`bite`). `cooks` is whether it wants to
 * be softened in the pan before it is eaten — raw onion is not a filling
 * anyone asked for.
 */
export const FILLINGS = Object.freeze({
  cheese: { name: 'cheese', key: '1', colour: hex(0xf2b33d), whole: 'a block of cheddar', moisture: 0.35, bite: 1.15, cooks: false, melts: true, grates: true },
  tomato: { name: 'tomato', key: '2', colour: hex(0xd8402a), whole: 'a tomato', moisture: 1, bite: 1.15, cooks: false },
  ham: { name: 'ham', key: '3', colour: hex(0xe39a95), whole: 'a slice of ham', moisture: 0.6, bite: 1.15, cooks: false },
  pepper: { name: 'pepper', key: '4', colour: hex(0x3f8a2e), whole: 'a quarter of green pepper', moisture: 0.8, bite: 1.15, cooks: true },
  onion: { name: 'onion', key: '5', colour: hex(0xf1ead8), whole: 'half an onion', moisture: 0.8, bite: 1.15, cooks: true },
  chives: { name: 'chives', key: '6', colour: hex(0x4f9a35), whole: 'a bunch of chives', moisture: 0.7, bite: 0.6, cooks: false },
});

export const FILLING_KINDS = Object.freeze(Object.keys(FILLINGS));

export const isFilling = (piece) => Boolean(FILLINGS[piece.kind]);

/** The extras named, in the order they sit on the counter: 'ham, cheese and pepper'. */
export function listed(kinds) {
  const names = FILLING_KINDS.filter((k) => kinds.includes(k)).map((k) => FILLINGS[k].name);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A little mottle, so a cut face is not one flat colour. */
const mottle = (c, x, y, z, amount = 0.05, scale = 5) => {
  const m = 1 + amount * vnoise(x * scale + 7.1, y * scale + 2.9, z * scale + 4.3);
  return [c[0] * m, c[1] * m, c[2] * m];
};

const CHEDDAR = hex(0xf2a93b);
const TOMATO = { skin: hex(0xd8341f), flesh: hex(0xe0503a), seeds: hex(0xe9b05a), calyx: hex(0x3d6b22) };
const HAM = { skin: hex(0xd98c86), flesh: hex(0xeba49c) };
const PEPPER = { skin: hex(0x2f7a22), inside: hex(0xa9c98a), flesh: hex(0xc8deae) };
const ONION = { skin: hex(0xefe3c4), vein: hex(0xd8c597), flesh: hex(0xf4efe1) };
const CHIVE = { skin: hex(0x3f8a2a), flesh: hex(0x8cc06c) };

/** What each looks like inside, wherever a knife goes through it. */
export const FILLING_FLESH = Object.freeze({
  cheese: (x, y, z) => mottle(hex(0xf5b54a), x, y, z, 0.04),
  /** Red wall and pale seed jelly, in patches: a tomato's inside, without knowing where its middle is. */
  tomato: (x, y, z) => mix(TOMATO.flesh, TOMATO.seeds, Math.max(0, vnoise(x * 3.3 + 1.1, y * 3.3 + 5.2, z * 3.3 + 8.4)) * 0.8),
  ham: (x, y, z) => mottle(HAM.flesh, x, y, z, 0.06, 9),
  pepper: (x, y, z) => mottle(PEPPER.flesh, x, y, z, 0.03),
  onion: (x, y, z) => mottle(ONION.flesh, x, y, z, 0.04, 11),
  chives: () => [...CHIVE.flesh],
});

/**
 * A mesh made of faces, each given with its outward normal: every face
 * keeps its own corners, so its edges stay sharp, and is wound outward
 * whichever way its corners were listed. The weld in `solidFromBuffers`
 * stitches the shared corners back into one closed skin.
 */
function faces() {
  const positions = [], normals = [], colours = [], index = [];
  const vertex = (p, n, c) => {
    positions.push(...p);
    normals.push(...n);
    colours.push(c);
    return positions.length / 3 - 1;
  };
  /** A triangle or a quad; `n` is one normal or one per corner, `c` one colour or one per corner. */
  function face(points, n, c) {
    const ns = Array.isArray(n[0]) ? n : points.map(() => n);
    const cs = Array.isArray(c[0]) ? c : points.map(() => c);
    const [a, b, d] = points;
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], f = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cross = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
    const avg = ns.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]);
    const order = cross[0] * avg[0] + cross[1] * avg[1] + cross[2] * avg[2] >= 0 ? points.map((_, i) => i) : points.map((_, i) => i).reverse();
    const ids = order.map((i) => vertex(points[i], ns[i], cs[i]));
    for (let k = 1; k + 1 < ids.length; k++) index.push(ids[0], ids[k], ids[k + 1]);
  }
  function solid() {
    return solidFromBuffers({
      positions: Float64Array.from(positions), normals: Float64Array.from(normals), index,
      colour: (_x, _y, _z, i) => colours[i],
    });
  }
  return { face, solid };
}

/** A box `[w, h, d]` standing on y = 0, centred over the origin, coloured by `colour(x, y, z)`. */
function box([w, h, d], colour) {
  const m = faces();
  const x = w / 2, z = d / 2;
  const quad = (pts, n) => m.face(pts, n, pts.map((p) => colour(...p)));
  quad([[x, 0, -z], [x, h, -z], [x, h, z], [x, 0, z]], [1, 0, 0]);
  quad([[-x, 0, z], [-x, h, z], [-x, h, -z], [-x, 0, -z]], [-1, 0, 0]);
  quad([[-x, h, -z], [-x, h, z], [x, h, z], [x, h, -z]], [0, 1, 0]);
  quad([[-x, 0, z], [-x, 0, -z], [x, 0, -z], [x, 0, z]], [0, -1, 0]);
  quad([[x, 0, z], [x, h, z], [-x, h, z], [-x, 0, z]], [0, 0, 1]);
  quad([[-x, 0, -z], [-x, h, -z], [x, h, -z], [x, 0, -z]], [0, 0, -1]);
  return m.solid();
}

/**
 * A round thing: a sphere with no seam, each pole one vertex, every direction
 * pushed out to `point(dir)` and painted `colour(dir)`.
 */
function round({ columns = 36, rows = 22, point, colour }) {
  const dirs = [[0, 1, 0]];
  for (let j = 1; j < rows; j++) {
    const theta = (j / rows) * Math.PI;
    for (let i = 0; i < columns; i++) {
      const phi = (i / columns) * Math.PI * 2;
      dirs.push([Math.sin(theta) * Math.cos(phi), Math.cos(theta), -Math.sin(theta) * Math.sin(phi)]);
    }
  }
  dirs.push([0, -1, 0]);
  const last = dirs.length - 1;
  const at = (i, j) => 1 + (j - 1) * columns + (i % columns);
  const index = [];
  for (let i = 0; i < columns; i++) index.push(0, at(i, 1), at(i + 1, 1));
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 0; i < columns; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      index.push(a, d, b, b, d, c);
    }
  }
  for (let i = 0; i < columns; i++) index.push(last, at(i + 1, rows - 1), at(i, rows - 1));
  const positions = new Float64Array(dirs.length * 3);
  dirs.forEach((d, i) => positions.set(point(d), i * 3));
  return solidFromBuffers({ positions, normals: vertexNormals(positions, index), index, colour: (_x, _y, _z, i) => colour(dirs[i]) });
}

/** A block of cheddar, longer front to back than across. */
function cheese() {
  return [box([1.9, 0.8, 1.4], (x, y, z) => mottle(CHEDDAR, x, y, z, 0.05, 3))];
}

/** A round tomato, a little flattened, its ribs just showing, the green star of its calyx on top. */
function tomato() {
  const R = 0.95;
  return [round({
    point: ([x, y, z]) => {
      const rib = 1 + 0.035 * Math.cos(5 * Math.atan2(z, x)) * (1 - Math.abs(y));
      return [x * R * rib, y * R * 0.84 + R * 0.84, z * R * rib];
    },
    colour: ([x, y, z]) => {
      const star = Math.cos(5 * Math.atan2(z, x));
      if (y > 0.96 || (y > 0.86 && star > 0.3)) return [...TOMATO.calyx];
      return mottle(TOMATO.skin, x, y, z, 0.06, 4);
    },
  })];
}

/** A thick slice off the ham, the rind a shade darker than the meat. */
function ham() {
  return [box([2.3, 0.28, 1.9], (x, y, z) => mottle(HAM.skin, x, y, z, 0.05, 7))];
}

/**
 * A quarter of a green pepper, skin down as it would be cut: a curved strip
 * of its wall, glossy green outside, paler inside, its length front to back.
 */
function pepper() {
  const R = 1.3, T = 0.13, A = 1.6, L = 2.0, S = 10;
  const m = faces();
  const ring = (r, k) => {
    const t = -Math.PI / 2 - A / 2 + (A * k) / S;
    return [Math.cos(t) * r, Math.sin(t) * r + R, Math.cos(t), Math.sin(t)];
  };
  for (let k = 0; k < S; k++) {
    const [ox0, oy0, cx0, sy0] = ring(R, k), [ox1, oy1, cx1, sy1] = ring(R, k + 1);
    const [ix0, iy0] = ring(R - T, k), [ix1, iy1] = ring(R - T, k + 1);
    /** The skin, outside, and the paler wall inside. */
    m.face([[ox0, oy0, -L / 2], [ox1, oy1, -L / 2], [ox1, oy1, L / 2], [ox0, oy0, L / 2]],
      [[cx0, sy0, 0], [cx1, sy1, 0], [cx1, sy1, 0], [cx0, sy0, 0]], PEPPER.skin);
    m.face([[ix0, iy0, -L / 2], [ix1, iy1, -L / 2], [ix1, iy1, L / 2], [ix0, iy0, L / 2]],
      [[-cx0, -sy0, 0], [-cx1, -sy1, 0], [-cx1, -sy1, 0], [-cx0, -sy0, 0]], PEPPER.inside);
    /** The two ends, where it was cut from the rest of the pepper. */
    for (const zz of [-L / 2, L / 2]) {
      m.face([[ox0, oy0, zz], [ox1, oy1, zz], [ix1, iy1, zz], [ix0, iy0, zz]], [0, 0, Math.sign(zz)], PEPPER.flesh);
    }
  }
  /** The two long edges, where it was cut from the next quarter. */
  for (const [k, way] of [[0, -1], [S, 1]]) {
    const [ox, oy, c, s] = ring(R, k), [ix, iy] = ring(R - T, k);
    m.face([[ox, oy, -L / 2], [ox, oy, L / 2], [ix, iy, L / 2], [ix, iy, -L / 2]], [-s * way, c * way, 0], PEPPER.flesh);
  }
  return [m.solid()];
}

/**
 * Half an onion, peeled, lying on its cut face with its root to the back and
 * its tip to the front: a whole one, its poles front to back, halved through
 * them with the same cut the knife makes.
 */
function onion() {
  const R = 1.12;
  const whole = round({
    point: ([x, y, z]) => {
      /** The pole along z: a little pointed at the tip, blunt at the root. */
      const along = y;
      const tip = 1 + 0.18 * Math.max(0, along) ** 3;
      return [x * R, -z * R * 0.95, along * R * tip];
    },
    colour: ([x, y, z]) => {
      /** Faint lines running root to tip, the way the layers show through. */
      const streak = 0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 26);
      return mix(ONION.skin, ONION.vein, streak * 0.35 * (1 - Math.abs(y)));
    },
  });
  const { front } = split(whole, { normal: [0, 1, 0], offset: 0 }, { flesh: FILLING_FLESH.onion });
  return front;
}

/** A bunch of chives, six stalks side by side, lying front to back. */
function chives() {
  const r = 0.045, L = 3, S = 6;
  return Array.from({ length: 6 }, (_, n) => {
    const m = faces();
    const x0 = (n - 2.5) * 0.12, z0 = (n % 2) * 0.12 - 0.06;
    const at = (k) => {
      const t = (k / S) * Math.PI * 2;
      return [x0 + Math.cos(t) * r, r + Math.sin(t) * r, Math.cos(t), Math.sin(t)];
    };
    for (let k = 0; k < S; k++) {
      const [ax, ay, ac, as] = at(k), [bx, by, bc, bs] = at(k + 1);
      m.face([[ax, ay, z0 - L / 2], [bx, by, z0 - L / 2], [bx, by, z0 + L / 2], [ax, ay, z0 + L / 2]],
        [[ac, as, 0], [bc, bs, 0], [bc, bs, 0], [ac, as, 0]], CHIVE.skin);
      for (const zz of [z0 - L / 2, z0 + L / 2]) m.face([[x0, r, zz], [ax, ay, zz], [bx, by, zz]], [0, 0, Math.sign(zz - z0)], CHIVE.flesh);
    }
    return m.solid();
  });
}

const MAKE = { cheese, tomato, ham, pepper, onion, chives };

/**
 * Whether a bit of tomato is its top — the green of the calyx still on its
 * skin, and not much tomato with it: a trimming, for the bin, not the pan.
 */
export function isTrimming(piece) {
  if (piece.kind !== 'tomato' || piece.whole || piece.volume > PORTION.tomato * 0.3) return false;
  const { col, cap } = piece.solid;
  for (let t = 0; t < cap.length; t++) {
    if (cap[t]) continue;
    for (let k = 0; k < 3; k++) {
      const i = (t * 3 + k) * 3;
      if (col[i + 1] > col[i] * 1.5) return true;
    }
  }
  return false;
}

/**
 * What comes off the counter for `kind`: one solid, or several for a bunch of
 * chives, in the frame of where it is put down — lying on y = 0 round the
 * origin, its length front to back, so the knife cuts across it.
 */
export function wholeSolids(kind) {
  return MAKE[kind]();
}

/** A shred off the grater: a thin strip, about this thick and wide, and this long give or take. */
export const SHRED = Object.freeze({ thick: 0.13, wide: 0.2, long: 0.9, most: 90 });

/**
 * `volume` of `kind` through the grater: thin strips, as many as it makes —
 * up to `most` of them, thicker if there would be more — each lying flat at
 * the origin, its length along x, about `long` long. `random` gives each its
 * own length, and `flesh` their colour, for a kind that is not one of the
 * extras.
 */
export function shredSolids(kind, volume, random = Math.random, { flesh = FILLING_FLESH[kind] ?? (() => FILLINGS[kind].colour), most = SHRED.most, long = SHRED.long } = {}) {
  const one = SHRED.thick * SHRED.wide * long;
  const n = Math.max(3, Math.min(most, Math.round(volume / one)));
  const lengths = Array.from({ length: n }, () => long * (0.6 + 0.62 * random()));
  /** Thickened or thinned all alike so that, between them, the strips are all there was. */
  const k = Math.sqrt(volume / (SHRED.thick * SHRED.wide * lengths.reduce((a, b) => a + b, 0)));
  return lengths.map((l) => box([l, SHRED.thick * k, SHRED.wide * k], (x, y, z) => flesh(x, y, z)));
}

/**
 * How much one of each is, by volume: a portion. Twice that on a plate is
 * generous; four times is a lot.
 */
export const PORTION = Object.freeze(Object.fromEntries(FILLING_KINDS.map((kind) => [
  kind, wholeSolids(kind).reduce((sum, s) => sum + measure(s).volume, 0),
])));
