/**
 * The cutting board and the knife.
 *
 * The board is a slab of edge-grain maple with its corners rounded off, long
 * side left to right. Whatever is being cut lies on it front to back, so the
 * knife comes down across it with its blade towards the cook: every cut is a
 * plane z = constant in the board's own frame, and the blade is seen side on as
 * it falls, which is how a chop looks from where somebody is standing.
 */

import { endGrain, maple } from './textures.js';

export const BOARD = Object.freeze({ w: 15, d: 10.4, h: 0.9, round: 0.9 });

function roundedRect(GFX, w, d, r) {
  const shape = new GFX.Shape();
  const x = w / 2, z = d / 2;
  shape.moveTo(-x + r, -z);
  shape.lineTo(x - r, -z);
  shape.quadraticCurveTo(x, -z, x, -z + r);
  shape.lineTo(x, z - r);
  shape.quadraticCurveTo(x, z, x - r, z);
  shape.lineTo(-x + r, z);
  shape.quadraticCurveTo(-x, z, -x, z - r);
  shape.lineTo(-x, -z + r);
  shape.quadraticCurveTo(-x, -z, -x + r, -z);
  return shape;
}

export function buildBoard(GFX) {
  const group = new GFX.Group();
  group.name = 'board';

  const top = maple(GFX);
  if (top) {
    /** The lids' UVs are the outline's own coordinates, in units. */
    top.repeat.set(1 / BOARD.w, 1 / BOARD.d);
    top.offset.set(0.5, 0.5);
  }
  const side = endGrain(GFX);
  if (side) side.repeat.set(0.5, 1.4);

  const face = new GFX.MeshStandardMaterial({ name: 'maple', color: 0xffffff, map: top, roughness: 0.62, metalness: 0 });
  const edge = new GFX.MeshStandardMaterial({ name: 'maple-edge', color: 0xe0c49c, map: side, roughness: 0.7, metalness: 0 });
  if (!top) face.color.set(0xdcb57e);

  const bevel = 0.12;
  const geometry = new GFX.ExtrudeGeometry(roundedRect(GFX, BOARD.w - bevel * 2, BOARD.d - bevel * 2, BOARD.round), {
    depth: BOARD.h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6,
  });
  /** Extruded up z, then stood on the counter with z turned into y. */
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  geometry.computeVertexNormals();
  const slab = new GFX.Mesh(geometry, [face, edge]);
  slab.name = 'board-slab';
  group.add(slab);

  return { group, top: BOARD.h };
}

/**
 * A chef's knife: a blade with a curved belly running to a point, a bolster,
 * and a black handle with three rivets. Built lying along −x from the heel, the
 * edge down at y = 0 and the spine up, blade flat in the xy plane.
 */
export function buildKnife(GFX) {
  const group = new GFX.Group();
  group.name = 'knife';

  const steel = new GFX.MeshPhysicalMaterial({
    name: 'knife-steel', color: 0xd2d6dc, roughness: 0.3, metalness: 0.78, clearcoat: 0.5, clearcoatRoughness: 0.15,
  });
  const black = new GFX.MeshStandardMaterial({ name: 'knife-handle', color: 0x161514, roughness: 0.48, metalness: 0.05 });
  const rivet = new GFX.MeshStandardMaterial({ name: 'knife-rivet', color: 0xcfd2d6, roughness: 0.25, metalness: 1 });

  /** The blade's outline: heel at x = 0, tip at x = −LENGTH. */
  const LENGTH = 7.6, HEEL = 1.75;
  const shape = new GFX.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-LENGTH * 0.55, 0);
  shape.quadraticCurveTo(-LENGTH * 0.9, 0.05, -LENGTH, HEEL * 0.78);
  shape.quadraticCurveTo(-LENGTH * 0.6, HEEL * 0.98, -LENGTH * 0.2, HEEL);
  shape.lineTo(0, HEEL);
  shape.lineTo(0, 0);
  const blade = new GFX.ExtrudeGeometry(shape, {
    depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 1, curveSegments: 16,
  });
  blade.translate(0, 0, -0.02);
  const bladeMesh = new GFX.Mesh(blade, steel);
  bladeMesh.name = 'knife-blade';
  group.add(bladeMesh);

  const bolster = new GFX.Mesh(new GFX.BoxGeometry(0.42, HEEL * 0.9, 0.2), steel);
  bolster.name = 'knife-bolster';
  bolster.position.set(0.18, HEEL * 0.55, 0);
  group.add(bolster);

  const grip = new GFX.Mesh(new GFX.CylinderGeometry(0.34, 0.3, 3.9, 20), black);
  grip.name = 'knife-grip';
  grip.rotation.z = Math.PI / 2;
  grip.scale.set(1, 1, 0.68);
  grip.position.set(2.35, HEEL * 0.62, 0);
  group.add(grip);
  for (const x of [1.25, 2.3, 3.35]) {
    for (const z of [-0.235, 0.235]) {
      const r = new GFX.Mesh(new GFX.CylinderGeometry(0.08, 0.08, 0.02, 12), rivet);
      r.name = 'knife-rivet';
      r.rotation.x = Math.PI / 2;
      r.position.set(x, HEEL * 0.62, z);
      group.add(r);
    }
  }

  return { group, length: LENGTH, heel: HEEL };
}

/**
 * Where the next cut will go: a thin bright sheet standing in the plane of the
 * blade, as wide and as tall as whatever it would pass through. Drawn over the
 * food so it reads as a line across the top of it.
 */
export function buildGuide(GFX) {
  const mesh = new GFX.Mesh(
    new GFX.PlaneGeometry(1, 1),
    new GFX.MeshBasicMaterial({
      name: 'cut-guide', color: 0xfff6dc, transparent: true, opacity: 0.32, depthWrite: false, side: GFX.DoubleSide,
    }),
  );
  mesh.name = 'cut-guide';
  mesh.renderOrder = 5;
  mesh.visible = false;
  return mesh;
}
