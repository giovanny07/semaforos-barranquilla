// Generates a small synthetic fixture in public/data/ (same shape as the real files; see docs/data-schema.md).
// NEVER overwrites existing files: each file is written only if it is missing.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../public/data");
mkdirSync(dir, { recursive: true });

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const LAT0 = 10.975, LNG0 = -74.815, STEP = 0.0028, N = 9;
const RANK = ["living_street", "residential", "unclassified", "tertiary", "secondary", "primary", "trunk", "motorway"];
const classFor = (i) => (i % 8 === 4 ? "primary" : i % 4 === 0 ? "secondary" : i % 2 === 0 ? "tertiary" : "residential");
const lanesFor = (c) => ({ primary: 4, secondary: 3, tertiary: 2 }[c] ?? (rnd() < 0.5 ? null : 1));
const speedFor = (c) => ({ primary: 60, secondary: 50, tertiary: 40 }[c] ?? null);

const streets = [];
let wayId = 100000;
const calles = [], carreras = [];
for (let i = 0; i < N; i++) {
  const c = classFor(i);
  calles.push({ name: `Calle ${70 + i * 2}`, highway: c });
  streets.push({
    type: "Feature",
    geometry: { type: "LineString", coordinates: Array.from({ length: N }, (_, j) => [LNG0 + j * STEP, LAT0 + i * STEP]) },
    properties: { id: wayId++, name: `Calle ${70 + i * 2}`, highway: c, lanes: lanesFor(c), oneway: c === "residential" && rnd() < 0.5, maxspeed: speedFor(c) },
  });
}
for (let j = 0; j < N; j++) {
  const c = classFor(j + 2);
  carreras.push({ name: `Carrera ${38 + j * 2}`, highway: c });
  streets.push({
    type: "Feature",
    geometry: { type: "LineString", coordinates: Array.from({ length: N }, (_, i) => [LNG0 + j * STEP, LAT0 + i * STEP]) },
    properties: { id: wayId++, name: `Carrera ${38 + j * 2}`, highway: c, lanes: lanesFor(c), oneway: false, maxspeed: speedFor(c) },
  });
}

const intersections = [], signals = [];
let nodeId = 5000000;
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const a = calles[i], b = carreras[j];
  const ra = RANK.indexOf(a.highway), rb = RANK.indexOf(b.highway);
  const maxClass = ra >= rb ? a.highway : b.highway, minClass = ra >= rb ? b.highway : a.highway;
  const lo = Math.min(ra, rb), hi = Math.max(ra, rb);
  const id = `j${i}_${j}`;
  const coord = [LNG0 + j * STEP, LAT0 + i * STEP];
  const hasSignal = lo >= 4 ? rnd() < 0.75 : lo >= 3 ? rnd() < 0.25 : false;
  const pois = {
    school: rnd() < 0.15 ? 1 : 0, hospital: rnd() < 0.06 ? 1 : 0, market: rnd() < 0.1 ? 1 : 0,
    busStop: hi >= 4 ? Math.floor(rnd() * 4) : 0, worship: rnd() < 0.1 ? 1 : 0, park: rnd() < 0.12 ? 1 : 0,
  };
  const dist = hasSignal ? Math.round(rnd() * 12) : Math.round(150 + rnd() * 900);
  let score = null; const reasons = [];
  if (!hasSignal) {
    score = Math.round(Math.min(100, lo * 9 + hi * 7 + (pois.school ? 12 : 0) + (pois.hospital ? 10 : 0) + Math.min(15, dist / 60) + rnd() * 8));
    if (hi >= 5) reasons.push(`Cruce de vía primaria con ${minClass === "primary" ? "primaria" : minClass === "secondary" ? "secundaria" : minClass === "tertiary" ? "terciaria" : "local"}`);
    else if (hi >= 4) reasons.push("Cruce con vía secundaria");
    if (pois.school) reasons.push("Colegio a menos de 200 m");
    if (pois.hospital) reasons.push("Hospital a menos de 200 m");
    if (dist > 500) reasons.push(`Semáforo más cercano a ${dist} m`);
    if (pois.busStop >= 2) reasons.push("Varias paradas de bus cercanas");
  }
  const status = hasSignal ? "signalized" : score >= 70 ? "needs_high" : score >= 55 ? "needs_medium" : score >= 40 ? "needs_low" : "ok";
  const jev = !hasSignal && score >= 40 && rnd() < 0.7
    ? (() => {
        const s = Math.max(0, Math.min(100, Math.round(score + (rnd() - 0.5) * 30)));
        return {
          needLevel: s >= 70 ? "alta" : s >= 50 ? "media" : "baja",
          needScore: s, warrantProb: Math.round((s / 100) * 0.9 * 100) / 100,
          control: s >= 70 ? "semaforo" : s >= 50 ? "pare_multiple" : "pare", confidence: Math.round((0.55 + rnd() * 0.4) * 100) / 100,
        };
      })()
    : null;
  intersections.push({
    type: "Feature", geometry: { type: "Point", coordinates: coord },
    properties: {
      id, streets: [a.name, b.name], classes: [a.highway, b.highway], maxClass, minClass,
      legs: i === 0 || j === 0 || i === N - 1 || j === N - 1 ? 3 : 4,
      maxLanes: Math.max(lanesFor(a.highway) ?? 0, lanesFor(b.highway) ?? 0) || null,
      hasSignal, distNearestSignalM: dist, pois, heuristicScore: score, heuristicReasons: reasons, status, jev,
    },
  });
  if (hasSignal) signals.push({ type: "Feature", geometry: { type: "Point", coordinates: [coord[0] + 0.00004, coord[1] + 0.00003] }, properties: { id: nodeId++, kind: "signal", intersectionId: id } });
}
for (let k = 0; k < 6; k++) signals.push({
  type: "Feature",
  geometry: { type: "Point", coordinates: [LNG0 + (Math.floor(rnd() * (N - 1)) + 0.5) * STEP, LAT0 + Math.floor(rnd() * N) * STEP] },
  properties: { id: nodeId++, kind: "crossing_signal", intersectionId: null },
});

const count = (s) => intersections.filter((f) => f.properties.status === s).length;
const byClassPair = {};
for (const f of intersections) {
  const k = `${f.properties.maxClass}-${f.properties.minClass}`;
  byClassPair[k] ??= { total: 0, signalized: 0 };
  byClassPair[k].total++; if (f.properties.hasSignal) byClassPair[k].signalized++;
}
const summary = {
  generatedAt: new Date().toISOString(),
  counts: { streets: streets.length, signals: signals.length, intersections: intersections.length, signalized: count("signalized"), needsHigh: count("needs_high"), needsMedium: count("needs_medium"), needsLow: count("needs_low") },
  byClassPair, clippedToMunicipality: false, fixture: true,
};

const fc = (features) => JSON.stringify({ type: "FeatureCollection", features });
const out = { "streets.geojson": fc(streets), "signals.geojson": fc(signals), "intersections.geojson": fc(intersections), "summary.json": JSON.stringify(summary, null, 2) };
for (const [name, body] of Object.entries(out)) {
  const p = join(dir, name);
  if (existsSync(p)) { console.log(`omitido (ya existe): ${name}`); continue; }
  writeFileSync(p, body); console.log(`fixture escrito: ${name}`);
}
