#!/usr/bin/env node
/**
 * Bake static Moon textures from NASA Moon Trek WMTS tiles (LRO data).
 *
 *   npm run bake:textures            # all textures
 *   npm run bake:textures -- shade   # only keys containing "shade"
 *
 * Writes JPGs to public/textures/ so the app works offline and loads fast.
 * Sources: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon
 *
 * South-pole layers are polar stereographic (sphere R = 1 737 400 m).
 * Grid (from WMTSCapabilities.xml): top-left (-1095930, 1095930),
 * 256 px tiles, resolution 8562.03 m/px at zoom 0, halving per level,
 * 2^z x 2^z tiles with data. Most layers stop at zoom 5 (268 m/px); the
 * LOLA hillshades go deeper. Tile URL order is {z}/{row}/{col}.
 * Image orientation: +y (up) = 0°E, +x (right) = 90°E.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "textures");
const TREK = "https://trek.nasa.gov/tiles/Moon";
const SP_ORIGIN = 1095930;
const SP_RES0 = (30578404.017857101 * 0.28) / 1000; // m/px at zoom 0

/** half-extent in metres, keep in sync with src/lib/geo.ts */
export const CAPS = { outer: 400_000, inner: 40_000 };

const JOBS = [
  { key: "global_wac", kind: "eq", layer: "LRO_WAC_Mosaic_Global_303ppd_v02", z: 3, ext: "jpg" },
  { key: "sp_outer_shade", kind: "sp", layer: "LRO_LOLA_Shade_SPole75_30mp_v04", z: 6, half: CAPS.outer, size: 3072 },
  { key: "sp_outer_wac", kind: "sp", layer: "LRO_WAC_Mosaic_SPole60_100m_v02", z: 5, half: CAPS.outer, size: 2048 },
  { key: "sp_outer_illum", kind: "sp", layer: "LRO_LOLA_Illumination_SPole65S_240m", z: 3, half: CAPS.outer, size: 1024 },
  { key: "sp_outer_earthvis", kind: "sp", layer: "AVGVISIB_75S_120M_201608_EARTH_SP", z: 5, half: CAPS.outer, size: 2048 },
  // median: suppresses the LOLA ground-track striping that converges at the pole
  { key: "sp_inner_shade", kind: "sp", layer: "LRO_LOLA_Shade_SPole875_5mp_v04", z: 8, half: CAPS.inner, size: 2048, median: 5 },
];

async function fetchTile(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (i === tries - 1) throw new Error(`${url}: ${err}`);
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function mosaic(tiles, width, height, background) {
  const parts = (
    await pool(tiles, 12, async (t) => {
      const buf = await fetchTile(t.url);
      if (!buf) return null;
      // Normalise every tile (gray+alpha PNG, JPG…) to RGBA PNG.
      const input = await sharp(buf).ensureAlpha().png().toBuffer();
      return { input, left: t.left, top: t.top };
    })
  ).filter(Boolean);
  process.stdout.write(`  ${parts.length}/${tiles.length} tiles\n`);
  return sharp({ create: { width, height, channels: 4, background } }).composite(parts);
}

async function bakeEq(job) {
  const cols = 2 ** (job.z + 1), rows = 2 ** job.z;
  const tiles = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      tiles.push({ url: `${TREK}/EQ/${job.layer}/1.0.0/default/default028mm/${job.z}/${r}/${c}.${job.ext}`, left: c * 256, top: r * 256 });
  const img = await mosaic(tiles, cols * 256, rows * 256, { r: 0, g: 0, b: 0, alpha: 1 });
  return sharp(await img.png().toBuffer()).flatten({ background: "#000" }).jpeg({ quality: 86 }).toBuffer();
}

async function bakeSp(job) {
  const res = SP_RES0 / 2 ** job.z;
  const tileM = res * 256;
  const c0 = Math.floor((SP_ORIGIN - job.half) / tileM);
  const c1 = Math.floor((SP_ORIGIN + job.half) / tileM);
  const tiles = [];
  for (let r = c0; r <= c1; r++)
    for (let c = c0; c <= c1; c++)
      tiles.push({
        url: `${TREK}/SP/${job.layer}/1.0.0/default/default028mm/${job.z}/${r}/${c}.png`,
        left: (c - c0) * 256,
        top: (r - c0) * 256,
      });
  const n = (c1 - c0 + 1) * 256;
  const img = await mosaic(tiles, n, n, { r: 0, g: 0, b: 0, alpha: 1 });
  // Crop exactly [-half, +half] in both axes. Row 0 of the mosaic is at
  // y = SP_ORIGIN - c0*tileM; x likewise from the left.
  const offset = Math.round((SP_ORIGIN - job.half - c0 * tileM) / res);
  const side = Math.round((2 * job.half) / res);
  const flat = await sharp(await img.png().toBuffer())
    .extract({ left: offset, top: offset, width: side, height: side })
    .png()
    .toBuffer();
  let out = sharp(flat).flatten({ background: "#000" });
  if (job.median) out = sharp(await out.median(job.median).png().toBuffer());
  return out.resize(job.size, job.size).jpeg({ quality: 86 }).toBuffer();
}

const filter = process.argv[2];
await mkdir(OUT, { recursive: true });
for (const job of JOBS) {
  if (filter && !job.key.includes(filter)) continue;
  console.log(`${job.key}  ←  ${job.layer} (z${job.z})`);
  const buf = job.kind === "eq" ? await bakeEq(job) : await bakeSp(job);
  await writeFile(join(OUT, `${job.key}.jpg`), buf);
  console.log(`  wrote ${job.key}.jpg (${(buf.length / 1024).toFixed(0)} KB)`);
}
