#!/usr/bin/env node
/**
 * Save real backend results into public/fixtures/ so the app still shows
 * SPICE + LOLA numbers when the backend is not running (static hosting,
 * demo-day Wi-Fi). Run with the backend up:
 *
 *   uvicorn Backend.app.main:app            # from the repo root
 *   npm run snapshot                        # from Frontend/
 *   npm run snapshot -- 2028-11-20 2029-01-15   # extra landing dates
 *
 * Keep in sync with src/state/store.ts (WINDOW_DAYS, STEP_MINUTES, DELAYS)
 * and src/api/client.ts (fixture file names).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.API_URL ?? "http://localhost:8000";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "fixtures");
const WINDOW_DAYS = 30;
const STEP_MINUTES = 30;
const DELAYS = [0, 3, 7, 14, 30];
const starts = process.argv.slice(2).length ? process.argv.slice(2) : ["2028-11-20"];

const round = (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v);
const get = async (path) => {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
};
const save = (name, data) => writeFile(join(OUT, name), JSON.stringify(data, round));

await mkdir(OUT, { recursive: true });
const sites = await get("/sites");
await save("sites.json", sites);
for (const s of sites) {
  await save(`${s.id}_horizon.json`, await get(`/sites/${s.id}/horizon`));
  for (const base of starts) {
    for (const d of DELAYS) {
      const start = new Date(Date.parse(`${base}T00:00:00Z`) + d * 864e5);
      const end = new Date(start.getTime() + WINDOW_DAYS * 864e5);
      const iso = (t) => t.toISOString().replace(".000Z", "Z");
      const q = new URLSearchParams({ start: iso(start), end: iso(end), step_minutes: String(STEP_MINUTES) });
      const name = `${s.id}_${iso(start).slice(0, 10)}_${WINDOW_DAYS}d.json`;
      await save(name, await get(`/sites/${s.id}/analysis?${q}`));
      console.log("saved", name);
    }
  }
}
