/**
 * The kitchen: a stretch of marble counter against a wall of green tile with
 * a brass rail along it, the board on
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
import { buildButter, buildMill, buildSaltDish, buildTowel } from './props.js';
import { GRATE_TOP, buildStove } from './stove.js';
import { brushed, greenTile, marble, studio } from './textures.js';

/**
 * Where each station stands on the counter, in the room's frame — one way
 * for a wide window, the board beside the range, and another for a tall one,
 * the board above it — and where the wall is behind them.
 */
export const LAYOUTS = Object.freeze({
  wide: {
    /** Far enough apart for the spatula to lie between them, clear of both and of the knob. */
    board: { x: -9.2, z: 1.6 },
    stove: { x: 10.0, z: 0.4 },
    bowl: { x: -3.1, z: -9.0 },
    carton: { x: -13.9, z: -9.0 },
    oil: { x: -8.45, z: -10.2 },
    plate: { x: 1.5, z: 14.2 },
    spatula: { x: -0.1, z: 6.6, yaw: Math.PI },
    towel: { x: -11.2, z: 10.6, yaw: 0.12 },
    mill: { x: 15.4, z: -10.6 },
    salt: { x: 11.6, z: -10.4 },
    butter: { x: 5.4, z: -10.3 },
    wall: -13.6,
  },
  tall: {
    board: { x: 0, z: -4.4 },
    stove: { x: 0.2, z: 10.4 },
    bowl: { x: 5.5, z: -15.2 },
    carton: { x: -5.1, z: -15.6 },
    oil: { x: 0.5, z: -16.6 },
    plate: { x: 0, z: 24 },
    /** Beside the board, the blade up by it and the handle down past the range, clear of both. */
    spatula: { x: -9.2, z: -3.6, yaw: 0 },
    towel: { x: -15, z: 2, yaw: -0.1 },
    mill: { x: 9.2, z: -1.4 },
    salt: { x: 9.1, z: -6.6 },
    butter: { x: -9.1, z: -6.6, yaw: Math.PI / 2 },
    wall: -19.6,
  },
});

/**
 * The layout in use. Everything reads its place from here, live; `arrange`
 * changes it, in place, when the window changes shape.
 */
export const LAYOUT = structuredClone(LAYOUTS.wide);

/** The pan's handle comes out toward the cook, a little to the right. */
export const HANDLE_TURN = Math.PI + Math.PI / 6.5;

/** The wall: how tall it is. Where it stands is the layout's. */
const WALL = { height: 26 };

/** The pan's cooking surface, above the counter. */
export const PAN_Y = GRATE_TOP + IRON;

export function buildKitchen({ stage, GFX }) {
  const room = new GFX.Group();
  room.name = 'kitchen';

  /** The counter: one slab of marble, wide enough that its ends are never in shot. */
  const counterMap = marble(GFX);
  if (counterMap) counterMap.repeat.set(110 / 22, 64 / 22);
  const counter = new GFX.Mesh(
    new GFX.BoxGeometry(110, 2, 64),
    new GFX.MeshPhysicalMaterial({
      name: 'counter', color: counterMap ? 0xffffff : 0xe8e2d8, map: counterMap, roughness: 0.34, metalness: 0,
      clearcoat: 0.25, clearcoatRoughness: 0.4,
    }),
  );
  counter.name = 'counter';
  room.add(counter);

  const tiles = greenTile(GFX);
  if (tiles) tiles.repeat.set(110 / 16, WALL.height / 8);
  const wall = new GFX.Mesh(
    new GFX.PlaneGeometry(110, WALL.height),
    new GFX.MeshPhysicalMaterial({
      name: 'wall-tile', color: tiles ? 0xffffff : 0x24493a, map: tiles, roughness: 0.22, metalness: 0,
      clearcoat: 0.8, clearcoatRoughness: 0.12,
    }),
  );
  wall.name = 'wall';
  room.add(wall);

  /**
   * Brass on the wall: a quarter-round where the tile meets the stone, and a
   * rail on standoffs a hand's height up, the kind ladles hang from.
   */
  const brass = new GFX.MeshStandardMaterial({
    name: 'wall-brass', color: 0xc9a25a, map: brushed(GFX, 256, '#b0b0b0'), roughness: 0.3, metalness: 1,
  });
  const trim = new GFX.Group();
  trim.name = 'wall-brass';
  const cove = new GFX.Mesh(new GFX.CylinderGeometry(0.22, 0.22, 110, 12, 1, false, 0, Math.PI / 2), brass);
  cove.name = 'wall-cove';
  cove.rotation.z = Math.PI / 2;
  trim.add(cove);
  const rail = new GFX.Mesh(new GFX.CylinderGeometry(0.17, 0.17, 110, 16), brass);
  rail.name = 'wall-rail';
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 4.6, 0.75);
  trim.add(rail);
  for (let x = -48; x <= 48; x += 12) {
    const post = new GFX.Mesh(new GFX.CylinderGeometry(0.1, 0.16, 0.75, 12), brass);
    post.name = 'wall-standoff';
    post.rotation.x = Math.PI / 2;
    post.position.set(x, 4.6, 0.38);
    trim.add(post);
    const rose = new GFX.Mesh(new GFX.CylinderGeometry(0.34, 0.36, 0.08, 20), brass);
    rose.name = 'wall-rose';
    rose.rotation.x = Math.PI / 2;
    rose.position.set(x, 4.6, 0.04);
    trim.add(rose);
  }
  room.add(trim);

  const stove = buildStove(GFX);
  room.add(stove.group);

  /** The pan sits in its own group so a toss can lift it without moving its frame. */
  const pan = buildPan(GFX);
  const panRig = new GFX.Group();
  panRig.name = 'pan-rig';
  /** Where the rig sits when nothing is tossing it. */
  const panHome = new GFX.Vector3();
  pan.group.rotation.y = HANDLE_TURN;
  panRig.add(pan.group);
  room.add(panRig);

  const board = buildBoard(GFX);
  room.add(board.group);

  /** The knife lies flat along the back of the board until it is picked up. */
  const knife = buildKnife(GFX);
  knife.rest = { x: 0, y: BOARD.h + 0.03, z: 0 };
  knife.group.rotation.set(-Math.PI / 2, 0, 0);
  room.add(knife.group);
  const guide = buildGuide(GFX);
  room.add(guide);

  const bowl = buildBowl(GFX);
  room.add(bowl.group);

  /** The whisk leans in the bowl. */
  const whisk = buildWhisk(GFX);
  whisk.rest = { position: new GFX.Vector3(), rotation: new GFX.Euler(0.25, 0.5, -0.62) };
  room.add(whisk.group);

  const carton = buildCarton(GFX);
  carton.group.rotation.y = 0.12;
  room.add(carton.group);

  const oil = buildBottle(GFX);
  room.add(oil.group);

  /** The spatula waits on the counter, between the board and the range. */
  const spatula = buildSpatula(GFX);
  spatula.rest = { x: 0, y: 0.03, z: 0, yaw: 0, pitch: 0 };
  /** Turned first, then tipped along its own length: the handle lifts straight up, not off to one side. */
  spatula.group.rotation.order = 'YXZ';
  room.add(spatula.group);

  const plate = buildPlate(GFX);
  plate.group.visible = false;
  room.add(plate.group);

  const props = { towel: buildTowel(GFX), mill: buildMill(GFX), salt: buildSaltDish(GFX), butter: buildButter(GFX) };
  for (const p of Object.values(props)) room.add(p.group);

  /** Told whenever the stations move, so anything that remembers where they were can catch up. */
  const arranged = new Set();
  let shape = null;

  /** Puts every station where `name`'s layout says, and the things at rest on them with them. */
  function arrange(name) {
    if (name === shape) return false;
    shape = name;
    Object.assign(LAYOUT, structuredClone(LAYOUTS[name]));
    wall.position.set(0, WALL.height / 2, LAYOUT.wall);
    trim.position.set(0, 0, LAYOUT.wall);
    counter.position.set(0, -1, LAYOUT.wall + 32);
    stove.group.position.set(LAYOUT.stove.x, 0, LAYOUT.stove.z);
    panHome.set(LAYOUT.stove.x, PAN_Y, LAYOUT.stove.z);
    panRig.position.copy(panHome);
    board.group.position.set(LAYOUT.board.x, 0, LAYOUT.board.z);
    Object.assign(knife.rest, { x: LAYOUT.board.x + 1.9, z: LAYOUT.board.z - BOARD.d / 2 + 1.05 });
    knife.group.position.set(knife.rest.x, knife.rest.y, knife.rest.z);
    bowl.group.position.set(LAYOUT.bowl.x, 0, LAYOUT.bowl.z);
    whisk.rest.position.set(LAYOUT.bowl.x + 0.3, bowl.floor + 0.05, LAYOUT.bowl.z + 0.2);
    whisk.group.position.copy(whisk.rest.position);
    whisk.group.rotation.copy(whisk.rest.rotation);
    carton.group.position.set(LAYOUT.carton.x, 0, LAYOUT.carton.z);
    oil.group.position.set(LAYOUT.oil.x, 0, LAYOUT.oil.z);
    Object.assign(spatula.rest, { x: LAYOUT.spatula.x, z: LAYOUT.spatula.z, yaw: LAYOUT.spatula.yaw });
    spatula.group.position.set(spatula.rest.x, spatula.rest.y, spatula.rest.z);
    spatula.group.rotation.set(spatula.rest.pitch, spatula.rest.yaw, 0);
    plate.group.position.set(LAYOUT.plate.x, 0, LAYOUT.plate.z);
    for (const [key, p] of Object.entries(props)) {
      p.group.position.set(LAYOUT[key].x, 0, LAYOUT[key].z);
      p.group.rotation.y = LAYOUT[key].yaw ?? 0;
    }
    for (const fn of arranged) fn(name);
    return true;
  }
  arrange('wide');

  stage.setObject(room);
  light({ stage, GFX });

  /** Nothing should cast a shadow it cannot hold still: the flame and its glow are light. */
  for (const name of ['flame', 'flame-glow', 'cut-guide']) {
    const o = room.getObjectByName(name);
    if (o) o.castShadow = o.receiveShadow = false;
  }

  const camera = stage._camera;
  const controls = stage._controls;
  /**
   * The camera is the kitchen's, not the orbit controls': switched off, they
   * still re-aim it at their own target every frame, so they are told to stop.
   */
  controls.enabled = false;
  controls.update = () => false;

  /**
   * What has to be in shot: the board, the pan to its rim and its handle out
   * to the hole in the end — the steel round it can be cropped — and the row
   * along the back.
   */
  const keep = [];
  function gather() {
    keep.length = 0;
    const corners = (x0, x1, y0, y1, z0, z1) => {
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) keep.push(new GFX.Vector3(x, y, z));
    };
    corners(LAYOUT.board.x - BOARD.w / 2, LAYOUT.board.x + BOARD.w / 2, 0, BOARD.h + 2.5, LAYOUT.board.z - BOARD.d / 2, LAYOUT.board.z + BOARD.d / 2);
    corners(LAYOUT.stove.x - 6.6, LAYOUT.stove.x + 6.6, 0, PAN_Y + 2, LAYOUT.stove.z - 6.6, LAYOUT.stove.z + 6.6);
    const reach = 6.35 + 6.6;
    keep.push(new GFX.Vector3(LAYOUT.stove.x - Math.sin(HANDLE_TURN) * reach, PAN_Y + 1.6, LAYOUT.stove.z - Math.cos(HANDLE_TURN) * reach));
    const row = [LAYOUT.carton, LAYOUT.oil, LAYOUT.bowl];
    corners(Math.min(...row.map((r) => r.x)) - 3.8, Math.max(...row.map((r) => r.x)) + 3.8, 0, 3.5,
      Math.min(...row.map((r) => r.z)) - 3, Math.max(...row.map((r) => r.z)) + 2.6);
    /** The salt, the pepper and the butter are things to reach for: they have to be in shot too. */
    for (const [key, half, height] of [['salt', 1.5, 1.1], ['mill', 1.0, 5.0], ['butter', 2.3, 1.3]]) {
      corners(LAYOUT[key].x - half, LAYOUT[key].x + half, 0, height, LAYOUT[key].z - half, LAYOUT[key].z + half);
    }
  }

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
      return ndc.x >= -1 + margin.left && ndc.x <= 1 - margin.right && ndc.y >= -1 + margin.bottom && ndc.y <= 1 - margin.top;
    });
  }

  /**
   * Framed by asking: walk back until every corner that matters is on screen.
   * The middle of the shot is the middle of what has to be in it, so a tall
   * window and a wide one both come out filled.
   */
  function frame() {
    gather();
    camera.fov = view.fov;
    const box = new GFX.Box3().setFromPoints(keep);
    box.getCenter(target);
    target.y = 0;
    const width = stage.clientWidth || 1, height = stage.clientHeight || 1;
    const tall = shape === 'tall';
    const narrow = width < 720;
    /**
     * On a wide window the ticket stands down the left, so the shot keeps out
     * of that strip; on a tall one it sits across the top instead, and the bar
     * along the bottom wraps onto two rows on a narrow one.
     */
    const ticket = tall ? 0 : Math.min(0.5, ((16 + 290 + 18) / width) * 2);
    const margin = {
      left: tall ? 0.03 : ticket,
      right: 0.03,
      top: tall ? (128 / height) * 2 : 0.06,
      bottom: ((narrow ? 128 : 96) / height) * 2,
    };
    const want = (margin.bottom - margin.top) / 2;
    const side = (margin.left - margin.right) / 2;
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
      let left = Infinity, right = -Infinity;
      for (const p of keep) {
        const x = scratch.copy(p).project(camera).x;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
      const off = (lo + hi) / 2 - want;
      const offX = (left + right) / 2 - side;
      if (Math.abs(off) < 0.004 && Math.abs(offX) < 0.004) break;
      target.z -= off * dist * 0.45;
      target.x += offX * dist * 0.3;
    }
    place(dist);
  }

  /**
   * Where the framed shot puts the camera, kept so the camera can go and look
   * at something else for a while — the plate — and come back.
   */
  const home = { position: new GFX.Vector3(), target: new GFX.Vector3() };
  const look = { position: new GFX.Vector3(), target: new GFX.Vector3() };
  let away = null;

  function frameHome() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    arrange(w / h < 0.85 ? 'tall' : 'wide');
    if (typeof document !== 'undefined') document.body.dataset.shape = shape;
    frame();
    home.position.copy(camera.position);
    home.target.copy(target);
    if (!away) {
      look.position.copy(home.position);
      look.target.copy(home.target);
    }
  }

  /** Swings the camera round to look at `point` from `distance` away. */
  function focus(point, { distance = 24, pitch = 0.9 } = {}) {
    away = {
      target: point.clone(),
      position: point.clone().add(new GFX.Vector3(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance)),
    };
  }

  function release() {
    away = null;
  }

  function updateCamera(dt) {
    const want = away ?? home;
    const k = 1 - Math.exp(-dt * 3.2);
    look.position.lerp(want.position, k);
    look.target.lerp(want.target, k);
    camera.position.copy(look.position);
    camera.lookAt(look.target);
    camera.updateMatrixWorld(true);
  }

  frameHome();
  const observer = new ResizeObserver(() => frameHome());
  observer.observe(stage);

  return {
    room, camera, frame: frameHome, focus, release, updateCamera, panHome,
    get shape() { return shape; },
    onArrange(fn) {
      arranged.add(fn);
      return () => arranged.delete(fn);
    },
    stove, pan, panRig, board, knife, guide, bowl, whisk, carton, oil, spatula, plate, props,
  };
}

/**
 * The light: the morning coming in from the left as the key, which is the one
 * that casts; a brass pendant's warm pool over the counter; a cool fill from
 * the right; light bounced up off the pale stone; and the room itself,
 * prefiltered, in everything shiny.
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
      o.color.set(0xfff1de);
      o.groundColor.set(0x8c7a5e);
      o.intensity = 0.55;
    }
  });

  const key = stage._key;
  key.color.set(0xffecd2);
  key.intensity = 2.0;
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

  const pendant = new GFX.PointLight(0xffd9a6, 175, 60, 2);
  pendant.name = 'pendant';
  pendant.position.set(-2, 19, 3);
  scene.add(pendant);

  if (stage._ground) stage._ground.visible = false;
}
