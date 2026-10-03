/**
 * Eggs: Marc's shell, from the debate, at the size of an egg next to a pan,
 * and the two halves it breaks into against the rim of a bowl.
 *
 * The shape is his exactly — a sphere tapered towards the top and stretched a
 * little tall — and so is the skin: cream, with faint warm speckles.
 */

/** Marc's taper, as it was. */
export function shapeEgg(positions) {
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const taper = 1 - 0.075 * y - 0.055 * y * y;
    positions[i] *= 0.84 * taper;
    positions[i + 2] *= 0.84 * taper;
    positions[i + 1] = y * 1.03 + 0.01;
  }
  return positions;
}

/** An egg is about this tall next to the pan, in the pan's units. */
export const EGG_SCALE = 1.12;

let skinCache = null;

/** The speckled skin, painted once and shared by every egg in the carton. */
function shellSkin(GFX) {
  if (skinCache) return skinCache;
  if (typeof document === 'undefined') return (skinCache = { map: null });
  const width = 1024, height = 512;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  if (!g) return (skinCache = { map: null });
  g.fillStyle = '#f0e3cd';
  g.fillRect(0, 0, width, height);
  let s = 12345;
  const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 520; i++) {
    const x = random() * width, y = random() * height, r = 1 + random() * 3.2, a = 0.05 + random() * 0.16;
    g.fillStyle = random() < 0.5 ? `rgba(168,132,86,${a})` : `rgba(120,104,88,${a * 0.8})`;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
  }
  const map = new GFX.CanvasTexture(c);
  map.colorSpace = GFX.SRGBColorSpace;
  map.anisotropy = 4;
  return (skinCache = { map });
}

export function shellMaterial(GFX) {
  const { map } = shellSkin(GFX);
  return new GFX.MeshPhysicalMaterial({
    name: 'eggshell',
    color: new GFX.Color(map ? '#ffffff' : '#f0e3cd'),
    map,
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.6,
    sheen: 0.35,
    sheenColor: new GFX.Color('#fff2dd'),
    side: GFX.DoubleSide,
  });
}

/** A whole egg, standing on its blunt end at y = 0. */
export function eggGeometry(GFX) {
  const geometry = new GFX.SphereGeometry(1, 48, 32);
  shapeEgg(geometry.attributes.position.array);
  geometry.scale(EGG_SCALE, EGG_SCALE, EGG_SCALE);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox.min.y, 0);
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * Where it breaks: round the waist, a little above the middle, in a zigzag —
 * which is what an eggshell does when it is knocked on something.
 */
export function crackHeight(angle) {
  const teeth = 9;
  const t = (angle / (Math.PI * 2)) * teeth;
  const saw = Math.abs((t % 1) * 2 - 1);
  return 0.18 + 0.16 * saw + 0.04 * Math.sin(angle * 3);
}

/**
 * The two halves of a broken shell, as separate open cups: every triangle of
 * the egg goes to whichever side of the crack its middle is on. A sphere this
 * fine makes the edge of the break come out ragged, which is right.
 */
export function crackedHalves(GFX) {
  const whole = new GFX.SphereGeometry(1, 48, 32);
  shapeEgg(whole.attributes.position.array);
  whole.scale(EGG_SCALE, EGG_SCALE, EGG_SCALE);
  whole.computeVertexNormals();
  const pos = whole.attributes.position;
  const nrm = whole.attributes.normal;
  const uv = whole.attributes.uv;
  const index = whole.index.array;
  const top = { pos: [], nrm: [], uv: [] }, bottom = { pos: [], nrm: [], uv: [] };
  for (let k = 0; k < index.length; k += 3) {
    const tri = [index[k], index[k + 1], index[k + 2]];
    let cx = 0, cy = 0, cz = 0;
    for (const i of tri) {
      cx += pos.getX(i) / 3;
      cy += pos.getY(i) / 3 / EGG_SCALE;
      cz += pos.getZ(i) / 3;
    }
    const angle = Math.atan2(cz, cx) + Math.PI;
    const half = cy > crackHeight(angle) - 0.3 ? top : bottom;
    for (const i of tri) {
      half.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      half.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      half.uv.push(uv.getX(i), uv.getY(i));
    }
  }
  const build = (h) => {
    const g = new GFX.BufferGeometry();
    g.setAttribute('position', new GFX.Float32BufferAttribute(h.pos, 3));
    g.setAttribute('normal', new GFX.Float32BufferAttribute(h.nrm, 3));
    g.setAttribute('uv', new GFX.Float32BufferAttribute(h.uv, 2));
    return g;
  };
  return { top: build(top), bottom: build(bottom) };
}
