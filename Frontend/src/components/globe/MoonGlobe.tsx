import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { analysisKey, useStore, type MapLayer } from "../../state/store";
import { CAP_HALF_M, DEG, latLonToVec3, MOON_RADIUS_M, subPoint } from "../../lib/geo";
import { sampleAt, toSeries, type SkyState } from "../../lib/timeline";
import { makeCapGeometry, makeMoonMaterial } from "./moonMaterial";
import { GlobeOverlay, overlayRefs } from "./GlobeOverlay";

/**
 * The Moon is rotated so the south pole faces +z (towards the default camera)
 * and 0°E points screen-up — the same orientation as the polar-stereographic
 * maps. Everything Moon-fixed lives inside this group.
 */
const MOON_QUAT = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
  .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));

export const POLAR_VIEW_DIST = 1.3;
const SITE_VIEW_DIST = 1.035;
const MIN_ALT = 0.0012;
const MAX_ALT = 7;

const LAYER_TEXTURE: Record<MapLayer, string> = {
  shade: "/textures/sp_outer_shade.jpg",
  wac: "/textures/sp_outer_wac.jpg",
  illum: "/textures/sp_outer_illum.jpg",
  earthvis: "/textures/sp_outer_earthvis.jpg",
};

const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function loadTex(url: string, onLoad?: () => void) {
  let t = texCache.get(url);
  if (!t) {
    t = loader.load(url, onLoad);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    texCache.set(url, t);
  } else onLoad?.();
  return t;
}

/** World-space unit vector for a lat/lon. */
export function worldDir(lat: number, lon: number, out = new THREE.Vector3()) {
  return latLonToVec3(lat, lon, 1, out).applyQuaternion(MOON_QUAT);
}

function skyForReference(): { lat: number; lon: number; sky: SkyState } | null {
  const s = useStore.getState();
  const id = s.selectedSiteId ?? s.sites[0]?.id;
  const site = s.sites.find((x) => x.id === id);
  const entry = id ? s.analyses[analysisKey(id, s.missionStart)] : undefined;
  if (!site || !entry?.data) return null;
  return { lat: site.latitude_deg, lon: site.longitude_deg, sky: sampleAt(toSeries(entry.data), s.time) };
}

function Moon() {
  const layer = useStore((s) => s.layer);
  const { camera } = useThree();
  const globalMat = useMemo(() => makeMoonMaterial(loadTex("/textures/global_wac.jpg")), []);
  const outerGeo = useMemo(() => makeCapGeometry(CAP_HALF_M.outer, 1.00025, 180), []);
  const innerGeo = useMemo(() => makeCapGeometry(CAP_HALF_M.inner, 1.0004, 160), []);
  const outerMat = useMemo(() => makeMoonMaterial(null, { cap: true }), []);
  const innerMat = useMemo(() => makeMoonMaterial(loadTex("/textures/sp_inner_shade.jpg"), { cap: true }), []);

  useEffect(() => {
    const tex = loadTex(LAYER_TEXTURE[layer]);
    outerMat.uniforms.map.value = tex;
    outerMat.uniforms.hasMap.value = 1;
    outerMat.uniforms.colormap.value = layer === "illum" || layer === "earthvis" ? 1 : 0;
  }, [layer, outerMat]);

  const sunLocal = useRef(new THREE.Vector3(1, 0, 0));
  useFrame(() => {
    const ref = skyForReference();
    if (ref) {
      const p = subPoint(ref.lat, ref.lon, ref.sky.sun.az, ref.sky.sun.el);
      latLonToVec3(p.lat, p.lon, 1, sunLocal.current);
    }
    const alt = camera.position.length() - 1;
    // Full day/night shading as a globe, fading to flat map shading near the surface.
    const dayMix = THREE.MathUtils.smoothstep(alt, 0.15, 0.9);
    for (const m of [globalMat, outerMat, innerMat]) {
      m.uniforms.sunDir.value.copy(sunLocal.current);
      m.uniforms.dayMix.value = dayMix;
    }
    // Inner 5 m/px hillshade only for the hillshade layer, only when close.
    innerMat.uniforms.opacity.value = layer === "shade" ? 1 - THREE.MathUtils.smoothstep(alt, 0.05, 0.12) : 0;
  });

  return (
    <group quaternion={MOON_QUAT}>
      <mesh material={globalMat}>
        <sphereGeometry args={[1, 256, 128]} />
      </mesh>
      <mesh geometry={outerGeo} material={outerMat} renderOrder={1} />
      <mesh geometry={innerGeo} material={innerMat} renderOrder={2} />
    </group>
  );
}

function Stars() {
  const geo = useMemo(() => {
    const n = 4000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(400);
      pos.set([v.x, v.y, v.z], i * 3);
      const b = 0.35 + Math.random() ** 3 * 0.65;
      col.set([b, b, b * (0.9 + Math.random() * 0.1)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial size={1.3} sizeAttenuation={false} vertexColors depthWrite={false} />
    </points>
  );
}

/** Sun glow + Earth placed in their real directions as seen from the reference site. */
function SunAndEarth() {
  const sun = useRef<THREE.Sprite>(null);
  const earth = useRef<THREE.Mesh>(null);
  const sunTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,250,235,1)");
    grd.addColorStop(0.15, "rgba(255,236,190,0.9)");
    grd.addColorStop(0.4, "rgba(255,190,90,0.25)");
    grd.addColorStop(1, "rgba(255,160,60,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const ref = skyForReference();
    if (!ref || !sun.current || !earth.current) return;
    const s = subPoint(ref.lat, ref.lon, ref.sky.sun.az, ref.sky.sun.el);
    worldDir(s.lat, s.lon, v);
    sun.current.position.copy(v).multiplyScalar(60);
    const e = subPoint(ref.lat, ref.lon, ref.sky.earth.az, ref.sky.earth.el);
    worldDir(e.lat, e.lon, v);
    // Earth is ~221 Moon radii away; drawn closer (and larger) so it stays on screen.
    earth.current.position.copy(v).multiplyScalar(14);
  });
  return (
    <>
      <sprite ref={sun} scale={[9, 9, 1]}>
        <spriteMaterial map={sunTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh ref={earth}>
        <sphereGeometry args={[0.28, 48, 24]} />
        <meshStandardMaterial color="#4f8fd6" emissive="#0b1a33" roughness={0.7} />
      </mesh>
    </>
  );
}

function EarthLight() {
  // Light the Earth sphere from the Sun's direction.
  const light = useRef<THREE.DirectionalLight>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const ref = skyForReference();
    if (!ref || !light.current) return;
    const s = subPoint(ref.lat, ref.lon, ref.sky.sun.az, ref.sky.sun.el);
    worldDir(s.lat, s.lon, v);
    light.current.position.copy(v).multiplyScalar(100);
  });
  return <directionalLight ref={light} intensity={2.5} />;
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Google-Earth-like camera: orbit around the centre, zoom by altitude, fly-to. */
function CameraRig() {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enablePan = false;
    c.enableZoom = false; // custom altitude-based zoom below
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    controlsRef.current = c;
    return () => {
      c.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl]);
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; t0: number; dur: number } | null>(null);

  const flyTo = (dir: THREE.Vector3, dist: number, dur = 1.8) => {
    anim.current = {
      from: camera.position.clone().normalize(),
      to: dir.clone().normalize(),
      d0: camera.position.length(),
      d1: dist,
      t0: performance.now(),
      dur: dur * 1000,
    };
  };

  // Intro: start over the near side, swoop down to the south pole.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __camera: camera, __anim: anim });
    camera.position.set(0, 3.0, 0.9);
    camera.lookAt(0, 0, 0);
    // Skip the swoop if the user already picked a site (a fly-to is running).
    const t = setTimeout(() => !anim.current && flyTo(new THREE.Vector3(0, 0.0001, 1), POLAR_VIEW_DIST, 3.2), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to the selected site.
  const flyToken = useStore((s) => s.flyToToken);
  useEffect(() => {
    if (!flyToken) return;
    const s = useStore.getState();
    const site = s.sites.find((x) => x.id === s.selectedSiteId);
    if (site) flyTo(worldDir(site.latitude_deg, site.longitude_deg), SITE_VIEW_DIST);
    else flyTo(new THREE.Vector3(0, 0.0001, 1), POLAR_VIEW_DIST);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToken]);

  // External "reset view" requests.
  useEffect(() => {
    const onHome = () => flyTo(new THREE.Vector3(0, 0.0001, 1), POLAR_VIEW_DIST);
    const onGlobe = () => flyTo(new THREE.Vector3(0, 0.95, 0.3), 3.2);
    window.addEventListener("globe:home", onHome);
    window.addEventListener("globe:full", onGlobe);
    return () => {
      window.removeEventListener("globe:home", onHome);
      window.removeEventListener("globe:full", onGlobe);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Altitude-proportional wheel / pinch zoom.
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      anim.current = null;
      const d = camera.position.length();
      const alt = THREE.MathUtils.clamp((d - 1) * Math.exp(e.deltaY * 0.0016), MIN_ALT, MAX_ALT);
      camera.position.setLength(1 + alt);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [camera, gl]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const a = anim.current;
    if (a) {
      const k = Math.min(1, (performance.now() - a.t0) / a.dur);
      const e = easeInOut(k);
      const dir = a.from.clone();
      const angle = a.from.angleTo(a.to);
      if (angle > 1e-6) {
        const axis = new THREE.Vector3().crossVectors(a.from, a.to).normalize();
        dir.applyAxisAngle(axis, angle * e);
      }
      // Zoom out a little mid-flight for long hops, like Google Earth.
      const hop = Math.sin(Math.PI * e) * Math.min(0.6, angle * 0.6);
      const alt0 = Math.log(a.d0 - 1), alt1 = Math.log(a.d1 - 1);
      const dist = 1 + Math.exp(alt0 + (alt1 - alt0) * e) + hop;
      camera.position.copy(dir.multiplyScalar(dist));
      camera.lookAt(0, 0, 0);
      controls.enabled = k >= 1;
      if (k >= 1) anim.current = null;
    }
    const alt = camera.position.length() - 1;
    controls.rotateSpeed = THREE.MathUtils.clamp(alt * 0.9, 0.004, 0.8);
    if (!anim.current) controls.update();
    // Keep near plane tight when close to the surface.
    const cam = camera as THREE.PerspectiveCamera;
    const near = Math.max(alt * 0.2, 0.00002);
    if (Math.abs(cam.near - near) / near > 0.2) {
      cam.near = near;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}

/** Projects site positions + bearing arrows into the DOM overlay every frame. */
function OverlayProjector() {
  const { camera, size } = useThree();
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), q: new THREE.Vector3(), n: new THREE.Vector3(), e: new THREE.Vector3(), c: new THREE.Vector3() }), []);
  useFrame(() => {
    const s = useStore.getState();
    const camDir = tmp.c.copy(camera.position).normalize();
    const project = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      return { x: (p.x * 0.5 + 0.5) * size.width, y: (-p.y * 0.5 + 0.5) * size.height };
    };
    const placed: { x: number; y: number; ly: number }[] = [];
    const pins = s.sites
      .map((site) => {
        worldDir(site.latitude_deg, site.longitude_deg, tmp.p);
        return { site, facing: tmp.p.dot(camDir) > 0.05, ...project(tmp.p) };
      })
      .sort((a, b) => a.y - b.y);
    for (const { site, facing, x, y } of pins) {
      const el = overlayRefs.pins.get(site.id);
      if (!el) continue;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.opacity = facing ? "1" : "0";
      el.style.pointerEvents = facing ? "auto" : "none";
      // Stack labels of nearby sites instead of letting them overlap.
      let ly = 0;
      while (placed.some((q) => Math.abs(q.x - x) < 170 && Math.abs(q.y + q.ly - (y + ly)) < 25)) ly += 25;
      if (facing) placed.push({ x, y, ly });
      el.style.setProperty("--ly", `${ly}px`);
    }

    // Bearing arrows for the selected site: screen angle of an azimuth.
    const arrows = overlayRefs.arrows;
    const site = s.sites.find((x) => x.id === s.selectedSiteId);
    if (!arrows || !site) {
      if (arrows) arrows.style.opacity = "0";
    } else {
      worldDir(site.latitude_deg, site.longitude_deg, tmp.p);
      const P = project(tmp.p);
      // Local north/east tangent vectors (numerical; safe near the pole).
      worldDir(site.latitude_deg + 0.01, site.longitude_deg, tmp.n).sub(tmp.p).normalize();
      tmp.e.crossVectors(tmp.n, tmp.p).normalize(); // east = north × up
      const angleFor = (az: number) => {
        const d = tmp.n.clone().multiplyScalar(Math.cos(az * DEG)).add(tmp.e.clone().multiplyScalar(Math.sin(az * DEG)));
        const Q = project(tmp.q.copy(tmp.p).addScaledVector(d, 0.001));
        return (Math.atan2(Q.y - P.y, Q.x - P.x) * 180) / Math.PI;
      };
      arrows.style.transform = `translate(${P.x}px, ${P.y}px)`;
      arrows.style.opacity = tmp.p.dot(camDir) > 0.05 ? "1" : "0";
      const entry = s.analyses[analysisKey(site.id, s.missionStart)];
      if (entry?.data) {
        const sky = sampleAt(toSeries(entry.data), s.time);
        overlayRefs.setArrow?.("sun", angleFor(sky.sun.az), sky.sun.visible);
        overlayRefs.setArrow?.("earth", angleFor(sky.earth.az), sky.earth.visible);
        overlayRefs.setArrow?.("north", angleFor(0), true);
      }
    }

    // Scale bar: metres per pixel at screen centre.
    const alt = (camera.position.length() - 1) * MOON_RADIUS_M;
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const mPerPx = (2 * alt * Math.tan(fov / 2)) / size.height;
    overlayRefs.setScale?.(mPerPx, alt);
  });
  return null;
}

export function MoonGlobe() {
  return (
    <div className="globe">
      <Canvas
        camera={{ fov: 40, near: 0.0005, far: 2000, position: [0, 3, 0.9] }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#020306"]} />
        <ambientLight intensity={0.15} />
        <Stars />
        <Moon />
        <SunAndEarth />
        <EarthLight />
        <CameraRig />
        <OverlayProjector />
      </Canvas>
      <GlobeOverlay />
    </div>
  );
}
