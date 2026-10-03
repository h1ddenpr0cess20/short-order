/**
 * The kitchen: a stretch of marble counter against a tiled wall, the board on
 * the left, the range on the right with the pan on its grate, and along the
 * back the bowl, the oil and a carton of eggs.
 *
 * Everything is placed here and nowhere else. The simulations work in the
 * frames of the things they are about — the board's, the pan's, the bowl's —
 * and this is what puts those frames in the room.
 */

import { BOARD, buildBoard, buildGuide, buildKnife } from './board.js';
import { buildBowl, buildPlate, buildSpatula, buildWhisk } from './cookware.js';
import { IRON, buildPan } from './pan.js';
import { buildBottle, buildCarton } from './pantry.js';
import { GRATE_TOP, TOP, buildStove } from './stove.js';
import { marble, studio, subwayTile } from './textures.js';

/** Where each station stands on the counter, in the room's frame. */
export const LAYOUT = Object.freeze({
  board: { x: -8.6, z: 1.6 },
  stove: { x: 9.4, z: 0.4 },
  bowl: { x: -0.9, z: -8.6 },
  carton: { x: -13.4, z: -8.8 },
  oil: { x: -6.7, z: -9.9 },
  plate: { x: 0.4, z: 11.5 },
});

/** The pan's handle comes out toward the cook, a little to the right. */
export const HANDLE_TURN = Math.PI + Math.PI / 6.5;

/** The wall, and how far back it stands. */
const WALL = { z: -13.6, height: 26 };

/** The pan's cooking surface, above the counter. */
export const PAN_Y = GRATE_TOP + IRON;

export function buildKitchen({ stage, GFX }) {
  const room = new GFX.Group();
  room.name = 'kitchen';

  /** The counter: one slab of marble, wide enough that its ends are never in shot. */
  const counterMap = marble(GFX);
  if (counterMap) counterMap.repeat.set(110 / 22, 40 / 22);
  const counter = new GFX.Mesh(
    new GFX.BoxGeometry(110, 2, 40),
    new GFX.MeshPhysicalMaterial({
      name: 'counter', color: counterMap ? 0xffffff : 0xe8e2d8, map: counterMap, roughness: 0.34, metalness: 0,
      clearcoat: 0.25, clearcoatRoughness: 0.4,
    }),
  );
  counter.name = 'counter';
  counter.position.set(0, -1, WALL.z + 20);
  room.add(counter);

  const tiles = subwayTile(GFX);
  if (tiles) tiles.repeat.set(110 / 16, WALL.height / 8);
  const wall = new GFX.Mesh(
    new GFX.PlaneGeometry(110, WALL.height),
    new GFX.MeshPhysicalMaterial({
      name: 'wall-tile', color: tiles ? 0xffffff : 0xece8e0, map: tiles, roughness: 0.25, metalness: 0,
      clearcoat: 0.6, clearcoatRoughness: 0.2,
    }),
  );
  wall.name = 'wall';
  wall.position.set(0, WALL.height / 2, WALL.z);
  room.add(wall);

  const stove = buildStove(GFX);
  stove.group.position.set(LAYOUT.stove.x, 0, LAYOUT.stove.z);
  room.add(stove.group);

  /** The pan sits in its own group so a toss can lift it without moving its frame. */
  const pan = buildPan(GFX);
  const panRig = new GFX.Group();
  panRig.name = 'pan-rig';
  panRig.position.set(LAYOUT.stove.x, PAN_Y, LAYOUT.stove.z);
  pan.group.rotation.y = HANDLE_TURN;
  panRig.add(pan.group);
  room.add(panRig);

  const board = buildBoard(GFX);
  board.group.position.set(LAYOUT.board.x, 0, LAYOUT.board.z);
  room.add(board.group);

  /** The knife lies flat along the back of the board until it is picked up. */
  const knife = buildKnife(GFX);
  knife.rest = { x: LAYOUT.board.x + 1.9, y: BOARD.h + 0.03, z: LAYOUT.board.z - BOARD.d / 2 + 1.05 };
  knife.group.position.set(knife.rest.x, knife.rest.y, knife.rest.z);
  knife.group.rotation.set(-Math.PI / 2, 0, 0);
  room.add(knife.group);
  const guide = buildGuide(GFX);
  room.add(guide);

  const bowl = buildBowl(GFX);
  bowl.group.position.set(LAYOUT.bowl.x, 0, LAYOUT.bowl.z);
  room.add(bowl.group);

  /** The whisk leans in the bowl. */
  const whisk = buildWhisk(GFX);
  whisk.group.position.set(LAYOUT.bowl.x + 0.3, bowl.floor + 0.05, LAYOUT.bowl.z + 0.2);
  whisk.group.rotation.set(0.25, 0.5, -0.62);
  room.add(whisk.group);

  const carton = buildCarton(GFX);
  carton.group.position.set(LAYOUT.carton.x, 0, LAYOUT.carton.z);
  carton.group.rotation.y = 0.12;
  room.add(carton.group);

  const oil = buildBottle(GFX);
  oil.group.position.set(LAYOUT.oil.x, 0, LAYOUT.oil.z);
  room.add(oil.group);

  /** The spatula waits on the counter in front, between the board and the range. */
  const spatula = buildSpatula(GFX);
  spatula.rest = { x: 0.6, y: 0.02, z: 5.4, yaw: -0.18 };
  spatula.group.position.set(spatula.rest.x, spatula.rest.y, spatula.rest.z);
  spatula.group.rotation.set(0, spatula.rest.yaw, 0);
  room.add(spatula.group);

  const plate = buildPlate(GFX);
  plate.group.position.set(LAYOUT.plate.x, 0, LAYOUT.plate.z);
  plate.group.visible = false;
  room.add(plate.group);

  stage.setObject(room);
  light({ stage, GFX });

  /** Nothing should cast a shadow it cannot hold still: the flame and its glow are light. */
  for (const name of ['flame', 'flame-glow', 'cut-guide']) {
    const o = room.getObjectByName(name);
    if (o) o.castShadow = o.receiveShadow = false;
  }

  const camera = stage._camera;
  const controls = stage._controls;
  controls.enabled = false;

  /**
   * What has to be in shot: the board, the whole of the range and the pan's
   * handle, and the row along the back up to the top of the bottle.
   */
  const keep = [];
  const corners = (x0, x1, y0, y1, z0, z1) => {
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) keep.push(new GFX.Vector3(x, y, z));
  };
  corners(LAYOUT.board.x - BOARD.w / 2, LAYOUT.board.x + BOARD.w / 2, 0, BOARD.h + 2.5, LAYOUT.board.z - BOARD.d / 2, LAYOUT.board.z + BOARD.d / 2);
  corners(LAYOUT.stove.x - TOP.w / 2, LAYOUT.stove.x + TOP.w / 2, 0, PAN_Y + 2, LAYOUT.stove.z - TOP.d / 2, LAYOUT.stove.z + TOP.d / 2);
  corners(LAYOUT.carton.x - 4, LAYOUT.bowl.x + 4, 0, 3.5, LAYOUT.bowl.z - 4, LAYOUT.bowl.z + 2);

  const view = { pitch: 0.88, yaw: 0, fov: 34 };
  const scratch = new GFX.Vector3();
  const target = new GFX.Vector3();

  function place(dist) {
    camera.position.set(
      target.x + Math.sin(view.yaw) * Math.cos(view.pitch) * dist,
      target.y + Math.sin(view.pitch) * dist,
      target.z + Math.cos(view.yaw) * Math.cos(view.pitch) * dist,
    );
    camera.near = Math.max(0.5, dist / 60);
    camera.far = dist * 6;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
  }

  /** Inside the frame, clear of the strip the recipe card has and the bar at the bottom. */
  function fits(margin) {
    return keep.every((p) => {
      const ndc = scratch.copy(p).project(camera);
      return Math.abs(ndc.x) <= 1 - margin.x && ndc.y >= -1 + margin.bottom && ndc.y <= 1 - margin.top;
    });
  }

  /**
   * Framed by asking: walk back until every corner that matters is on screen.
   * The middle of the shot is the middle of what has to be in it, so a tall
   * window and a wide one both come out filled.
   */
  function frame() {
    camera.fov = view.fov;
    const box = new GFX.Box3().setFromPoints(keep);
    box.getCenter(target);
    target.y = 0;
    const narrow = stage.clientWidth < 720;
    const margin = { x: 0.03, top: narrow ? 0.2 : 0.12, bottom: narrow ? 0.24 : 0.14 };
    const want = (margin.bottom - margin.top) / 2;
    let dist = 20;
    for (let pass = 0; pass < 4; pass++) {
      dist = 20;
      place(dist);
      for (let i = 0; i < 120 && !fits(margin); i++) {
        dist *= 1.03;
        place(dist);
      }
      /**
       * Then slid along the counter until the slack is shared top and bottom:
       * the corners nearest the camera and those furthest from it do not sit
       * symmetrically round wherever the box's middle happens to be.
       */
      let lo = Infinity, hi = -Infinity;
      for (const p of keep) {
        const y = scratch.copy(p).project(camera).y;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      const off = (lo + hi) / 2 - want;
      if (Math.abs(off) < 0.004) break;
      target.z -= off * dist * 0.45;
    }
    place(dist);
  }

  frame();
  const observer = new ResizeObserver(() => frame());
  observer.observe(stage);

  return {
    room, camera, frame,
    stove, pan, panRig, board, knife, guide, bowl, whisk, carton, oil, spatula, plate,
  };
}

/**
 * The light: the morning coming in from the left as the key, which is the one
 * that casts; a pendant over the counter; a cool fill from the right; and the
 * room itself, prefiltered, in everything shiny.
 */
function light({ stage, GFX }) {
  const scene = stage._scene;
  const renderer = stage._renderer;
  try {
    const env = studio(GFX);
    if (env) {
      const pmrem = new GFX.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(env).texture;
      pmrem.dispose();
    }
  } catch {
  }
  scene.environmentIntensity = 0.7;

  scene.traverse((o) => {
    if (o.isHemisphereLight) {
      o.color.set(0xfff4e6);
      o.groundColor.set(0x5a4a3a);
      o.intensity = 0.55;
    }
  });

  const key = stage._key;
  key.color.set(0xfff1dc);
  key.intensity = 2.1;
  key.position.set(-14, 30, 16);
  key.target.position.set(0, 0, 0);
  key.target.updateMatrixWorld();
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 2;
  const cam = key.shadow.camera;
  cam.left = -30;
  cam.right = 30;
  cam.top = 24;
  cam.bottom = -24;
  cam.near = 1;
  cam.far = 90;
  cam.updateProjectionMatrix();

  scene.traverse((o) => {
    if (o.isDirectionalLight && o !== key) {
      o.color.set(0xdfe8ff);
      o.intensity = 0.4;
      o.position.set(18, 14, 10);
    }
  });

  const pendant = new GFX.PointLight(0xffe2b8, 160, 60, 2);
  pendant.name = 'pendant';
  pendant.position.set(-2, 19, 3);
  scene.add(pendant);

  if (stage._ground) stage._ground.visible = false;
}
