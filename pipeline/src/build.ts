/**
 * Step 2 — raw OSM → streets / signals / intersections / summary in data/out/.
 *   pnpm run build
 */
import fs from "node:fs";
import path from "node:path";
import KDBush from "kdbush";
import {
  BACKTEST_FILE, CLASS_RANK, CRASH_FIELDS, CRASHES_OUT, GEO, JEV_SCORES, JEV_SCORES_NOCRASH, OFFICIAL_FIELDS, OFFICIAL_OUT, OFFICIAL_SIGNALS,
  OUT_DIR, RAW_DIR, REPORT_DIR, type RoadClass,
} from "./config.ts";
import { AreaFilter, angleDiff, assembleRings, bearing, dist, project, round6, unproject } from "./geo.ts";
import { HEURISTIC, scoreJunction, type JunctionFacts, type Pois, type Status } from "./heuristic.ts";
import { keysFromOsmName, normText, pairKey, parseCrashAddress } from "./streetkeys.ts";
import { assignSites, buildSites, SITE, type OfficialSignal, type OsmSignal } from "./signals.ts";
import { CRASH, loadCrashes, matchCrashes, type CrashCount } from "./crashes.ts";
import { computePriority, loadThresholds, type PriorityInput } from "./priority.ts";

type XY = [number, number];
type RawWay = { type: string; id: number; nodes: number[]; geometry: Array<{ lat: number; lon: number }>; tags: Record<string, string> };
type Way = {
  id: number;
  name: string | null;
  highway: string;
  cls: RoadClass;
  isLink: boolean;
  lanes: number | null;
  oneway: boolean;
  maxspeed: number | null;
  roundabout: boolean;
  /** bridge / tunnel / layer≠0: not at grade */
  gradeSep: boolean;
  /** normalised street keys from name + alt names (see streetkeys.ts) */
  keys: string[];
  nodes: number[];
  coords: Array<[number, number]>; // lon, lat
};

/** `fetchedAt` of every raw OSM file read: the snapshot date stamps the outputs, so a rebuild is byte-identical. */
const fetchedAt: string[] = [];
const readRaw = (f: string) => {
  const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"));
  if (typeof raw.fetchedAt === "string") fetchedAt.push(raw.fetchedAt);
  return raw.elements as any[];
};
/** Latest raw-snapshot date (or SOURCE_DATE_EPOCH, or now when neither exists). */
const snapshotDate = () =>
  fetchedAt.length ? [...fetchedAt].sort().at(-1)!
  : process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : new Date().toISOString();
const rank = (c: RoadClass) => CLASS_RANK.indexOf(c); // lower = more important
const num = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = parseFloat(v.split(";")[0]);
  return Number.isFinite(n) ? n : null;
};

/** Street keys of a way; a named street whose name does not parse still gets a key so twins can be grouped. */
function wayKeys(t: Record<string, string>): string[] {
  const keys = new Set<string>();
  for (const k of ["name", "alt_name", "official_name", "old_name", "loc_name", "short_name"]) for (const x of keysFromOsmName(t[k])) keys.add(x);
  if (!keys.size && t.name) keys.add("N:" + normText(t.name));
  return [...keys];
}

// ---------------------------------------------------------------- area
function loadArea(): AreaFilter {
  const fp = path.join(RAW_DIR, "boundary.json");
  try {
    if (!fs.existsSync(fp)) throw new Error("boundary.json missing");
    const rels = readRaw("boundary.json").filter((e) => e.type === "relation");
    // municipality = admin_level 6 in Colombia
    const rel = rels.find((r) => r.tags?.admin_level === "6") ?? rels[0];
    if (!rel) throw new Error("no boundary relation in response");
    const outers = assembleRings(rel.members, "outer");
    const inners = assembleRings(rel.members, "inner");
    console.log(`boundary: relation ${rel.id}, ${outers.length} outer ring(s), ${outers.reduce((s, r) => s + r.length, 0)} vertices`);
    return new AreaFilter(outers, inners);
  } catch (err) {
    console.warn(`WARNING: municipality boundary unusable (${(err as Error).message}); keeping bbox only`);
    return new AreaFilter(null);
  }
}

// ---------------------------------------------------------------- main
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const area = loadArea();

  // ---- streets
  const rawWays = readRaw("ways.json") as RawWay[];
  const ways: Way[] = [];
  for (const w of rawWays) {
    if (w.type !== "way" || !w.geometry || w.geometry.length < 2) continue;
    const t = w.tags ?? {};
    if (t.area === "yes" || t.access === "private" || t.access === "no") continue;
    if (!w.geometry.some((p) => area.contains(p.lon, p.lat))) continue;
    const cls = t.highway.replace(/_link$/, "") as RoadClass;
    const roundabout = t.junction === "roundabout" || t.junction === "circular";
    ways.push({
      id: w.id,
      name: t.name ?? t.ref ?? null,
      highway: t.highway,
      cls,
      isLink: t.highway.endsWith("_link"),
      lanes: num(t.lanes),
      oneway: t.oneway === "yes" || t.oneway === "-1" || t.oneway === "1" || roundabout,
      maxspeed: num(t.maxspeed),
      roundabout,
      gradeSep: (!!t.bridge && t.bridge !== "no") || (!!t.tunnel && t.tunnel !== "no") || (!!t.layer && t.layer !== "0"),
      keys: wayKeys(t),
      nodes: w.nodes,
      coords: w.geometry.map((p) => [p.lon, p.lat]),
    });
  }
  console.log(`streets: ${ways.length} of ${rawWays.length} ways kept`);

  // ---- node graph
  const pos = new Map<number, XY>();
  const adj = new Map<number, Array<{ to: number; way: number }>>();
  const link = (a: number, b: number, way: number) => {
    let l = adj.get(a);
    if (!l) adj.set(a, (l = []));
    l.push({ to: b, way });
  };
  ways.forEach((w, wi) => {
    for (let i = 0; i < w.nodes.length; i++) {
      if (!pos.has(w.nodes[i])) pos.set(w.nodes[i], project(w.coords[i][0], w.coords[i][1]));
      if (i > 0 && w.nodes[i] !== w.nodes[i - 1]) {
        link(w.nodes[i], w.nodes[i - 1], wi);
        link(w.nodes[i - 1], w.nodes[i], wi);
      }
    }
  });

  // Junction candidates: ≥3 graph legs. Degree-2 nodes shared by two ways are way-splits / name changes /
  // corners (the same roadway continues) and are skipped.
  const cand: number[] = [];
  for (const [id, l] of adj) if (l.length >= 3) cand.push(id);
  console.log(`graph: ${pos.size} nodes, ${cand.length} junction-node candidates`);

  // ---- cluster candidates within mergeRadius that are actually connected by road
  const candIdx = new KDBush(cand.length);
  for (const id of cand) candIdx.add(...pos.get(id)!);
  candIdx.finish();

  const connectedWithin = (a: number, b: number, maxM: number): boolean => {
    // bounded Dijkstra-ish DFS; neighbourhoods are tiny
    const best = new Map<number, number>([[a, 0]]);
    const stack: number[] = [a];
    while (stack.length) {
      const u = stack.pop()!;
      const du = best.get(u)!;
      for (const e of adj.get(u) ?? []) {
        const dv = du + dist(pos.get(u)!, pos.get(e.to)!);
        if (dv > maxM || dv >= (best.get(e.to) ?? Infinity)) continue;
        if (e.to === b) return true;
        best.set(e.to, dv);
        stack.push(e.to);
      }
    }
    return false;
  };

  const pairs: Array<[number, number, number]> = [];
  cand.forEach((id, i) => {
    const p = pos.get(id)!;
    for (const j of candIdx.within(p[0], p[1], GEO.mergeRadiusM)) {
      if (j > i) pairs.push([i, j, dist(p, pos.get(cand[j])!)]);
    }
  });
  pairs.sort((a, b) => a[2] - b[2]);

  const parent = cand.map((_, i) => i);
  const box = cand.map((id) => {
    const p = pos.get(id)!;
    return [p[0], p[1], p[0], p[1]];
  });
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [i, j, d] of pairs) {
    const a = find(i), b = find(j);
    if (a === b) continue;
    const m = [Math.min(box[a][0], box[b][0]), Math.min(box[a][1], box[b][1]), Math.max(box[a][2], box[b][2]), Math.max(box[a][3], box[b][3])];
    if (Math.hypot(m[2] - m[0], m[3] - m[1]) > GEO.maxClusterSpanM) continue;
    if (!connectedWithin(cand[i], cand[j], d * 1.6 + 10)) continue; // e.g. bridge over a street: close but not connected
    parent[b] = a;
    box[a] = m;
  }
  const clusters = new Map<number, number[]>();
  cand.forEach((id, i) => {
    const r = find(i);
    let l = clusters.get(r);
    if (!l) clusters.set(r, (l = []));
    l.push(id);
  });
  const clusterOf = new Map<number, number>();
  for (const [r, members] of clusters) for (const m of members) clusterOf.set(m, r);

  // ---- signals (OSM + official inventory) & POIs
  const rawSignals = readRaw("signals.json").filter((e) => e.type === "node" && area.contains(e.lon, e.lat));
  const osmSignals: OsmSignal[] = rawSignals.map((s) => ({
    id: s.id,
    xy: project(s.lon, s.lat),
    kind: s.tags?.highway === "traffic_signals" ? "signal" : "crossing_signal",
  }));
  const officialAll = (JSON.parse(fs.readFileSync(OFFICIAL_SIGNALS, "utf8")).features as any[]).map((f, idx): OfficialSignal => ({
    idx,
    xy: project(f.geometry.coordinates[0], f.geometry.coordinates[1]),
    lonlat: f.geometry.coordinates,
    nombre: f.properties.nombre,
    codigo: f.properties.codigo,
    estado: f.properties.estado,
    fechaInicio: f.properties.fechaInicio,
  }));
  const official = officialAll.filter((o) => area.contains(o.lonlat[0], o.lonlat[1]));
  const sites = buildSites(osmSignals, official);

  const poiKind = (t: Record<string, string>): keyof Pois | null => {
    const a = t.amenity;
    if (a === "school" || a === "college" || a === "university" || a === "kindergarten") return "school";
    if (a === "hospital" || a === "clinic") return "hospital";
    if (a === "marketplace" || t.shop === "supermarket" || t.shop === "mall") return "market";
    if (a === "bus_station" || t.highway === "bus_stop" || t.public_transport === "platform" || t.public_transport === "station") return "busStop";
    if (a === "place_of_worship") return "worship";
    if (t.leisure === "park") return "park";
    return null;
  };
  const pois: Array<{ xy: XY; kind: keyof Pois }> = [];
  for (const e of readRaw("pois.json")) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    const kind = poiKind(e.tags ?? {});
    if (lat == null || !kind) continue;
    pois.push({ xy: project(lon, lat), kind });
  }
  const poiIdx = new KDBush(Math.max(1, pois.length));
  if (pois.length === 0) poiIdx.add(1e12, 1e12);
  for (const p of pois) poiIdx.add(p.xy[0], p.xy[1]);
  poiIdx.finish();

  // Road overpasses / underpasses: a bridge or tunnel way that crosses ANOTHER drivable way without sharing a node.
  // (Most bridge=yes ways in Barranquilla are small bridges over arroyos and canals: those are ordinary streets.)
  const segIdx = new KDBush(ways.reduce((n, w) => n + w.nodes.length - 1, 0));
  const segs: Array<{ wi: number; a: number; b: number }> = [];
  ways.forEach((w, wi) => {
    for (let i = 1; i < w.nodes.length; i++) {
      const A = pos.get(w.nodes[i - 1])!, B = pos.get(w.nodes[i])!;
      segs.push({ wi, a: w.nodes[i - 1], b: w.nodes[i] });
      segIdx.add((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
    }
  });
  segIdx.finish();
  const ccw = (A: XY, B: XY, C: XY) => (C[1] - A[1]) * (B[0] - A[0]) - (B[1] - A[1]) * (C[0] - A[0]);
  const crosses = (A: XY, B: XY, C: XY, D: XY) => ccw(A, C, D) * ccw(B, C, D) < 0 && ccw(A, B, C) * ccw(A, B, D) < 0;
  const overpass = new Set<number>(); // way indexes
  ways.forEach((w, wi) => {
    if (!w.gradeSep) return;
    for (let i = 1; i < w.nodes.length && !overpass.has(wi); i++) {
      const A = pos.get(w.nodes[i - 1])!, B = pos.get(w.nodes[i])!;
      for (const h of segIdx.within((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, dist(A, B) / 2 + 150)) {
        const sg = segs[h];
        if (sg.wi === wi || sg.a === w.nodes[i - 1] || sg.a === w.nodes[i] || sg.b === w.nodes[i - 1] || sg.b === w.nodes[i]) continue;
        if (crosses(A, B, pos.get(sg.a)!, pos.get(sg.b)!)) { overpass.add(wi); overpass.add(sg.wi); break; }
      }
    }
  });
  // the road passing under/over is only "grade separated" at that spot, so index the crossing structure's nodes only
  const structPts: Array<{ xy: XY; kind: "roundabout" | "grade" }> = [];
  ways.forEach((w, wi) => {
    const kind = w.roundabout ? "roundabout" : w.gradeSep && overpass.has(wi) ? "grade" : null;
    if (kind) for (const n of w.nodes) structPts.push({ xy: pos.get(n)!, kind });
  });
  console.log(`structures: ${ways.filter((w) => w.roundabout).length} roundabout ways, ${ways.filter((w, wi) => w.gradeSep && overpass.has(wi)).length} road over/underpass ways (of ${ways.filter((w) => w.gradeSep).length} bridge/tunnel/layer ways)`);
  const structIdx = new KDBush(Math.max(1, structPts.length));
  if (!structPts.length) structIdx.add(1e12, 1e12);
  for (const p of structPts) structIdx.add(p.xy[0], p.xy[1]);
  structIdx.finish();
  const isOverpassWay = (w: Way) => w.gradeSep && overpass.has(ways.indexOf(w));

  // ---- pass 1: geometry of each intersection
  type Leg = { way: Way; bearing: number };
  type Approach = { legs: Leg[]; bearing: number; cls: RoadClass; name: string | null; isLink: boolean; oneway: boolean };
  type Inter = {
    id: string;
    lonlat: [number, number];
    xy: XY;
    members: number[];
    memberXY: XY[];
    legWays: Way[];
    majorName: string | null;
    majorKeys: Set<string>;
    facts: Omit<JunctionFacts, "distNearestSignalM">;
    structure: { roundabout: boolean; ramp: boolean; gradeSeparated: boolean; nearRoundabout: boolean; nearGradeSeparated: boolean };
    group: number;
    props: Record<string, any>;
  };
  const inters: Inter[] = [];

  for (const [root, members] of clusters) {
    const mset = new Set(members);
    const legs: Leg[] = [];
    for (const u of members) {
      for (const e0 of adj.get(u)!) {
        // walk outward along the roadway through degree-2 nodes
        let prev = u, cur = e0.to, travelled = dist(pos.get(u)!, pos.get(cur)!), internal = false;
        let sample: XY = pos.get(cur)!;
        for (;;) {
          if (mset.has(cur)) { internal = true; break; }
          sample = pos.get(cur)!;
          if (travelled >= GEO.legBearingSampleM) break;
          const nb = adj.get(cur)!;
          if (nb.length !== 2 || clusterOf.has(cur)) break;
          const nx = nb[0].to === prev ? nb[1] : nb[0];
          travelled += dist(pos.get(cur)!, pos.get(nx.to)!);
          prev = cur;
          cur = nx.to;
        }
        if (internal) continue;
        legs.push({ way: ways[e0.way], bearing: bearing(pos.get(u)!, sample) });
      }
    }
    // merge legs into approaches (both carriageways of a divided road = one approach)
    const approaches: Approach[] = [];
    for (const leg of legs) {
      const w = leg.way;
      const hit = approaches.find(
        (a) =>
          angleDiff(a.bearing, leg.bearing) <= GEO.sameApproachDeg &&
          ((w.name != null && w.name === a.name) || (w.name == null && a.name == null && w.oneway && a.oneway && w.cls === a.cls && w.isLink === a.isLink)),
      );
      if (hit) {
        hit.legs.push(leg);
        if (rank(w.cls) < rank(hit.cls)) hit.cls = w.cls;
        hit.isLink = hit.isLink && w.isLink;
        hit.oneway = hit.oneway && w.oneway;
      } else {
        approaches.push({ legs: [leg], bearing: leg.bearing, cls: w.cls, name: w.name, isLink: w.isLink, oneway: w.oneway });
      }
    }
    if (approaches.length < 3) continue; // carriageway split/merge, not an intersection

    const cx = members.reduce((s, m) => s + pos.get(m)![0], 0) / members.length;
    const cy = members.reduce((s, m) => s + pos.get(m)![1], 0) / members.length;
    const [lon, lat] = unproject(cx, cy);
    if (!area.contains(lon, lat)) continue;

    // major street vs crossing street(s)
    const W = HEURISTIC.classWeight;
    const lanesOf = (a: Approach) => Math.max(0, ...a.legs.map((l) => l.way.lanes ?? 0));
    const major = [...approaches].sort(
      (a, b) => Number(a.isLink) - Number(b.isLink) || W[b.cls] - W[a.cls] || lanesOf(b) - lanesOf(a) || Number(b.name != null) - Number(a.name != null),
    )[0];
    // The major street = the top approach, everything sharing its name, and whatever leaves the junction
    // opposite to it (the same roadway continuing, even if its name/class changes there).
    // When the major street visibly continues under its own name on the opposite side, another street arriving at a
    // flat angle (e.g. Carrera 9G merging into a carriageway of the Circunvalar) is a crossing street, not a continuation.
    const continuesByName = major.name != null && approaches.some((a) => a !== major && a.name === major.name && angleDiff(a.bearing, major.bearing) >= 150);
    const isMajorStreet = (a: Approach) =>
      a === major || (major.name != null && a.name === major.name) || (!continuesByName && angleDiff(a.bearing, major.bearing) >= 150);
    const majorSet = approaches.filter(isMajorStreet);
    const crossing = approaches.filter((a) => !isMajorStreet(a));
    const crossReal = crossing.filter((a) => !a.isLink);
    const crossPool = crossReal.length ? crossReal : crossing;
    const crossBest = crossPool.length ? crossPool.reduce((b, a) => (W[a.cls] > W[b.cls] ? a : b)) : null;
    const crossClass = crossBest ? crossBest.cls : null;

    const legWays = legs.map((l) => l.way);
    const classesNorm = legWays.map((w) => w.cls);
    const maxClass = classesNorm.reduce((a, b) => (rank(b) < rank(a) ? b : a));
    const minClass = classesNorm.reduce((a, b) => (rank(b) > rank(a) ? b : a));
    const lanesVals = legWays.map((w) => w.lanes).filter((v): v is number => v != null);
    const maxLanes = lanesVals.length ? Math.max(...lanesVals) : null;

    const pc: Pois = { school: 0, hospital: 0, market: 0, busStop: 0, worship: 0, park: 0 };
    for (const h of poiIdx.within(cx, cy, GEO.poiRadiusM)) if (pois[h]) pc[pois[h].kind]++;

    const near = structIdx.within(cx, cy, GEO.interchangeRadiusM).map((h) => structPts[h]).filter(Boolean);
    const structure = {
      roundabout: legWays.some((w) => w.roundabout),
      // ramps of trunk/motorway interchanges, or a junction whose only "crossing" is a ramp. Slip lanes (`_link`) of
      // ordinary avenues at an at-grade junction are NOT structural.
      ramp: legWays.some((w) => w.isLink && (w.cls === "trunk" || w.cls === "motorway")) || (crossing.length > 0 && crossReal.length === 0),
      gradeSeparated: legWays.some(isOverpassWay),
      nearRoundabout: near.some((p) => p.kind === "roundabout" && dist(p.xy, [cx, cy]) <= GEO.roundaboutRadiusM),
      nearGradeSeparated: near.some((p) => p.kind === "grade"),
    };

    const majorKeys = new Set<string>();
    for (const a of majorSet) if (a.name === major.name) for (const l of a.legs) for (const k of l.way.keys) majorKeys.add(k);

    const id = `n${Math.min(...members)}`;
    inters.push({
      id,
      lonlat: [round6(lon), round6(lat)],
      xy: [cx, cy],
      members,
      memberXY: members.map((m) => pos.get(m)!),
      legWays,
      majorName: major.name,
      majorKeys,
      structure,
      group: -1,
      facts: {
        majorClass: major.cls,
        crossClass,
        approaches: approaches.length,
        maxLanes,
        divided: majorSet.some((a) => a.legs.length >= 2 && a.legs.every((l) => l.way.oneway)),
        rampOnly: crossing.length > 0 && crossReal.length === 0,
        roundabout: structure.roundabout,
        onewayT: crossing.length === 1 && majorSet.every((a) => a.legs.length === 1 && a.oneway),
        pois: pc,
      },
      props: {
        id,
        streets: [...new Set(legWays.map((w) => w.name).filter((n): n is string => !!n))],
        classes: [...new Set(legWays.map((w) => w.highway))].sort((a, b) => rank(a.replace(/_link$/, "") as RoadClass) - rank(b.replace(/_link$/, "") as RoadClass)),
        maxClass,
        minClass,
        majorClass: major.cls,
        crossClass,
        majorStreet: major.name,
        crossStreet: crossBest?.name ?? null,
        legs: approaches.length,
        maxLanes,
        pois: pc,
      },
    });
    void root;
  }
  console.log(`intersections: ${inters.length} (from ${clusters.size} clusters)`);
  const interById = new Map(inters.map((it) => [it.id, it]));

  // ---- pass 2: which junctions are signalized (one primary junction per signal site; neighbours are "covered")
  const W = HEURISTIC.classWeight;
  const { primaryOf, coveredBy } = assignSites(
    sites,
    inters.map((it) => ({ id: it.id, xy: it.xy, memberXY: it.memberXY, weight: W[it.facts.majorClass] * (it.facts.crossClass ? W[it.facts.crossClass] : 0) })),
  );
  // signal points for distance queries: every OSM node + official points of official-only sites
  const sigPts: Array<{ xy: XY; site: number }> = [];
  for (const s of sites) {
    for (const n of s.osm) sigPts.push({ xy: n.xy, site: s.id });
    if (!s.osm.length) for (const o of s.official) sigPts.push({ xy: o.xy, site: s.id });
  }
  const sigIdx = new KDBush(Math.max(1, sigPts.length));
  if (!sigPts.length) sigIdx.add(1e12, 1e12);
  for (const p of sigPts) sigIdx.add(p.xy[0], p.xy[1]);
  sigIdx.finish();
  const nearestSignal = (pts: XY[], excludeSite = -1): number => {
    let best = Infinity;
    for (const p of pts) {
      for (let r = 60; r <= 100_000; r *= 4) {
        for (const h of sigIdx.within(p[0], p[1], r)) if (sigPts[h] && sigPts[h].site !== excludeSite) best = Math.min(best, dist(p, sigPts[h].xy));
        if (best <= r) break; // anything outside r is farther than best
      }
    }
    return best;
  };

  // graph nodes that carry a signal: OSM signal nodes that are way nodes + member nodes of signalized/covered junctions
  const nodeSite = new Map<number, number>();
  for (const s of sites) for (const n of s.osm) if (pos.has(n.id)) nodeSite.set(n.id, s.id);
  for (const it of inters) {
    const s = primaryOf.get(it.id) ?? coveredBy.get(it.id)?.site;
    if (s) for (const m of it.members) if (!nodeSite.has(m)) nodeSite.set(m, s.id);
  }
  /** Distance along the junction's main road (same-named ways only) to the nearest signal of another site. */
  const alongRoad = (it: Inter, excludeSite = -1): number | null => {
    if (!it.majorName) return null;
    const onRoad = (wi: number) => ways[wi].name === it.majorName || ways[wi].keys.some((k) => it.majorKeys.has(k));
    const best = new Map<number, number>();
    const queue: Array<[number, number]> = [];
    for (const m of it.members) { best.set(m, 0); queue.push([0, m]); }
    while (queue.length) {
      queue.sort((a, b) => b[0] - a[0]);
      const [d, u] = queue.pop()!;
      if (d > (best.get(u) ?? Infinity)) continue;
      const site = nodeSite.get(u);
      if (site !== undefined && site !== excludeSite && d > 0) return Math.round(d);
      for (const e of adj.get(u) ?? []) {
        if (!onRoad(e.way)) continue;
        const dv = d + dist(pos.get(u)!, pos.get(e.to)!);
        if (dv > GEO.alongRoadMaxM || dv >= (best.get(e.to) ?? Infinity)) continue;
        best.set(e.to, dv);
        queue.push([dv, e.to]);
      }
    }
    return null;
  };

  for (const it of inters) {
    const site = primaryOf.get(it.id);
    const cov = coveredBy.get(it.id);
    const pts = [...it.memberXY, it.xy];
    const dSig = nearestSignal(pts);
    it.props.hasSignal = !!site;
    it.props.signalSource = site ? site.source : null;
    it.props.coveredBy = cov ? cov.by : null;
    it.props.distNearestSignalM = Number.isFinite(dSig) ? Math.round(dSig) : -1;
    it.props.distSignalAlongM = site ? null : alongRoad(it, cov ? cov.site.id : -1);
    if (site?.official.length) {
      it.props.signalOfficialName = site.official.map((o) => o.nombre).join(" / ");
      it.props.signalSince = site.official[0].fechaInicio ?? null;
    }
  }

  // ---- pass 3: crossing groups (dual-carriageway twins: same street pair, < twinRadiusM apart) and crash matching
  const pairsOf = (it: Inter): string[] => {
    const byName = new Map<string, string[]>();
    for (const w of it.legWays) if (w.name && w.keys.length) byName.set(w.name, w.keys);
    const names = [...byName.keys()];
    const out = new Set<string>();
    for (let a = 0; a < names.length; a++)
      for (let b = a + 1; b < names.length; b++)
        for (const ka of byName.get(names[a])!) for (const kb of byName.get(names[b])!) if (ka !== kb) out.add(pairKey(ka, kb));
    return [...out];
  };
  const byPair = new Map<string, number[]>();
  inters.forEach((it, i) => { for (const k of pairsOf(it)) (byPair.get(k) ?? byPair.set(k, []).get(k)!).push(i); });
  const gParent = inters.map((_, i) => i);
  const gBox = inters.map((it) => [it.xy[0], it.xy[1], it.xy[0], it.xy[1]]);
  const gFind = (i: number): number => (gParent[i] === i ? i : (gParent[i] = gFind(gParent[i])));
  const twinPairs: Array<[number, number, number]> = [];
  for (const list of byPair.values())
    for (let a = 0; a < list.length; a++)
      for (let b = a + 1; b < list.length; b++) {
        const d = dist(inters[list[a]].xy, inters[list[b]].xy);
        if (d <= GEO.twinRadiusM) twinPairs.push([list[a], list[b], d]);
      }
  twinPairs.sort((x, y) => x[2] - y[2]);
  for (const [i, j] of twinPairs) {
    const a = gFind(i), b = gFind(j);
    if (a === b) continue;
    const m = [Math.min(gBox[a][0], gBox[b][0]), Math.min(gBox[a][1], gBox[b][1]), Math.max(gBox[a][2], gBox[b][2]), Math.max(gBox[a][3], gBox[b][3])];
    if (Math.hypot(m[2] - m[0], m[3] - m[1]) > GEO.maxCrossingSpanM) continue; // never chain a whole corridor into one "crossing"
    gParent[b] = a;
    gBox[a] = m;
  }
  inters.forEach((it, i) => (it.group = gFind(i)));
  const groupMembers = new Map<number, Inter[]>();
  for (const it of inters) (groupMembers.get(it.group) ?? groupMembers.set(it.group, []).get(it.group)!).push(it);
  const pairIndex = new Map<string, Set<number>>();
  for (const [k, list] of byPair) pairIndex.set(k, new Set(list.map((i) => inters[i].group)));

  const crashRows = loadCrashes();
  let crashCounts = new Map<number, CrashCount>();
  let crashReport: ReturnType<typeof matchCrashes>["report"] | null = null;
  if (crashRows) {
    const r = matchCrashes(crashRows, pairIndex, (g) => {
      const m = groupMembers.get(g)!;
      return { label: `${m[0].props.streets.join(" × ")} (${m.map((x) => x.id).join(",")})`, lat: m[0].lonlat[1], lon: m[0].lonlat[0] };
    });
    crashCounts = r.counts;
    crashReport = r.report;
    console.log(`crashes: ${r.report.matched}/${r.report.records} matched (${(r.report.matchRateAll * 100).toFixed(1)} %), ${r.report.inPeriod.matched} in ${CRASH.period}`);
  } else console.warn('WARNING: no crash file in data/raw — run "pnpm run fetch"; crashes = null');

  // percentile scale: crossing groups with no signalized/covered member and ≥1 crash in the period
  const groupSignalized = (g: number) => groupMembers.get(g)!.some((m) => m.props.hasSignal || m.props.coveredBy);
  const unsigTotals = [...crashCounts.entries()].filter(([g, c]) => c.total > 0 && !groupSignalized(g)).map(([, c]) => c.total).sort((a, b) => a - b);
  const pct = (total: number): number => {
    if (!unsigTotals.length || total <= 0) return 0;
    let below = 0, equal = 0;
    for (const t of unsigTotals) { if (t < total) below++; else if (t === total) equal++; }
    return Math.round(((below + 0.5 * equal) / unsigTotals.length) * 100);
  };
  const q = (p: number) => (unsigTotals.length ? unsigTotals[Math.min(unsigTotals.length - 1, Math.floor(p * unsigTotals.length))] : 0);
  for (const it of inters) {
    const c = crashRows ? crashCounts.get(it.group) : undefined;
    const has = !!c && c.total > 0;
    it.props.crashes = crashRows ? { total: c?.total ?? 0, injuries: c?.injuries ?? 0, deaths: c?.deaths ?? 0, period: CRASH.period } : null;
    it.props.crashesRecentVictims = c?.recentVictims ?? 0;
    it.props.crashesPedestrian = c?.pedestrians ?? 0;
    it.props.crashPct = has ? pct(c!.total) : null; // same scale for every junction (used by the model state and the backtest)
    it.props.crashRank = has && !it.props.hasSignal && !it.props.coveredBy ? it.props.crashPct : null;
  }

  // ---- pass 4: heuristic (unchanged rules; straight-line distance)
  for (const it of inters) {
    let score: number | null = null, reasons: string[], status: Status = "signalized";
    if (it.props.hasSignal) reasons = ["Intersección ya semaforizada"];
    else if (it.props.coveredBy) {
      score = 0;
      status = "ok";
      reasons = ["Cubierto por el cruce semaforizado contiguo"];
    } else {
      const r = scoreJunction({ ...it.facts, distNearestSignalM: it.props.distNearestSignalM < 0 ? Infinity : it.props.distNearestSignalM });
      score = r.score; reasons = r.reasons; status = r.status;
    }
    Object.assign(it.props, {
      divided: it.facts.divided,
      onewayT: it.facts.onewayT,
      structure: it.structure,
      heuristicScore: score,
      heuristicReasons: reasons,
      status,
      jev: null,
    });
  }

  // ---- merge jev scores
  if (fs.existsSync(JEV_SCORES)) {
    const raw = JSON.parse(fs.readFileSync(JEV_SCORES, "utf8"));
    const byId = new Map<string, any>();
    const src = Array.isArray(raw) ? raw : Array.isArray(raw.scores) ? raw.scores : (raw.scores ?? raw);
    if (Array.isArray(src)) for (const r of src) byId.set(String(r.id ?? r.intersectionId), r.jev ?? r);
    else for (const [k, v] of Object.entries(src)) byId.set(k, (v as any)?.jev ?? v);
    let n = 0;
    for (const it of inters) {
      const j = byId.get(it.id);
      if (it.props.hasSignal || it.props.coveredBy) continue;
      if (!j || typeof j !== "object" || j.needScore == null) continue;
      it.props.jev = { needLevel: String(j.needLevel), needScore: Number(j.needScore), warrantProb: Number(j.warrantProb), control: String(j.control), confidence: Number(j.confidence) };
      n++;
    }
    console.log(`jev: merged ${n} scores from jev-scores.json`);
  } else {
    console.log("jev: no jev-scores.json → jev = null");
  }

  // crash-blind second opinion (same model, crash records withheld) → used only for `agreement`
  const noCrash: Record<string, { warrantProb: number; control: string }> = fs.existsSync(JEV_SCORES_NOCRASH) ? JSON.parse(fs.readFileSync(JEV_SCORES_NOCRASH, "utf8")) : {};

  // ---- pass 5: priority tiers (model + rules + evidence), then de-duplicate twins
  const hashId = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
  const thresholds = loadThresholds();
  {
    // crash level of the junctions the city already signalized (tune half only, same split as the backtest)
    const t = inters.filter((it) => it.props.signalSource === "ambos" && hashId(it.id) % 2 === 0 && it.props.crashes).map((it) => it.props.crashes.total as number).sort((a, b) => a - b);
    if (t.length) { thresholds.signalizedCrashMedian = t[t.length >> 1]; thresholds.signalizedCrashP75 = t[Math.floor(t.length * 0.75)]; }
    const sp = inters.filter((it) => it.props.signalSource === "ambos" && hashId(it.id) % 2 === 0)
      .map((it) => nearestSignal([...it.memberXY, it.xy], primaryOf.get(it.id)!.id)).filter(Number.isFinite).sort((a, b) => a - b);
    if (sp.length) thresholds.signalizedSpacingP25M = Math.round(sp[Math.floor(sp.length * 0.25)]);
    console.log(`priority: thresholds ${JSON.stringify(thresholds)}`);
  }
  const prio = new Map<string, ReturnType<typeof computePriority>>();
  const priorityInput = (it: Inter, over: Partial<PriorityInput> = {}): PriorityInput => ({
    hasSignal: it.props.hasSignal,
    coveredBy: it.props.coveredBy,
    coveredByName: it.props.coveredBy ? (interById.get(it.props.coveredBy)?.props.streets ?? []).slice(0, 2).join(" × ") : null,
    coveredDistM: it.props.coveredBy ? Math.round(dist(it.xy, interById.get(it.props.coveredBy)!.xy)) : null,
    signalSource: it.props.signalSource,
    signalSince: it.props.signalSince ?? null,
    majorClass: it.facts.majorClass,
    crossClass: it.facts.crossClass,
    majorStreet: it.majorName,
    crossStreet: it.props.crossStreet,
    legs: it.facts.approaches,
    maxLanes: it.facts.maxLanes,
    divided: it.facts.divided,
    onewayT: it.facts.onewayT,
    rampOnly: it.facts.rampOnly,
    structure: it.structure,
    distNearestSignalM: it.props.distNearestSignalM,
    distSignalAlongM: it.props.distSignalAlongM,
    pois: it.facts.pois,
    crashes: it.props.crashes,
    crashesRecentVictims: it.props.crashesRecentVictims,
    crashesPedestrian: it.props.crashesPedestrian,
    crashRank: it.props.crashRank,
    jev: it.props.jev,
    jevNoCrash: it.props.jev && noCrash[it.id] ? { warrantProb: Number(noCrash[it.id].warrantProb), control: String(noCrash[it.id].control) } : null,
    ...over,
  });
  for (const it of inters) prio.set(it.id, computePriority(priorityInput(it), thresholds));
  // twins: the same crossing must appear once. Keep the best-ranked record; the others point to it.
  const TIER_ORDER = ["prioritario", "recomendado", "observacion", "sin_accion", "semaforizado"];
  let twinsDemoted = 0;
  for (const members of groupMembers.values()) {
    if (members.length < 2) continue;
    const ranked = [...members].sort((a, b) => {
      const pa = prio.get(a.id)!, pb = prio.get(b.id)!;
      return TIER_ORDER.indexOf(pa.priority) - TIER_ORDER.indexOf(pb.priority) || pb.priorityScore - pa.priorityScore || a.id.localeCompare(b.id);
    });
    const keep = ranked[0];
    const signalized = members.find((m) => m.props.hasSignal);
    for (const m of ranked.slice(1)) {
      const p = prio.get(m.id)!;
      if (p.priority === "semaforizado" || p.priority === "sin_accion") continue;
      const ref = signalized ?? keep;
      m.props.twinOf = ref.id;
      prio.set(m.id, {
        priority: "sin_accion",
        priorityScore: 0,
        recommendation: "Ninguna",
        evidence: [signalized ? `Mismo cruce que el semaforizado a ${Math.round(dist(m.xy, ref.xy))} m (otra calzada)` : `Mismo cruce que el punto evaluado a ${Math.round(dist(m.xy, ref.xy))} m (otra calzada de la misma vía)`],
        agreement: "alto",
      });
      twinsDemoted++;
    }
  }
  // neighbouring candidates: within nmsRadiusM only the best-ranked stays "prioritario" (one signal changes the other's need)
  const pri = inters.filter((it) => prio.get(it.id)!.priority === "prioritario").sort((a, b) => prio.get(b.id)!.priorityScore - prio.get(a.id)!.priorityScore || a.id.localeCompare(b.id));
  const kept: Inter[] = [];
  let nmsDemoted = 0;
  for (const it of pri) {
    const near = kept.find((k) => dist(k.xy, it.xy) <= GEO.nmsRadiusM);
    if (!near) { kept.push(it); continue; }
    const p = prio.get(it.id)!;
    p.priority = "recomendado";
    p.priorityScore = Math.min(74, p.priorityScore - 25);
    p.evidence.push(`A ${Math.round(dist(near.xy, it.xy))} m de otro cruce priorizado (${near.props.streets.slice(0, 2).join(" × ")}): estudiar en conjunto`);
    nmsDemoted++;
  }
  console.log(`priority: ${nmsDemoted} prioritario demoted to recomendado (neighbour of a better-ranked one)`);
  for (const it of inters) Object.assign(it.props, prio.get(it.id));
  console.log(`priority: twins folded into their pair: ${twinsDemoted}`);

  // ---- signals → their site's primary junction
  const signalFeatures = rawSignals.map((s, i) => {
    const site = sites.find((x) => x.osm.includes(osmSignals[i]));
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [round6(s.lon), round6(s.lat)] },
      properties: { id: s.id, kind: osmSignals[i].kind, intersectionId: site?.primary[0] ?? null },
    };
  });

  // ---- write
  const fc = (features: unknown[]) => ({ type: "FeatureCollection", features });
  const write = (name: string, obj: unknown, dir = OUT_DIR) => {
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, name);
    fs.writeFileSync(fp, JSON.stringify(obj, null, dir === OUT_DIR ? undefined : 1));
    console.log(`wrote ${path.relative(OUT_DIR, fp)} (${(fs.statSync(fp).size / 1e6).toFixed(2)} MB)`);
  };
  write(
    "streets.geojson",
    fc(
      ways.map((w) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: w.coords.map(([x, y]) => [round6(x), round6(y)]) },
        properties: { id: w.id, name: w.name, highway: w.highway, lanes: w.lanes, oneway: w.oneway, maxspeed: w.maxspeed },
      })),
    ),
  );
  write("signals.geojson", fc(signalFeatures));
  // OSM-derived database (ODbL): every property except those whose values come only from the Alcaldía datasets
  const separate = new Set<string>([...CRASH_FIELDS, ...OFFICIAL_FIELDS]);
  const odblProps = (p: Record<string, any>) => Object.fromEntries(Object.entries(p).filter(([k]) => !separate.has(k)));
  write("intersections.geojson", fc(inters.map((it) => ({ type: "Feature", geometry: { type: "Point", coordinates: it.lonlat }, properties: odblProps(it.props) }))));
  // Alcaldía crash records aggregated per junction (CC BY-SA 4.0), keyed by intersection id. Empty without crash data.
  write(CRASHES_OUT, crashRows ? Object.fromEntries(inters.map((it) => [it.id, Object.fromEntries(CRASH_FIELDS.map((k) => [k, it.props[k]]))])) : {});
  // Alcaldía official inventory (CC BY-SA 4.0): the complete layer as published, NOT de-duplicated against OSM.
  // `intersectionId` is only a join key: the junction the point was matched to (null when none / outside the area).
  const officialJunction = new Map<OfficialSignal, string>();
  for (const s of sites) for (const o of s.official) if (s.primary[0]) officialJunction.set(o, s.primary[0]);
  const officialRaw = JSON.parse(fs.readFileSync(OFFICIAL_SIGNALS, "utf8")).features as any[];
  write(OFFICIAL_OUT, {
    type: "FeatureCollection",
    name: "Inventario oficial de intersecciones semaforizadas de Barranquilla (versión de septiembre de 2023)",
    attribution:
      "Alcaldía Distrital de Barranquilla, Atlántico. El mismo inventario se publica en datos.gov.co («Semaforización en " +
      "Barranquilla», svyb-d6ts / xknx-agu2) bajo CC BY-SA 4.0; esta es su versión de septiembre de 2023.",
    license: "CC-BY-SA-4.0",
    features: officialRaw.map((f, i) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { ...f.properties, intersectionId: officialJunction.get(officialAll[i]) ?? null },
    })),
  });

  // ---- signal reconciliation report
  const siteName = (s: (typeof sites)[number]) => s.primary.map((id) => interById.get(id)!.props.streets.slice(0, 3).join(" × ")).join(" / ") || "(sin cruce vial asociado)";
  const [slon, slat] = [0, 1];
  const sitePos = (s: (typeof sites)[number]) => { const ll = unproject(s.xy[0], s.xy[1]); return { lat: round6(ll[slat]), lon: round6(ll[slon]) }; };
  const officialMatched = sites.filter((s) => s.source === "ambos").reduce((n, s) => n + s.official.length, 0);
  const reconciliation = {
    officialPointsInFile: officialAll.length,
    officialPointsInsideStudyArea: official.length,
    osmSignalNodes: osmSignals.length,
    sites: { total: sites.length, ambos: sites.filter((s) => s.source === "ambos").length, soloOsm: sites.filter((s) => s.source === "osm").length, soloOficial: sites.filter((s) => s.source === "oficial").length },
    officialMatchedToOsm: officialMatched,
    sitesWithSeveralOfficialPoints: sites.filter((s) => s.official.length >= 2).map((s) => s.official.map((o) => o.nombre)),
    signalizedJunctions: {
      total: inters.filter((i) => i.props.hasSignal).length,
      ambos: inters.filter((i) => i.props.signalSource === "ambos").length,
      soloOsm: inters.filter((i) => i.props.signalSource === "osm").length,
      soloOficial: inters.filter((i) => i.props.signalSource === "oficial").length,
    },
    coveredJunctions: inters.filter((i) => i.props.coveredBy).length,
    sitesWithoutJunction: sites.filter((s) => !s.primary.length).map((s) => ({ source: s.source, pedestrianOnly: s.pedestrianOnly, nodes: s.osm.length, official: s.official.map((o) => o.nombre), ...sitePos(s) })),
    officialWithoutOsm: sites.filter((s) => s.source === "oficial").flatMap((s) => s.official.map((o) => ({ nombre: o.nombre, estado: o.estado, fechaInicio: o.fechaInicio, lat: o.lonlat[1], lon: o.lonlat[0], nearestOsmSignalM: Math.round(Math.min(...osmSignals.map((n) => dist(n.xy, o.xy)))), junction: s.primary[0] ?? null }))),
    osmWithoutOfficial: sites.filter((s) => s.source === "osm").map((s) => ({ where: siteName(s), ...sitePos(s), nodes: s.osm.length, pedestrianOnly: s.pedestrianOnly, hasJunction: s.primary.length > 0, nearestOfficialM: Math.round(Math.min(...official.map((o) => dist(o.xy, s.xy)))) })),
    parameters: SITE,
  };
  // QA: does the official NAME ("CALLE 30 CON CARRERA 21B") agree with the streets of the junction it was matched to?
  const nameQa = { parsed: 0, agree: 0, disagree: [] as Array<{ nombre: string; matchedTo: string }> };
  for (const s of sites)
    for (const o of s.official) {
      const p = parseCrashAddress(o.nombre.replace(/\*.*$/, ""));
      if (p.kind !== "junction" || !s.primary.length) continue;
      const groups = pairIndex.get(pairKey(p.a, p.b));
      if (!groups) continue;
      nameQa.parsed++;
      const mine = new Set([...s.primary, ...s.covered].map((id) => interById.get(id)!.group));
      if ([...groups].some((g) => mine.has(g))) nameQa.agree++;
      else nameQa.disagree.push({ nombre: o.nombre, matchedTo: siteName(s) });
    }
  const spans = sites.map((s) => { let m = 0; for (const a of s.osm) for (const b of s.osm) m = Math.max(m, dist(a.xy, b.xy)); return Math.round(m); }).sort((a, b) => b - a);
  Object.assign(reconciliation, { officialNameCheck: nameQa, largestSiteSpansM: spans.slice(0, 12) });
  write("signals-reconciliation.json", reconciliation, REPORT_DIR);
  if (crashReport) write("crash-match.json", { ...crashReport, percentileScale: { groups: unsigTotals.length, p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95), max: unsigTotals.at(-1) ?? 0 } }, REPORT_DIR);

  // ---- backtest input: signalized junctions AS IF their own signal did not exist + a sample of quiet junctions
  const LOCAL: RoadClass[] = ["residential", "living_street", "unclassified"];
  const hash = hashId;
  const modelProps = (it: Inter, over: Record<string, unknown> = {}) => ({ ...it.props, jev: undefined, evidence: undefined, ...over });
  const cfItem = (set: string, half?: string) => (it: Inter) => {
    const site = primaryOf.get(it.id)!;
    const d = nearestSignal([...it.memberXY, it.xy], site.id);
    return {
      id: it.id, set, half: half ?? (hash(it.id) % 2 === 0 ? "tune" : "holdout"), lat: it.lonlat[1], lon: it.lonlat[0],
      props: modelProps(it, { hasSignal: false, signalSource: null, distNearestSignalM: Number.isFinite(d) ? Math.round(d) : -1, distSignalAlongM: alongRoad(it, site.id) }),
    };
  };
  // signalized per OSM but absent from the Oct-2023 inventory (mostly newer installations): never used for tuning
  const btOsmOnly = inters.filter((it) => it.props.signalSource === "osm").map(cfItem("osm_only", "holdout"));
  const btSignalized = inters
    .filter((it) => it.props.signalSource === "ambos")
    .map((it) => {
      const site = primaryOf.get(it.id)!;
      const d = nearestSignal([...it.memberXY, it.xy], site.id);
      return {
        id: it.id, set: "signalized", half: hash(it.id) % 2 === 0 ? "tune" : "holdout", lat: it.lonlat[1], lon: it.lonlat[0],
        props: modelProps(it, { hasSignal: false, signalSource: null, distNearestSignalM: Number.isFinite(d) ? Math.round(d) : -1, distSignalAlongM: alongRoad(it, site.id) }),
      };
    });
  const quietPool = inters.filter((it) => !it.props.hasSignal && !it.props.coveredBy && it.facts.crossClass && LOCAL.includes(it.facts.majorClass) && LOCAL.includes(it.facts.crossClass));
  const btQuiet = [...quietPool].sort((a, b) => hash("q" + a.id) - hash("q" + b.id)).slice(0, 400)
    .map((it) => ({ id: it.id, set: "quiet", half: hash(it.id) % 2 === 0 ? "tune" : "holdout", lat: it.lonlat[1], lon: it.lonlat[0], props: modelProps(it) }));
  // selectivity check: unsignalized at-grade junctions on a collector or higher (the population the shortlist is drawn from)
  const comparablePool = inters.filter((it) => !it.props.hasSignal && !it.props.coveredBy && it.facts.crossClass && rank(it.facts.majorClass) <= rank("tertiary") && it.facts.majorClass !== "motorway" && !it.structure.roundabout && !it.structure.ramp && !it.structure.gradeSeparated);
  const btComparable = [...comparablePool].sort((a, b) => hash("c" + a.id) - hash("c" + b.id)).slice(0, 300)
    .map((it) => ({ id: it.id, set: "comparable", half: hash(it.id) % 2 === 0 ? "tune" : "holdout", lat: it.lonlat[1], lon: it.lonlat[0], props: modelProps(it) }));
  write("backtest-input.json", { generatedAt: snapshotDate(), signalized: btSignalized.length, quietPool: quietPool.length, comparablePool: comparablePool.length, items: [...btSignalized, ...btQuiet, ...btComparable, ...btOsmOnly] });

  // ---- end-to-end backtest of the TIERS: signalized junctions as if their signal did not exist, through the same rules
  const backtest = fs.existsSync(BACKTEST_FILE) ? JSON.parse(fs.readFileSync(BACKTEST_FILE, "utf8")) : null;
  let tierBacktest: Record<string, unknown> | null = null;
  if (backtest?.main?.perJunction && backtest?.blind?.perJunction) {
    const main = new Map<string, any>(backtest.main.perJunction.map((r: any) => [r.id, r]));
    const blind = new Map<string, any>(backtest.blind.perJunction.map((r: any) => [r.id, r]));
    const tally = (items: Array<{ id: string; half: string; props: any }>, half: string) => {
      const out: Record<string, number> = { n: 0, prioritario: 0, recomendado: 0, observacion: 0, sin_accion: 0 };
      for (const item of items) {
        if (item.half !== half || !main.has(item.id)) continue;
        const it = interById.get(item.id)!;
        const m = main.get(item.id), b = blind.get(item.id);
        const r = computePriority(priorityInput(it, {
          hasSignal: false, coveredBy: null, signalSource: null,
          distNearestSignalM: item.props.distNearestSignalM, distSignalAlongM: item.props.distSignalAlongM,
          crashRank: it.props.crashPct,
          jev: { needLevel: m.needLevel, needScore: m.needScore, warrantProb: m.warrantProb, control: m.control, confidence: m.confidence },
          jevNoCrash: b ? { warrantProb: b.warrantProb, control: b.control } : null,
        }), thresholds);
        out.n++;
        out[r.priority]++;
      }
      return { ...out, shortlistedPct: out.n ? +((100 * (out.prioritario + out.recomendado)) / out.n).toFixed(1) : 0, anyFlagPct: out.n ? +((100 * (out.n - out.sin_accion)) / out.n).toFixed(1) : 0 };
    };
    tierBacktest = {
      note: "Tiers computed with the production rules on the backtest sets (before the neighbour / twin de-duplication). shortlisted = prioritario + recomendado.",
      holdout: { signalized: tally(btSignalized, "holdout"), quiet: tally(btQuiet, "holdout"), comparable: tally(btComparable, "holdout"), osmOnlySignalized: tally(btOsmOnly, "holdout") },
      tune: { signalized: tally(btSignalized, "tune"), quiet: tally(btQuiet, "tune"), comparable: tally(btComparable, "tune") },
    };
    console.log(`tier backtest (holdout): ${JSON.stringify((tierBacktest as any).holdout)}`);
  }

  // ---- summary
  const count = (s: Status) => inters.filter((i) => i.props.status === s).length;
  const countP = (p: string) => inters.filter((i) => i.props.priority === p).length;
  const byClassPair: Record<string, Record<string, number>> = {};
  for (const it of inters) {
    const k = `${it.props.maxClass}×${it.props.minClass}`;
    const b = (byClassPair[k] ??= { total: 0, signalized: 0, needsHigh: 0, needsMedium: 0, needsLow: 0, ok: 0 });
    b.total++;
    const key = ({ signalized: "signalized", needs_high: "needsHigh", needs_medium: "needsMedium", needs_low: "needsLow", ok: "ok" } as const)[it.props.status as Status];
    b[key]++;
  }
  write("summary.json", {
    generatedAt: snapshotDate(),
    counts: {
      streets: ways.length,
      signals: signalFeatures.length,
      signalNodes: signalFeatures.filter((s) => s.properties.kind === "signal").length,
      crossingSignals: signalFeatures.filter((s) => s.properties.kind === "crossing_signal").length,
      intersections: inters.length,
      signalized: count("signalized"),
      signalizedOfficial2023: official.length,
      covered: reconciliation.coveredJunctions,
      needsHigh: count("needs_high"),
      needsMedium: count("needs_medium"),
      needsLow: count("needs_low"),
      ok: count("ok"),
      prioritario: countP("prioritario"),
      recomendado: countP("recomendado"),
      observacion: countP("observacion"),
      sinAccion: countP("sin_accion"),
    },
    byClassPair: Object.fromEntries(Object.entries(byClassPair).sort((a, b) => b[1].total - a[1].total)),
    clippedToMunicipality: area.clipped,
    bbox: [10.89, -74.93, 11.07, -74.74],
    hasJevScores: inters.some((i) => i.props.jev != null),
    thresholds: HEURISTIC.thresholds,
    validation: {
      signals: {
        officialInventory: official.length,
        officialCutoff: "2023-10",
        signalizedJunctions: reconciliation.signalizedJunctions,
        officialConfirmedInOsm: officialMatched,
        officialWithoutOsm: reconciliation.officialWithoutOsm.length,
        osmWithoutOfficial: reconciliation.osmWithoutOfficial.length,
        coveredJunctions: reconciliation.coveredJunctions,
      },
      crashes: crashReport
        ? { dataset: CRASH.dataset, records: crashReport.records, matched: crashReport.matched, matchRate: crashReport.matchRateAll, matchRateJunctionFormat: crashReport.matchRateJunctionFormat, period: CRASH.period, periodRecords: crashReport.inPeriod.records, periodMatched: crashReport.inPeriod.matched }
        : null,
      backtest: backtest?.summary ?? null,
      tierBacktest,
      tierThresholds: thresholds,
      doc: "docs/validation.md",
    },
  });
}

main();
