/**
 * Things on the counter round the job: a folded tea towel, which is only
 * there to be there — a kitchen with nothing in it but the job looks like a
 * stage — and the pepper mill, the little pot of salt and the butter, which
 * the cook reaches for.
 */

import { cast } from './cast.js';
import { extrude, planarUV, roundRect } from './sdf.js';
import { flakes, graterFace, slicerFace, towel, walnut } from './textures.js';
import { floorFrom } from '../sim/pile.js';

const v2 = (GFX, points) => points.map(([x, y]) => new GFX.Vector2(x, y));

/**
 * A thin round wire bent round a rounded rectangle `w` by `d`, corners `r`,
 * lying flat at y = 0: the gilt line round the top of a dish.
 */
function roundedTube(GFX, w, d, r, thick, sides = 6) {
  const path = [];
  const straight = (x0, z0, x1, z1) => path.push([x0, z0], [x1, z1]);
  const corner = (cx, cz, from) => {
    for (let k = 1; k < 8; k++) {
      const a = from + (k / 8) * (Math.PI / 2);
      path.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  const x = w / 2 - r, z = d / 2 - r;
  straight(-x, -d / 2, x, -d / 2);
  corner(x, -z, -Math.PI / 2);
  straight(w / 2, -z, w / 2, z);
  corner(x, z, 0);
  straight(x, d / 2, -x, d / 2);
  corner(-x, z, Math.PI / 2);
  straight(-w / 2, z, -w / 2, -z);
  corner(-x, -z, Math.PI);
  const n = path.length;
  const position = [], normal = [], index = [];
  for (let i = 0; i < n; i++) {
    const [px, pz] = path[i];
    const [ax, az] = path[(i - 1 + n) % n], [bx, bz] = path[(i + 1) % n];
    /** Outward across the path, in the plane. */
    let ox = bz - az, oz = -(bx - ax);
    const len = Math.hypot(ox, oz) || 1;
    ox /= len; oz /= len;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const nx = ox * Math.cos(a), ny = Math.sin(a), nz = oz * Math.cos(a);
      position.push(px + nx * thick, ny * thick, pz + nz * thick);
      normal.push(nx, ny, nz);
      const j = (i + 1) % n, l = (k + 1) % sides;
      index.push(i * sides + k, j * sides + k, j * sides + l, i * sides + k, j * sides + l, i * sides + l);
    }
  }
  const geometry = new GFX.BufferGeometry();
  geometry.setAttribute('position', new GFX.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new GFX.Float32BufferAttribute(normal, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Glazes and metals the props share. */
function finishes(GFX) {
  return {
    gold: new GFX.MeshStandardMaterial({ name: 'gilt', color: 0xd8b26a, roughness: 0.28, metalness: 1 }),
    green: new GFX.MeshPhysicalMaterial({
      name: 'green-glaze', color: 0x1f3d30, roughness: 0.22, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.12,
    }),
    cream: new GFX.MeshPhysicalMaterial({
      name: 'cream-glaze', color: 0xf3ecdd, roughness: 0.26, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.15,
    }),
  };
}

/**
 * A linen towel folded in three: three soft layers, each a hair in from the
 * one under it, and the rolled edge of the cloth where each one folds back on
 * the next — on alternate sides, the way a fold goes. Cast in one piece, so
 * the cloth is soft at every edge.
 */
export function buildTowel(GFX) {
  const W = 7.2, D = 3.6, T = 0.13;
  const map = towel(GFX);
  if (map) {
    map.repeat.set(1, 1);
    map.offset.set(0.5, 0.5);
  }
  const cloth = new GFX.MeshStandardMaterial({
    name: 'towel', color: map ? 0xffffff : 0xece3cf, map, bumpMap: map, bumpScale: 0.6, roughness: 0.96, metalness: 0,
  });
  const distance = (x, y, z) => {
    let d = Infinity;
    for (let k = 0; k < 3; k++) {
      const w = W - k * 0.1, depth = D - k * 0.06;
      /** Each layer sags a touch towards its middle, and the cloth is never quite flat. */
      const lift = k * (T - 0.012) - 0.012 * Math.cos((x / w) * Math.PI) * k;
      d = Math.min(d, extrude(roundRect(x, z, w, depth, 0.18), y, lift, lift + T, T * 0.48));
      if (k > 0) {
        /** The fold: a rolled edge joining this layer to the one under it. */
        const side = k % 2 ? 1 : -1;
        const fold = Math.hypot(x - side * (w / 2 - T * 0.7), y - lift) - T * 0.92;
        d = Math.min(d, Math.max(fold, Math.abs(z) - depth / 2 + 0.1, -side * x + side * (w / 2 - T * 0.7)));
      }
    }
    return d;
  };
  const geometry = planarUV(GFX, cast(GFX, { distance, from: [-3.8, -0.1, -2], to: [3.8, 0.55, 2], step: 0.075 }));
  /** Laid on so the painted towel covers the top layer edge to edge. */
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / W, -uv.getY(i) / D);
  const group = new GFX.Group();
  group.name = 'towel';
  const mesh = new GFX.Mesh(geometry, cloth);
  mesh.name = 'towel-fold';
  group.add(mesh);
  return { group };
}

/**
 * A pepper mill turned from walnut: a flared foot with a brass band, a waist
 * to hold it by, the body swelling to the shoulder, and a domed crown with a
 * brass finial that turns it.
 */
export function buildMill(GFX) {
  const grain = walnut(GFX);
  if (grain) grain.repeat.set(2, 1);
  const wood = new GFX.MeshPhysicalMaterial({
    name: 'mill-wood', color: grain ? 0xffffff : 0x4a2f1d, map: grain, roughness: 0.38, metalness: 0,
    clearcoat: 0.55, clearcoatRoughness: 0.3,
  });
  const { gold } = finishes(GFX);
  const body = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, [
    [0, 0], [0.96, 0], [1.0, 0.06], [1.0, 0.34], [0.9, 0.46], [0.8, 0.8], [0.74, 1.4], [0.74, 2.1],
    [0.8, 2.7], [0.9, 3.2], [0.96, 3.55], [0.96, 3.72], [0.88, 3.82], [0.66, 3.86],
  ]), 40), wood);
  body.name = 'mill-body';
  const crown = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, [
    [0.62, 3.84], [0.76, 3.9], [0.82, 4.05], [0.78, 4.3], [0.6, 4.58], [0.36, 4.76], [0.16, 4.84], [0, 4.86],
  ]), 40), wood);
  crown.name = 'mill-crown';
  const band = new GFX.Mesh(new GFX.CylinderGeometry(1.005, 1.005, 0.16, 40, 1, true), gold);
  band.name = 'mill-band';
  band.position.y = 0.22;
  const seam = new GFX.Mesh(new GFX.TorusGeometry(0.72, 0.035, 8, 40), gold);
  seam.name = 'mill-seam';
  seam.rotation.x = Math.PI / 2;
  seam.position.y = 3.86;
  const knob = new GFX.Mesh(new GFX.SphereGeometry(0.2, 16, 10), gold);
  knob.name = 'mill-knob';
  knob.scale.set(1, 0.8, 1);
  knob.position.y = 4.98;
  const stem = new GFX.Mesh(new GFX.CylinderGeometry(0.08, 0.12, 0.18, 12), gold);
  stem.name = 'mill-stem';
  stem.position.y = 4.88;
  const group = new GFX.Group();
  group.name = 'pepper-mill';
  group.add(body, crown, band, seam, stem, knob);
  return { group, height: 5 };
}

/**
 * A box grater: four steel faces punched with grating holes, tapering up to a
 * rolled rim, and a black handle over the top. Cheese let go over it comes
 * out the bottom, shredded.
 */
export function buildGrater(GFX) {
  const face = graterFace(GFX);
  if (face) face.repeat.set(4, 1);
  const steel = new GFX.MeshPhysicalMaterial({
    name: 'grater-steel', color: face ? 0xffffff : 0xb9bdc2, map: face, bumpMap: face, bumpScale: 0.6,
    roughness: 0.32, metalness: 0.85, side: GFX.DoubleSide,
  });
  const rimSteel = new GFX.MeshStandardMaterial({ name: 'grater-rim', color: 0xc9ccd0, roughness: 0.25, metalness: 0.9 });
  const black = new GFX.MeshPhysicalMaterial({ name: 'grater-handle', color: 0x1b1c1e, roughness: 0.45, metalness: 0, clearcoat: 0.3 });
  /** Square in section, turned a quarter so its faces are front, back and sides, and drawn out wider than deep. */
  const H = 3.4;
  const body = new GFX.Mesh(new GFX.CylinderGeometry(0.95, 1.45, H, 4, 1, true), steel);
  body.name = 'grater-body';
  body.rotation.y = Math.PI / 4;
  body.position.y = H / 2;
  const rim = new GFX.Mesh(new GFX.TorusGeometry(0.95, 0.07, 6, 4), rimSteel);
  rim.name = 'grater-rim';
  rim.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  rim.position.y = H;
  const foot = new GFX.Mesh(new GFX.TorusGeometry(1.45, 0.06, 6, 4), rimSteel);
  foot.name = 'grater-foot';
  foot.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  foot.position.y = 0.06;
  const handle = new GFX.Mesh(new GFX.TorusGeometry(0.62, 0.13, 10, 24, Math.PI), black);
  handle.name = 'grater-handle';
  handle.position.y = H + 0.02;
  /**
   * The slicing side, on +x: a plain panel with one wide slot, laid over the
   * side it is on, which leans in toward the top like the rest.
   */
  const slicer = slicerFace(GFX);
  const sliceSteel = new GFX.MeshPhysicalMaterial({
    name: 'grater-slicer', color: slicer ? 0xffffff : 0xc3c6ca, map: slicer, roughness: 0.28, metalness: 0.85, side: GFX.DoubleSide,
  });
  const out = (y) => (1.45 + ((0.95 - 1.45) * y) / H) * Math.SQRT1_2;
  const y0 = 0.12, y1 = H - 0.06;
  const corners = [[out(y0) + 0.012, y0, -out(y0) + 0.03], [out(y0) + 0.012, y0, out(y0) - 0.03], [out(y1) + 0.012, y1, out(y1) - 0.03], [out(y1) + 0.012, y1, -out(y1) + 0.03]];
  const lean = Math.hypot(H, 0.5 * Math.SQRT1_2);
  const n = [H / lean, (0.5 * Math.SQRT1_2) / lean, 0];
  const panel = new GFX.BufferGeometry();
  panel.setAttribute('position', new GFX.BufferAttribute(Float32Array.from([0, 2, 1, 0, 3, 2].flatMap((i) => corners[i])), 3));
  panel.setAttribute('normal', new GFX.BufferAttribute(Float32Array.from(Array.from({ length: 6 }, () => n).flat()), 3));
  panel.setAttribute('uv', new GFX.BufferAttribute(Float32Array.from([0, 2, 1, 0, 3, 2].flatMap((i) => [[0, 0], [1, 0], [1, 1], [0, 1]][i])), 2));
  panel.computeBoundingSphere?.();
  const slicing = new GFX.Mesh(panel, sliceSteel);
  slicing.name = 'grater-slicer';
  const shape = new GFX.Group();
  shape.scale.set(1, 1, 0.72);
  shape.add(body, rim, foot, handle, slicing);
  const group = new GFX.Group();
  group.name = 'grater';
  group.add(shape);
  for (const m of [body, rim, foot, handle]) m.castShadow = m.receiveShadow = true;
  slicing.receiveShadow = true;
  return { group, height: H + 0.75 };
}

/**
 * A pinch pot of flaky salt: green glaze outside, cream inside, a gilt line
 * round the rim, and a heap of flakes in it.
 */
export function buildSaltDish(GFX) {
  const { gold, green, cream } = finishes(GFX);
  /** One wall, out and up the outside, then down the inside: two glazes, so two turnings. */
  const outside = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, [
    [0, 0], [0.9, 0], [0.98, 0.06], [1.0, 0.14], [1.26, 0.42], [1.42, 0.78], [1.48, 1.02],
  ]), 40), green);
  outside.name = 'salt-dish';
  const inside = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, [
    [1.48, 1.02], [1.36, 1.0], [1.28, 0.74], [1.08, 0.42], [0.7, 0.26], [0, 0.24],
  ]), 40), cream);
  inside.name = 'salt-dish-inside';
  const rim = new GFX.Mesh(new GFX.TorusGeometry(1.43, 0.045, 8, 48), gold);
  rim.name = 'salt-dish-rim';
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.02;

  const map = flakes(GFX);
  if (map) map.repeat.set(2, 2);
  const salt = new GFX.MeshStandardMaterial({
    name: 'salt', color: 0xffffff, map, bumpMap: map, bumpScale: 1.4, roughness: 0.7, metalness: 0,
  });
  const heap = new GFX.Mesh(new GFX.SphereGeometry(1.2, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), salt);
  heap.name = 'salt';
  heap.scale.set(1, 0.34, 1);
  heap.position.y = 0.56;
  const group = new GFX.Group();
  group.name = 'salt';
  group.add(outside, inside, rim, heap);
  return { group, height: 1.1 };
}

/**
 * One of the extras, whole, sitting on the counter waiting for the knife: the
 * same solids that go onto the board when it is picked up, at the same size,
 * so what is on the counter is what gets cut. Stood on the counter round its
 * own middle; `size` is its footprint and height, for reaching for it.
 */
export function buildWhole(GFX, { name, solids }) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const solid of solids) {
    for (let i = 0; i < solid.pos.length; i += 3) {
      x0 = Math.min(x0, solid.pos[i]);
      x1 = Math.max(x1, solid.pos[i]);
      y0 = Math.min(y0, solid.pos[i + 1]);
      y1 = Math.max(y1, solid.pos[i + 1]);
      z0 = Math.min(z0, solid.pos[i + 2]);
      z1 = Math.max(z1, solid.pos[i + 2]);
    }
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const pos = [], nrm = [], col = [];
  for (const solid of solids) {
    for (let i = 0; i < solid.pos.length; i += 3) {
      pos.push(solid.pos[i] - cx, solid.pos[i + 1] - y0, solid.pos[i + 2] - cz);
      nrm.push(solid.nrm[i], solid.nrm[i + 1], solid.nrm[i + 2]);
      col.push(solid.col[i], solid.col[i + 1], solid.col[i + 2]);
    }
  }
  const geometry = new GFX.BufferGeometry();
  geometry.setAttribute('position', new GFX.BufferAttribute(Float32Array.from(pos), 3));
  geometry.setAttribute('normal', new GFX.BufferAttribute(Float32Array.from(nrm), 3));
  geometry.setAttribute('color', new GFX.BufferAttribute(Float32Array.from(col), 3));
  geometry.computeBoundingSphere?.();
  const mesh = new GFX.Mesh(geometry, new GFX.MeshPhysicalMaterial({
    name: `whole-${name}`, vertexColors: true, roughness: 0.55, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4,
  }));
  mesh.name = `whole-${name}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new GFX.Group();
  group.name = `extra-${name}`;
  group.add(mesh);
  return { group, size: [x1 - x0, y1 - y0, z1 - z0] };
}

/**
 * An empty ramekin, for whatever the cook has cut and wants to keep apart
 * until it goes in the pan: cream china with a green band and a gilt rim,
 * `radius` across the rim. Its contents hang off `group`, in its own frame,
 * poured into `dish`.
 */
export function buildRamekin(GFX, { name, radius = 1.5 }) {
  /** How deep it is drawn, for how wide: deep enough to hold half a potato, diced. */
  const DEEP = 1.15;
  const { gold, cream, green } = finishes(GFX);
  const outside = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, [
    [0, 0], [0.72, 0], [0.78, 0.05], [0.82, 0.12], [0.86, 0.7], [0.88, 0.84],
  ]), 40), cream);
  outside.name = `ramekin-${name}`;
  /** The inside, from the middle of the floor out and up to the rim. */
  const well = [[0, 0.18], [0.6, 0.2], [0.76, 0.3], [0.8, 0.82], [0.88, 0.84]];
  const inside = new GFX.Mesh(new GFX.LatheGeometry(v2(GFX, [...well].reverse()), 40), cream);
  inside.name = `ramekin-${name}-inside`;
  const band = new GFX.Mesh(new GFX.CylinderGeometry(0.865, 0.85, 0.12, 40, 1, true), green);
  band.name = `ramekin-${name}-band`;
  band.position.y = 0.6;
  const rim = new GFX.Mesh(new GFX.TorusGeometry(0.86, 0.035, 8, 48), gold);
  rim.name = `ramekin-${name}-rim`;
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.84;
  for (const m of [outside, inside, band, rim]) m.receiveShadow = true;
  /** Drawn at the size of the little one, and grown: the china, not what goes in it. */
  const k = radius / 0.88;
  const china = new GFX.Group();
  china.scale.set(k, k * DEEP, k);
  china.add(outside, inside, band, rim);
  const group = new GFX.Group();
  group.name = `ramekin-${name}`;
  group.add(china);
  /**
   * What is poured in piles on its floor, which curves up into the side, and
   * on over the rim if there is a lot of it; the middle of every piece is
   * inside, but a heap can spill over the rim.
   */
  const wellAt = floorFrom(well.map(([r, y]) => [r * k, y * k * DEEP]));
  const dish = {
    base: (x, z) => (Math.hypot(x, z) <= 0.9 * k ? wellAt(Math.hypot(x, z)) : 0),
    holds: (x, z) => Math.hypot(x, z) <= 0.7 * k,
    centre: [0, 0],
    spread: 0.3,
    /** Heaped up over the rim, as much as it will take, and no more. */
    brim: 0.84 * k * DEEP + 0.8,
  };
  return { group, radius, dish };
}

/** How many pats there are in a stick of butter. */
export const PATS = 8;

/**
 * A stick of butter on a china dish with a gilt rim, still on its gold foil.
 * Every pat taken off it shortens the stick from the cut end; `left(k)` shows
 * it with that share still there.
 */
export function buildButter(GFX) {
  const { gold, cream } = finishes(GFX);
  const fat = new GFX.MeshPhysicalMaterial({
    name: 'butter', color: 0xf5dd8e, roughness: 0.46, metalness: 0, sheen: 0.4, sheenColor: new GFX.Color(0xfff2c4),
  });
  const group = new GFX.Group();
  group.name = 'butter';
  const W = 4.6, D = 2.4;
  /** The dish: a slab of china with a raised lip all round, every edge rounded, cast in one. */
  const dishDistance = (x, y, z) => {
    const outer = extrude(roundRect(x, z, W, D, 0.5), y, 0, 0.42, 0.1);
    const well = extrude(roundRect(x, z, W - 0.4, D - 0.4, 0.32), y, 0.2, 1, 0.08);
    return Math.max(outer, -well);
  };
  const dish = new GFX.Mesh(cast(GFX, { distance: dishDistance, from: [-2.4, -0.06, -1.3], to: [2.4, 0.5, 1.3], step: 0.07 }), cream);
  dish.name = 'butter-dish';
  group.add(dish);
  /** A gilt line round the top of the lip. */
  const gilt = new GFX.Mesh(roundedTube(GFX, W - 0.2, D - 0.2, 0.42, 0.045), gold);
  gilt.name = 'butter-dish-gilt';
  gilt.position.y = 0.425;
  group.add(gilt);

  /** The foil it came in, opened out flat under it and creased. */
  const foil = new GFX.Mesh(
    new GFX.PlaneGeometry(3.95, 1.75, 8, 3),
    new GFX.MeshStandardMaterial({ name: 'butter-foil', color: 0xe6c47a, roughness: 0.42, metalness: 0.65, side: GFX.DoubleSide }),
  );
  foil.name = 'butter-foil';
  const crease = foil.geometry.attributes.position;
  for (let i = 0; i < crease.count; i++) crease.setZ(i, (Math.sin(i * 2.3) * 0.5 + 0.5) * 0.03);
  foil.geometry.computeVertexNormals();
  foil.rotation.x = -Math.PI / 2;
  foil.position.y = 0.22;
  group.add(foil);

  const LENGTH = 3.6;
  const stickGeo = cast(GFX, {
    distance: (x, y, z) => extrude(roundRect(x, z, LENGTH, 1.2, 0.1), y, 0, 1.0, 0.07),
    from: [-1.9, -0.06, -0.7], to: [1.9, 1.06, 0.7], step: 0.08,
  });
  /** Pivoted on its left-hand, uncut end, so it can be shortened from the right. */
  stickGeo.translate(LENGTH / 2, 0, 0);
  const stick = new GFX.Mesh(stickGeo, fat);
  stick.name = 'butter-stick';
  stick.position.set(-LENGTH / 2, 0.23, 0);
  group.add(stick);
  return {
    group,
    height: 1.3,
    /** Shows the stick with `k` of it left: shorter from the right-hand, cut end. */
    left(k) {
      const keep = Math.max(0, Math.min(1, k));
      stick.visible = keep > 0.01;
      stick.scale.x = Math.max(0.01, keep);
    },
  };
}
