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
import { FILLING_KINDS, wholeSolids } from '../food/fillings.js';
import { buildButter, buildGrater, buildMill, buildRamekin, buildSaltDish, buildTowel, buildWhole } from './props.js';
import { potatoSolid } from '../food/potato.js';
import { GRATE_TOP, KNOB, buildStove } from './stove.js';
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
    towel: { x: -21.5, z: 4.5, yaw: 1.4 },
    mill: { x: 15.4, z: -10.6 },
    /** The extras, whole, in a row along the front of the counter under the board, each lying front to back. */
    extras: {
      cheese: { x: -15.25, z: 9.6, yaw: 0 }, tomato: { x: -12.85, z: 9.6, yaw: 0 }, ham: { x: -10.25, z: 9.6, yaw: 0 },
      pepper: { x: -7.65, z: 9.6, yaw: 0 }, onion: { x: -5.1, z: 9.6, yaw: 0 }, chives: { x: -3.15, z: 9.6, yaw: 0 },
    },
    salt: { x: 11.6, z: -10.4 },
    butter: { x: 5.4, z: -10.3 },
    /** A potato on the counter, between the bowl and the butter, for when one is not already on the board. */
    potato: { x: 1.5, z: -9.6, yaw: Math.PI / 2 },
    /**
     * Empty ramekins in a row along the front of the counter on the left, in
     * front of the extras and the grater, clear of the plate: one for each
     * thing the cook might want kept apart.
     */
    prep: [
      { x: -21.7, z: 13.3 }, { x: -18.6, z: 13.3 }, { x: -15.5, z: 13.3 },
      { x: -12.4, z: 13.3 }, { x: -9.3, z: 13.3 }, { x: -6.2, z: 13.3 },
    ],
    /** The grater at the end of the row of extras, by the cheese, clear of the towel, its slicing side to the board. */
    grater: { x: -18.0, z: 9.8 },
    wall: -13.6,
  },
  tall: {
    board: { x: 0, z: -4.4 },
    /** Far enough down that the extras between it and the board are clear of the pan's rim, looked at from above. */
    stove: { x: 0.2, z: 12.2 },
    bowl: { x: 5.5, z: -15.2 },
    carton: { x: -5.1, z: -15.6 },
    oil: { x: 0.5, z: -16.6 },
    plate: { x: 0, z: 27 },
    /** Beside the board, the blade up by it and the handle down past the range, clear of both. */
    spatula: { x: -9.2, z: -3.6, yaw: 0 },
    towel: { x: -15, z: 2, yaw: -0.1 },
    mill: { x: 9.2, z: -1.4 },
    salt: { x: 9.1, z: -6.6 },
    butter: { x: -9.1, z: -6.6, yaw: Math.PI / 2 },
    potato: { x: 10.3, z: -11.5, yaw: Math.PI / 2 },
    /** Down the left of the range, past the spatula's handle, as close in to it as they go. */
    prep: [
      { x: -11, z: 7.4 }, { x: -11, z: 10.5 }, { x: -11, z: 13.6 },
      { x: -11, z: 16.7 }, { x: -11, z: 19.8 }, { x: -11, z: 22.9 },
    ],
    /** Right of the range, below the mill, clear of the pan's handle: turned round, its slicing side to the range. */
    grater: { x: 10.6, z: 7.2, yaw: Math.PI },
    /**
     * Between the board and the range, in a row, where a hand going from one
     * to the other passes them — turned side to side, to fit the gap.
     */
    extras: {
      cheese: { x: -6.6, z: 2.3, yaw: Math.PI / 2 }, tomato: { x: -4.55, z: 2.3, yaw: Math.PI / 2 }, ham: { x: -2.2, z: 2.3, yaw: Math.PI / 2 },
      pepper: { x: 0.2, z: 2.3, yaw: Math.PI / 2 }, onion: { x: 2.65, z: 2.3, yaw: Math.PI / 2 }, chives: { x: 5.7, z: 2.3, yaw: Math.PI / 2 },
    },
    wall: -19.6,
  },
});

/** What the camera can be looking at: the whole counter, or the board or the pan close up. */
export const VIEWS = Object.freeze(['all', 'board', 'pan']);

/**
 * The layout in use. Everything reads its place from here, live; `arrange`
 * changes it, in place, when the window changes shape.
 */
export const LAYOUT = structuredClone(LAYOUTS.wide);

/** The pan's handle comes out toward the cook, a little to the right. */
export const HANDLE_TURN = Math.PI + Math.PI / 6.5;

/** The wall: how tall it is. Where it stands is the layout's. */
const WALL = { height: 26 };

/** How far the counter runs out from the wall. */
const COUNTER_DEPTH = 96;

/** The pan's cooking surface, above the counter. */
export const PAN_Y = GRATE_TOP + IRON;

/**
 * How much of each edge of the screen the page's panels take, as a share of
 * the frame — the shot is framed inside what is left. Each panel is cut off
 * along whichever edge loses the least more to it than is lost already, the
 * biggest first: a ticket down the left is a strip down the left, one across
 * the top a strip across the top, a bar along the bottom a strip along the
 * bottom — and the little switch riding on the bar goes with the bar, not
 * down the side of the screen. `panels` are screen rectangles, in pixels.
 */
export function panelMargins(width, height, panels, gap = 12) {
  const m = { left: gap, right: gap, top: gap, bottom: gap };
  const list = panels.filter((r) => r && r.width > 0 && r.height > 0).sort((a, b) => b.width * b.height - a.width * a.height);
  for (const r of list) {
    const cuts = [
      ['left', r.right + gap, height],
      ['right', width - r.left + gap, height],
      ['top', r.bottom + gap, width],
      ['bottom', height - r.top + gap, width],
    ].map(([edge, depth, along]) => [edge, depth, Math.max(0, depth - m[edge]) * along]);
    const [edge, depth] = cuts.reduce((a, b) => (b[2] < a[2] ? b : a));
    m[edge] = Math.max(m[edge], depth);
  }
  return { left: (m.left / width) * 2, right: (m.right / width) * 2, top: (m.top / height) * 2, bottom: (m.bottom / height) * 2 };
}

export function buildKitchen({ stage, GFX }) {
  const room = new GFX.Group();
  room.name = 'kitchen';

  /**
   * The counter: one slab of marble, wide enough that its ends are never in
   * shot, and deep enough that its front edge is not either — not even with
   * the camera down at the plate on a tall window.
   */
  const counterMap = marble(GFX);
  if (counterMap) counterMap.repeat.set(110 / 22, COUNTER_DEPTH / 22);
  const counter = new GFX.Mesh(
    new GFX.BoxGeometry(110, 2, COUNTER_DEPTH),
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

  const props = { towel: buildTowel(GFX), mill: buildMill(GFX), salt: buildSaltDish(GFX), butter: buildButter(GFX), grater: buildGrater(GFX) };
  for (const p of Object.values(props)) room.add(p.group);
  /** The extras, whole on the counter. */
  const extras = Object.fromEntries(FILLING_KINDS.map((kind) => [kind, buildWhole(GFX, { name: kind, solids: wholeSolids(kind) })]));
  for (const e of Object.values(extras)) room.add(e.group);
  /** Where the extra of `kind` sits now, and which way it is turned. */
  const extraAt = (kind) => LAYOUT.extras[kind];
  /** A potato, whole, for a dish that leaves it to the cook whether to have one. Only on the counter when it is wanted. */
  const spud = buildWhole(GFX, { name: 'potato', solids: [potatoSolid()] });
  spud.group.visible = false;
  room.add(spud.group);
  /** The empty ramekins, for keeping what has been cut until it goes in. */
  const prep = LAYOUTS.wide.prep.map((_, i) => buildRamekin(GFX, { name: `prep-${i + 1}`, radius: 1.5 }));
  for (const r of prep) room.add(r.group);

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
    counter.position.set(0, -1, LAYOUT.wall + COUNTER_DEPTH / 2);
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
    for (const kind of FILLING_KINDS) {
      const at = extraAt(kind);
      extras[kind].group.position.set(at.x, 0, at.z);
      extras[kind].group.rotation.y = at.yaw;
    }
    spud.group.position.set(LAYOUT.potato.x, 0, LAYOUT.potato.z);
    spud.group.rotation.y = LAYOUT.potato.yaw;
    prep.forEach((r, i) => r.group.position.set(LAYOUT.prep[i].x, 0, LAYOUT.prep[i].z));
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
   * What has to be in shot. For the whole counter: the board, the pan to its
   * rim and its handle out to the hole in the end — the steel round it can be
   * cropped — the row along the back, and everything there is to reach for.
   * Closer in, just the one station: the board with room over it for the
   * knife, or the pan with the knob and enough of the handle to take hold of.
   */
  function gather(name) {
    const keep = [];
    const corners = (x0, x1, y0, y1, z0, z1) => {
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) keep.push(new GFX.Vector3(x, y, z));
    };
    const handle = (reach) => new GFX.Vector3(LAYOUT.stove.x - Math.sin(HANDLE_TURN) * reach, PAN_Y + 1.6, LAYOUT.stove.z - Math.cos(HANDLE_TURN) * reach);
    if (name === 'board') {
      corners(LAYOUT.board.x - BOARD.w / 2 - 0.3, LAYOUT.board.x + BOARD.w / 2 + 0.3, 0, BOARD.h + 2.5, LAYOUT.board.z - BOARD.d / 2 - 0.3, LAYOUT.board.z + BOARD.d / 2 + 0.3);
      return keep;
    }
    if (name === 'pan') {
      corners(LAYOUT.stove.x - 6.6, LAYOUT.stove.x + 6.6, 0, PAN_Y + 2, LAYOUT.stove.z - 6.6, LAYOUT.stove.z + 6.6);
      corners(LAYOUT.stove.x + KNOB.x - 1.1, LAYOUT.stove.x + KNOB.x + 1.1, 0, 1.2, LAYOUT.stove.z + KNOB.z - 1.1, LAYOUT.stove.z + KNOB.z + 1.1);
      keep.push(handle(6.35 + 3.4));
      return keep;
    }
    corners(LAYOUT.board.x - BOARD.w / 2, LAYOUT.board.x + BOARD.w / 2, 0, BOARD.h + 2.5, LAYOUT.board.z - BOARD.d / 2, LAYOUT.board.z + BOARD.d / 2);
    corners(LAYOUT.stove.x - 6.6, LAYOUT.stove.x + 6.6, 0, PAN_Y + 2, LAYOUT.stove.z - 6.6, LAYOUT.stove.z + 6.6);
    keep.push(handle(6.35 + 6.6));
    const row = [LAYOUT.carton, LAYOUT.oil, LAYOUT.bowl];
    corners(Math.min(...row.map((r) => r.x)) - 3.8, Math.max(...row.map((r) => r.x)) + 3.8, 0, 3.5,
      Math.min(...row.map((r) => r.z)) - 3, Math.max(...row.map((r) => r.z)) + 2.6);
    /** The salt, the pepper, the butter and the grater are things to reach for: they have to be in shot too. */
    for (const [key, half, height] of [['salt', 1.5, 1.1], ['mill', 1.0, 5.0], ['butter', 2.3, 1.3], ['grater', 1.5, 4.2]]) {
      corners(LAYOUT[key].x - half, LAYOUT[key].x + half, 0, height, LAYOUT[key].z - half, LAYOUT[key].z + half);
    }
    for (const kind of FILLING_KINDS) {
      const at = extraAt(kind), [w, h, d] = extras[kind].size;
      const half = Math.max(w, d) / 2;
      corners(at.x - half, at.x + half, 0, h, at.z - half, at.z + half);
    }
    {
      const [w, h, d] = spud.size, turned = Math.abs(Math.sin(LAYOUT.potato.yaw)) > 0.5;
      const hx = (turned ? d : w) / 2, hz = (turned ? w : d) / 2;
      corners(LAYOUT.potato.x - hx, LAYOUT.potato.x + hx, 0, h, LAYOUT.potato.z - hz, LAYOUT.potato.z + hz);
    }
    for (const at of LAYOUT.prep) corners(at.x - 1.5, at.x + 1.5, 0, 1.9, at.z - 1.5, at.z + 1.5);
    return keep;
  }

  /** A wide window too low for the full ticket and bar: a phone turned on its side. */
  const isShort = (width, height) => width / height >= 0.85 && height < 520;

  /**
   * How steeply each shot looks down. Closer in it is more nearly overhead,
   * so a cut lands where it was aimed and the floor of the pan shows; on a
   * tall window the whole counter is looked down on more steeply too, which
   * fills the height that the width leaves over.
   */
  const pitchOf = (name) => (name === 'all' ? (shape === 'tall' ? 0.98 : 0.88) : 1.04);
  const FOV = 34;
  const scratch = new GFX.Vector3();
  const target = new GFX.Vector3();

  function place(dist, pitch) {
    camera.position.set(target.x, target.y + Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist);
    camera.near = Math.max(0.5, dist / 60);
    camera.far = dist * 6;
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
  }

  /**
   * Inside the frame, clear of the margins the page's own panels take — and,
   * closed in on a station, no bigger on the screen than `most`, in pixels:
   * on a phone the board wants every pixel there is, but on a big screen,
   * filled edge to edge, it is more than anyone needs to cut on.
   */
  function fits(keep, margin, most = null) {
    let left = Infinity, right = -Infinity, lo = Infinity, hi = -Infinity;
    for (const p of keep) {
      const ndc = scratch.copy(p).project(camera);
      if (ndc.x < -1 + margin.left || ndc.x > 1 - margin.right || ndc.y < -1 + margin.bottom || ndc.y > 1 - margin.top) return false;
      left = Math.min(left, ndc.x);
      right = Math.max(right, ndc.x);
      lo = Math.min(lo, ndc.y);
      hi = Math.max(hi, ndc.y);
    }
    if (!most) return true;
    return ((right - left) / 2) * most.width <= most.w && ((hi - lo) / 2) * most.height <= most.h;
  }

  /** The most a station closed in on takes of the screen, in pixels. */
  const CLOSE = { w: 760, h: 620 };

  /**
   * The page's panels over the kitchen — the ticket, the bar — as rectangles
   * on the screen. Whoever puts them there says where they are. While the
   * camera is away at the plate, different ones: the verdict, not the bar.
   */
  let covers = () => [];
  let awayCovers = () => [];

  const margins = (width, height, panels = covers()) => panelMargins(width, height, panels);

  /**
   * Framed by asking: the nearest the camera can stand with every corner that
   * matters on screen, then slid along the counter until the slack is shared
   * on both sides of the shot — the corners nearest the camera and those
   * furthest from it do not sit symmetrically round wherever the middle of
   * what is in shot happens to be — and asked again from there.
   */
  function frame(name, margin, into, width, height) {
    fit(gather(name), pitchOf(name), margin, name === 'all' ? null : { ...CLOSE, width, height }, into);
  }

  /** The shot of `keep` from `pitch`, as near as `margin` and `most` let it come, into `into`. */
  function fit(keep, pitch, margin, most, into) {
    camera.fov = FOV;
    const middle = new GFX.Box3().setFromPoints(keep).getCenter(new GFX.Vector3());
    const want = (margin.bottom - margin.top) / 2;
    const side = (margin.left - margin.right) / 2;
    const reach = Math.tan((FOV / 2) * (Math.PI / 180));
    /**
     * How far the camera's aim is off the middle of what is in shot, per unit
     * of distance: at first, whatever puts that middle in the middle of the
     * room the panels leave — which need not be the middle of the screen —
     * and then whatever shares the slack round it evenly.
     */
    const shift = { x: -side * reach * camera.aspect, z: (want * reach) / Math.sin(pitch) };
    const at = (dist) => {
      target.set(middle.x + shift.x * dist, 0, middle.z + shift.z * dist);
      place(dist, pitch);
    };
    let dist = 20;
    for (let pass = 0; pass < 6; pass++) {
      /** In and out by halves until the nearest that fits is pinned down. */
      let near = 2, far = 2000;
      for (let i = 0; i < 26; i++) {
        dist = Math.sqrt(near * far);
        at(dist);
        if (fits(keep, margin, most)) far = dist;
        else near = dist;
      }
      dist = far;
      at(dist);
      let lo = Infinity, hi = -Infinity, left = Infinity, right = -Infinity;
      for (const p of keep) {
        const ndc = scratch.copy(p).project(camera);
        lo = Math.min(lo, ndc.y);
        hi = Math.max(hi, ndc.y);
        left = Math.min(left, ndc.x);
        right = Math.max(right, ndc.x);
      }
      const off = (lo + hi) / 2 - want;
      const offX = (left + right) / 2 - side;
      if (Math.abs(off) < 0.004 && Math.abs(offX) < 0.004) break;
      /** A step along the counter moves the shot by about this much of the frame. */
      shift.z -= (off * reach) / Math.sin(pitch);
      shift.x += offX * reach * camera.aspect;
    }
    at(dist);
    into.position.copy(camera.position);
    into.target.copy(target);
  }

  /** The shots the camera can take: the whole counter, or one station close up. */
  const shots = Object.fromEntries(VIEWS.map((name) => [name, { position: new GFX.Vector3(), target: new GFX.Vector3() }]));
  /** The one the cook has picked. */
  let view = 'all';
  /** Stood back to the whole counter for a while, whatever the view: something is being carried. */
  let backed = false;
  const shotNow = () => shots[backed ? 'all' : view];

  /**
   * Where the camera is, kept apart from the shot it is heading for, so it
   * can swing over to another — or go and look at something else for a
   * while, the plate — and come back.
   */
  const look = { position: new GFX.Vector3(), target: new GFX.Vector3() };
  let away = null;
  let moving = false;
  /** What the shots were last framed for, so nothing that changes nothing re-frames them. */
  let framed = '';

  function frameHome({ glide = false } = {}) {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    arrange(w / h < 0.85 ? 'tall' : 'wide');
    if (typeof document !== 'undefined') {
      document.body.dataset.shape = shape;
      if (isShort(w, h)) document.body.dataset.short = 'true';
      else delete document.body.dataset.short;
    }
    if (away) aim();
    const margin = margins(w, h);
    const key = JSON.stringify([w, h, shape, margin].map((v) => (typeof v === 'object' ? Object.values(v).map((n) => n.toFixed(3)) : v)));
    if (key !== framed) {
      framed = key;
      for (const name of VIEWS) frame(name, margin, shots[name], w, h);
      if (!away && !glide) {
        look.position.copy(shotNow().position);
        look.target.copy(shotNow().target);
      }
    }
    moving = true;
    updateCamera(0);
  }

  /** Over to another view: the whole counter, the board or the pan. */
  function show(name) {
    if (!VIEWS.includes(name) || name === view) return false;
    view = name;
    moving = true;
    for (const fn of viewed) fn(name);
    return true;
  }

  /** Stands back to see the whole counter while `on`, and goes back to the view after. */
  function standBack(on) {
    if (backed === Boolean(on)) return;
    backed = Boolean(on);
    moving = true;
  }

  /**
   * Swings the camera round to look at what is `radius` round `point` — the
   * plate — framed into whatever room the panels over it leave.
   */
  function focus(point, { radius = 6, pitch = 0.98 } = {}) {
    away = { point: point.clone(), radius, pitch, position: new GFX.Vector3(), target: new GFX.Vector3() };
    aim();
  }

  /** Frames what the camera has gone to look at again: the panels round it have come or gone, or the window has changed. */
  function aim() {
    if (!away) return;
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    const { point: p, radius: r } = away;
    const keep = [];
    for (const x of [p.x - r, p.x + r]) for (const y of [0, p.y + 2]) for (const z of [p.z - r, p.z + r]) keep.push(new GFX.Vector3(x, y, z));
    fit(keep, away.pitch, margins(w, h, awayCovers()), { ...CLOSE, width: w, height: h }, away);
    moving = true;
    updateCamera(0);
  }

  function release() {
    away = null;
    moving = true;
  }

  /** Eased toward the shot it wants: a slow swing over to the plate, a quicker one between views. */
  function updateCamera(dt) {
    if (!moving && !away) return;
    const want = away ?? shotNow();
    const k = dt > 0 ? 1 - Math.exp(-dt * (away ? 3.2 : 5.5)) : 0;
    look.position.lerp(want.position, k);
    look.target.lerp(want.target, k);
    const dist = look.position.distanceTo(look.target);
    camera.near = Math.max(0.5, dist / 60);
    camera.far = dist * 6;
    camera.updateProjectionMatrix();
    camera.position.copy(look.position);
    camera.lookAt(look.target);
    camera.updateMatrixWorld(true);
    if (look.position.distanceToSquared(want.position) < 1e-6 && look.target.distanceToSquared(want.target) < 1e-6) moving = false;
  }

  /** Told whenever the view changes. */
  const viewed = new Set();

  frameHome();
  const observer = new ResizeObserver(() => frameHome());
  observer.observe(stage);

  return {
    room, camera, focus, release, updateCamera, panHome, show, standBack,
    /** Frames every shot again — when the window, or the panels over it, change shape. */
    frame: frameHome,
    /** Where the page's panels are, as screen rectangles: the shots keep clear of them. */
    set covers(fn) {
      covers = fn;
      framed = '';
      frameHome();
    },
    /** The same, for while the camera is away at the plate. */
    set awayCovers(fn) {
      awayCovers = fn;
      aim();
    },
    get shape() { return shape; },
    get view() { return view; },
    /** Whether the camera is still on its way somewhere: the kitchen is not still while it is. */
    get moving() { return moving; },
    onArrange(fn) {
      arranged.add(fn);
      return () => arranged.delete(fn);
    },
    onView(fn) {
      viewed.add(fn);
      return () => viewed.delete(fn);
    },
    stove, pan, panRig, board, knife, guide, bowl, whisk, carton, oil, spatula, plate, props, extras, extraAt, spud, prep,
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
