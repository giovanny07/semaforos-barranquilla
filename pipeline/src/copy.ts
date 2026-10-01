/** Step 3 — copy what the map needs from data/out/ to web/public/data/.
 *
 *  - intersections.geojson: only the junctions the map draws or lists (prioritario, recomendado, observacion and
 *    semaforizado; the ~8,800 "sin acción" ones are never shown) and only the properties the UI reads.
 *  - crashes-by-intersection.json: the crash fields of those junctions (Alcaldía data, CC BY-SA 4.0), joined by id
 *    in the browser.
 *  - streets.geojson, signals.geojson, summary.json: copied as they are.
 *
 *  data/out/ keeps the full database. */
import fs from "node:fs";
import path from "node:path";
import { CRASHES_OUT, OUT_DIR, WEB_DATA_DIR } from "./config.ts";

const SHOWN = new Set(["prioritario", "recomendado", "observacion", "semaforizado"]);
/** Junction properties read by web/ (lib/data.ts, components/*, lib/sim.ts). */
const WEB_PROPS = [
  "id", "streets", "classes", "majorStreet", "crossStreet", "legs", "maxLanes", "pois", "hasSignal", "signalSource",
  "distNearestSignalM", "distSignalAlongM", "priority", "priorityScore", "recommendation", "evidence", "agreement",
];
const WEB_CRASH_PROPS = ["crashes", "crashRank"];

const src = (f: string) => {
  const fp = path.join(OUT_DIR, f);
  if (!fs.existsSync(fp)) throw new Error(`missing ${fp} — run "pnpm run build" first`);
  return fp;
};
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const report = (f: string) => console.log(`copied ${f} → web/public/data/ (${(fs.statSync(path.join(WEB_DATA_DIR, f)).size / 1e6).toFixed(2)} MB)`);

fs.mkdirSync(WEB_DATA_DIR, { recursive: true });

const fc = JSON.parse(fs.readFileSync(src("intersections.geojson"), "utf8"));
fc.features = fc.features
  .filter((f: any) => SHOWN.has(f.properties.priority))
  .map((f: any) => ({ type: "Feature", geometry: f.geometry, properties: pick(f.properties, WEB_PROPS) }));
fs.writeFileSync(path.join(WEB_DATA_DIR, "intersections.geojson"), JSON.stringify(fc));
report("intersections.geojson");

const crashes = JSON.parse(fs.readFileSync(src(CRASHES_OUT), "utf8")) as Record<string, Record<string, unknown>>;
const webCrashes: Record<string, unknown> = {};
for (const f of fc.features) if (crashes[f.properties.id]) webCrashes[f.properties.id] = pick(crashes[f.properties.id], WEB_CRASH_PROPS);
fs.writeFileSync(path.join(WEB_DATA_DIR, CRASHES_OUT), JSON.stringify(webCrashes));
report(CRASHES_OUT);

for (const f of ["streets.geojson", "signals.geojson", "summary.json"]) {
  fs.copyFileSync(src(f), path.join(WEB_DATA_DIR, f));
  report(f);
}
