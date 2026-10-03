/**
 * The surfaces, painted on canvases at load: no image files to fetch, and
 * nothing here that a browser has to decode.
 *
 * Every painter hands back `null` without a document, so the kitchen can be
 * built under Node for the tests — the materials just come out plain.
 */

import { vnoise } from '../food/noise.js';

function canvas(width, height = width) {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  return ctx ? { el, ctx } : null;
}

function texture(GFX, el, { srgb = true, wrap = false } = {}) {
  const tex = new GFX.CanvasTexture(el);
  if (srgb) tex.colorSpace = GFX.SRGBColorSpace;
  tex.anisotropy = 8;
  if (wrap) tex.wrapS = tex.wrapT = GFX.RepeatWrapping;
  return tex;
}

/** A tiny seeded generator, so the grain is the same on every load. */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise that repeats every `period` lattice cells, so a texture painted with it tiles. */
function periodic(x, y, period, seed = 0) {
  const fade = (t) => t * t * (3 - 2 * t);
  const i = Math.floor(x), j = Math.floor(y);
  const fx = fade(x - i), fy = fade(y - j);
  const at = (a, b) => {
    const p = ((a % period) + period) % period, q = ((b % period) + period) % period;
    let n = (Math.imul(p, 374761393) + Math.imul(q, 668265263) + Math.imul(seed, 1274126177)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
  const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
  return (top + (bottom - top) * fy) * 2 - 1;
}

/**
 * Honed Calacatta: warm white, soft grey clouding, and the long grey veins
 * with a gold bloom either side that the stone is named for. Still lighter
 * than anything on it, so the iron and the board read against it. It tiles,
 * so it can be laid down as many times as the counter is long.
 */
export function marble(GFX, size = 768) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const img = ctx.createImageData(size, size);
  const P = 4;
  /**
   * Everything slow-moving — the broad warp of the veins, the clouding, where
   * each family of veins fades — is worked out on a coarse grid and blended
   * up: only the fine warp is worked out for every pixel.
   */
  const G = 96;
  const coarse = (fn) => {
    const grid = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) grid[j * G + i] = fn((i / G) * P, (j / G) * P);
    return grid;
  };
  const warpLow = coarse((u, v) => periodic(u, v, P, 1) * 1.1 + periodic(u * 2, v * 2, P * 2, 2) * 0.5);
  const cloud = coarse((u, v) => periodic(u * 1.5, v * 1.5, P * 1.5, 4) * 0.5 + periodic(u * 8, v * 8, P * 8, 5) * 0.12);
  const fadeA = coarse((u, v) => Math.min(1, Math.max(0, 0.45 + periodic(u * 0.75 + 3, v * 0.75, P * 0.75, 7) * 1.6)));
  const fadeB = coarse((u, v) => Math.min(1, Math.max(0, 0.2 + periodic(u + 9, v + 4, P, 8) * 1.8)));
  const at = (grid, x, y) => {
    const gx = (x / size) * G, gy = (y / size) * G;
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const i1 = (i + 1) % G, j1 = (j + 1) % G;
    const top = grid[j * G + i] + (grid[j * G + i1] - grid[j * G + i]) * fx;
    const bottom = grid[j1 * G + i] + (grid[j1 * G + i1] - grid[j1 * G + i]) * fx;
    return top + (bottom - top) * fy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * P, v = (y / size) * P;
      const warp = at(warpLow, x, y) + periodic(u * 4, v * 4, P * 4, 3) * 0.3;
      /** Veins run on the diagonal; whole turns across the tile, so they meet themselves at the edges. */
      const a = Math.abs(Math.sin(((x + y) / size) * Math.PI * 2 + warp * 0.95));
      const b = Math.abs(Math.sin(((x - 2 * y) / size) * Math.PI * 2 + warp * 1.4 + 1.3));
      const hair = Math.abs(Math.sin(((3 * x + y) / size) * Math.PI * 2 + warp * 2.2 + 0.4));
      /**
       * How much vein is here: each family fades in and out along its length,
       * thick in places and gone in others, the way stone is.
       */
      const fa = at(fadeA, x, y), fb = at(fadeB, x, y);
      const widthA = 0.012 + 0.03 * fa;
      const vein = Math.max(0, 1 - a / widthA) * fa * 0.85 + Math.max(0, 1 - b / 0.012) * fb * 0.5
        + Math.max(0, 1 - hair / 0.006) * fb * 0.22;
      /** And the soft gold the big veins bleed into the stone either side of them. */
      const bloom = Math.max(0, 1 - a / 0.2) ** 2 * fa * 0.55;
      const l = 0.955 + at(cloud, x, y) * 0.03;
      let r = l, g = l * 0.978, bl = l * 0.948;
      r -= bloom * 0.02; g -= bloom * 0.06; bl -= bloom * 0.14;
      const k = Math.min(1, vein);
      r += (0.62 - r) * k * 0.4; g += (0.61 - g) * k * 0.4; bl += (0.59 - bl) * k * 0.4;
      const i = (y * size + x) * 4;
      img.data[i] = Math.round(255 * Math.min(1, r));
      img.data[i + 1] = Math.round(255 * Math.min(1, g));
      img.data[i + 2] = Math.round(255 * Math.min(1, bl));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return texture(GFX, c.el, { wrap: true });
}

/**
 * Edge-grain maple: strips glued side by side, each its own shade, with the
 * grain running the length of them and the faint scratches of a board that
 * has been used.
 */
export function maple(GFX, { width = 1024, height = 720, seed = 7 } = {}) {
  const c = canvas(width, height);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(seed);
  const strips = 13;
  const w = height / strips;
  for (let s = 0; s < strips; s++) {
    const tone = random();
    const r = 214 + tone * 22, g = 172 + tone * 22, b = 118 + tone * 18;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, s * w, width, w + 1);
    /** Grain: long, slightly wavy lines along the strip. */
    for (let k = 0; k < 26; k++) {
      const y0 = s * w + random() * w;
      ctx.strokeStyle = `rgba(${120 + random() * 40},${80 + random() * 30},${40 + random() * 20},${0.05 + random() * 0.1})`;
      ctx.lineWidth = 0.6 + random() * 1.4;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 16) {
        const y = y0 + Math.sin(x * 0.004 + k) * 2.5 + vnoise(x * 0.01, y0 * 0.05, s) * 3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    /** The glue line between strips. */
    ctx.fillStyle = 'rgba(110,70,30,0.22)';
    ctx.fillRect(0, s * w, width, 1.2);
  }
  /** Knife marks: short, fine, pale, mostly across the grain. */
  for (let k = 0; k < 260; k++) {
    const x = width * (0.15 + random() * 0.7), y = height * (0.15 + random() * 0.7);
    const a = Math.PI / 2 + (random() - 0.5) * 0.9;
    const l = 8 + random() * 34;
    ctx.strokeStyle = `rgba(255,240,215,${0.08 + random() * 0.12})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  /** The juice groove routed round the top, a finger's width in from the edge. */
  const inset = height * 0.055, r = height * 0.06;
  for (const [w, colour] of [[11, 'rgba(96,58,24,0.34)'], [6, 'rgba(70,40,14,0.32)'], [1.4, 'rgba(255,236,200,0.5)']]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = w;
    ctx.beginPath();
    const off = colour.startsWith('rgba(255') ? 4 : 0;
    ctx.roundRect(inset + off, inset + off, width - inset * 2, height - inset * 2, r);
    ctx.stroke();
  }
  return texture(GFX, c.el);
}

/** End grain, for the edges of the board: rings, not stripes. */
export function endGrain(GFX, size = 256) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  ctx.fillStyle = 'rgb(196,150,98)';
  ctx.fillRect(0, 0, size, size);
  for (let r = 4; r < size * 1.5; r += 5) {
    ctx.strokeStyle = `rgba(120,78,38,${0.12 + (r % 15 === 4 ? 0.1 : 0)})`;
    ctx.beginPath();
    ctx.arc(-size * 0.3, size * 1.4, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  return texture(GFX, c.el);
}

/**
 * Bottle-green glazed tile, laid like subway tile: every tile its own depth of
 * green, pooled darker where the glaze ran thick at the bottom edge and bright
 * along the top where it thinned over the bevel, in dark grout. The wall a
 * bistro kitchen is painted against.
 */
export function greenTile(GFX, { width = 1024, height = 512, seed = 3 } = {}) {
  const c = canvas(width, height);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(seed);
  ctx.fillStyle = '#1b1d18';
  ctx.fillRect(0, 0, width, height);
  const tw = width / 8, th = height / 8;
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 ? tw / 2 : 0;
    for (let col = -1; col < 9; col++) {
      const x = col * tw + offset, y = row * th;
      const t = random();
      const r = 22 + t * 16, g = 64 + t * 26, b = 48 + t * 16;
      const grad = ctx.createLinearGradient(x, y, x, y + th);
      grad.addColorStop(0, `rgb(${r + 34},${g + 44},${b + 34})`);
      grad.addColorStop(0.12, `rgb(${r + 8},${g + 10},${b + 8})`);
      grad.addColorStop(0.7, `rgb(${r},${g},${b})`);
      grad.addColorStop(1, `rgb(${r - 12},${g - 26},${b - 18})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x + 3, y + 3, tw - 6, th - 6, 6);
      ctx.fill();
      /** The glaze is never quite even: a few soft pools of deeper colour on every tile. */
      for (let k = 0; k < 5; k++) {
        const px = x + 8 + random() * (tw - 16), py = y + 8 + random() * (th - 16), pr = 8 + random() * 22;
        const pool = ctx.createRadialGradient(px, py, 0, px, py, pr);
        pool.addColorStop(0, `rgba(6,30,20,${0.12 + random() * 0.14})`);
        pool.addColorStop(1, 'rgba(6,30,20,0)');
        ctx.fillStyle = pool;
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      /** The bevel catching the light along the top and down one side. */
      ctx.strokeStyle = 'rgba(210,235,215,0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 4.5);
      ctx.lineTo(x + tw - 8, y + 4.5);
      ctx.stroke();
    }
  }
  return texture(GFX, c.el, { wrap: true });
}

/** Brushed metal: fine streaks one way, for the trim round the range. */
export function brushed(GFX, size = 512, base = '#9da0a3') {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(11);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 1400; k++) {
    const y = random() * size;
    const l = 40 + random() * 260;
    const x = random() * size;
    const v = random() < 0.5 ? 255 : 60;
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.03 + random() * 0.05})`;
    ctx.lineWidth = 0.6 + random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l, y + (random() - 0.5) * 1.5);
    ctx.stroke();
  }
  return texture(GFX, c.el, { wrap: true });
}

/** A soft round blot, black at the middle and gone at the edge: a cheap shadow. */
export function blot(GFX, size = 128) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2 - 1);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return texture(GFX, c.el);
}

/** A soft white puff, for steam and smoke and the glow round a flame. */
export function puff(GFX, size = 128) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2 - 1);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return texture(GFX, c.el);
}

/**
 * Butter foaming: a froth of small bubbles, thick in the middle and thinning
 * to nothing at the edge, so a disc of it lies on the pan like a pool.
 */
export function foam(GFX, size = 256) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(17);
  for (let n = 0; n < 1400; n++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * size * 0.48;
    const x = size / 2 + Math.cos(a) * r, y = size / 2 + Math.sin(a) * r;
    const fade = 1 - (r / (size * 0.48)) ** 2;
    const b = 0.6 + random() * 2.6;
    ctx.beginPath();
    ctx.arc(x, y, b, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(0.25 + random() * 0.55) * fade})`;
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * fade})`;
    ctx.stroke();
  }
  return texture(GFX, c.el);
}

/**
 * A soft ring of light, brightest a little way in from the edge: the glow a
 * gas burner throws out from under a pan onto the steel round it.
 */
export function halo(GFX, size = 256) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.76, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return texture(GFX, c.el);
}

/**
 * The room the kitchen reflects: a bistro after dark — a warm ceiling, a row
 * of lamps along it, green walls, a dark floor. Only ever seen in the iron,
 * the brass, the glaze and the oil.
 */
export function studio(GFX) {
  const c = canvas(512, 256);
  if (!c) return null;
  const { ctx } = c;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#fff0d6');
  g.addColorStop(0.3, '#c9ab7e');
  g.addColorStop(0.46, '#4d6152');
  g.addColorStop(0.54, '#2a3a30');
  g.addColorStop(1, '#14130f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  /** The lamps, and a window's worth of warm light off to one side. */
  for (const [x, y, r] of [[60, 34, 14], [180, 26, 18], [300, 34, 14], [420, 26, 18]]) {
    const lamp = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    lamp.addColorStop(0, 'rgba(255,246,226,1)');
    lamp.addColorStop(0.4, 'rgba(255,214,150,0.7)');
    lamp.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  ctx.fillStyle = 'rgba(255,232,196,0.5)';
  ctx.fillRect(340, 70, 110, 44);
  const tex = new GFX.Texture(c.el);
  tex.mapping = GFX.EquirectangularReflectionMapping;
  tex.colorSpace = GFX.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * A linen tea towel: oatmeal, a weave you can just see, slubs in the thread,
 * and a bottle-green band with gold pinstripes either side near each end.
 */
export function towel(GFX, { width = 1024, height = 512 } = {}) {
  const c = canvas(width, height);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(23);
  ctx.fillStyle = '#ece3cf';
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += 2) {
    ctx.fillStyle = `rgba(110,92,62,${0.025 + random() * 0.05})`;
    ctx.fillRect(0, y, width, 1);
  }
  for (let x = 0; x < width; x += 2) {
    ctx.fillStyle = `rgba(110,92,62,${0.02 + random() * 0.04})`;
    ctx.fillRect(x, 0, 1, height);
  }
  /** Slubs: short thick bits of thread, along the weft. */
  for (let k = 0; k < 220; k++) {
    ctx.fillStyle = `rgba(${random() < 0.5 ? '255,250,236' : '150,128,92'},${0.15 + random() * 0.2})`;
    ctx.fillRect(random() * width, random() * height, 6 + random() * 18, 1.2);
  }
  for (const end of [0.13, 0.81]) {
    const stripe = (x, w, colour) => {
      ctx.fillStyle = colour;
      ctx.fillRect(x * width, 0, w * width, height);
    };
    stripe(end, 0.006, 'rgba(176,138,62,0.9)');
    stripe(end + 0.014, 0.05, 'rgba(28,62,46,0.94)');
    stripe(end + 0.07, 0.006, 'rgba(176,138,62,0.9)');
  }
  /** The weave over the stripes too. */
  for (let y = 0; y < height; y += 3) {
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fillRect(0, y, width, 1);
  }
  return texture(GFX, c.el);
}

/**
 * Walnut, for the turned and handled things: dark, warm, the grain running
 * the length of the piece and the odd wavy figure through it. Across is u,
 * along is v, which is how a lathe and a cylinder lay their surfaces out.
 */
export function walnut(GFX, { width = 512, height = 512, seed = 29 } = {}) {
  const c = canvas(width, height);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(seed);
  ctx.fillStyle = '#4a2f1d';
  ctx.fillRect(0, 0, width, height);
  for (let k = 0; k < 160; k++) {
    const x0 = random() * width;
    const dark = random() < 0.6;
    ctx.strokeStyle = dark ? `rgba(28,16,8,${0.12 + random() * 0.25})` : `rgba(140,96,60,${0.08 + random() * 0.16})`;
    ctx.lineWidth = 0.8 + random() * 3.2;
    ctx.beginPath();
    for (let y = 0; y <= height; y += 8) {
      const x = x0 + Math.sin(y * 0.012 + k) * 6 + vnoise(x0 * 0.02, y * 0.01, k) * 10;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return texture(GFX, c.el, { wrap: true });
}

/**
 * Moulded paper pulp, for the carton: grey-beige, mottled, with short fibres
 * through it. Laid on from above, so its own scale is all that matters.
 */
export function pulp(GFX, size = 256) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(31);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 8, v = (y / size) * 8;
      const n = periodic(u, v, 8, 7) * 0.5 + periodic(u * 4, v * 4, 32, 8) * 0.3 + periodic(u * 16, v * 16, 128, 9) * 0.2;
      const l = 0.78 + n * 0.06;
      const i = (y * size + x) * 4;
      img.data[i] = Math.round(255 * l * 0.93);
      img.data[i + 1] = Math.round(255 * l * 0.86);
      img.data[i + 2] = Math.round(255 * l * 0.74);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let k = 0; k < 400; k++) {
    const x = random() * size, y = random() * size, a = random() * Math.PI, l = 1.5 + random() * 4;
    ctx.strokeStyle = random() < 0.5 ? 'rgba(90,74,52,0.18)' : 'rgba(250,242,226,0.22)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return texture(GFX, c.el, { wrap: true });
}

/** The faces the labels are set in: the page's own, once it has them, and a plain serif if not. */
const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
const CONDENSED = 'Oswald, "Arial Narrow", "Roboto Condensed", sans-serif';

/** A double rule round the edge of a label: a thick one and a hairline inside it. */
function frameLabel(ctx, w, h, inset, colour) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 4;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(inset + 8, inset + 8, w - inset * 2 - 16, h - inset * 2 - 16);
}

/** Text with its letters spread, centred on x. */
function spaced(ctx, text, x, y, spacing) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let at = x - total / 2;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => {
    ctx.fillText(ch, at, y);
    at += widths[i] + spacing;
  });
  ctx.textAlign = 'center';
}

/**
 * The label on the oil: cream paper, a gold double rule, and the name in a
 * display serif. Painted flat; the bottle wraps it round its front.
 */
export function oilLabel(GFX) {
  const w = 512, h = 400;
  const c = canvas(w, h);
  if (!c) return null;
  const { ctx } = c;
  ctx.fillStyle = '#f1e8d2';
  ctx.fillRect(0, 0, w, h);
  frameLabel(ctx, w, h, 22, '#a8843f');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#a8843f';
  ctx.font = `500 26px ${CONDENSED}`;
  spaced(ctx, 'EXTRA VIRGIN', w / 2, 98, 9);
  ctx.fillStyle = '#1d3a2c';
  ctx.font = `700 118px ${SERIF}`;
  ctx.fillText('Olio', w / 2, 222);
  ctx.strokeStyle = '#a8843f';
  ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + s * 40, 262);
    ctx.lineTo(w / 2 + s * 150, 262);
    ctx.stroke();
  }
  ctx.fillStyle = '#a8843f';
  ctx.beginPath();
  ctx.arc(w / 2, 262, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d3a2c';
  ctx.font = `italic 400 34px ${SERIF}`;
  ctx.fillText('first cold pressing', w / 2, 316);
  return texture(GFX, c.el);
}

/**
 * The stamp on the inside of the egg carton's lid: a green oval with a gold
 * rule and the farm's name round it.
 */
export function cartonLabel(GFX) {
  const w = 512, h = 320;
  const c = canvas(w, h);
  if (!c) return null;
  const { ctx } = c;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(29,58,44,0.92)';
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 12, h / 2 - 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c8a45a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2 - 28, h / 2 - 28, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c8a45a';
  ctx.font = `500 26px ${CONDENSED}`;
  spaced(ctx, 'PASTURE RAISED', w / 2, 108, 7);
  ctx.fillStyle = '#f1e8d2';
  ctx.font = `700 72px ${SERIF}`;
  ctx.fillText('Six Eggs', w / 2, 186);
  ctx.fillStyle = '#c8a45a';
  ctx.font = `italic 400 28px ${SERIF}`;
  ctx.fillText('laid this week', w / 2, 236);
  return texture(GFX, c.el);
}

/**
 * Forged steel, for the knife: a satin flat with fine streaks along it, and the
 * bright grind of the edge bevel along the bottom. u along the blade, v up it.
 */
export function blade(GFX, { width = 512, height = 128 } = {}) {
  const c = canvas(width, height);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(37);
  const g = ctx.createLinearGradient(0, height, 0, 0);
  g.addColorStop(0, '#f4f6f8');
  g.addColorStop(0.22, '#e2e6ea');
  g.addColorStop(0.24, '#9ea4ab');
  g.addColorStop(0.5, '#b8bec5');
  g.addColorStop(1, '#a9afb6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  for (let k = 0; k < 500; k++) {
    const y = random() * height, x = random() * width, l = 30 + random() * 160;
    ctx.strokeStyle = `rgba(${random() < 0.5 ? '255,255,255' : '60,64,70'},${0.04 + random() * 0.06})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l, y);
    ctx.stroke();
  }
  return texture(GFX, c.el);
}

/** Flaky sea salt: a white heap of little bright planes and grey shadows between them. */
export function flakes(GFX, size = 256) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(41);
  ctx.fillStyle = '#e9e6e0';
  ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 900; k++) {
    const x = random() * size, y = random() * size, r = 1.5 + random() * 4.5;
    ctx.fillStyle = random() < 0.35 ? `rgba(150,146,140,${0.2 + random() * 0.3})` : `rgba(255,255,255,${0.5 + random() * 0.5})`;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.9, y + r * (random() - 0.2));
    ctx.lineTo(x - r * 0.8, y + r * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  return texture(GFX, c.el, { wrap: true });
}
