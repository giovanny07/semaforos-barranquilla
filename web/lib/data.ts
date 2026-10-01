import type { FeatureCollection, Point } from "geojson";
import type { ActionPriority, CrashFields, Filters, FlatFC, IntersectionProps, JevBlock, Junction, Priority, Summary } from "./types";

const CLASS_LABEL: Record<string, string> = {
  motorway: "Autopista", trunk: "Troncal", primary: "Primaria", secondary: "Secundaria", tertiary: "Terciaria",
  unclassified: "Sin clasificar", residential: "Residencial", living_street: "Vecinal", service: "Servicio",
};

export const baseClass = (c: string) => c.replace(/_link$/, "");
export const classLabel = (c: string) => CLASS_LABEL[baseClass(c)] ?? c;

export const ACTION_PRIORITIES: ActionPriority[] = ["prioritario", "recomendado", "observacion"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  prioritario: "Prioritario", recomendado: "Recomendado", observacion: "En observación",
  sin_accion: "Sin acción", semaforizado: "Con semáforo",
};

export const PRIORITY_HINT: Record<ActionPriority, string> = {
  prioritario: "Estudiar primero",
  recomendado: "Estudiar después",
  observacion: "Hacer seguimiento",
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  prioritario: "#dc2626", recomendado: "#f97316", observacion: "#eab308", sin_accion: "#94a3b8", semaforizado: "#16a34a",
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Fallbacks for data files generated before Addendum v2 (no `priority` / `recommendation` yet).
function fallbackPriority(p: IntersectionProps): Priority {
  if (p.hasSignal) return "semaforizado";
  const j = p.jev;
  if (!j) return "sin_accion";
  // a roundabout already controls its junction: never shortlist it for a signal
  if ((p.heuristicReasons ?? []).some((r) => /glorieta/i.test(r))) return "sin_accion";
  const level = norm(j.needLevel);
  const high = /(crit|alt)/.test(level);
  const signal = /semaforo/.test(norm(j.control));
  if (high && signal && j.warrantProb >= 0.6) return "prioritario";
  if (high || j.warrantProb >= 0.5) return "recomendado";
  if (/med/.test(level)) return "observacion";
  return "sin_accion";
}

function fallbackRecommendation(j: JevBlock | null | undefined): string {
  if (!j) return "Ninguna";
  const c = j.control.replaceAll("_", " ");
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export interface Loaded {
  junctions: Junction[];
  byId: Map<string, Junction>;
  flat: FlatFC;
  counts: Record<Priority, number>;
}

/** `crashes`: crash fields by intersection id, published apart from the OSM-derived junctions (different licence). */
export function prepare(fc: FeatureCollection<Point, IntersectionProps>, crashes: Record<string, CrashFields> = {}): Loaded {
  const junctions: Junction[] = [];
  const byId = new Map<string, Junction>();
  const flat: FlatFC = { type: "FeatureCollection", features: [] };
  const counts: Record<Priority, number> = { prioritario: 0, recomendado: 0, observacion: 0, sin_accion: 0, semaforizado: 0 };

  for (const f of fc.features) {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const priority = p.priority ?? fallbackPriority(p);
    const c = crashes[String(p.id)];
    const j: Junction = {
      ...p,
      id: String(p.id),
      crashes: c ? c.crashes : (p.crashes ?? null),
      crashRank: c ? c.crashRank : (p.crashRank ?? null),
      streets: p.streets ?? [],
      classes: p.classes ?? [],
      heuristicReasons: p.heuristicReasons ?? [],
      pois: p.pois ?? { school: 0, hospital: 0, market: 0, busStop: 0, worship: 0, park: 0 },
      lng, lat, priority,
      priorityScore: p.priorityScore ?? (p.jev ? Math.round(p.jev.warrantProb * 100) : 0),
      recommendation: p.recommendation ?? fallbackRecommendation(p.jev),
      evidence: p.evidence ?? p.heuristicReasons ?? [],
    };
    junctions.push(j);
    byId.set(j.id, j);
    counts[priority]++;
    // signalized junctions are drawn through the signals layer; "sin acción" ones are not drawn at all
    if (priority === "semaforizado" || priority === "sin_accion") continue;
    flat.features.push({
      type: "Feature",
      geometry: f.geometry,
      properties: { id: j.id, pr: priority, ps: j.priorityScore, school: j.pois.school, hospital: j.pois.hospital },
    });
  }
  return { junctions, byId, flat, counts };
}

// "Vía 40 × Calle 106" reads better than the full list of every street touching the junction
export const junctionName = (j: Junction) =>
  j.majorStreet && j.crossStreet ? `${j.majorStreet} × ${j.crossStreet}` : j.streets.length ? j.streets.join(" × ") : "Cruce sin nombre";

export function passes(j: Junction, f: Filters): boolean {
  if (j.priority === "semaforizado" || j.priority === "sin_accion" || !f.priorities[j.priority]) return false;
  if (f.nearSchool || f.nearHospital) {
    const hit = (f.nearSchool && j.pois.school > 0) || (f.nearHospital && j.pois.hospital > 0);
    if (!hit) return false;
  }
  const q = norm(f.query.trim());
  if (q && !norm(j.streets.join(" ")).includes(q)) return false;
  return true;
}

/** MapLibre filter equivalent to `passes` (the street search only narrows the list, not the map). */
export function mapFilter(f: Filters): unknown[] {
  const on = ACTION_PRIORITIES.filter((p) => f.priorities[p]);
  const out: unknown[] = ["all", ["in", ["get", "pr"], ["literal", on]]];
  const poi: unknown[] = [];
  if (f.nearSchool) poi.push([">", ["get", "school"], 0]);
  if (f.nearHospital) poi.push([">", ["get", "hospital"], 0]);
  if (poi.length) out.push(["any", ...poi]);
  return out;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export const loadSummary = () => fetchJson<Summary>("/data/summary.json");
export const loadIntersections = async () => {
  const [fc, crashes] = await Promise.all([
    fetchJson<FeatureCollection<Point, IntersectionProps>>("/data/intersections.geojson"),
    // optional: without it the panel shows "s/d" for crashes
    fetchJson<Record<string, CrashFields>>("/data/crashes-by-intersection.json").catch(() => ({})),
  ]);
  return prepare(fc, crashes);
};

// Google Maps views that can be embedded without an API key.
export const googleEmbed = (lat: number, lng: number, view: "street" | "satellite" | "map") =>
  view === "street"
    ? `https://www.google.com/maps/embed?origin=mfe&pb=!6m6!1m5!2m2!1d${lat}!2d${lng}!4f-0!5f1`
    : `https://www.google.com/maps/embed?origin=mfe&pb=!1m4!2m1!1s${lat},${lng}!5e${view === "satellite" ? 1 : 0}!6i19`;

export const googleLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
