/**
 * Cheese melting, as a shape: a block slumps under its own weight, its
 * corners round off, its top sags into a low dome and its foot spreads out
 * into a puddle — all of it the way the room's "down" is, whichever way up
 * the block happens to be lying.
 *
 * A solid here is a soup of triangles, every corner its own vertex, so the
 * shape is worked out from where each vertex is and nothing else: two
 * vertices at one place go to one place, and the surface stays closed.
 */

/** One triangle in four, `levels` times over: enough vertices for a block to bend rather than stay a box. */
export function subdivide(solid, levels = 2) {
  let pos = solid.pos, nrm = solid.nrm, col = solid.col, cap = solid.cap;
  for (let l = 0; l < levels; l++) {
    const tris = pos.length / 9;
    const P = new Float32Array(tris * 36), N = new Float32Array(tris * 36), C = new Float32Array(tris * 36);
    const K = new Uint8Array(tris * 4);
    const corner = (src, t, k) => [src[t * 9 + k * 3], src[t * 9 + k * 3 + 1], src[t * 9 + k * 3 + 2]];
    const half = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    for (let t = 0; t < tris; t++) {
      for (const [src, out] of [[pos, P], [nrm, N], [col, C]]) {
        const a = corner(src, t, 0), b = corner(src, t, 1), c = corner(src, t, 2);
        const ab = half(a, b), bc = half(b, c), ca = half(c, a);
        [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]].forEach((tri, i) => {
          tri.forEach((v, k) => out.set(v, (t * 4 + i) * 9 + k * 3));
        });
      }
      K.fill(cap[t], t * 4, t * 4 + 4);
    }
    pos = P;
    nrm = N;
    col = C;
    cap = K;
  }
  return { pos, nrm, col, cap };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A little unevenness of its own at each point, so a melted top is not machined smooth. */
function lumpy(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * `src` (from `subdivide`) melted by `m`, 0 to 1, with `up` the room's up in
 * the piece's own frame: positions into `pos`, normals into `nrm`. Nothing
 * moves below the bottom of the block, so it stays sitting where it sat.
 */
export function melt(src, pos, nrm, up, m) {
  const n = src.pos.length / 3;
  up = unit(up);
  /** Two level directions across the block, from whichever of its own sides is least upright. */
  const seed = Math.abs(up[0]) < 0.7 ? [1, 0, 0] : [0, 0, 1];
  const e1 = unit([seed[0] - up[0] * dot(seed, up), seed[1] - up[1] * dot(seed, up), seed[2] - up[2] * dot(seed, up)]);
  const e2 = cross(up, e1);

  let h0 = Infinity, h1 = -Infinity, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = [src.pos[i * 3], src.pos[i * 3 + 1], src.pos[i * 3 + 2]];
    const h = dot(p, up), x = dot(p, e1), y = dot(p, e2);
    h0 = Math.min(h0, h);
    h1 = Math.max(h1, h);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const H = Math.max(1e-6, h1 - h0);
  const ax = Math.max(1e-6, (x1 - x0) / 2), by = Math.max(1e-6, (y1 - y0) / 2);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  /** Down to under a third of its height, and out as far as keeps it about as much cheese. */
  const tall = 1 - 0.7 * m;
  const wide = 1 / Math.sqrt(tall);
  /** A long block melts round: its two widths go toward each other. */
  const mean = (ax + by) / 2;
  const A = ax + (mean - ax) * m * 0.6, B = by + (mean - by) * m * 0.6;

  for (let i = 0; i < n; i++) {
    const p = [src.pos[i * 3], src.pos[i * 3 + 1], src.pos[i * 3 + 2]];
    const t = (dot(p, up) - h0) / H;
    const X = (dot(p, e1) - cx) / ax, Y = (dot(p, e2) - cy) / by;
    /** The square of its footprint drawn toward a disc, corners first. */
    const dX = X * Math.sqrt(Math.max(0, 1 - (Y * Y) / 2)), dY = Y * Math.sqrt(Math.max(0, 1 - (X * X) / 2));
    const rX = X + (dX - X) * m, rY = Y + (dY - Y) * m;
    const out = dX * dX + dY * dY;
    /** The foot runs out furthest; the top stays in over it. */
    const spread = 1 + (wide - 1) * (1.2 - 0.6 * t);
    /** The top sinks most toward its edges, into a dome, and is a little uneven. */
    const lump = (lumpy(p[0], p[1], p[2]) - 0.5) * 0.08 * m * t;
    const h = H * t * tall * (1 - 0.55 * m * t * out) + H * lump;
    const x = cx + rX * A * spread, y = cy + rY * B * spread;
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = up[k] * (h0 + h) + e1[k] * x + e2[k] * y;
  }

  /**
   * Normals: each face's own while it is still a block, and shared smoothly
   * between the faces round a point as it melts, so its edges go soft.
   */
  const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  const shared = new Map();
  const face = new Float32Array(n * 3);
  for (let t = 0; t < n / 3; t++) {
    const a = t * 9;
    const u = [pos[a + 3] - pos[a], pos[a + 4] - pos[a + 1], pos[a + 5] - pos[a + 2]];
    const v = [pos[a + 6] - pos[a], pos[a + 7] - pos[a + 1], pos[a + 8] - pos[a + 2]];
    const f = cross(u, v);
    /** Facing out, the way the block's own face did, whichever way round its corners run. */
    if (f[0] * src.nrm[a] + f[1] * src.nrm[a + 1] + f[2] * src.nrm[a + 2] < 0) {
      f[0] = -f[0];
      f[1] = -f[1];
      f[2] = -f[2];
    }
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      face.set(unit(f), i * 3);
      const id = key(i);
      const sum = shared.get(id) ?? [0, 0, 0];
      sum[0] += f[0];
      sum[1] += f[1];
      sum[2] += f[2];
      shared.set(id, sum);
    }
  }
  for (let i = 0; i < n; i++) {
    const s = unit(shared.get(key(i)));
    const f = [face[i * 3], face[i * 3 + 1], face[i * 3 + 2]];
    const b = Math.min(1, m * 1.6);
    const out = unit([f[0] + (s[0] - f[0]) * b, f[1] + (s[1] - f[1]) * b, f[2] + (s[2] - f[2]) * b]);
    nrm.set(out, i * 3);
  }
}
