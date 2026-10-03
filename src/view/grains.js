/**
 * Salt and pepper on the way down: a pinch is a little shower of white
 * grains, a twist of the mill a scatter of dark ones, falling onto whatever
 * they were aimed at and gone when they reach it. Only there to be seen
 * going on; where the seasoning ends up is the simulation's business.
 *
 * A fixed pool of tiny meshes, reused.
 */

const POOL = 90;
const GRAVITY = 30;

export function createGrains({ GFX, room }) {
  const materials = {
    salt: new GFX.MeshStandardMaterial({ name: 'salt-grain', color: 0xfbfaf6, roughness: 0.5, metalness: 0, emissive: 0x2a2a2a }),
    pepper: new GFX.MeshStandardMaterial({ name: 'pepper-grain', color: 0x241a14, roughness: 0.8, metalness: 0 }),
  };
  const shape = new GFX.BoxGeometry(0.07, 0.07, 0.07);
  const grains = Array.from({ length: POOL }, () => {
    const mesh = new GFX.Mesh(shape, materials.salt);
    mesh.name = 'grain';
    mesh.visible = false;
    room.add(mesh);
    return { mesh, vel: [0, 0, 0], floor: 0, delay: 0 };
  });
  let next = 0;

  return {
    /**
     * A shower of `count` grains of `kind` over `at` (a point in the room,
     * where they land), spread over `radius`, falling from `height` above it.
     */
    pour(kind, at, { count = 26, radius = 2.4, height = 4.5 } = {}) {
      for (let i = 0; i < count; i++) {
        const g = grains[next];
        next = (next + 1) % POOL;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
        g.mesh.material = materials[kind];
        g.mesh.position.set(at.x + Math.cos(a) * r * 0.3, at.y + height + Math.random() * 0.6, at.z + Math.sin(a) * r * 0.3);
        g.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        g.mesh.scale.setScalar(kind === 'pepper' ? 0.8 + Math.random() * 0.9 : 0.6 + Math.random() * 0.6);
        g.vel = [Math.cos(a) * r * 0.9, -2 - Math.random() * 2, Math.sin(a) * r * 0.9];
        g.floor = at.y + 0.05;
        g.delay = Math.random() * 0.25;
        g.mesh.visible = false;
        g.live = true;
      }
    },

    update(dt) {
      for (const g of grains) {
        if (!g.live) continue;
        if (g.delay > 0) {
          g.delay -= dt;
          if (g.delay > 0) continue;
          g.mesh.visible = true;
        }
        g.vel[1] -= GRAVITY * dt;
        g.mesh.position.x += g.vel[0] * dt;
        g.mesh.position.y += g.vel[1] * dt;
        g.mesh.position.z += g.vel[2] * dt;
        if (g.mesh.position.y <= g.floor) {
          g.live = false;
          g.mesh.visible = false;
        }
      }
    },
  };
}
