/**
 * Signal ground truth: merges OSM signal nodes with the official inventory of signalized intersections
 * (Secretaría de Tránsito, cut-off Oct-2023, 342 points) into "sites" — one site = one signalized place.
 *
 *  1. OSM nodes (highway=traffic_signals and crossing=traffic_signals) closer than SITE.linkM are one site
 *     (a dual-carriageway crossing carries 2–8 nodes).
 *  2. Each official point joins the site of its nearest OSM node within SITE.officialMatchM, else it becomes
 *     an official-only site.
 *  3. Each site is given ONE primary junction (the junction most of its nodes are nearest to). Any other
 *     junction within SITE.junctionRadiusM of the site's nodes is "covered": not counted as a separate signalized
 *     intersection, and never proposed for a new signal.
 */
import KDBush from "kdbush";
import { dist } from "./geo.ts";

type XY = [number, number];

export const SITE = {
  linkM: 40,
  officialMatchM: 80,
  junctionRadiusM: 30,
  /** official-only sites: inventory coordinates are hand-placed, allow more slack to find the junction */
  officialJunctionRadiusM: 50,
  /** sites with an official point or ≥2 OSM nodes whose nodes sit far from the junction centre (wide avenues) */
  fallbackJunctionRadiusM: 60,
} as const;

export type OsmSignal = { id: number; xy: XY; kind: "signal" | "crossing_signal" };
export type OfficialSignal = { idx: number; xy: XY; nombre: string; codigo: string; estado: string; fechaInicio: string; lonlat: [number, number] };
export type JunctionLite = { id: string; xy: XY; memberXY: XY[]; weight: number };

export type Site = {
  id: number;
  osm: OsmSignal[];
  official: OfficialSignal[];
  source: "osm" | "oficial" | "ambos";
  xy: XY;
  /** only crossing=traffic_signals nodes and no official point → most likely a pedestrian crossing signal */
  pedestrianOnly: boolean;
  primary: string[];
  covered: string[];
};

export function buildSites(osm: OsmSignal[], official: OfficialSignal[]): Site[] {
  const idx = new KDBush(Math.max(1, osm.length));
  if (!osm.length) idx.add(1e12, 1e12);
  for (const s of osm) idx.add(s.xy[0], s.xy[1]);
  idx.finish();
  const parent = osm.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  osm.forEach((s, i) => {
    for (const j of idx.within(s.xy[0], s.xy[1], SITE.linkM)) if (j !== i && osm[j]) parent[find(j)] = find(i);
  });
  const byRoot = new Map<number, Site>();
  const sites: Site[] = [];
  osm.forEach((s, i) => {
    const r = find(i);
    let site = byRoot.get(r);
    if (!site) {
      site = { id: sites.length, osm: [], official: [], source: "osm", xy: [0, 0], pedestrianOnly: false, primary: [], covered: [] };
      byRoot.set(r, site);
      sites.push(site);
    }
    site.osm.push(s);
  });
  for (const o of official) {
    let best = -1, bd = Infinity;
    for (const j of idx.within(o.xy[0], o.xy[1], SITE.officialMatchM)) {
      if (!osm[j]) continue;
      const d = dist(o.xy, osm[j].xy);
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) byRoot.get(find(best))!.official.push(o);
    else sites.push({ id: sites.length, osm: [], official: [o], source: "oficial", xy: o.xy, pedestrianOnly: false, primary: [], covered: [] });
  }
  for (const s of sites) {
    s.source = s.osm.length && s.official.length ? "ambos" : s.osm.length ? "osm" : "oficial";
    const pts = s.osm.length ? s.osm.map((n) => n.xy) : s.official.map((o) => o.xy);
    s.xy = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    s.pedestrianOnly = s.source === "osm" && s.osm.every((n) => n.kind === "crossing_signal");
  }
  return sites;
}

const dJ = (p: XY, j: JunctionLite) => Math.min(dist(p, j.xy), ...j.memberXY.map((m) => dist(p, m)));

/** Fills site.primary / site.covered. Returns junctionId → { primaryOf, coveredBy(site) }. */
export function assignSites(sites: Site[], junctions: JunctionLite[]) {
  const jIdx = new KDBush(Math.max(1, junctions.length));
  if (!junctions.length) jIdx.add(1e12, 1e12);
  for (const j of junctions) jIdx.add(j.xy[0], j.xy[1]);
  jIdx.finish();
  const SLACK = 50; // members can sit this far from a junction centroid

  for (const s of sites) {
    const pts = s.osm.length ? s.osm.map((n) => n.xy) : s.official.map((o) => o.xy);
    const radius = s.osm.length ? SITE.junctionRadiusM : SITE.officialJunctionRadiusM;
    const cand = new Map<number, number>(); // junction index → min distance
    for (const p of pts)
      for (const h of jIdx.within(p[0], p[1], radius + SLACK)) {
        const j = junctions[h];
        if (!j) continue;
        const d = dJ(p, j);
        if (d <= radius && d < (cand.get(h) ?? Infinity)) cand.set(h, d);
      }
    if (!cand.size && (s.official.length || s.osm.length >= 2)) {
      let best = -1, bd = Infinity;
      for (const h of jIdx.within(s.xy[0], s.xy[1], SITE.fallbackJunctionRadiusM + SLACK)) {
        const j = junctions[h];
        if (!j) continue;
        const d = dJ(s.xy, j);
        if (d <= SITE.fallbackJunctionRadiusM && d < bd) { bd = d; best = h; }
      }
      if (best >= 0) cand.set(best, bd);
    }
    if (!cand.size) continue;
    const votes = new Map<number, number>();
    for (const p of pts) {
      let best = -1, bd = Infinity;
      for (const h of cand.keys()) {
        const d = dJ(p, junctions[h]);
        if (d < bd) { bd = d; best = h; }
      }
      votes.set(best, (votes.get(best) ?? 0) + 1);
    }
    const ranked = [...cand.keys()].sort(
      (a, b) => (votes.get(b) ?? 0) - (votes.get(a) ?? 0) || junctions[b].weight - junctions[a].weight || dist(junctions[a].xy, s.xy) - dist(junctions[b].xy, s.xy),
    );
    const primary = new Set<number>([ranked[0]]);
    // a site that swallowed several official intersections keeps one primary junction per official point
    if (s.official.length >= 2) {
      primary.clear();
      for (const o of s.official) {
        let best = -1, bd = Infinity;
        for (const h of cand.keys()) {
          const d = dJ(o.xy, junctions[h]);
          if (d < bd) { bd = d; best = h; }
        }
        if (best >= 0) primary.add(best);
      }
    }
    s.primary = [...primary].map((h) => junctions[h].id);
    s.covered = ranked.filter((h) => !primary.has(h)).map((h) => junctions[h].id);
  }

  const primaryOf = new Map<string, Site>();
  const coveredBy = new Map<string, { site: Site; by: string }>();
  for (const s of sites) for (const id of s.primary) if (!primaryOf.has(id)) primaryOf.set(id, s);
  const jById = new Map(junctions.map((j) => [j.id, j]));
  for (const s of sites)
    for (const id of s.covered) {
      if (primaryOf.has(id) || coveredBy.has(id)) continue;
      const me = jById.get(id)!;
      const by = [...s.primary].sort((a, b) => dist(jById.get(a)!.xy, me.xy) - dist(jById.get(b)!.xy, me.xy))[0];
      coveredBy.set(id, { site: s, by });
    }
  return { primaryOf, coveredBy };
}
