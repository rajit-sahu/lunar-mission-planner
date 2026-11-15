import * as THREE from "three";
import { CAP_HALF_M, invStereoSouth, latLonToVec3 } from "../../lib/geo";

/**
 * One material for the global sphere and the polar caps.
 *  - `sunDir` (Moon-fixed frame) drives a soft day/night terminator.
 *  - `dayMix` fades that shading in/out (1 = globe view, 0 = polar map).
 *  - Caps fade out radially so they blend into the global mosaic.
 *  - `colormap` > 0 renders a grayscale data layer through a colour ramp.
 */
export function makeMoonMaterial(map: THREE.Texture | null, opts: { cap?: boolean } = {}) {
  return new THREE.ShaderMaterial({
    transparent: !!opts.cap,
    depthWrite: !opts.cap,
    side: opts.cap ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      map: { value: map },
      hasMap: { value: map ? 1 : 0 },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      dayMix: { value: 1 },
      ambient: { value: 0.07 },
      opacity: { value: 1 },
      isCap: { value: opts.cap ? 1 : 0 },
      colormap: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = uv;
        vN = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform int hasMap;
      uniform vec3 sunDir;
      uniform float dayMix;
      uniform float ambient;
      uniform float opacity;
      uniform int isCap;
      uniform int colormap;
      varying vec2 vUv;
      varying vec3 vN;
      #include <logdepthbuf_pars_fragment>

      vec3 ramp(float t) {
        // perceptual dark-blue → teal → amber → near-white
        vec3 c0 = vec3(0.05, 0.06, 0.16);
        vec3 c1 = vec3(0.07, 0.36, 0.52);
        vec3 c2 = vec3(0.35, 0.72, 0.55);
        vec3 c3 = vec3(0.98, 0.80, 0.35);
        vec3 c4 = vec3(1.0, 0.97, 0.88);
        if (t < 0.25) return mix(c0, c1, t / 0.25);
        if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
        if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
        return mix(c3, c4, (t - 0.75) / 0.25);
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 base = hasMap == 1 ? texture2D(map, vUv).rgb : vec3(0.55);
        if (colormap == 1) {
          float g = dot(base, vec3(0.299, 0.587, 0.114));
          base = ramp(clamp(g, 0.0, 1.0));
        }
        float d = dot(normalize(vN), normalize(sunDir));
        float lit = ambient + (1.0 - ambient) * smoothstep(-0.035, 0.06, d);
        vec3 col = base * mix(1.0, lit, dayMix);
        float a = opacity;
        if (isCap == 1) {
          float r = length(vUv - 0.5) * 2.0;
          a *= 1.0 - smoothstep(0.82, 1.0, r);
        }
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Spherical cap textured with a south-polar-stereographic image covering
 * [-half, +half] metres in x and y (see scripts/bake-textures.mjs).
 */
export function makeCapGeometry(half: number = CAP_HALF_M.outer, radius = 1.0004, segments = 160) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const u = i / segments, w = j / segments;
      const x = -half + 2 * half * u;
      const y = -half + 2 * half * w;
      const { lat, lon } = invStereoSouth(x, y);
      latLonToVec3(lat, lon, radius, v);
      pos.push(v.x, v.y, v.z);
      uv.push(u, w);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < segments; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
