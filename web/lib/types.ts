import type { FeatureCollection, Point } from "geojson";

export type Status = "signalized" | "needs_high" | "needs_medium" | "needs_low" | "ok";
export type Priority = "prioritario" | "recomendado" | "observacion" | "sin_accion" | "semaforizado";
/** Priorities the user can act on (shown as coloured points and in the ranked list). */
export type ActionPriority = "prioritario" | "recomendado" | "observacion";

export interface Pois {
  school: number;
  hospital: number;
  market: number;
  busStop: number;
  worship: number;
  park: number;
}

export interface JevBlock {
  needLevel: string;
  needScore: number;
  warrantProb: number;
  control: string;
  confidence: number;
}

export interface Crashes {
  total: number;
  injuries: number;
  deaths: number;
  period: string;
}

/** A junction in public/data/intersections.geojson. The web copy carries only what the UI reads (pipeline/src/copy.ts);
 *  the optional pipeline fields are present in older data files and in the fixture (see `prepare` for the fallbacks). */
export interface IntersectionProps {
  id: string;
  streets: string[];
  classes: string[];
  maxClass?: string;
  minClass?: string;
  legs: number;
  maxLanes: number | null;
  hasSignal: boolean;
  distNearestSignalM: number;
  pois: Pois;
  heuristicScore?: number | null;
  heuristicReasons?: string[];
  status?: Status;
  jev?: JevBlock | null;
  signalSource?: "osm" | "oficial" | "ambos" | null;
  distSignalAlongM?: number | null;
  /** joined from crashes-by-intersection.json (Alcaldía data, published in its own file) */
  crashes?: Crashes | null;
  crashRank?: number | null;
  priority?: Priority;
  priorityScore?: number;
  recommendation?: string;
  evidence?: string[];
  agreement?: "alto" | "medio" | "bajo";
  majorStreet?: string | null;
  crossStreet?: string | null;
}

/** Entry of public/data/crashes-by-intersection.json, keyed by intersection id. */
export interface CrashFields {
  crashes: Crashes | null;
  crashRank: number | null;
}

export interface SignalProps {
  id: number;
  kind: "signal" | "crossing_signal";
  intersectionId: string | null;
}

export interface Summary {
  generatedAt: string;
  counts: {
    streets: number;
    signals: number;
    intersections: number;
    signalized: number;
    prioritario?: number;
    recomendado?: number;
    observacion?: number;
  };
  clippedToMunicipality: boolean;
  validation?: Record<string, unknown>;
  fixture?: boolean;
}

/** Junction as used by the UI: contract props + derived fields, with v2 fields always present. */
export interface Junction extends IntersectionProps {
  lng: number;
  lat: number;
  priority: Priority;
  priorityScore: number;
  recommendation: string;
  evidence: string[];
}

/** Flat properties handed to MapLibre (no nested objects => cheap expressions). */
export interface FlatProps {
  id: string;
  pr: Priority;
  ps: number;
  school: number;
  hospital: number;
}

export type FlatFC = FeatureCollection<Point, FlatProps>;

export interface Filters {
  priorities: Record<ActionPriority, boolean>;
  signals: boolean;
  nearSchool: boolean;
  nearHospital: boolean;
  query: string;
}
