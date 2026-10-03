/**
 * Butter in the pan: each pat drops in, sits on the iron and slumps away as
 * it melts; what has melted is a pool over the floor, foaming while its water
 * cooks off, then clear and golden, then nut-brown, then — too hot for too
 * long — dark. Read off the pan's butter; nothing here changes it.
 */

import { FLAT } from '../scene/pan.js';
import { foam } from '../scene/textures.js';

export function createButterView(GFX, parent) {
  /** The pool's colour as its milk solids brown: golden, nutty, burnt. */
  const rgb = (hex) => { const c = new GFX.Color(hex); return [c.r, c.g, c.b]; };
  const GOLDEN = rgb(0xffb43c), NUTTY = rgb(0xc9772c), BURNT = rgb(0x2e1d10);

  const pat = new GFX.MeshStandardMaterial({ name: 'butter-pat', color: 0xf4dc8a, roughness: 0.38, metalness: 0 });
  const patGeometry = new GFX.BoxGeometry(0.95, 0.42, 0.7);
  const pats = new Map();

  const pool = new GFX.Mesh(
    new GFX.CircleGeometry(FLAT, 48),
    /** A warm glow of its own as well: a thin film over black iron otherwise reads dark olive, not gold. */
    new GFX.MeshStandardMaterial({ name: 'butter-pool', color: 0xffb43c, emissive: 0x6a3800, roughness: 0.12, metalness: 0, transparent: true, opacity: 0, depthWrite: false }),
  );
  pool.name = 'butter-pool';
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.012;
  pool.renderOrder = 1;
  pool.receiveShadow = true;
  parent.add(pool);

  const map = foam(GFX);
  const froth = new GFX.Mesh(
    new GFX.CircleGeometry(FLAT * 0.92, 48),
    new GFX.MeshStandardMaterial({ name: 'butter-foam', color: 0xfff3cf, map, roughness: 0.8, metalness: 0, transparent: true, opacity: 0, depthWrite: false }),
  );
  froth.name = 'butter-foam';
  froth.rotation.x = -Math.PI / 2;
  froth.position.y = 0.03;
  froth.renderOrder = 2;
  parent.add(froth);

  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  return {
    /** `butter` is the pan's butter; `fat` how much fat in all is in the pan. */
    update(butter, fat, dt, time) {
      /** Pats: one mesh each while it lasts, dropped in from above, slumping as it melts. */
      const live = new Set(butter.pats);
      for (const [p, view] of pats) {
        if (live.has(p)) continue;
        parent.remove(view.mesh);
        pats.delete(p);
      }
      for (const p of butter.pats) {
        let view = pats.get(p);
        if (!view) {
          const mesh = new GFX.Mesh(patGeometry, pat);
          mesh.name = 'butter-pat';
          mesh.castShadow = true;
          mesh.rotation.y = Math.random() * Math.PI;
          parent.add(mesh);
          view = { mesh, drop: 0 };
          pats.set(p, view);
        }
        view.drop = Math.min(1, view.drop + dt / 0.35);
        const fall = (1 - view.drop) ** 2 * 5;
        const k = Math.max(0.05, p.left);
        view.mesh.scale.set(0.55 + 0.45 * Math.sqrt(k) + (1 - k) * 0.5, k, 0.55 + 0.45 * Math.sqrt(k) + (1 - k) * 0.5);
        view.mesh.position.set(p.x, 0.21 * k + fall, p.z);
      }

      /** The pool: as much as there is butter in the fat, coloured by how brown it has gone. */
      const amount = Math.min(1, butter.solids) * Math.min(1, fat / 0.25);
      const b = butter.brown;
      const colour = b < 1 ? mix(GOLDEN, NUTTY, Math.max(0, b - 0.25) / 0.75) : mix(NUTTY, BURNT, Math.min(1, (b - 1) / 0.6));
      pool.material.color.setRGB(colour[0], colour[1], colour[2]);
      pool.material.emissive.setRGB(colour[0] * 0.16, colour[1] * 0.1, colour[2] * 0.04);
      /** Over black iron a thin wash of yellow reads as murk: the pool is laid on thick enough to read as butter. */
      pool.material.opacity = Math.min(0.62, amount * (0.5 + 0.15 * Math.min(1, b)));
      pool.visible = pool.material.opacity > 0.01;
      froth.material.opacity = Math.min(0.75, butter.foam * 0.8);
      froth.visible = froth.material.opacity > 0.01;
      if (froth.visible) froth.rotation.z = time * 0.05;
    },

    clear() {
      for (const view of pats.values()) parent.remove(view.mesh);
      pats.clear();
      pool.visible = froth.visible = false;
    },
  };
}
