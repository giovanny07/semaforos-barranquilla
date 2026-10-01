/** Step 4 — sanity checks on data/out and web/public/data. Exits non-zero on hard failures. `--top N` prints the N best candidates. */
import fs from "node:fs";
import path from "node:path";
import { BBOX, CRASH_FIELDS, CRASHES_OUT, OFFICIAL_FIELDS, OFFICIAL_OUT, OFFICIAL_SIGNALS, OUT_DIR, RAW_DIR, WEB_DATA_DIR } from "./config.ts";
import { AreaFilter, assembleRings } from "./geo.ts";

const load = (f: string, dir = OUT_DIR) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const streets = load("streets.geojson").features as any[];
const signals = load("signals.geojson").features as any[];
const inters = load("intersections.geojson").features as any[];
const summary = load("summary.json");
const crashFile = load(CRASHES_OUT) as Record<string, Record<string, unknown>>;
const officialOut = load(OFFICIAL_OUT).features as any[];
const topIdx = process.argv.indexOf("--top");
const TOP = topIdx > 0 ? Number(process.argv[topIdx + 1]) : 15;

const errors: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) errors.push(msg); };

// ---- licence split: Alcaldía-only fields live in their own CC BY-SA files, joined back by intersection id
const separate = [...CRASH_FIELDS, ...OFFICIAL_FIELDS] as string[];
check(inters.every((f) => separate.every((k) => !(k in f.properties))), `intersections.geojson must not carry ${separate.join(", ")}`);
const ids = new Set(inters.map((f) => f.properties.id));
check(Object.keys(crashFile).every((id) => ids.has(id)), `${CRASHES_OUT} has ids that are not junctions`);
check(Object.keys(crashFile).length === 0 || Object.keys(crashFile).length === inters.length, `${CRASHES_OUT} must cover every junction (or be empty without crash data)`);
for (const f of inters) Object.assign(f.properties, crashFile[f.properties.id] ?? { crashes: null, crashRank: null });
const officialIn = JSON.parse(fs.readFileSync(OFFICIAL_SIGNALS, "utf8")).features as any[];
check(officialOut.length === officialIn.length, `${OFFICIAL_OUT}: ${officialOut.length} points, inventory has ${officialIn.length}`);
check(officialOut.every((f) => f.properties.intersectionId === null || ids.has(f.properties.intersectionId)), `${OFFICIAL_OUT}: unknown intersectionId`);

const inBbox = ([lon, lat]: number[]) => lat >= BBOX.s && lat <= BBOX.n && lon >= BBOX.w && lon <= BBOX.e;
check(streets.length > 3000, `too few streets: ${streets.length}`);
check(signals.length > 300, `too few signals: ${signals.length}`);
check(inters.every((f) => inBbox(f.geometry.coordinates)), "intersection outside bbox");
check(signals.every((f) => inBbox(f.geometry.coordinates)), "signal outside bbox");
if (summary.clippedToMunicipality) {
  const rel = JSON.parse(fs.readFileSync(path.join(RAW_DIR, "boundary.json"), "utf8")).elements.find((e: any) => e.type === "relation" && e.tags?.admin_level === "6");
  const area = new AreaFilter(assembleRings(rel.members, "outer"), assembleRings(rel.members, "inner"));
  // The boundary follows streets, so junctions sit exactly on it; allow for the 6-decimal rounding (~0.1 m).
  const E = 3e-6;
  const inside = ([x, y]: number[]) => [[0, 0], [E, 0], [-E, 0], [0, E], [0, -E]].some(([dx, dy]) => area.contains(x + dx, y + dy));
  const out = inters.filter((f) => !inside(f.geometry.coordinates)).length;
  const outSig = signals.filter((f) => !inside(f.geometry.coordinates)).length;
  check(out === 0, `${out} intersections outside the municipality polygon`);
  check(outSig === 0, `${outSig} signals outside the municipality polygon`);
  console.log(`outside municipality polygon: intersections ${out}, signals ${outSig}`);
}
check(new Set(inters.map((f) => f.properties.id)).size === inters.length, "duplicate intersection ids");
const STATUSES = ["signalized", "needs_high", "needs_medium", "needs_low", "ok"];
for (const f of inters) {
  const p = f.properties;
  check(STATUSES.includes(p.status), `bad status ${p.status}`);
  check(p.hasSignal === (p.status === "signalized"), `${p.id}: hasSignal/status mismatch`);
  check(p.hasSignal ? p.heuristicScore === null : p.heuristicScore >= 0 && p.heuristicScore <= 100, `${p.id}: bad score`);
  check(p.legs >= 3 && Array.isArray(p.streets) && Array.isArray(p.heuristicReasons), `${p.id}: bad shape`);
  if (errors.length > 20) break;
}
// ---- priority tiers
const PRIORITIES = ["prioritario", "recomendado", "observacion", "sin_accion", "semaforizado"];
const RECS = ["Semáforo vehicular", "Semáforo peatonal", "PARE / ceda el paso", "Reductores de velocidad", "Glorieta", "Ninguna"];
const JARGON = /\bjev\b|modelo|\bIA\b|inteligencia artificial|probabilidad|confianza|%/i;
const byPriority: Record<string, number> = {};
for (const f of inters) {
  const p = f.properties;
  byPriority[p.priority] = (byPriority[p.priority] ?? 0) + 1;
  check(PRIORITIES.includes(p.priority), `${p.id}: bad priority ${p.priority}`);
  check((p.priority === "semaforizado") === p.hasSignal, `${p.id}: priority/hasSignal mismatch`);
  check(p.hasSignal ? ["osm", "oficial", "ambos"].includes(p.signalSource) : p.signalSource === null, `${p.id}: bad signalSource`);
  check(RECS.includes(p.recommendation), `${p.id}: bad recommendation ${p.recommendation}`);
  check(["alto", "medio", "bajo"].includes(p.agreement), `${p.id}: bad agreement`);
  check(Number.isFinite(p.priorityScore) && p.priorityScore >= 0 && p.priorityScore <= 100, `${p.id}: bad priorityScore`);
  check(Array.isArray(p.evidence) && p.evidence.length > 0 && p.evidence.every((e: unknown) => typeof e === "string" && e.length > 3 && !JARGON.test(e as string)), `${p.id}: bad evidence ${JSON.stringify(p.evidence)}`);
  check(p.crashes === null || (p.crashes.total >= p.crashes.injuries + p.crashes.deaths && typeof p.crashes.period === "string"), `${p.id}: bad crashes`);
  check(p.crashRank === null || (!p.hasSignal && p.crashes?.total > 0 && p.crashRank >= 0 && p.crashRank <= 100), `${p.id}: bad crashRank`);
  check(p.distSignalAlongM === null || p.distSignalAlongM >= 0, `${p.id}: bad distSignalAlongM`);
  if (p.priority === "prioritario" || p.priority === "recomendado") {
    const s = p.structure ?? {};
    check(!s.roundabout && !s.nearRoundabout && !s.ramp && !s.gradeSeparated && !s.nearGradeSeparated, `${p.id}: shortlisted junction on a roundabout / ramp / overpass`);
    check(p.distNearestSignalM < 0 || p.distNearestSignalM >= 80, `${p.id}: shortlisted junction ${p.distNearestSignalM} m from a signal`);
    check(!p.coveredBy && !p.twinOf, `${p.id}: shortlisted junction is covered / a twin`);
    check(["trunk", "primary", "secondary", "tertiary"].includes(p.majorClass), `${p.id}: shortlisted junction without a collector or arterial`);
    check(p.jev != null && /^Semáforo/.test(p.recommendation), `${p.id}: shortlisted without a signal recommendation`);
  }
  if (errors.length > 20) break;
}
check((byPriority.prioritario ?? 0) <= 80, `prioritario not credible: ${byPriority.prioritario}`);
check(summary.counts.prioritario === (byPriority.prioritario ?? 0), "summary prioritario mismatch");
check(summary.counts.signalized >= 330 && summary.counts.signalized <= 380, `signalized count ${summary.counts.signalized} far from the official 342`);
// the shortlist must not contain the same crossing twice
const P = inters.filter((f) => f.properties.priority === "prioritario");
for (let a = 0; a < P.length; a++)
  for (let b = a + 1; b < P.length; b++) {
    const [x1, y1] = P[a].geometry.coordinates, [x2, y2] = P[b].geometry.coordinates;
    const d = Math.hypot((x1 - x2) * 111_320 * Math.cos((y1 * Math.PI) / 180), (y1 - y2) * 110_574);
    check(d > 100, `prioritario ${P[a].properties.id} and ${P[b].properties.id} are ${Math.round(d)} m apart`);
  }
console.log("priority:", PRIORITIES.map((s) => `${s}=${byPriority[s] ?? 0}`).join("  "));

const dist: Record<string, number> = {};
for (const f of inters) dist[f.properties.status] = (dist[f.properties.status] ?? 0) + 1;
check((dist.needs_high ?? 0) < 1000, `needs_high not credible: ${dist.needs_high}`);
check(summary.counts.intersections === inters.length, "summary count mismatch");

console.log(`streets ${streets.length} | signals ${signals.length} (${signals.filter((s) => s.properties.kind === "signal").length} signal, ${signals.filter((s) => s.properties.kind === "crossing_signal").length} crossing) | intersections ${inters.length}`);
console.log(`clippedToMunicipality: ${summary.clippedToMunicipality}`);
console.log("status:", STATUSES.map((s) => `${s}=${dist[s] ?? 0}`).join("  "));
console.log(`signals with an intersectionId: ${signals.filter((s) => s.properties.intersectionId).length}`);
console.log(`intersections with jev: ${inters.filter((f) => f.properties.jev).length}`);

// ---- web copies (pipeline/src/copy.ts): trimmed to what the map draws, same tier counts as the summary
const web = load("intersections.geojson", WEB_DATA_DIR).features as any[];
const webSummary = load("summary.json", WEB_DATA_DIR);
const webCrashes = load(CRASHES_OUT, WEB_DATA_DIR) as Record<string, unknown>;
const webIds = new Set(web.map((f) => f.properties.id));
const webBy: Record<string, number> = {};
for (const f of web) webBy[f.properties.priority] = (webBy[f.properties.priority] ?? 0) + 1;
check(!webBy.sin_accion, "web intersections still contain sin_accion junctions");
check(web.every((f) => separate.every((k) => !(k in f.properties))), "web intersections carry crash / inventory fields");
check(Object.keys(webCrashes).every((id) => webIds.has(id)), `web ${CRASHES_OUT} has ids missing from the web intersections`);
for (const k of ["prioritario", "recomendado", "observacion"] as const) check((webBy[k] ?? 0) === summary.counts[k], `web ${k} ${webBy[k]} ≠ summary ${summary.counts[k]}`);
check((webBy.semaforizado ?? 0) === summary.counts.signalized, `web semaforizado ${webBy.semaforizado} ≠ summary ${summary.counts.signalized}`);
check(JSON.stringify(webSummary) === JSON.stringify(summary), "web summary.json differs from data/out/summary.json");
const linked = new Set(signals.map((s) => s.properties.intersectionId).filter(Boolean));
check([...linked].every((id) => webIds.has(id)), "a signal points to a junction missing from the web copy");
console.log(`web copy: ${web.length} junctions (prioritario ${webBy.prioritario ?? 0} · recomendado ${webBy.recomendado ?? 0} · observacion ${webBy.observacion ?? 0} · semaforizado ${webBy.semaforizado ?? 0}), ${Object.keys(webCrashes).length} crash entries`);

console.log(`\nTop ${TOP} needs_high:`);
const top = inters.filter((f) => !f.properties.hasSignal).sort((a, b) => b.properties.heuristicScore - a.properties.heuristicScore).slice(0, TOP);
for (const f of top) {
  const p = f.properties;
  console.log(`  ${String(p.heuristicScore).padStart(3)}  ${p.streets.join(" × ") || "(sin nombre)"}  [${p.majorClass}×${p.crossClass}, ${p.legs} accesos, señal a ${p.distNearestSignalM} m]  ${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}`);
}

if (errors.length) {
  console.error("\nVERIFY FAILED:\n" + [...new Set(errors)].slice(0, 20).map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log("\nverify OK");
