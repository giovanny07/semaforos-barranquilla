/**
 * Step 1 — fetch raw OSM data from Overpass and the crash records from datos.gov.co into data/raw/
 * (cached; never re-fetched when present). Network, no API key. The committed data/raw/ is the snapshot the
 * published numbers come from: re-fetching gives a newer OSM snapshot, so the numbers will change.
 *
 *   pnpm run fetch                 # fetch whatever is missing (from the repo root)
 *   pnpm run fetch -- --force      # ignore the cache and download everything again
 */
import fs from "node:fs";
import path from "node:path";
import { fetchCrashes } from "./crashes.ts";
import { BBOX, BBOX_STR, HIGHWAY_REGEX, OVERPASS_HEADERS, OVERPASS_URL, RAW_DIR } from "./config.ts";

const FORCE = process.argv.includes("--force");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class OverpassBusy extends Error {}
class OverpassTimeout extends Error {}

async function overpassOnce(query: string): Promise<any> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: OVERPASS_HEADERS,
    body: "data=" + encodeURIComponent(query),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  if (res.status === 429 || res.status === 503 || res.status === 504) {
    throw new OverpassBusy(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${text.slice(0, 300)}`);
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    // Overpass returns HTML/XML error pages on overload
    if (/rate_limited|too busy|Dispatcher_Client/i.test(text)) throw new OverpassBusy("busy (html)");
    if (/timed out|out of memory/i.test(text)) throw new OverpassTimeout(text.slice(0, 200));
    throw new Error("Overpass returned non-JSON: " + text.slice(0, 300));
  }
  // A 200 with a `remark` means the query died server-side (timeout / memory) → partial data.
  if (typeof json.remark === "string" && /timed out|out of memory|runtime error/i.test(json.remark)) {
    throw new OverpassTimeout(json.remark);
  }
  return json;
}

/** Polite retry with exponential backoff when the server is busy. Timeouts are rethrown for the caller to split. */
async function overpass(query: string, label: string): Promise<any> {
  const delays = [10_000, 20_000, 40_000, 80_000, 120_000];
  for (let attempt = 0; ; attempt++) {
    try {
      const t0 = Date.now();
      const json = await overpassOnce(query);
      console.log(`  [${label}] ${json.elements?.length ?? 0} elements in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return json;
    } catch (err) {
      if (err instanceof OverpassTimeout) throw err;
      const retriable = err instanceof OverpassBusy || (err as Error).name === "TimeoutError" || (err as any)?.cause;
      if (!retriable || attempt >= delays.length) throw err;
      console.log(`  [${label}] ${(err as Error).message} — retrying in ${delays[attempt] / 1000}s`);
      await sleep(delays[attempt]);
    }
  }
}

type Box = { s: number; w: number; n: number; e: number };
const boxStr = (b: Box) => `${b.s},${b.w},${b.n},${b.e}`;
function quarter(b: Box): Box[] {
  const mLat = (b.s + b.n) / 2;
  const mLon = (b.w + b.e) / 2;
  return [
    { s: b.s, w: b.w, n: mLat, e: mLon },
    { s: b.s, w: mLon, n: mLat, e: b.e },
    { s: mLat, w: b.w, n: b.n, e: mLon },
    { s: mLat, w: mLon, n: b.n, e: b.e },
  ];
}

/**
 * Runs `makeQuery(bbox)`; on a server-side timeout, splits the bbox in 4 and merges (dedup by type/id).
 */
async function fetchTiled(makeQuery: (bbox: string) => string, label: string, box: Box = BBOX, depth = 0): Promise<any[]> {
  try {
    const json = await overpass(makeQuery(boxStr(box)), label + (depth ? `/d${depth}` : ""));
    return json.elements ?? [];
  } catch (err) {
    if (!(err instanceof OverpassTimeout) || depth >= 3) throw err;
    console.log(`  [${label}] timed out (${(err as Error).message.trim()}); splitting bbox into 4`);
    const seen = new Set<string>();
    const out: any[] = [];
    for (const sub of quarter(box)) {
      await sleep(2000);
      for (const el of await fetchTiled(makeQuery, label, sub, depth + 1)) {
        const key = `${el.type}/${el.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(el);
        }
      }
    }
    return out;
  }
}

async function cached(file: string, producer: () => Promise<any[]>, optional = false): Promise<void> {
  const fp = path.join(RAW_DIR, file);
  if (!FORCE && fs.existsSync(fp)) {
    console.log(`cached  ${file}`);
    return;
  }
  console.log(`fetch   ${file}`);
  try {
    const elements = await producer();
    fs.writeFileSync(fp, JSON.stringify({ fetchedAt: new Date().toISOString(), bbox: BBOX_STR, elements }));
    console.log(`  wrote ${file} (${(fs.statSync(fp).size / 1e6).toFixed(2)} MB)`);
  } catch (err) {
    if (!optional) throw err;
    console.warn(`  WARNING: could not fetch ${file}: ${(err as Error).message} — continuing without it`);
  }
  await sleep(3000); // be polite between queries
}

/** POIs keep only the tags the build reads: OSM contact tags (phone, e-mail, addresses…) are not stored. */
const POI_TAGS = ["name", "amenity", "shop", "highway", "public_transport", "leisure", "bus"];
const slimPoi = (e: any) => ({
  type: e.type, id: e.id, ...(e.lat != null ? { lat: e.lat, lon: e.lon } : {}), ...(e.center ? { center: e.center } : {}),
  tags: Object.fromEntries(POI_TAGS.filter((k) => e.tags?.[k] != null).map((k) => [k, e.tags[k]])),
});

const Q = {
  ways: (bbox: string) => `[out:json][timeout:180][bbox:${bbox}];
way["highway"~"${HIGHWAY_REGEX}"];
out body geom;`,
  signals: (bbox: string) => `[out:json][timeout:90][bbox:${bbox}];
(
  node["highway"="traffic_signals"];
  node["crossing"="traffic_signals"];
);
out body;`,
  pois: (bbox: string) => `[out:json][timeout:120][bbox:${bbox}];
(
  nwr["amenity"~"^(school|college|university|kindergarten|hospital|clinic|marketplace|bus_station|place_of_worship)$"];
  nwr["shop"~"^(supermarket|mall)$"];
  node["highway"="bus_stop"];
  node["public_transport"="platform"]["bus"="yes"];
  nwr["public_transport"="station"];
  nwr["leisure"="park"];
);
out tags center;`,
  // Relations are matched by bbox when any member lies inside it; much cheaper than an area query.
  boundary: (bbox: string) => `[out:json][timeout:120][bbox:${bbox}];
relation["boundary"="administrative"]["name"="Barranquilla"];
out body geom;`,
};

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  await cached("ways.json", () => fetchTiled(Q.ways, "ways"));
  await cached("signals.json", () => fetchTiled(Q.signals, "signals"));
  await cached("pois.json", async () => (await fetchTiled(Q.pois, "pois")).map(slimPoi));
  await cached("boundary.json", () => fetchTiled(Q.boundary, "boundary"), true);
  // crash records (datos.gov.co, Socrata API, paginated; cached like the rest)
  try {
    const rows = await fetchCrashes(FORCE);
    console.log(`crashes: ${rows.length} rows (data/raw/crashes-yb9r-2dsi.json)`);
  } catch (err) {
    console.warn(`  WARNING: could not fetch crash records: ${(err as Error).message} — the build will set crashes = null`);
  }
  console.log("fetch done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
