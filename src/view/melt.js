/**
 * Cheese melting, as a shape: a block slumps under its own weight, its
 * corners round off, its top sags into a low dome and its foot spreads out
 * into a puddle — all of it the way the room's "down" is, whichever way up
 * the block happens to be lying.
 *
 * A solid here is a soup of triangles, every corner its own vertex, so the
 * shape is worked out from where each vertex is and nothing else: two
 * vertices at one place go to one place, and the surface stays closed.
 *
 * It is worked out again as the cheese melts, for every bit of it in the pan,
 * so it is kept cheap: a bit is only made finer if it is a plain block with
 * too few corners to bend, and which corners are the same point is found
 * once, not every time.
 */

/** A piece with fewer triangles than this is split finer, so it has something to round off. */
const COARSE = 96;

/** One triangle in four, `levels` times over. */
function subdivide(solid, levels) {
  let { pos, nrm, col, cap } = solid;
  for (let l = 0; l < levels; l++) {
    const tris = pos.length / 9;
    const P = new Float32Array(tris * 36), N = new Float32Array(tris * 36), C = new Float32Array(tris * 36);
    const K = new Uint8Array(tris * 4);
    /** Corners a, b, c and the middles of ab, bc, ca, as offsets into a scratch row of six points. */
    const row = new Float32Array(18);
    const order = [0, 3, 5, 3, 1, 4, 5, 4, 2, 3, 4, 5];
    for (const [src, out] of [[pos, P], [nrm, N], [col, C]]) {
      for (let t = 0; t < tris; t++) {
        const o = t * 9;
        for (let k = 0; k < 9; k++) row[k] = src[o + k];
        for (let k = 0; k < 3; k++) {
          row[9 + k] = (row[k] + row[3 + k]) / 2;
          row[12 + k] = (row[3 + k] + row[6 + k]) / 2;
          row[15 + k] = (row[6 + k] + row[k]) / 2;
        }
        for (let v = 0; v < 12; v++) {
          const from = order[v] * 3, to = t * 36 + v * 3;
          out[to] = row[from];
          out[to + 1] = row[from + 1];
          out[to + 2] = row[from + 2];
        }
      }
    }
    for (let t = 0; t < tris; t++) K.fill(cap[t], t * 4, t * 4 + 4);
    pos = P;
    nrm = N;
    col = C;
    cap = K;
  }
  return { pos, nrm, col, cap };
}

/**
 * The surface a piece of cheese is drawn with: its own, or finer if it is
 * too plain to bend and `fine` is not turned off, and for each vertex which
 * point of the surface it is.
 */
export function meltable(solid, { fine = true } = {}) {
  const tris = solid.pos.length / 9;
  /** A shred is thin enough that melting only flattens it: it needs nothing finer. */
  const levels = !fine ? 0 : tris <= COARSE / 8 ? 2 : tris < COARSE ? 1 : 0;
  const out = subdivide(solid, levels);
  const n = out.pos.length / 3;
  const weld = new Int32Array(n);
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(out.pos[i * 3] * 1e4)},${Math.round(out.pos[i * 3 + 1] * 1e4)},${Math.round(out.pos[i * 3 + 2] * 1e4)}`;
    let id = seen.get(key);
    if (id === undefined) {
      id = seen.size;
      seen.set(key, id);
    }
    weld[i] = id;
  }
  return { ...out, weld, points: seen.size, sum: new Float32Array(seen.size * 3) };
}

/** A little unevenness of its own at each point, so a melted top is not machined smooth. */
function lumpy(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * `src` (from `meltable`) melted by `m`, 0 to 1, with `up` the room's up in
 * the piece's own frame: positions into `pos`, normals into `nrm`. Nothing
 * moves below the bottom of the block, so it stays sitting where it sat.
 */
export function melt(src, pos, nrm, up, m) {
  const n = src.pos.length / 3;
  const P = src.pos;
  let ul = Math.hypot(up[0], up[1], up[2]) || 1;
  const ux = up[0] / ul, uy = up[1] / ul, uz = up[2] / ul;
  /** Two level directions across the block, from whichever of its own sides is least upright. */
  let ax = 0, az = 0;
  if (Math.abs(ux) < 0.7) ax = 1;
  else az = 1;
  const along = ax * ux + az * uz;
  let e1x = ax - ux * along, e1y = -uy * along, e1z = az - uz * along;
  ul = Math.hypot(e1x, e1y, e1z);
  e1x /= ul;
  e1y /= ul;
  e1z /= ul;
  const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;

  let h0 = Infinity, h1 = -Infinity, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n * 3; i += 3) {
    const h = P[i] * ux + P[i + 1] * uy + P[i + 2] * uz;
    const x = P[i] * e1x + P[i + 1] * e1y + P[i + 2] * e1z;
    const y = P[i] * e2x + P[i + 1] * e2y + P[i + 2] * e2z;
    if (h < h0) h0 = h;
    if (h > h1) h1 = h;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const H = Math.max(1e-6, h1 - h0);
  const hx = Math.max(1e-6, (x1 - x0) / 2), hy = Math.max(1e-6, (y1 - y0) / 2);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  /** Down to under a third of its height, and out as far as keeps it about as much cheese. */
  const tall = 1 - 0.7 * m;
  const wide = 1 / Math.sqrt(tall);
  /** A long block melts round: its two widths go toward each other. */
  const mean = (hx + hy) / 2;
  const A = hx + (mean - hx) * m * 0.6, B = hy + (mean - hy) * m * 0.6;

  for (let i = 0; i < n * 3; i += 3) {
    const px = P[i], py = P[i + 1], pz = P[i + 2];
    const t = (px * ux + py * uy + pz * uz - h0) / H;
    const X = (px * e1x + py * e1y + pz * e1z - cx) / hx, Y = (px * e2x + py * e2y + pz * e2z - cy) / hy;
    /** The square of its footprint drawn toward a disc, corners first. */
    const dX = X * Math.sqrt(Math.max(0, 1 - (Y * Y) / 2)), dY = Y * Math.sqrt(Math.max(0, 1 - (X * X) / 2));
    const rX = X + (dX - X) * m, rY = Y + (dY - Y) * m;
    const out = dX * dX + dY * dY;
    /** The foot runs out furthest; the top stays in over it. */
    const spread = 1 + (wide - 1) * (1.2 - 0.6 * t);
    /** The top sinks most toward its edges, into a dome, and is a little uneven. */
    const lump = (lumpy(px, py, pz) - 0.5) * 0.08 * m * t;
    const h = h0 + H * (t * tall * (1 - 0.55 * m * t * out) + lump);
    const x = cx + rX * A * spread, y = cy + rY * B * spread;
    pos[i] = ux * h + e1x * x + e2x * y;
    pos[i + 1] = uy * h + e1y * x + e2y * y;
    pos[i + 2] = uz * h + e1z * x + e2z * y;
  }

  /**
   * Normals: each face's own while it is still a block, and shared smoothly
   * between the faces round a point as it melts, so its edges go soft.
   */
  const { weld, sum } = src;
  const N = src.nrm;
  sum.fill(0);
  for (let i = 0; i < n * 3; i += 9) {
    const ex = pos[i + 3] - pos[i], ey = pos[i + 4] - pos[i + 1], ez = pos[i + 5] - pos[i + 2];
    const fx = pos[i + 6] - pos[i], fy = pos[i + 7] - pos[i + 1], fz = pos[i + 8] - pos[i + 2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    /** Facing out, the way the block's own face did, whichever way round its corners run. */
    if (nx * N[i] + ny * N[i + 1] + nz * N[i + 2] < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (let k = 0; k < 9; k += 3) {
      nrm[i + k] = nx / l;
      nrm[i + k + 1] = ny / l;
      nrm[i + k + 2] = nz / l;
      const w = weld[(i + k) / 3] * 3;
      sum[w] += nx;
      sum[w + 1] += ny;
      sum[w + 2] += nz;
    }
  }
  const b = Math.min(1, m * 1.6);
  for (let i = 0; i < n * 3; i += 3) {
    const w = weld[i / 3] * 3;
    const sl = Math.hypot(sum[w], sum[w + 1], sum[w + 2]) || 1;
    const nx = nrm[i] + (sum[w] / sl - nrm[i]) * b;
    const ny = nrm[i + 1] + (sum[w + 1] / sl - nrm[i + 1]) * b;
    const nz = nrm[i + 2] + (sum[w + 2] / sl - nrm[i + 2]) * b;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm[i] = nx / l;
    nrm[i + 1] = ny / l;
    nrm[i + 2] = nz / l;
  }
}
