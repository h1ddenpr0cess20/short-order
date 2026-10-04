/**
 * Steam, smoke and spatter over the pan.
 *
 * Steam comes off anything wet on hot iron — raw potato going in, egg running
 * across the floor — and thins as the food dries, which is a cook's best clue
 * that the browning has started. Smoke is something burning, or oil past its
 * smoke point. Spatter is the spit of fat when cold food lands in a hot pan.
 *
 * A fixed pool of sprites, reused; nothing is made or thrown away per frame.
 */

import { puff } from '../scene/textures.js';

const SOFT = 70;
const SPARKS = 30;

/**
 * At most this many puffs owed at once. Steam that finds nowhere to come from
 * — an empty pan, egg with hardly a wet patch left — is owed, not saved up: a
 * backlog let out in one frame would take every sprite there is at once.
 */
const OWED = 3;

export function createParticles({ GFX, room }) {
  const texture = puff(GFX);
  const make = (additive) => {
    const material = new GFX.SpriteMaterial({
      name: additive ? 'spatter' : 'vapour',
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: additive ? GFX.AdditiveBlending : GFX.NormalBlending,
    });
    const sprite = new GFX.Sprite(material);
    sprite.name = material.name;
    sprite.visible = false;
    sprite.renderOrder = 6;
    room.add(sprite);
    return { sprite, life: 0, age: 0, vel: [0, 0, 0], size: [1, 1], peak: 0, kind: null };
  };
  const soft = Array.from({ length: SOFT }, () => make(false));
  const sparks = Array.from({ length: SPARKS }, () => make(true));
  const all = [...soft, ...sparks];
  /** How many are showing: none, and there is nothing to move. */
  let live = 0;
  let debt = { steam: 0, smoke: 0 };

  function free(pool) {
    let best = null;
    for (const p of pool) {
      if (!p.sprite.visible) return p;
      if (!best || p.age / p.life > best.age / best.life) best = p;
    }
    return best;
  }

  function emit(kind, at) {
    const p = free(kind === 'spark' ? sparks : soft);
    p.kind = kind;
    p.age = 0;
    if (!p.sprite.visible) live += 1;
    p.sprite.visible = true;
    p.sprite.position.copy(at);
    const m = p.sprite.material;
    if (kind === 'steam') {
      p.life = 1.6 + Math.random() * 0.9;
      p.vel = [(Math.random() - 0.5) * 0.6, 1.8 + Math.random() * 1.0, (Math.random() - 0.5) * 0.6];
      p.size = [0.9, 3.2 + Math.random()];
      p.peak = 0.1 + Math.random() * 0.06;
      m.color.set(0xffffff);
    } else if (kind === 'smoke') {
      p.life = 2.4 + Math.random();
      p.vel = [(Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.7, (Math.random() - 0.5) * 0.5];
      p.size = [1.2, 4.5 + Math.random() * 1.5];
      p.peak = 0.22 + Math.random() * 0.1;
      m.color.set(0x7c7166);
    } else {
      p.life = 0.22 + Math.random() * 0.18;
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
      p.vel = [Math.cos(a) * s, 4 + Math.random() * 5, Math.sin(a) * s];
      p.size = [0.16, 0.06];
      p.peak = 0.9;
      m.color.set(0xfff0c8);
    }
    m.opacity = 0;
  }

  const at = new GFX.Vector3();

  return {
    /**
     * `pan` is the pan simulation, `frame` its group in the scene; `extra`
     * steam is liquid egg's share, 0 to 1.
     */
    update(dt, { pan, frame, eggSteam = 0, sheetPoint = null }) {
      const pieces = pan.pieces;
      debt.steam = Math.min(OWED, debt.steam + dt * (pan.steam * 26 + eggSteam * 30));
      debt.smoke = Math.min(OWED, debt.smoke + dt * pan.smoke * 18);
      while (debt.steam >= 1) {
        debt.steam -= 1;
        const source = (eggSteam > 0.2 && sheetPoint && Math.random() < 0.6) ? sheetPoint() : pieces[Math.floor(Math.random() * pieces.length)]?.pos;
        if (!source) continue;
        frame.localToWorld(at.set(source[0] + (Math.random() - 0.5) * 0.6, source[1] + 0.3, source[2] + (Math.random() - 0.5) * 0.6));
        emit('steam', at);
      }
      /** What is burning, looked for once a frame and only when there is smoke to put out. */
      const burnt = debt.smoke >= 1 ? pieces.filter((p) => Math.max(...p.brown) > 1.5) : null;
      while (debt.smoke >= 1) {
        debt.smoke -= 1;
        const source = burnt.length ? burnt[Math.floor(Math.random() * burnt.length)].pos : [(Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6];
        frame.localToWorld(at.set(source[0], source[1] + 0.4, source[2]));
        emit('smoke', at);
      }

      if (live === 0) return;
      for (const p of all) {
        if (!p.sprite.visible) continue;
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) {
          p.sprite.visible = false;
          live -= 1;
          continue;
        }
        if (p.kind === 'spark') p.vel[1] -= 30 * dt;
        else {
          /** Rising air slows and spreads. */
          p.vel[0] *= 1 - dt * 0.5;
          p.vel[2] *= 1 - dt * 0.5;
        }
        p.sprite.position.x += p.vel[0] * dt;
        p.sprite.position.y += p.vel[1] * dt;
        p.sprite.position.z += p.vel[2] * dt;
        const size = p.size[0] + (p.size[1] - p.size[0]) * k;
        p.sprite.scale.set(size, size, 1);
        const fade = p.kind === 'spark' ? 1 - k : Math.min(1, k * 5) * (1 - k) * (1 - k);
        p.sprite.material.opacity = p.peak * fade;
        p.sprite.material.rotation += dt * 0.4;
      }
    },

    /** A spit of fat: `count` sparks from a point in `frame`. */
    spatter(frame, point, count = 6) {
      for (let k = 0; k < count; k++) {
        frame.localToWorld(at.set(point[0] + (Math.random() - 0.5) * 1.5, point[1] + 0.2, point[2] + (Math.random() - 0.5) * 1.5));
        emit('spark', at);
      }
    },
  };
}
