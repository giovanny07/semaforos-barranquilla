/**
 * Priority tiers (see docs/data-schema.md and docs/validation.md). ONE evaluation built from independent signals:
 *
 *   M   model       the model (which sees the crash records) picks a signal as the right control AND its warrant
 *                   probability is above the threshold chosen on the backtest (data/out/backtest.json)
 *   M0  model, blind  same model and questions with the crash records withheld, above its own backtest threshold.
 *                   Needed because M ≈ "≥5 crashes on a collector": M and the crash records are not independent.
 *   R   rules       a collector or higher road is involved, the junction is at grade (no roundabout / ramp / overpass /
 *                   carriageway split) and no signal exists in the same block (< 80 m)
 *   E   evidence    crash count ≥ 75th percentile of the junctions the city already signalized, OR ≥ their median AND
 *                   (school / hospital within 200 m OR ≥ 600 m without a signal along the main road)
 *
 *   prioritario  = M ∧ M0 ∧ R ∧ E, not closer to a signal than the city's own 25th-percentile spacing, and not within
 *                  120 m of a better-ranked prioritario (that one is demoted to recomendado: study them together)
 *   recomendado  = M ∧ R ∧ (M0 ∨ crashes ≥ p75 of signalized)
 *   observacion  = M alone (rests on crash records only, or no collector involved), or top-quartile crashes where the
 *                  model prefers a cheaper control (PARE, reductores, glorieta) — that control is the recommendation
 *   sin_accion   = everything else (incl. junctions covered by a contiguous signalized crossing)
 *   semaforizado = already has a signal (official inventory and/or OSM)
 *
 * The numeric bars (model thresholds, crash median / p75, spacing p25) all come from the TUNE half of the backtest.
 * `evidence` only contains facts a person can check on the ground or in the source data.
 */
import fs from "node:fs";
import { BACKTEST_FILE, CLASS_RANK, type RoadClass } from "./config.ts";
import type { Pois } from "./heuristic.ts";

export const PRIORITY = {
  /** used only when no backtest file exists yet */
  defaultWarrantProb: 0.5,
  /** E: crash percentile among unsignalized junctions with ≥1 crash, and a floor on the absolute count */
  crashTopPct: 75,
  crashMinTotal: 3,
  /** E: long unsignalized stretch along the main road (criteria.md §3.3: 600–1,000 m gap) */
  longStretchM: 600,
  /** R: a signal closer than this (straight line) is in the same block and already serves the crossing. 10 % of the
   *  city's signalized junctions (tune half) have another signal closer than 74 m, so anything larger would
   *  contradict the city's own practice; the same figure is given to the model. */
  servedByNeighbourM: 80,
  /** R: a collector or higher road is involved (46 % of the city's signalized junctions have a crossing street that
   *  OSM tags as residential, so the class of the crossing street is NOT used as a veto) */
  minMajor: "tertiary" as RoadClass,
  /** model probability floor for "observación" when the rules do not support it */
  tierFloor: { prioritario: 75, recomendado: 50, observacion: 25, sin_accion: 0 },
} as const;

export type Thresholds = {
  warrantProb: number;
  warrantProbNoCrash: number;
  source: string;
  /** crash counts (2018–2022) of the junctions the city already signalized, tune half: median and 75th percentile */
  signalizedCrashMedian: number;
  signalizedCrashP75: number;
  /** 25th percentile of the distance from a signalized junction to the nearest OTHER signal (tune half): the top tier
   *  is not given to junctions packed closer to an existing signal than three quarters of the city's own signals */
  signalizedSpacingP25M: number;
};
export function loadThresholds(): Thresholds {
  try {
    const b = JSON.parse(fs.readFileSync(BACKTEST_FILE, "utf8"));
    const t = Number(b?.chosen?.warrantProb), tb = Number(b?.chosenBlind?.warrantProb);
    if (Number.isFinite(t) && t > 0 && t < 1)
      return { signalizedCrashMedian: Infinity, signalizedCrashP75: Infinity, signalizedSpacingP25M: 0, warrantProb: t, warrantProbNoCrash: Number.isFinite(tb) ? tb : t, source: `backtest ${b.chosen.variant ?? ""} (${b.chosen.rule ?? ""})`.trim() };
  } catch { /* no backtest yet */ }
  return { signalizedCrashMedian: Infinity, signalizedCrashP75: Infinity, signalizedSpacingP25M: 0, warrantProb: PRIORITY.defaultWarrantProb, warrantProbNoCrash: PRIORITY.defaultWarrantProb, source: "default (no backtest file)" };
}

export type PriorityInput = {
  hasSignal: boolean;
  coveredBy: string | null;
  coveredByName: string | null;
  coveredDistM: number | null;
  signalSource: string | null;
  signalSince: string | null;
  majorClass: RoadClass;
  crossClass: RoadClass | null;
  majorStreet: string | null;
  crossStreet: string | null;
  legs: number;
  maxLanes: number | null;
  divided: boolean;
  onewayT: boolean;
  rampOnly: boolean;
  structure: { roundabout: boolean; ramp: boolean; gradeSeparated: boolean; nearRoundabout: boolean; nearGradeSeparated: boolean };
  distNearestSignalM: number;
  distSignalAlongM: number | null;
  pois: Pois;
  crashes: { total: number; injuries: number; deaths: number; period: string } | null;
  crashesRecentVictims: number;
  crashesPedestrian: number;
  crashRank: number | null;
  jev: { needLevel: string; needScore: number; warrantProb: number; control: string; confidence: number } | null;
  /** same model and questions with the crash records withheld: independent of the crash evidence */
  jevNoCrash: { warrantProb: number; control: string } | null;
};

export type PriorityResult = {
  priority: "prioritario" | "recomendado" | "observacion" | "sin_accion" | "semaforizado";
  priorityScore: number;
  recommendation: string;
  evidence: string[];
  agreement: "alto" | "medio" | "bajo";
};

const CLASS_ES: Record<RoadClass, string> = {
  motorway: "autopista",
  trunk: "troncal",
  primary: "arterial principal",
  secondary: "arterial secundaria",
  tertiary: "colectora",
  unclassified: "local",
  residential: "local residencial",
  living_street: "de prioridad peatonal",
};
const RECOMMENDATION: Record<string, string> = {
  "semáforo vehicular": "Semáforo vehicular",
  "semáforo peatonal": "Semáforo peatonal",
  "señal de PARE / ceda el paso": "PARE / ceda el paso",
  "reductores de velocidad": "Reductores de velocidad",
  glorieta: "Glorieta",
  "ninguna intervención": "Ninguna",
};
const rank = (c: RoadClass) => CLASS_RANK.indexOf(c);
const atLeast = (c: RoadClass | null, min: RoadClass) => c != null && rank(c) <= rank(min);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const article = (street: string) => (/^(Calle|Carrera|Vía|Avenida|Autopista|Diagonal|Transversal|Carretera)/i.test(street) ? "la " : "");

export function crashSentence(c: NonNullable<PriorityInput["crashes"]>, recent: number): string[] {
  const out: string[] = [];
  if (c.total > 0) {
    const parts = [plural(c.total, "siniestro registrado", "siniestros registrados") + ` ${c.period}`];
    if (c.deaths) parts.push(`${c.deaths} con muertos`);
    if (c.injuries) parts.push(`${c.injuries} con heridos`);
    out.push(parts.join(", "));
  }
  if (recent > 0) out.push(`${plural(recent, "siniestro con víctimas", "siniestros con víctimas")} 2023–2025`);
  return out;
}

export function isStructural(j: PriorityInput): string | null {
  if (j.crossClass == null) return "Bifurcación o unión de calzadas, sin vía transversal";
  if (j.structure.roundabout || j.structure.nearRoundabout) return "Forma parte de una glorieta o de su acceso";
  if (j.majorClass === "motorway") return "Autopista con accesos controlados";
  if (j.structure.ramp || j.rampOnly) return "Conecta con un ramal de enlace (intercambiador)";
  if (j.structure.gradeSeparated || j.structure.nearGradeSeparated) return "Junto a un puente o paso a desnivel";
  return null;
}

export function computePriority(j: PriorityInput, th: Thresholds): PriorityResult {
  const P = PRIORITY;
  const evidence: string[] = [];
  const crashEv = j.crashes ? crashSentence(j.crashes, j.crashesRecentVictims) : [];

  if (j.hasSignal) {
    const src = j.signalSource === "ambos" ? "inventario oficial 2023 y OpenStreetMap" : j.signalSource === "oficial" ? "inventario oficial 2023" : "OpenStreetMap (no figura en el inventario oficial de 2023)";
    evidence.push(`Semaforizado según ${src}`);
    if (j.signalSince && !/1999/.test(j.signalSince)) evidence.push(`En funcionamiento desde ${j.signalSince}`);
    evidence.push(...crashEv);
    return { priority: "semaforizado", priorityScore: 0, recommendation: "Ninguna", evidence, agreement: "alto" };
  }
  if (j.coveredBy) {
    evidence.push(`Cubierto por el cruce semaforizado contiguo${j.coveredByName ? ` (${j.coveredByName})` : ""}${j.coveredDistM != null ? `, a ${j.coveredDistM} m` : ""}`);
    return { priority: "sin_accion", priorityScore: 0, recommendation: "Ninguna", evidence, agreement: "alto" };
  }

  // ---- facts
  if (j.crossClass) evidence.push(`Vía ${CLASS_ES[j.majorClass]}${j.majorStreet ? ` (${j.majorStreet})` : ""} cruza vía ${CLASS_ES[j.crossClass]}${j.crossStreet ? ` (${j.crossStreet})` : ""}`);
  evidence.push(...crashEv);
  if (j.distSignalAlongM != null && j.majorStreet) evidence.push(`Semáforo más cercano a ${j.distSignalAlongM} m sobre ${article(j.majorStreet)}${j.majorStreet}`);
  else if (j.distNearestSignalM >= 0) evidence.push(`Semáforo más cercano a ${j.distNearestSignalM} m en línea recta`);
  if (j.pois.school) evidence.push(`${plural(j.pois.school, "institución educativa", "instituciones educativas")} a menos de 200 m`);
  if (j.pois.hospital) evidence.push(`${plural(j.pois.hospital, "centro de salud", "centros de salud")} a menos de 200 m`);
  if (j.pois.market) evidence.push(`${plural(j.pois.market, "mercado o supermercado", "mercados o supermercados")} a menos de 200 m`);
  if (j.maxLanes != null && j.maxLanes >= 3) evidence.push(`Vía de ${j.maxLanes} carriles`);
  if (j.divided) evidence.push("Vía principal de doble calzada");
  evidence.push(j.legs === 3 ? "Intersección en T (3 accesos)" : `${j.legs} accesos`);

  // ---- the three signals
  const structural = isStructural(j);
  const control = j.jev?.control ?? null;
  const wantsSignal = control === "semáforo vehicular" || control === "semáforo peatonal";
  const M = !!j.jev && wantsSignal && j.jev.warrantProb >= th.warrantProb;

  const served = j.distNearestSignalM >= 0 && j.distNearestSignalM < P.servedByNeighbourM;
  const R = !structural && !served && atLeast(j.majorClass, P.minMajor);

  const C = j.crashRank != null && j.crashRank >= P.crashTopPct && (j.crashes?.total ?? 0) >= P.crashMinTotal;
  const stretch = j.distSignalAlongM != null ? j.distSignalAlongM >= P.longStretchM : j.distNearestSignalM >= P.longStretchM;
  const generator = j.pois.school + j.pois.hospital > 0;
  const E = C || generator || stretch;

  // independent signals for `agreement`: the model WITHOUT crash data, the rules, the crash records
  const M0 = !!j.jevNoCrash && (j.jevNoCrash.control === "semáforo vehicular" || j.jevNoCrash.control === "semáforo peatonal") && j.jevNoCrash.warrantProb >= th.warrantProbNoCrash;
  const positives = Number(M0) + Number(R) + Number(C);

  if (structural) evidence.push(structural);
  if (served) evidence.push(`Ya hay un semáforo a ${j.distNearestSignalM} m (misma cuadra)`);

  const cheaper = !!j.jev && !wantsSignal && control !== "ninguna intervención";
  // The model that sees the crash records flags almost exactly the junctions with ≥5 crashes, so "model + top-quartile
  // crashes" is not an agreement of independent signals. The top tiers therefore also require the crash-blind model
  // (M0), and the crash bar is set by the junctions the city already signalized (tune half of the backtest).
  const total = j.crashes?.total ?? 0;
  const Estrong = total >= th.signalizedCrashP75 || (total >= th.signalizedCrashMedian && (generator || stretch));
  let priority: PriorityResult["priority"] = "sin_accion";
  const spaced = j.distNearestSignalM < 0 || j.distNearestSignalM >= th.signalizedSpacingP25M;
  // OSM "unclassified" crossing streets on the arterials are mostly accesses to industrial / port yards: not top tier
  const minorAccess = j.crossClass === "unclassified" || j.crossClass === "living_street";
  if (minorAccess && M && R) evidence.push("La vía transversal es un acceso menor o industrial según el mapa: verificar en campo");
  if (M && R && M0 && Estrong && spaced && !minorAccess) priority = "prioritario";
  else if (M && R && (M0 || total >= th.signalizedCrashP75)) priority = "recomendado";
  else if (!structural && !served && M) priority = "observacion"; // rests on the crash records alone, or rules do not support it
  else if (!structural && C && (cheaper || (R && wantsSignal))) priority = "observacion"; // crash evidence, cheaper control or model below threshold

  if (priority === "sin_accion" && !structural && !served) evidence.splice(4); // keep the map file small: main facts only
  const recommendation = priority === "sin_accion" ? "Ninguna" : (RECOMMENDATION[control ?? ""] ?? "Ninguna");

  const agreement: PriorityResult["agreement"] =
    priority === "sin_accion" ? (positives <= 1 && !M ? "alto" : "medio") : positives === 3 ? "alto" : positives === 2 ? "medio" : "bajo";
  void E;

  // ranking inside the tier: model probability, model need level, crash percentile, pedestrian generators, stretch
  const composite =
    0.4 * (j.jev?.warrantProb ?? 0) +
    0.2 * ((j.jev?.needScore ?? 0) / 100) +
    0.25 * ((j.crashRank ?? 0) / 100) +
    0.1 * Math.min(1, (j.pois.school + j.pois.hospital) / 2) +
    0.05 * Number(stretch);
  const priorityScore = Math.round(P.tierFloor[priority] + 25 * Math.min(1, composite));

  return { priority, priorityScore, recommendation, evidence, agreement };
}
