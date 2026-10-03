/**
 * Gas flame: a ring of blue tongues round the burner, drawn with a shader of
 * its own, once for each backend.
 *
 * Every tongue is one quad lying nearly flat, pointing out from the ring — a
 * flame under a pan is pushed out sideways along the iron — and curling up at
 * the tip. The mesh only says where each tongue starts; how long it is, how it
 * curls and how it flickers are worked out per vertex from `level` and `time`.
 *
 *   position  the base of the tongue, on the ring
 *   normal    x and z: the way out from the middle; y: a seed of its own
 *   uv        across the tongue, and along it from base to tip
 */

const TONGUES = 28;

export function flameGeometry(GFX, { radius = 1.45, height = 0.12 } = {}) {
  const pos = [], nrm = [], uv = [], index = [];
  for (let k = 0; k < TONGUES; k++) {
    const a = (k / TONGUES) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    const seed = ((k * 7919) % 97) / 97;
    const base = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(cx * radius, height, cz * radius);
      nrm.push(cx, seed, cz);
      uv.push(u, v);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new GFX.BufferGeometry();
  geometry.setAttribute('position', new GFX.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new GFX.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new GFX.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  /** The shader moves every vertex, so the bounds are set by hand to hold the longest flame. */
  geometry.boundingSphere = new GFX.Sphere(new GFX.Vector3(0, 0.5, 0), radius + 3);
  return geometry;
}

const GLSL_VERTEX = /* glsl */ `
uniform float time;
uniform float level;
varying vec2 vUv;
varying float vFade;

void main() {
  vec2 out2 = normalize(normal.xz);
  vec3 outward = vec3(out2.x, 0.0, out2.y);
  vec3 across = vec3(-out2.y, 0.0, out2.x);
  float seed = normal.y;
  float flicker = 0.82 + 0.18 * sin(time * (17.0 + seed * 9.0) + seed * 40.0)
                + 0.08 * sin(time * 41.0 + seed * 13.0);
  float len = (0.35 + 1.25 * level) * flicker;
  float v = uv.y;
  float width = 0.32 * (1.0 - v * 0.65) * (0.7 + 0.3 * level);
  vec3 p = position
         + outward * (v * len)
         + vec3(0.0, 1.0, 0.0) * (v * v * len * 0.55)
         + across * ((uv.x - 0.5) * width);
  vUv = uv;
  vFade = level;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const GLSL_FRAGMENT = /* glsl */ `
uniform float time;
uniform float level;
varying vec2 vUv;
varying float vFade;

void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float along = vUv.y;
  float body = (1.0 - smoothstep(0.25, 1.0, across)) * (1.0 - smoothstep(0.55, 1.0, along)) * smoothstep(0.0, 0.06, along);
  float core = (1.0 - smoothstep(0.0, 0.55, across)) * (1.0 - smoothstep(0.05, 0.45, along));
  vec3 mantle = vec3(0.16, 0.26, 1.0);
  vec3 inner = vec3(0.55, 0.85, 1.0);
  vec3 colour = mix(mantle, inner, core);
  float alpha = (body * 0.55 + core * 0.6) * clamp(vFade * 1.6, 0.0, 1.0);
  gl_FragColor = vec4(colour, alpha);
}
`;

const WGSL = /* wgsl */ `
struct Out {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) fade: f32,
};

@vertex
fn vs(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> Out {
  let out2 = normalize(normal.xz);
  let outward = vec3f(out2.x, 0.0, out2.y);
  let across = vec3f(-out2.y, 0.0, out2.x);
  let seed = normal.y;
  let time = material.time;
  let level = material.level;
  let flicker = 0.82 + 0.18 * sin(time * (17.0 + seed * 9.0) + seed * 40.0)
              + 0.08 * sin(time * 41.0 + seed * 13.0);
  let len = (0.35 + 1.25 * level) * flicker;
  let v = uv.y;
  let width = 0.32 * (1.0 - v * 0.65) * (0.7 + 0.3 * level);
  let p = position
        + outward * (v * len)
        + vec3f(0.0, 1.0, 0.0) * (v * v * len * 0.55)
        + across * ((uv.x - 0.5) * width);
  var o: Out;
  o.position = object.projectionMatrix * object.modelViewMatrix * vec4f(p, 1.0);
  o.uv = uv;
  o.fade = level;
  return o;
}

@fragment
fn fs(i: Out) -> @location(0) vec4f {
  let across = abs(i.uv.x - 0.5) * 2.0;
  let along = i.uv.y;
  let body = (1.0 - smoothstep(0.25, 1.0, across)) * (1.0 - smoothstep(0.55, 1.0, along)) * smoothstep(0.0, 0.06, along);
  let core = (1.0 - smoothstep(0.0, 0.55, across)) * (1.0 - smoothstep(0.05, 0.45, along));
  let mantle = vec3f(0.16, 0.26, 1.0);
  let inner = vec3f(0.55, 0.85, 1.0);
  let colour = mix(mantle, inner, core);
  let alpha = (body * 0.55 + core * 0.6) * clamp(i.fade * 1.6, 0.0, 1.0);
  return vec4f(colour, alpha);
}
`;

/** The flame material. `uniforms.level` is 0 (off) to 1 (full), `uniforms.time` in seconds. */
export function flameMaterial(GFX) {
  return new GFX.ShaderMaterial({
    name: 'gas-flame',
    uniforms: { time: { value: 0 }, level: { value: 0 } },
    glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT },
    wgsl: WGSL,
    transparent: true,
    blending: GFX.AdditiveBlending,
    depthWrite: false,
    side: GFX.DoubleSide,
  });
}
