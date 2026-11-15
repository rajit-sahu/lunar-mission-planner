/**
 * Visual layer for Street View. Nothing here moves the Sun, Earth or the
 * horizon line: positions and sizes come from SPICE + LOLA in SurfacePOV.
 *  - Earth: NASA Blue Marble map, drawn as a globe with the correct phase,
 *    turning with time (sub-Moon longitude from a low-precision lunar
 *    ephemeris, ~1°). Seen from the lunar south pole Earth's north points
 *    roughly down; we draw it that way (tilt within ~25°, not modelled).
 *  - Sun: limb-darkened white disc (no atmosphere, so no blue sky or halo;
 *    the soft glare is a camera effect).
 *  - Ground: lit by the real Sun direction (faces turned to the Sun are
 *    bright, faces turned away are black), faint earthshine, and an
 *    illustrative regolith texture with rocks and their shadows.
 */
import { angDiff, DEG, norm360 } from "../../lib/geo";

// ---------------------------------------------------------------- Earth map
let earthPixels: { w: number; h: number; d: Uint8ClampedArray } | null = null;
let earthLoading = false;
const earthListeners = new Set<() => void>();

export function onEarthReady(fn: () => void) {
  earthListeners.add(fn);
  return () => earthListeners.delete(fn);
}

function loadEarth() {
  if (earthPixels || earthLoading || typeof Image === "undefined") return;
  earthLoading = true;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    earthPixels = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
    earthListeners.forEach((f) => f());
  };
  img.src = "/textures/earth_bluemarble.jpg";
}

/** Geographic point on Earth directly under the Moon (deg), low precision. */
export function subMoonPoint(tMs: number) {
  const d = tMs / 86400000 - 10957.5; // days since J2000.0
  const L = (218.316 + 13.176396 * d) * DEG;
  const M = (134.963 + 13.064993 * d) * DEG;
  const F = (93.272 + 13.22935 * d) * DEG;
  const lam = L + 6.289 * DEG * Math.sin(M);
  const bet = 5.128 * DEG * Math.sin(F);
  const eps = 23.439 * DEG;
  const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam));
  const dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam));
  const gmst = norm360(280.46061837 + 360.98564736629 * d);
  let lon = ra / DEG - gmst;
  lon = ((lon + 540) % 360) - 180;
  return { lat: dec / DEG, lon };
}

const earthCache = { key: "", canvas: null as HTMLCanvasElement | null };

/**
 * Earth disc as an offscreen canvas (2r x 2r). sun = direction of sunlight in
 * the disc frame (x right, y up, z toward the viewer).
 */
function earthCanvas(r: number, sub: { lat: number; lon: number }, sun: [number, number, number], northDown: boolean) {
  loadEarth();
  const R = Math.max(8, Math.min(220, Math.round(r)));
  const key = [R, sub.lat.toFixed(1), sub.lon.toFixed(1), sun.map((v) => v.toFixed(2)).join(","), northDown, !!earthPixels].join("|");
  if (earthCache.key === key && earthCache.canvas) return earthCache.canvas;
  const c = earthCache.canvas ?? document.createElement("canvas");
  c.width = c.height = 2 * R + 4;
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  const out = img.data;
  const sl = sub.lat * DEG, so = sub.lon * DEG;
  const cs = Math.cos(sl), ss = Math.sin(sl);
  for (let py = 0; py < c.height; py++) {
    for (let px = 0; px < c.width; px++) {
      const u = (px - R - 2 + 0.5) / R;
      const v = -(py - R - 2 + 0.5) / R;
      const rr = u * u + v * v;
      if (rr > 1) continue;
      const z = Math.sqrt(1 - rr);
      // Lighting from the true Sun direction (soft terminator).
      const lam = u * sun[0] + v * sun[1] + z * sun[2];
      const light = Math.max(0, Math.min(1, (lam + 0.06) / 0.5));
      // Body coordinates; north points down when seen from the south pole.
      const nx = northDown ? -u : u, ny = northDown ? -v : v;
      const lat = Math.asin(Math.max(-1, Math.min(1, ny * cs + z * ss)));
      const lon = so + Math.atan2(nx, z * cs - ny * ss);
      let cr = 30, cg = 70, cb = 140;
      if (earthPixels) {
        const ix = Math.floor((((lon / DEG + 180) % 360) + 360) % 360 / 360 * earthPixels.w) % earthPixels.w;
        const iy = Math.min(earthPixels.h - 1, Math.floor((90 - lat / DEG) / 180 * earthPixels.h));
        const k = (iy * earthPixels.w + ix) * 4;
        cr = earthPixels.d[k];
        cg = earthPixels.d[k + 1];
        cb = earthPixels.d[k + 2];
      }
      // Thin blue atmosphere toward the limb, on the lit side.
      const limb = Math.pow(1 - z, 3);
      const night = 0.035;
      const f = night + (1 - night) * light;
      const o = (py * c.width + px) * 4;
      out[o] = Math.min(255, cr * f + 90 * limb * light);
      out[o + 1] = Math.min(255, cg * f + 150 * limb * light);
      out[o + 2] = Math.min(255, cb * f + 255 * limb * light);
      const edge = Math.min(1, (1 - Math.sqrt(rr)) * R * 1.5); // antialias
      out[o + 3] = 255 * edge;
    }
  }
  g.putImageData(img, 0, 0);
  earthCache.key = key;
  earthCache.canvas = c;
  return c;
}

export function drawEarth(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  er: number,
  exag: number,
  sunScreenAngle: number, // radians, canvas coords (y down), Earth -> Sun
  phaseAngle: number, // Sun-Earth-observer angle, radians
  tMs: number,
) {
  const sin = Math.sin(phaseAngle);
  // canvas y is down; disc frame y is up.
  const sun: [number, number, number] = [sin * Math.cos(sunScreenAngle), -sin * Math.sin(sunScreenAngle), Math.cos(phaseAngle)];
  const c = earthCanvas(er, subMoonPoint(tMs), sun, true);
  const R = (c.width - 4) / 2;
  const k = er / R;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.scale(k, k * exag);
  ctx.drawImage(c, -R - 2, -R - 2);
  ctx.restore();
  // Faint outline so a "new Earth" (dark side toward us) can still be found.
  ctx.strokeStyle = "rgba(140,185,240,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(ex, ey, er + 1.5, (er + 1.5) * exag, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------------------------------------------------------------- Sun
export function drawSun(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, exag: number, visible: boolean) {
  // Camera glare (no atmosphere: the real sky stays black right up to the disc).
  const glare = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 22 + 30);
  glare.addColorStop(0, `rgba(255,248,232,${visible ? 0.5 : 0.25})`);
  glare.addColorStop(0.12, `rgba(255,236,200,${visible ? 0.16 : 0.08})`);
  glare.addColorStop(1, "rgba(255,220,170,0)");
  ctx.fillStyle = glare;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 22 + 30, 0, Math.PI * 2);
  ctx.fill();
  // Faint diffraction spikes, like a camera lens.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const L = r * 10 + 40;
    const g = ctx.createLinearGradient(sx - Math.cos(a) * L, sy - Math.sin(a) * L, sx + Math.cos(a) * L, sy + Math.sin(a) * L);
    g.addColorStop(0, "rgba(255,240,210,0)");
    g.addColorStop(0.5, `rgba(255,244,222,${visible ? 0.35 : 0.15})`);
    g.addColorStop(1, "rgba(255,240,210,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - Math.cos(a) * L, sy - Math.sin(a) * L);
    ctx.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L);
    ctx.stroke();
  }
  ctx.restore();
  // Limb-darkened disc (I = 1 - 0.6 (1 - mu)).
  const d = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  d.addColorStop(0, "#ffffff");
  d.addColorStop(0.7, "#fffaf0");
  d.addColorStop(0.92, "#f6e8cc");
  d.addColorStop(1, "#d9c49c");
  ctx.fillStyle = d;
  ctx.beginPath();
  ctx.ellipse(sx, sy, r, r * exag, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- Ground
let regolith: CanvasPattern | null = null;
function regolithPattern(ctx: CanvasRenderingContext2D) {
  if (regolith) return regolith;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const img = g.createImageData(S, S);
  let s = 987654;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Value noise at a few scales, tileable.
  const grid = (n: number) => Array.from({ length: n * n }, rnd);
  const octaves = [8, 16, 32, 64].map((n) => ({ n, v: grid(n) }));
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let val = 0, amp = 0.5, tot = 0;
      for (const { n, v } of octaves) {
        const fx = (x / S) * n, fy = (y / S) * n;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const at = (i: number, j: number) => v[((j % n) * n + (i % n))];
        const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
        const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
        val += (a * (1 - ty) + b * ty) * amp;
        tot += amp;
        amp *= 0.6;
      }
      const k = val / tot;
      const o = (y * S + x) * 4;
      const grey = 70 + k * 70;
      img.data[o] = grey;
      img.data[o + 1] = grey * 0.98;
      img.data[o + 2] = grey * 0.95;
      img.data[o + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  regolith = ctx.createPattern(c, "repeat");
  return regolith;
}

export interface Rock {
  az: number;
  d: number; // m
  s: number; // m
}

/** Illustrative rocks for a viewpoint, fixed per seed. */
export function makeRocks(seed: string, n = 260): Rock[] {
  let s = 7;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) % 2147483647;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({ az: rnd() * 360, d: 14 * Math.exp(rnd() * Math.log(18)), s: 0.08 + rnd() ** 4 * 0.9 }));
}

export interface GroundArgs {
  W: number;
  H: number;
  heading: number;
  pxDeg: number;
  X: (az: number) => number;
  Y: (el: number) => number;
  hAt: (az: number) => number;
  pts: [number, number][];
  sun?: { az: number; el: number; up: boolean };
  earth?: { az: number; up: boolean; lit: number };
  rocks: Rock[];
  observerM: number;
}

/** Fill the terrain below the horizon line with lit regolith and rocks. */
export function drawGround(ctx: CanvasRenderingContext2D, a: GroundArgs) {
  const { W, H, pts, heading, pxDeg, sun, earth } = a;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-2, H);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(W + 2, H);
  ctx.closePath();
  ctx.clip();

  // Base: dark regolith.
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, W, H);
  const pat = regolithPattern(ctx);
  if (pat) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Ambient: with the Sun down only earthshine remains, so the ground is near-black.
  const ambient = sun?.up ? 0.55 : 0.12 + (earth?.up ? 0.12 * earth.lit : 0);
  ctx.fillStyle = `rgba(0,0,0,${1 - ambient})`;
  ctx.fillRect(0, 0, W, H);

  // Sunlight on the faces we look at: bright when the Sun is behind us,
  // black when we look toward it. Grazing light, so it fades near the feet.
  const sunK = sun?.up ? Math.min(1, 0.45 + sun.el / 4) : 0;
  const top = Math.min(...pts.map((p) => p[1]));
  for (let x = 0; x < W; x += 3) {
    const az = norm360(heading + (x - W / 2) / pxDeg);
    let L = 0;
    if (sun?.up) L += sunK * Math.max(0, Math.cos(angDiff(az, sun.az + 180) * DEG)) ** 1.5;
    if (earth?.up) L += 0.05 * earth.lit * Math.max(0, Math.cos(angDiff(az, earth.az + 180) * DEG));
    if (L <= 0.01) continue;
    ctx.fillStyle = `rgba(214,206,190,${Math.min(0.85, L)})`;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillRect(x, top, 3, H - top);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(200,192,178,${Math.min(0.5, L * 0.55)})`;
    ctx.fillRect(x, top, 3, H - top);
  }
  // Darken toward the feet (grazing light, and the eye adapts to the sky).
  const fade = ctx.createLinearGradient(0, top, 0, H);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(0.35, "rgba(0,0,0,0.25)");
  fade.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, top, W, H - top);

  // Rocks with long shadows pointing away from the Sun (illustrative).
  const toScreen = (e: number, n: number) => {
    const d = Math.hypot(e, n);
    const az = norm360(Math.atan2(e, n) / DEG);
    return { x: a.X(az), y: a.Y(-Math.atan2(a.observerM, d) / DEG), d, az };
  };
  const sorted = [...a.rocks].sort((p, q) => q.d - p.d);
  for (const r of sorted) {
    if (Math.abs(angDiff(heading, r.az)) > (W / pxDeg) / 2 + 3) continue;
    const el = -Math.atan2(a.observerM, r.d) / DEG;
    if (el > a.hAt(r.az) - 0.25) continue; // hidden behind nearer rising ground
    const base = toScreen(r.d * Math.sin(r.az * DEG), r.d * Math.cos(r.az * DEG));
    const w = (r.s / r.d) / DEG * pxDeg;
    if (w < 0.8) continue;
    const hgt = w * 0.55;
    if (sun?.up && sun.el > 0.05) {
      const len = Math.min(r.s * 0.5 / Math.tan(sun.el * DEG), 25 * r.s);
      const sa = (sun.az + 180) * DEG;
      const end = toScreen(r.d * Math.sin(r.az * DEG) + len * Math.sin(sa), r.d * Math.cos(r.az * DEG) + len * Math.cos(sa));
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(0.8, hgt * 0.45);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    const lit = sun?.up ? Math.max(0, Math.cos(angDiff(r.az, sun.az + 180) * DEG)) : 0;
    const side = sun?.up ? Math.sin(angDiff(r.az, sun.az) * DEG) : 0; // which side faces the Sun
    const g = ctx.createLinearGradient(base.x - w, 0, base.x + w, 0);
    const bright = `rgb(${60 + 150 * (0.35 + 0.65 * lit)},${58 + 140 * (0.35 + 0.65 * lit)},${55 + 125 * (0.35 + 0.65 * lit)})`;
    const dark = "rgb(16,16,18)";
    // Sun to the right of the rock (side > 0) lights its right-hand side.
    g.addColorStop(0, side > 0 ? dark : bright);
    g.addColorStop(1, side > 0 ? bright : dark);
    ctx.fillStyle = sun?.up ? g : "rgb(22,22,26)";
    ctx.beginPath();
    ctx.ellipse(base.x, base.y - hgt * 0.5, w / 2, hgt / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
