/**
 * Crash evidence from datos.gov.co "Accidentalidad en Barranquilla" (yb9r-2dsi, IPAT police reports).
 * The dataset has NO coordinates, only a free-text address. A record is matched to a crossing only when the
 * address names exactly two streets ("CL 110 CR 46", "CRA 38 CON CALLE 72", "VIA 40 CL 75") and exactly one
 * crossing of those two streets exists in the junction table. Door addresses, "entre … y …", "frente a …" and
 * anything else stay unmatched: an unmatched record is better than a wrong match.
 *
 * Period: damage-only crashes disappear from the dataset from 2023 on (4,128 in 2018 → 6 in 2023) while
 * injury+fatal records stay level (≈1,100–1,800 / year 2018–2025), i.e. the reporting rule changed. Counts and
 * ranking therefore use 2018–2022 only, when all severities were recorded. Injury/fatal crashes of 2023–2025
 * are kept separately (`recentVictims`) as supporting evidence.
 */
import fs from "node:fs";
import path from "node:path";
import { RAW_DIR, USER_AGENT } from "./config.ts";
import { pairKey, parseCrashAddress } from "./streetkeys.ts";

export const CRASH = {
  dataset: "yb9r-2dsi",
  url: "https://www.datos.gov.co/resource/yb9r-2dsi.json",
  file: "crashes-yb9r-2dsi.json",
  pageSize: 50_000,
  periodFrom: 2018,
  periodTo: 2022,
  period: "2018–2022",
  recentFrom: 2023,
  recentTo: 2025,
} as const;

export type RawCrash = {
  fecha_accidente?: string;
  gravedad_accidente?: string;
  clase_accidente?: string;
  sitio_exacto_accidente?: string;
  a_o_accidente?: string;
};
/** Columns stored in data/raw: only what the matching reads. Date, time of day and the per-row victim counts are
 *  dropped so the committed snapshot does not combine an exact address with an exact date and time. */
const KEEP: Array<keyof RawCrash> = ["a_o_accidente", "gravedad_accidente", "clase_accidente", "sitio_exacto_accidente"];
const slim = (r: RawCrash): RawCrash => {
  const year = r.a_o_accidente ?? r.fecha_accidente?.slice(0, 4);
  return Object.fromEntries(KEEP.map((k) => [k, k === "a_o_accidente" ? year : r[k]]).filter(([, v]) => v != null));
};

export async function fetchCrashes(force = false): Promise<RawCrash[]> {
  const fp = path.join(RAW_DIR, CRASH.file);
  if (!force && fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, "utf8"));
  const all: RawCrash[] = [];
  for (let offset = 0; ; offset += CRASH.pageSize) {
    const url = `${CRASH.url}?$limit=${CRASH.pageSize}&$offset=${offset}&$order=:id`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`datos.gov.co HTTP ${res.status}`);
    const page = (await res.json()) as RawCrash[];
    all.push(...page.map(slim));
    console.log(`  [crashes] offset ${offset}: ${page.length} rows`);
    if (page.length < CRASH.pageSize) break;
  }
  fs.mkdirSync(RAW_DIR, { recursive: true });
  // one record per line, so a data refresh gives a readable diff
  fs.writeFileSync(fp, `[\n${all.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
  return all;
}

export function loadCrashes(): RawCrash[] | null {
  const fp = path.join(RAW_DIR, CRASH.file);
  return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, "utf8")) : null;
}

export type CrashCount = { total: number; injuries: number; deaths: number; recentVictims: number; pedestrians: number };
export type CrashMatchReport = {
  records: number;
  byYear: Record<string, { total: number; damageOnly: number; withVictims: number }>;
  parsedAsJunction: number;
  matched: number;
  matchRateAll: number;
  matchRateJunctionFormat: number;
  unmatched: Record<string, number>;
  inPeriod: { records: number; matched: number };
  sample: Array<{ address: string; year: string; matchedTo: string; lat: number; lon: number }>;
  topUnmatched: Array<{ pattern: string; n: number; example: string }>;
  topUnmatchedPairs: Array<{ address: string; n: number; reason: string }>;
};

/**
 * @param pairIndex  street-pair key → crossing-group ids that have both streets
 * @param groupLabel group id → label + position, for the audit sample
 */
export function matchCrashes(
  rows: RawCrash[],
  pairIndex: Map<string, Set<number>>,
  groupLabel: (g: number) => { label: string; lat: number; lon: number },
  seed = 20260920,
) {
  const counts = new Map<number, CrashCount>();
  const unmatched: Record<string, number> = { door: 0, between: 0, single: 0, other: 0, no_such_crossing: 0, ambiguous: 0 };
  const byYear: CrashMatchReport["byYear"] = {};
  const patterns = new Map<string, { n: number; example: string }>();
  const missPairs = new Map<string, { n: number; reason: string }>();
  const matchedRows: Array<{ address: string; year: string; g: number }> = [];
  let parsed = 0, matched = 0, inPeriod = 0, inPeriodMatched = 0;

  for (const r of rows) {
    const year = Number(r.a_o_accidente ?? (r.fecha_accidente ?? "").slice(0, 4));
    const sev = (r.gravedad_accidente ?? "").toLowerCase();
    const dead = sev.includes("muert"), hurt = sev.includes("herid");
    const y = (byYear[String(year)] ??= { total: 0, damageOnly: 0, withVictims: 0 });
    y.total++;
    if (dead || hurt) y.withVictims++; else y.damageOnly++;
    const inP = year >= CRASH.periodFrom && year <= CRASH.periodTo;
    if (inP) inPeriod++;

    const addr = r.sitio_exacto_accidente ?? "";
    const p = parseCrashAddress(addr);
    let reason: string | null = null;
    let g = -1;
    if (p.kind !== "junction") reason = p.kind;
    else {
      parsed++;
      const groups = pairIndex.get(pairKey(p.a, p.b));
      if (!groups || groups.size === 0) reason = "no_such_crossing";
      else if (groups.size > 1) reason = "ambiguous";
      else g = [...groups][0];
    }
    if (reason) {
      unmatched[reason]++;
      if (reason === "no_such_crossing" || reason === "ambiguous") {
        const k = addr.trim().toUpperCase();
        const e = missPairs.get(k) ?? { n: 0, reason };
        e.n++;
        missPairs.set(k, e);
      } else {
        const sig = addr.toUpperCase().replace(/\d+[A-Z]{0,2}\d?/g, "#").replace(/\s+/g, " ").trim();
        const e = patterns.get(sig) ?? { n: 0, example: addr };
        e.n++;
        patterns.set(sig, e);
      }
      continue;
    }
    matched++;
    matchedRows.push({ address: addr, year: String(year), g });
    const c = counts.get(g) ?? { total: 0, injuries: 0, deaths: 0, recentVictims: 0, pedestrians: 0 };
    if (inP) {
      inPeriodMatched++;
      c.total++;
      if (dead) c.deaths++;
      else if (hurt) c.injuries++;
      if (/atropello/i.test(r.clase_accidente ?? "")) c.pedestrians++;
    } else if (year >= CRASH.recentFrom && year <= CRASH.recentTo && (dead || hurt)) c.recentVictims++;
    counts.set(g, c);
  }

  // deterministic pseudo-random sample for the manual sanity check
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const sample: CrashMatchReport["sample"] = [];
  const pool = [...matchedRows];
  while (sample.length < 30 && pool.length) {
    const [row] = pool.splice(Math.floor(rnd() * pool.length), 1);
    const l = groupLabel(row.g);
    sample.push({ address: row.address, year: row.year, matchedTo: l.label, lat: l.lat, lon: l.lon });
  }

  const report: CrashMatchReport = {
    records: rows.length,
    byYear,
    parsedAsJunction: parsed,
    matched,
    matchRateAll: +(matched / rows.length).toFixed(4),
    matchRateJunctionFormat: +(matched / Math.max(1, parsed)).toFixed(4),
    unmatched,
    inPeriod: { records: inPeriod, matched: inPeriodMatched },
    sample,
    topUnmatched: [...patterns.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([pattern, v]) => ({ pattern, ...v })),
    topUnmatchedPairs: [...missPairs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25).map(([address, v]) => ({ address, ...v })),
  };
  return { counts, report };
}
