/**
 * What eggs look like: the sheet in the pan, the eggs in the bowl, and the
 * moments in between — an egg knocked on the rim and broken in, and the bowl
 * tipped out over the pan.
 */

import { hex, mix } from '../food/colour.js';
import { crackedHalves, shellMaterial } from '../food/egg.js';
import { rawEgg } from '../food/curd.js';
import { BOWL, bowlRadius } from '../scene/cookware.js';
import { FLAT } from '../scene/pan.js';
import { EGG_VOLUME } from '../sim/eggs.js';

/** Egg as it sets: wet and bright, then a soft opaque yellow, then dry and pale. */
const SETTING = hex(0xf5cd52);
const SET = hex(0xf7da6c);
const DRY = hex(0xeed693);
const BROWNED = hex(0xc8913f);

/** The colour of egg at a given set, yolkiness and browning. */
export function eggColour(set, yolk, brown, out = [0, 0, 0]) {
  const raw = rawEgg(yolk);
  const s = Math.min(1, Math.max(0, set));
  mix(raw, SETTING, Math.min(1, s / 0.5), out);
  if (s > 0.5) mix(out, SET, (s - 0.5) / 0.5, out);
  if (set > 1.1) mix(out, DRY, Math.min(1, (set - 1.1) / 0.4), out);
  if (brown > 0.2) mix(out, BROWNED, Math.min(0.85, (brown - 0.2) * 0.9), out);
  return out;
}

/**
 * The sheet of egg on the floor of the pan, as a heightfield over the sheet's
 * grid. Where there is no egg the surface dips under the iron and is hidden,
 * so the edge of the egg is wherever the surface comes up through the floor —
 * a smooth line, not the grid's steps.
 */
export function createSheetView(GFX, sheet) {
  const { N, size } = sheet;
  const V = N + 1;
  const pos = new Float32Array(V * V * 3);
  const nrm = new Float32Array(V * V * 3);
  const col = new Float32Array(V * V * 3);
  const height = new Float32Array(V * V);
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const k = j * V + i;
      pos[k * 3] = -FLAT + i * size;
      pos[k * 3 + 2] = -FLAT + j * size;
      nrm[k * 3 + 1] = 1;
    }
  }
  const index = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new GFX.BufferGeometry();
  geometry.setAttribute('position', new GFX.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new GFX.BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new GFX.BufferAttribute(col, 3));
  geometry.setIndex(index);
  geometry.boundingSphere = new GFX.Sphere(new GFX.Vector3(0, 0, 0), FLAT * 1.5);
  const mesh = new GFX.Mesh(geometry, new GFX.MeshPhysicalMaterial({
    name: 'egg-sheet', vertexColors: true, roughness: 0.32, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3,
  }));
  mesh.name = 'egg-sheet';
  mesh.receiveShadow = true;
  mesh.visible = false;

  const c = [0, 0, 0];

  function update() {
    let any = false;
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        /** A corner takes the average of the patches round it. */
        let a = 0, s = 0, y = 0, b = 0, n = 0;
        for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const ci = i + di, cj = j + dj;
          if (ci < 0 || cj < 0 || ci >= N || cj >= N) continue;
          const k = cj * N + ci;
          if (!sheet.inside[k]) continue;
          const w = sheet.amount[k];
          a += w;
          s += sheet.set[k] * w;
          y += sheet.yolk[k] * w;
          b += sheet.brown[k] * w;
          n += 1;
        }
        const k = j * V + i;
        const depth = n ? a / 4 : 0;
        height[k] = depth > 0.008 ? 0.01 + depth * 0.9 : -0.04;
        if (depth > 0.008) any = true;
        if (a > 0) eggColour(s / a, y / a, b / a, c);
        else c[0] = c[1] = c[2] = 0.8;
        col[k * 3] = c[0];
        col[k * 3 + 1] = c[1];
        col[k * 3 + 2] = c[2];
      }
    }
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const k = j * V + i;
        pos[k * 3 + 1] = height[k];
        const hl = height[j * V + Math.max(0, i - 1)], hr = height[j * V + Math.min(V - 1, i + 1)];
        const hd = height[Math.max(0, j - 1) * V + i], hu = height[Math.min(V - 1, j + 1) * V + i];
        const nx = hl - hr, nz = hd - hu, ny = 2 * size;
        const l = Math.hypot(nx, ny, nz);
        nrm[k * 3] = nx / l;
        nrm[k * 3 + 1] = ny / l;
        nrm[k * 3 + 2] = nz / l;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    mesh.visible = any;
  }

  return { mesh, update };
}

/** How high beaten egg comes up the bowl for a given amount of it. */
export function fillHeight(volume) {
  let v = 0, y = 0;
  const dy = 0.01;
  while (v < volume && y < BOWL.depth) {
    const r = bowlRadius(y + dy / 2);
    v += Math.PI * r * r * dy;
    y += dy;
  }
  return y;
}

/**
 * The eggs in the bowl: a pool of white with the yolks sitting in it, which
 * the whisk swirls into streaks and then into one even, frothy yellow.
 */
export function createBowlView(GFX, bowlGroup, bowlState, floor) {
  const RINGS = 10, SEGS = 56;
  const count = 1 + RINGS * SEGS;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const polar = [];
  polar.push([0, 0]);
  for (let r = 1; r <= RINGS; r++) for (let s = 0; s < SEGS; s++) polar.push([r / RINGS, (s / SEGS) * Math.PI * 2]);
  for (let i = 0; i < count; i++) nrm[i * 3 + 1] = 1;
  const index = [];
  for (let s = 0; s < SEGS; s++) index.push(0, 1 + ((s + 1) % SEGS), 1 + s);
  for (let r = 1; r < RINGS; r++) {
    for (let s = 0; s < SEGS; s++) {
      const a = 1 + (r - 1) * SEGS + s, b = 1 + (r - 1) * SEGS + ((s + 1) % SEGS);
      const c = a + SEGS, d = b + SEGS;
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new GFX.BufferGeometry();
  geometry.setAttribute('position', new GFX.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new GFX.BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new GFX.BufferAttribute(col, 3));
  geometry.setIndex(index);
  geometry.boundingSphere = new GFX.Sphere(new GFX.Vector3(0, 1, 0), BOWL.rim + 1);
  const surface = new GFX.Mesh(geometry, new GFX.MeshPhysicalMaterial({
    name: 'bowl-egg', vertexColors: true, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
  }));
  surface.name = 'bowl-egg';
  surface.visible = false;
  bowlGroup.add(surface);

  const yolkMaterial = new GFX.MeshPhysicalMaterial({
    name: 'yolk', color: 0xf09a12, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
  });
  const yolkGeometry = new GFX.SphereGeometry(0.5, 24, 16);
  const yolks = [];

  const WHITE = hex(0xe9dec2);
  const BEATEN = hex(0xf2bf3c);
  const FOAM = hex(0xf8e7a6);
  const c = [0, 0, 0];
  let phase = 0;

  function update(dt, swirl = 0) {
    const volume = bowlState.eggs * EGG_VOLUME * (bowlState.draining ?? 1);
    phase += swirl;
    surface.visible = volume > 0.05;
    while (yolks.length < bowlState.yolks.length) {
      const yolk = new GFX.Mesh(yolkGeometry, yolkMaterial);
      yolk.name = 'yolk';
      bowlGroup.add(yolk);
      yolks.push(yolk);
    }
    while (yolks.length > bowlState.yolks.length) yolks.pop().removeFromParent();
    if (!surface.visible) {
      for (const y of yolks) y.visible = false;
      return;
    }
    const level = fillHeight(volume);
    const R = bowlRadius(level) * 0.995;
    const m = bowlState.mix;
    for (let i = 0; i < count; i++) {
      const [r, a] = polar[i];
      const x = Math.cos(a) * r * R, z = Math.sin(a) * r * R;
      /** Streaks: a spiral the whisk drags round, fading as the eggs come together. */
      const streak = 0.5 + 0.5 * Math.sin(a * 3 + r * 9 - phase * 1.7);
      const t = Math.min(1, m * 1.15 + (1 - m) * m * 1.6 * streak);
      mix(WHITE, BEATEN, t, c);
      if (m > 0.55) {
        const froth = Math.max(0, Math.sin(x * 23.1 + z * 17.3) * Math.sin(x * 11.7 - z * 29.3));
        mix(c, FOAM, Math.min(1, (m - 0.55) * 1.6) * (0.25 + 0.5 * froth) * (1 - r * 0.6), c);
      }
      pos[i * 3] = x;
      pos[i * 3 + 1] = floor + level + 0.015 * Math.sin(a * 5 + phase * 3) * r;
      pos[i * 3 + 2] = z;
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;

    /** The yolks sit proud of the white until the whisk breaks them into it. */
    const whole = 1 - Math.min(1, m / 0.4);
    yolks.forEach((yolk, i) => {
      const at = bowlState.yolks[i];
      yolk.visible = whole > 0.02;
      const spin = phase * 0.6;
      const x = (at.x * Math.cos(spin) - at.z * Math.sin(spin)) * R * 0.75;
      const z = (at.x * Math.sin(spin) + at.z * Math.cos(spin)) * R * 0.75;
      yolk.position.set(x, floor + level - 0.05, z);
      const k = 0.55 + 0.45 * whole;
      yolk.scale.set(1.2 * k + (1 - whole) * 0.5, 0.62 * whole + 0.05, 1.2 * k + (1 - whole) * 0.5);
    });
  }

  return { update, surface };
}

/**
 * An egg out of the carton, knocked on the rim and broken into the bowl: lifted,
 * carried over, a tap, and the two halves of the shell pulled apart while the
 * egg drops out between them. `onIn` is called as it lands in the bowl.
 */
/**
 * An egg from the carton cracked into the bowl: carried over to the rim,
 * knocked on it, and opened over the bowl, the egg falling out between the
 * halves. `rimPoint()` is where on the rim it is knocked and `centre()` the
 * middle of the bowl, so the egg is always opened over the inside of it.
 */
export function createCracker(GFX, { room, rimPoint, centre }) {
  const halves = crackedHalves(GFX);
  const material = shellMaterial(GFX);
  const active = [];

  const yolkMaterial = new GFX.MeshPhysicalMaterial({
    name: 'falling-yolk', color: 0xf09a12, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05,
  });
  const whiteMaterial = new GFX.MeshPhysicalMaterial({
    name: 'falling-white', color: 0xf1e9d4, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.7, depthWrite: false,
  });
  const drop = new GFX.SphereGeometry(0.55, 20, 14);

  function start(eggMesh, onIn) {
    const from = eggMesh.getWorldPosition(new GFX.Vector3());
    from.y += 1.1;
    eggMesh.visible = false;
    const group = new GFX.Group();
    group.name = 'cracking-egg';
    const top = new GFX.Mesh(halves.top, material);
    const bottom = new GFX.Mesh(halves.bottom, material);
    top.name = 'shell-top';
    bottom.name = 'shell-bottom';
    group.add(top, bottom);
    const yolk = new GFX.Mesh(drop, yolkMaterial);
    yolk.name = 'falling-yolk';
    yolk.visible = false;
    const white = new GFX.Mesh(drop, whiteMaterial);
    white.name = 'falling-white';
    white.visible = false;
    room.add(group, yolk, white);
    group.position.copy(from);
    active.push({ t: 0, from, group, top, bottom, yolk, white, onIn, landed: false, cracked: false });
  }

  const ease = (t) => t * t * (3 - 2 * t);

  /** Returns any events that happened this frame: 'tap' as the shell meets the rim, 'in' as the egg lands. */
  function update(dt) {
    const events = [];
    for (const a of [...active]) {
      a.t += dt;
      const t = a.t;
      const rim = rimPoint();
      /** Which way is into the bowl from the rim, across the counter; the egg is turned to face it. */
      const c = centre();
      const ix0 = c.x - rim.x, iz0 = c.z - rim.z, il = Math.hypot(ix0, iz0) || 1;
      const ix = ix0 / il, iz = iz0 / il;
      const yaw = Math.atan2(-iz, ix);
      /** Over to just above the rim, tipped toward the bowl. */
      if (t < 0.42) {
        const k = ease(t / 0.42);
        a.group.position.set(
          a.from.x + (rim.x - a.from.x) * k,
          a.from.y + (rim.y + 1.6 - a.from.y) * k + Math.sin(k * Math.PI) * 1.4,
          a.from.z + (rim.z - a.from.z) * k,
        );
        a.group.rotation.set(0, yaw, -k * 0.6);
      } else if (t < 0.52) {
        /** The knock on the rim. */
        const k = (t - 0.42) / 0.1;
        a.group.position.set(rim.x, rim.y + 1.6 - Math.sin(k * Math.PI) * 0.5, rim.z);
        a.group.rotation.set(0, yaw, -0.6);
        if (!a.cracked && k > 0.5) {
          a.cracked = true;
          events.push('tap');
        }
      } else if (t < 0.95) {
        /**
         * Brought in over the bowl and pulled apart, the egg falling out
         * between the halves into the middle of it: the half nearer the rim
         * lifts back toward it, the other opens over the bowl.
         */
        const k = ease(Math.min(1, (t - 0.52) / 0.3));
        const over = 1.5 * k;
        const ox = rim.x + ix * over, oz = rim.z + iz * over;
        a.group.position.set(ox, rim.y + 1.6 + 0.4 * k, oz);
        a.group.rotation.set(0, yaw, -0.6 * (1 - k));
        a.top.position.set(-0.9 * k, 0.5 * k, 0);
        a.top.rotation.set(0, 0, 1.4 * k);
        a.bottom.position.set(0.9 * k, -0.2 * k, 0);
        a.bottom.rotation.set(0, 0, -1.1 * k);
        const fall = Math.max(0, t - 0.56);
        const y = rim.y + 1.3 - 18 * fall * fall;
        a.yolk.visible = a.white.visible = y > rim.y - 1.4;
        a.yolk.position.set(ox, y, oz);
        a.yolk.scale.set(0.8, 0.8, 0.8);
        a.white.position.set(ox, y + 0.25, oz);
        a.white.scale.set(1.2, 1.5 + fall * 3, 1.2);
        if (!a.landed && y < rim.y - 1.2) {
          a.landed = true;
          a.yolk.visible = a.white.visible = false;
          events.push('in');
          a.onIn?.();
        }
      } else {
        /** The shells go. */
        const k = Math.min(1, (t - 0.95) / 0.25);
        a.group.scale.setScalar(1 - k);
        a.group.position.y += dt * 4;
        if (!a.landed) {
          a.landed = true;
          events.push('in');
          a.onIn?.();
        }
        if (k >= 1) {
          a.group.removeFromParent();
          a.yolk.removeFromParent();
          a.white.removeFromParent();
          active.splice(active.indexOf(a), 1);
        }
      }
    }
    return events;
  }

  /** Drops every egg in the air, unbroken into anything. */
  function clear() {
    for (const a of active) {
      a.group.removeFromParent();
      a.yolk.removeFromParent();
      a.white.removeFromParent();
    }
    active.length = 0;
  }

  return { start, update, clear, get busy() { return active.length > 0; } };
}
