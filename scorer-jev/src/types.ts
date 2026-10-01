/** Properties of a feature in data/out/intersections.geojson, plus the crash fields joined from crashes-by-intersection.json (see docs/data-schema.md). */
export interface JunctionProps {
  id: string;
  streets: string[];
  classes: string[];
  maxClass: string;
  minClass: string;
  legs: number;
  maxLanes: number | null;
  hasSignal: boolean;
  distNearestSignalM: number | null;
  pois: { school: number; hospital: number; market: number; busStop: number; worship: number; park: number };
  heuristicScore: number | null;
  heuristicReasons?: string[];
  status?: string;
  // ---- Addendum v2 facts (optional so older inputs / fixtures still load)
  majorClass?: string;
  crossClass?: string | null;
  majorStreet?: string | null;
  crossStreet?: string | null;
  divided?: boolean;
  onewayT?: boolean;
  structure?: { roundabout: boolean; ramp: boolean; gradeSeparated: boolean; nearRoundabout: boolean; nearGradeSeparated: boolean };
  signalSource?: string | null;
  coveredBy?: string | null;
  distSignalAlongM?: number | null;
  crashes?: { total: number; injuries: number; deaths: number; period: string } | null;
  crashesPedestrian?: number;
  crashesRecentVictims?: number;
  /** percentile of `crashes.total` on the scale of unsignalized junctions with ≥1 crash (same scale for every junction) */
  crashPct?: number | null;
  crashRank?: number | null;
}

export interface Junction {
  props: JunctionProps;
  lon: number;
  lat: number;
}

// ---- TypeSafe wire format (https://docs.typesafe.ai/api.md) ----

export type Described = string | Record<string, unknown> | unknown[];

export type Question =
  | { type: "noul"; instructions: Described; criteria?: { true?: Described; false?: Described } }
  | { type: "choice"; instructions: Described; criteria: Record<string, Described | null> }
  | { type: "score"; instructions: Described; criteria: Described[] };

export interface SystemOneRequest {
  state: Described;
  model: string;
  questions: Record<string, Question>;
}

export interface NoulAnswer { type: "noul"; noul: number }
export interface ChoiceAnswer { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
export interface ScoreAnswer {
  type: "score";
  score: number;
  legend?: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

/** Normalised response, identical in shape to the native TypeSafe response body. */
export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Entry of data/out/jev-scores.json (the `jev` field of a junction; see docs/data-schema.md). */
export interface JevScore {
  needLevel: string;
  needScore: number;
  warrantProb: number;
  control: string;
  confidence: number;
}
