/**
 * Need-for-signal heuristic for unsignalized junctions.
 *
 * This is a *screening* score ("candidato a estudio de tránsito") built only from OSM geometry/tags — there
 * are no traffic counts or crash records behind it, so no warrant can actually be demonstrated.
 *
 * Aligned with docs/research/criteria.md (Manual de Señalización Vial 2024, cap. 4, num. 4.3.3, conditions A–F,
 * cross-checked with MUTCD 4C). Component budget follows its §3.2 with the crash component (E, 15 pts)
 * redistributed because no geocoded crash data is available: hierarchy 40→50, pedestrians 15→20.
 *
 *   hierarchy  (A/B/W8)  50 · sqrt(wMajor · wCross)      — volume is needed on BOTH streets
 *   geometry             ≤15, lanes + approaches + divided major road          (× context)
 *   spacing    (D)       −10…+15 by distance to the nearest existing signal    (bonus × context)
 *   pedestrians (C)      ≤20, POIs within 200 m, ×1.3 when ≥3 lanes to cross   (× wMajor)
 *   then multipliers (signal <150 m, ramps, roundabouts, one-way T) and hard caps.
 *
 * context = sqrt(wMajor · wCross). Scaling the add-ons by it is a deliberate deviation from the purely additive
 * table in criteria.md: it keeps local × local junctions near 0 whatever is around them.
 *
 * EVERY tunable number lives in HEURISTIC below.
 */
import type { RoadClass } from "./config.ts";

export const HEURISTIC = {
  /**
   * Proxy for traffic volume by OSM class (0–1). With hierarchyMax = 50 the geometric mean reproduces the matrix
   * suggested in criteria.md §3.2 (rescaled 40→50): prim×prim 50, prim×sec 45, sec×sec 40, prim×tert 34,
   * sec×tert 30, tert×tert 22, prim×unclassified 16, prim×residential 10, tert×residential 7, resid×resid 2.
   */
  classWeight: {
    motorway: 1.0,
    trunk: 1.0,
    primary: 1.0,
    secondary: 0.8,
    tertiary: 0.45,
    unclassified: 0.1,
    residential: 0.04,
    living_street: 0.02,
  } satisfies Record<RoadClass, number>,
  hierarchyMax: 50,

  /** Geometry (× context), capped at geometryCap. */
  geometryCap: 15,
  /** Points by number of approaches; ≥5 uses the "5" entry. 3-leg junctions have far fewer conflict points. */
  legs: { 3: 1, 4: 5, 5: 5 } as Record<number, number>,
  /** Points by max `lanes` tagged on any leg (first match wins). */
  lanes: [
    { min: 3, pts: 8 },
    { min: 2, pts: 5 },
  ],
  /** Major street is a divided road / dual carriageway: harder to cross (condition B). */
  dividedPts: 3,

  /**
   * Distance to the nearest existing signal (condition D; Manual 2024 4.3.3.4: never closer than 300 m).
   * Straight-line distance to ANY signal, not along the same corridor — a simplification.
   * First band whose maxM is greater than the distance applies. `add` > 0 is scaled by context.
   * `cap` limits the final status.
   */
  spacing: [
    { maxM: 150, mult: 0.3, add: 0, cap: "needs_low" }, // practical veto
    { maxM: 300, mult: 1, add: -10, cap: "needs_medium" },
    { maxM: 500, mult: 1, add: 8, cap: null },
    { maxM: 1000, mult: 1, add: 15, cap: null },
    { maxM: Infinity, mult: 1, add: 10, cap: null }, // probably outside the signal network: less coordination benefit
  ] as Array<{ maxM: number; mult: number; add: number; cap: "needs_low" | "needs_medium" | null }>,
  /** The spacing bonus only applies when the major street is at least this class (a corridor worth coordinating). */
  spacingBonusMinClass: "tertiary" as RoadClass,

  /** Pedestrian demand (condition C): POIs within 200 m — first / each additional / cap. Sum capped, × wMajor. */
  poi: {
    school: { first: 6, extra: 2, cap: 8 },
    hospital: { first: 4, extra: 1, cap: 6 },
    market: { first: 4, extra: 1, cap: 6 },
    busStop: { first: 1, extra: 1, cap: 4 },
    worship: { first: 1, extra: 0, cap: 1 },
    park: { first: 1, extra: 0, cap: 1 },
  },
  poiCap: 20,
  /** Wide road to cross → pedestrian points × this when maxLanes ≥ wideLanes. */
  wideRoad: { lanes: 3, mult: 1.3 },

  /** Geometry situations where a signal is not the natural control (criteria.md hard rules 3–4). */
  multipliers: {
    /** Crossing legs are only ramps/_link ways (merge / diverge, grade-separated interchange). */
    rampOnly: 0.2,
    /** Junction is part of a roundabout: already controlled. */
    roundabout: 0.2,
    /** T-junction onto a single one-way carriageway (right-in/right-out, no median opening). */
    onewayT: 0.6,
  },
  /** Hard rule 1: crossing street is local and no school/hospital nearby → it will never reach 75–150 veh/h for 8 h. */
  localCrossCap: { classes: ["residential", "living_street"] as RoadClass[], cap: "needs_low" as const },

  /** status thresholds on the final score. */
  thresholds: { high: 45, medium: 35, low: 25 },
} as const;

const CLASS_ES: Record<RoadClass, string> = {
  motorway: "autopista",
  trunk: "troncal",
  primary: "primaria",
  secondary: "secundaria",
  tertiary: "terciaria",
  unclassified: "local sin clasificar",
  residential: "residencial",
  living_street: "de prioridad peatonal",
};

export type Pois = { school: number; hospital: number; market: number; busStop: number; worship: number; park: number };

export type JunctionFacts = {
  majorClass: RoadClass;
  /** Highest class among approaches that are NOT the major street; null → nothing actually crosses. */
  crossClass: RoadClass | null;
  approaches: number;
  maxLanes: number | null;
  divided: boolean;
  rampOnly: boolean;
  roundabout: boolean;
  onewayT: boolean;
  distNearestSignalM: number;
  pois: Pois;
};

export type Status = "signalized" | "needs_high" | "needs_medium" | "needs_low" | "ok";

const ORDER: Status[] = ["ok", "needs_low", "needs_medium", "needs_high"];
const CLASS_ORDER: RoadClass[] = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street"];

const POI_ES: Record<keyof Pois, [string, string]> = {
  school: ["institución educativa", "instituciones educativas"],
  hospital: ["centro de salud", "centros de salud"],
  market: ["mercado/supermercado", "mercados/supermercados"],
  busStop: ["paradero de bus", "paraderos de bus"],
  worship: ["lugar de culto", "lugares de culto"],
  park: ["parque", "parques"],
};

export function scoreJunction(f: JunctionFacts): { score: number; reasons: string[]; status: Status } {
  const H = HEURISTIC;
  const reasons: string[] = [];
  if (!f.crossClass) {
    return { score: 0, reasons: ["Sin vía transversal: bifurcación o unión de calzadas"], status: "ok" };
  }
  const wMajor = H.classWeight[f.majorClass];
  const wCross = H.classWeight[f.crossClass];
  const context = Math.sqrt(wMajor * wCross);
  let cap: Status | null = null;
  const capTo = (c: Status) => {
    if (cap === null || ORDER.indexOf(c) < ORDER.indexOf(cap)) cap = c;
  };

  // 1. hierarchy
  let score = H.hierarchyMax * context;
  reasons.push(`Cruce de vía ${CLASS_ES[f.majorClass]} con ${CLASS_ES[f.crossClass]}`);

  // 2. geometry
  let geo = H.legs[Math.min(f.approaches, 5)] ?? 0;
  reasons.push(f.approaches === 3 ? "Intersección en T (3 accesos)" : `${f.approaches} accesos`);
  if (f.maxLanes != null) {
    const l = H.lanes.find((x) => f.maxLanes! >= x.min);
    if (l) geo += l.pts;
    if (f.maxLanes >= 3) reasons.push(`Vía de ${f.maxLanes} carriles`);
  }
  if (f.divided) {
    geo += H.dividedPts;
    reasons.push("Vía principal de doble calzada");
  }
  score += context * Math.min(H.geometryCap, geo);

  // 3. spacing to the nearest existing signal
  const d = Math.round(f.distNearestSignalM);
  const band = H.spacing.find((b) => f.distNearestSignalM < b.maxM) ?? H.spacing[H.spacing.length - 1];
  const corridor = CLASS_ORDER.indexOf(f.majorClass) <= CLASS_ORDER.indexOf(H.spacingBonusMinClass);
  if (band.add > 0 && corridor) {
    score += context * band.add;
    reasons.push(`Tramo sin semáforo: el más cercano está a ${d} m`);
  } else if (band.add < 0) {
    score += band.add;
    reasons.push(`A menos de 300 m de otro semáforo (${d} m; Manual 2024, 4.3.3.4)`);
  }

  // 4. pedestrian generators
  let poiPts = 0;
  for (const k of Object.keys(H.poi) as Array<keyof Pois>) {
    const n = f.pois[k];
    if (n <= 0) continue;
    const c = H.poi[k];
    poiPts += Math.min(c.cap, c.first + (n - 1) * c.extra);
    if (k !== "worship" && k !== "park") reasons.push(`${n} ${POI_ES[k][n === 1 ? 0 : 1]} a menos de 200 m`);
  }
  if (f.maxLanes != null && f.maxLanes >= H.wideRoad.lanes) poiPts *= H.wideRoad.mult;
  score += wMajor * Math.min(H.poiCap, poiPts);

  // 5. multipliers and hard caps
  if (band.mult !== 1) {
    score *= band.mult;
    reasons.push(`Semáforo existente muy cercano (${d} m)`);
  }
  if (band.cap) capTo(band.cap);
  if (f.rampOnly) {
    score *= H.multipliers.rampOnly;
    reasons.push("Solo conecta un ramal de enlace (incorporación/salida)");
  }
  if (f.roundabout) {
    score *= H.multipliers.roundabout;
    reasons.push("Forma parte de una glorieta (ya tiene control)");
  }
  if (f.onewayT) {
    score *= H.multipliers.onewayT;
    reasons.push("Acceso en T a calzada de un solo sentido");
  }
  if (H.localCrossCap.classes.includes(f.crossClass) && f.pois.school === 0 && f.pois.hospital === 0) capTo(H.localCrossCap.cap);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const t = H.thresholds;
  let status: Status = score >= t.high ? "needs_high" : score >= t.medium ? "needs_medium" : score >= t.low ? "needs_low" : "ok";
  if (cap !== null && ORDER.indexOf(status) > ORDER.indexOf(cap)) {
    status = cap;
    // keep the score consistent with the capped status so the map colour and the number agree
    const ceiling = cap === "needs_medium" ? t.high - 1 : cap === "needs_low" ? t.medium - 1 : t.low - 1;
    score = Math.min(score, ceiling);
  }
  return { score, reasons, status };
}
