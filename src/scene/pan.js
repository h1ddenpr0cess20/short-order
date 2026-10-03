/**
 * The pan: the cast iron skillet the debate was held in, now on a burner.
 *
 * Everything but the handle is turned out of one profile, revolved — a pan is
 * a solid of revolution, and drawing it as one is what gets the rolled rim to
 * read as metal folded over rather than a wall with a cap on it. The handle is
 * cast onto it as a distance field (see `cast.js`), fillet and all.
 *
 * Its origin is the middle of the cooking surface, so anything resting on the
 * flat of it sits at y = 0 in its frame. The food is simulated in that frame:
 * `FLAT` is how far out the floor is level, and `floorHeight` is where the
 * floor is anywhere out to the wall.
 */

import { cast } from './cast.js';

/** The inside of the pan at the top of the corner. The flare starts outside this. */
export const COOK_RADIUS = 5.5;

/** How wide the base rolls up into the wall. Corners of a pan are radii. */
const CORNER = 0.8;

/** The flat of the pan: level iron, out to where the base starts rolling up into the wall. */
export const FLAT = COOK_RADIUS - CORNER;

/** Inside of the rim, at the top of the flare. */
export const RIM_HEIGHT = 1.75;

/** How thick the iron is. Rim, wall and base are all cast in one piece. */
export const IRON = 0.34;

/** The outside of the rim. */
export const RIM_RADIUS = COOK_RADIUS + 0.85;

/**
 * A quarter-turn of profile, as points in the (radius, height) plane.
 *
 * The corners of a pan are radii, not creases — the base rolls into the wall
 * and the wall rolls over into the rim — and a cast body with a sharp corner in
 * it looks pressed out of sheet.
 */
function arc(cx, cy, r, from, to, steps = 8) {
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = from + ((to - from) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Where the base has finished rolling into the wall and the flare starts. */
const KNEE = -0.55;

/** The lip is a bead: a half-round the wall is folded over into. */
const BEAD = 0.28;
const LIP = { x: RIM_RADIUS - BEAD, y: RIM_HEIGHT - BEAD };

/** How far out the inside of the wall goes before the rim rolls over: past this is over the edge. */
export const LIP_RADIUS = LIP.x;

/** Inside: the base rolls up into the wall, and the wall flares to the lip. */
const INSIDE = [
  [0, 0],
  [FLAT, 0],
  ...arc(FLAT, CORNER, CORNER, -Math.PI / 2, KNEE),
  [LIP.x - BEAD * 0.2, LIP.y - 0.02],
];

/**
 * One contour, from the middle of the inside out and round the whole body:
 * base, corner, flare, over the rim, back down the outside, and in along the
 * underside to the middle again. Revolved, that is the pan.
 */
const PROFILE = Object.freeze([
  ...INSIDE,
  /** Over the top and back down the outside. */
  ...arc(LIP.x, LIP.y, BEAD, Math.PI, 0, 12),
  /** Outside: the same body, offset by however thick the iron is. */
  [FLAT + Math.cos(KNEE) * (CORNER + IRON), CORNER + Math.sin(KNEE) * (CORNER + IRON)],
  ...arc(FLAT, CORNER, CORNER + IRON, KNEE, -Math.PI / 2),
  [0, -IRON],
]);

/**
 * The space inside the pan, and everything above it: the base and the flare
 * as far as the inside of the bead, then straight up. Nothing cast onto the
 * outside may come through into it.
 */
const HOLLOW = Object.freeze([
  ...INSIDE,
  [LIP.x - BEAD, LIP.y],
  [LIP.x - BEAD, 40],
  [0, 40],
]);

/**
 * The seasoned surface: near black, worn paler in the middle where a pan gets
 * used, with the faint concentric rings a lathe-turned base is left with.
 */
function cookTexture(GFX) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#131211';
  ctx.fillRect(0, 0, 512, 512);

  const worn = ctx.createRadialGradient(256, 256, 10, 256, 256, 250);
  worn.addColorStop(0, 'rgba(96,84,70,0.34)');
  worn.addColorStop(0.45, 'rgba(62,55,47,0.2)');
  worn.addColorStop(1, 'rgba(20,19,18,0)');
  ctx.fillStyle = worn;
  ctx.fillRect(0, 0, 512, 512);

  ctx.lineWidth = 1;
  for (let r = 12; r < 250; r += 6) {
    ctx.strokeStyle = `rgba(198,182,160,${0.014 + (r % 18 === 0 ? 0.016 : 0)})`;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const map = new GFX.CanvasTexture(c);
  map.colorSpace = GFX.SRGBColorSpace;
  return map;
}

/**
 * Signed distance to a closed polygon, negative inside. Flat, x then y, since
 * the handle asks this a few hundred thousand times.
 */
function polygonDistance(flat, px, py) {
  let d = Infinity;
  let sign = 1;
  const n = flat.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = flat[i], ay = flat[i + 1];
    const ex = flat[j] - ax, ey = flat[j + 1] - ay;
    const wx = px - ax, wy = py - ay;
    const len2 = ex * ex + ey * ey;
    const t = len2 > 0 ? Math.min(1, Math.max(0, (wx * ex + wy * ey) / len2)) : 0;
    const dx = wx - ex * t, dy = wy - ey * t;
    d = Math.min(d, dx * dx + dy * dy);
    const up = py >= ay, down = py < flat[j + 1], left = ex * wy > ey * wx;
    if ((up && down && left) || (!up && !down && !left)) sign = -sign;
  }
  return sign * Math.sqrt(d);
}

/** A smooth minimum: the union of two solids, with a fillet `k` wide where they meet. */
function blend(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * The handle's shape, cut to the proportions of a cast skillet's — a Lodge's,
 * say: a flat tab rather than a bar, wide where it is cast into the wall, a
 * waist to hold it by, and a rounded end with a teardrop hole to hang it by,
 * point toward the pan.
 *
 * Measured from where it leaves the outside of the rim, along the handle (`s`)
 * and across it (`x`).
 */
const HANDLE = Object.freeze({
  /** How far it rises from level. A little: it is a pan, not a saucepan. */
  tilt: 0.14,
  /** Where along the rim's height its middle runs out of the wall. */
  root: RIM_HEIGHT - 0.24,
  /** The rounded end, and the hole through it. */
  end: { s: 5.9, r: 0.86 },
  hole: { s: 6.02, r: 0.31, tip: 5.28, point: 0.07 },
  /** Half its thickness: flat, and a little heavier at the root. */
  half: (s) => 0.14 + 0.08 * Math.exp(-Math.max(s, 0) / 0.9),
  /** Half its width: flared into the wall, a waist, and out a little to the end. */
  width: (s) => 0.56 + 0.64 * Math.exp(-Math.max(s, 0) / 0.75) + 0.06 * Math.min(1, Math.max(0, (s - 1.5) / 3)),
  /** How round its edges are. */
  edge: 0.09,
});

/** How wide the fillet is where the handle is cast into the wall. */
const FILLET = 0.32;

/**
 * How far under the lathed wall its copy sits. More than the lathe's flat
 * facets fall short of a true circle, so none of the copy shows between them.
 */
const INSET = 0.015;

/** How far short of the inside of the pan anything cast onto it stops. */
const CLEAR = 0.02;

/** The outline from above: negative inside the tab, positive outside it. */
function handleOutline(x, s) {
  const { end, hole, width } = HANDLE;
  const w = width(s);
  const slope = (width(s + 0.01) - width(s - 0.01)) / 0.02;
  const shaft = Math.max((Math.abs(x) - w) / Math.hypot(1, slope), s - end.s, -1.4 - s);
  const tab = Math.hypot(x, s - end.s) - end.r;
  const solid = blend(shaft, tab, 0.6);

  /** The teardrop: a circle, and a smaller one it tapers to. */
  const h = hole.s - hole.tip;
  const q = hole.s - s;
  const a = (hole.r - hole.point) / h;
  const b = Math.sqrt(1 - a * a);
  const k = -Math.abs(x) * a + q * b;
  let drop;
  if (k < 0) drop = Math.hypot(x, q) - hole.r;
  else if (k > b * h) drop = Math.hypot(x, q - h) - hole.point;
  else drop = Math.abs(x) * b + q * a - hole.r;

  return Math.max(solid, -drop);
}

/**
 * The handle, cast into the pan in one piece.
 *
 * It used to be three: a stub of a collar on the rim, a round bar that did not
 * quite meet it, and a ring hung off the end. A cast handle is none of those —
 * it is a flat tab that runs out of the wall, flared where it joins, with the
 * iron filleted into the rim all round the joint.
 *
 * So it is described as a distance field — the tab, a copy of the pan's own
 * wall a hair inside the real one, and a fillet between them — and cast. The
 * copy of the wall is what the fillet is struck against; it sits just under
 * the surface of the lathed pan, so the only part of it that shows is where
 * the fillet rises out of the iron.
 *
 * It is cast out along −z; the kitchen turns the whole pan so the handle comes
 * toward whoever is cooking.
 */
export function buildHandle(GFX, iron) {
  const { tilt, root, half, edge } = HANDLE;
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const profile = Float64Array.from(PROFILE.flat());
  const hollow = Float64Array.from(HOLLOW.flat());

  const distance = (x, h, s) => {
    const outline = handleOutline(x, s);
    const wx = outline + edge, wy = Math.abs(h) - half(s) + edge;
    const tab = Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - edge;

    /**
     * Only as much of the wall as the fillet reaches. Past that the handle is
     * on its own, and the copy of the wall stops at a face buried in the iron.
     */
    if (tab > FILLET) return tab;

    /** The same point in the pan's frame: `s` runs out and up the handle, `h` off its face. */
    const py = root + s * sin + h * cos;
    const out = Math.hypot(x, RIM_RADIUS + s * cos - h * sin);
    /** Nothing of the pan is out here to be filleted to, or cut back from. */
    if (out > RIM_RADIUS + 2 * FILLET) return tab;
    const wall = polygonDistance(profile, out, py) + INSET;
    const solid = blend(tab, wall, FILLET);
    return Math.max(solid, CLEAR - polygonDistance(hollow, out, py));
  };

  /** Sampled a little finer than its rounded edges are round, and no finer than that. */
  const geometry = cast(GFX, { distance, from: [-1.65, -0.75, -1.5], to: [1.65, 0.62, 6.9], step: 0.06 });

  /** Cast in the handle's own frame, then turned out the back and tipped up. */
  const handle = new GFX.Mesh(geometry, iron);
  handle.name = 'pan-handle';
  handle.position.set(0, root, -RIM_RADIUS);
  handle.rotation.set(tilt, Math.PI, 0);
  return handle;
}

/**
 * Where the floor of the pan is, `r` out from the middle: level to `FLAT`, then
 * rolling up the corner into the wall, then the straight flare to the lip.
 * What anything sliding out to the edge rides up on.
 */
export function floorHeight(r) {
  if (r <= FLAT) return 0;
  const k = Math.cos(KNEE);
  const out = FLAT + k * CORNER;
  if (r <= out) {
    const dx = r - FLAT;
    return CORNER - Math.sqrt(Math.max(0, CORNER * CORNER - dx * dx));
  }
  /** Past the corner the wall runs straight from the knee to the inside of the lip. */
  const knee = [out, CORNER + Math.sin(KNEE) * CORNER];
  const lip = [LIP.x - BEAD * 0.2, LIP.y - 0.02];
  const t = Math.min(1, (r - knee[0]) / (lip[0] - knee[0]));
  return knee[1] + (lip[1] - knee[1]) * t;
}

/** How steep the floor is there — the rise over the run — for anything sliding up it. */
export function floorSlope(r) {
  const e = 0.01;
  return (floorHeight(r + e) - floorHeight(Math.max(0, r - e))) / (r + e - Math.max(0, r - e));
}

/**
 * Builds the pan and hands it back as one group, cooking surface at y = 0.
 * The materials come back too: oil in the pan is the floor going glossy.
 */
export function buildPan(GFX) {
  const pan = new GFX.Group();
  pan.name = 'pan';

  const iron = new GFX.MeshStandardMaterial({
    name: 'pan-iron',
    color: 0x17130f,
    roughness: 0.42,
    metalness: 0.72,
    side: GFX.DoubleSide,
  });

  const body = new GFX.Mesh(new GFX.LatheGeometry(PROFILE.map(([x, y]) => new GFX.Vector2(x, y)), 72), iron);
  body.name = 'pan-body';
  pan.add(body);

  /**
   * The cooking surface, laid a hair over the base of the body. Its own mesh
   * because it is the one part that is worn rather than cast, and the one that
   * changes: oiled, it goes from seasoned iron to a dark mirror.
   */
  const floor = new GFX.MeshStandardMaterial({
    name: 'pan-surface',
    map: cookTexture(GFX),
    roughness: 0.44,
    metalness: 0.62,
  });
  const surface = new GFX.Mesh(new GFX.CircleGeometry(FLAT + 0.25, 96), floor);
  surface.name = 'floor';
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.002;
  pan.add(surface);

  const handle = buildHandle(GFX, iron);
  pan.add(handle);

  return { group: pan, iron, floor, handle };
}
