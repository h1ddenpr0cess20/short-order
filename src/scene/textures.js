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
    let n = p * 374761393 + q * 668265263 + seed * 1274126177;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  };
  const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
  const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
  return (top + (bottom - top) * fy) * 2 - 1;
}

/**
 * Honed white marble, warm, with fine grey veining: the counter. Lighter than
 * anything on it, so the iron and the board read against it. It tiles, so it
 * can be laid down as many times as the counter is long.
 */
export function marble(GFX, size = 512) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const img = ctx.createImageData(size, size);
  const P = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * P, v = (y / size) * P;
      const warp = periodic(u, v, P, 1) * 1.1 + periodic(u * 2, v * 2, P * 2, 2) * 0.45 + periodic(u * 4, v * 4, P * 4, 3) * 0.18;
      /** Veins run on the diagonal; whole turns across the tile, so they meet themselves at the edges. */
      const a = Math.abs(Math.sin(((x + y) / size) * Math.PI * 2 + warp * 2.6));
      const b = Math.abs(Math.sin(((x - 2 * y) / size) * Math.PI * 2 + warp * 3.4 + 1.3));
      const cloud = periodic(u * 1.5, v * 1.5, P * 1.5, 4) * 0.5 + periodic(u * 8, v * 8, P * 8, 5) * 0.12;
      let l = 0.915 + cloud * 0.02;
      l -= Math.max(0, 1 - a / 0.035) * 0.075;
      l -= Math.max(0, 1 - b / 0.02) * 0.035;
      const i = (y * size + x) * 4;
      img.data[i] = Math.round(255 * Math.min(1, l * 0.99));
      img.data[i + 1] = Math.round(255 * Math.min(1, l * 0.972));
      img.data[i + 2] = Math.round(255 * Math.min(1, l * 0.94));
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

/** White subway tile, a little uneven in tone, with grey grout: the wall. */
export function subwayTile(GFX, { width = 1024, height = 512, seed = 3 } = {}) {
  const c = canvas(width, height);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(seed);
  ctx.fillStyle = '#8f8a82';
  ctx.fillRect(0, 0, width, height);
  const tw = width / 8, th = height / 8;
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 ? tw / 2 : 0;
    for (let col = -1; col < 9; col++) {
      const x = col * tw + offset, y = row * th;
      const tone = 228 + random() * 14;
      const g = ctx.createLinearGradient(x, y, x, y + th);
      g.addColorStop(0, `rgb(${tone + 6},${tone + 4},${tone})`);
      g.addColorStop(0.5, `rgb(${tone},${tone - 2},${tone - 6})`);
      g.addColorStop(1, `rgb(${tone - 14},${tone - 16},${tone - 20})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x + 2.5, y + 2.5, tw - 5, th - 5, 5);
      ctx.fill();
    }
  }
  return texture(GFX, c.el, { wrap: true });
}

/** Brushed steel: fine streaks one way, for the top of the range. */
export function brushed(GFX, size = 512) {
  const c = canvas(size);
  if (!c) return null;
  const { ctx } = c;
  const random = seeded(11);
  ctx.fillStyle = '#9da0a3';
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
 * The room the kitchen reflects: a warm ceiling with a lamp in it, pale walls,
 * a dark floor. Only ever seen in the iron, the steel and the oil.
 */
export function studio(GFX) {
  const c = canvas(256, 128);
  if (!c) return null;
  const { ctx } = c;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#fff3df');
  g.addColorStop(0.42, '#b3a796');
  g.addColorStop(0.52, '#5b5249');
  g.addColorStop(1, '#1c1916');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = 'rgba(255,248,232,0.95)';
  ctx.beginPath();
  ctx.ellipse(90, 18, 30, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,236,206,0.6)';
  ctx.fillRect(170, 30, 60, 30);
  const tex = new GFX.Texture(c.el);
  tex.mapping = GFX.EquirectangularReflectionMapping;
  tex.colorSpace = GFX.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** A cotton tea towel: cream, a weave you can just see, and two red stripes near one end. */
export function towel(GFX, { width = 512, height = 256 } = {}) {
  const c = canvas(width, height);
  if (!c) return null;
  const { ctx } = c;
  ctx.fillStyle = '#efe7d6';
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += 3) {
    ctx.fillStyle = `rgba(120,100,70,${y % 6 ? 0.04 : 0.07})`;
    ctx.fillRect(0, y, width, 1);
  }
  for (let x = 0; x < width; x += 3) {
    ctx.fillStyle = `rgba(120,100,70,${x % 6 ? 0.03 : 0.05})`;
    ctx.fillRect(x, 0, 1, height);
  }
  for (const [x, w] of [[0.16, 0.035], [0.22, 0.012], [0.78, 0.012], [0.84, 0.035]]) {
    ctx.fillStyle = 'rgba(168,46,38,0.85)';
    ctx.fillRect(x * width, 0, w * width, height);
  }
  return texture(GFX, c.el);
}
