/**
 * Where the pointer is in the kitchen: which station it is over, and the
 * point it touches there, in that station's own frame.
 *
 * Nothing here raycasts the meshes. Every station is a flat surface at a known
 * height — the top of the board, the floor of the pan, the eggs in the bowl —
 * so the ray is met with that plane and the hit tested against the station's
 * outline. That is cheap, it never misses a thin piece of food, and it means
 * a pointer on the potato is on the board.
 */

export function createPointer({ GFX, stage, camera }) {
  const raycaster = new GFX.Raycaster();
  const ndc = new GFX.Vector2();
  const hit = new GFX.Vector3();
  const plane = new GFX.Plane();
  const up = new GFX.Vector3(0, 1, 0);

  const state = { x: 0, y: 0, inside: false, ndc };

  function aim(event) {
    const rect = stage.getBoundingClientRect();
    state.x = event.clientX;
    state.y = event.clientY;
    state.inside = true;
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  /** Where the ray meets the level plane at `height`, as a fresh vector, or null if it never does. */
  function at(height) {
    plane.set(up, -height);
    const p = raycaster.ray.intersectPlane(plane, hit);
    return p ? p.clone() : null;
  }

  /** The screen position of a point in the room, in CSS pixels. */
  function screen(point) {
    const rect = stage.getBoundingClientRect();
    const v = point.clone().project(camera);
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height, behind: v.z > 1 };
  }

  return { state, aim, at, screen, ray: raycaster.ray };
}
