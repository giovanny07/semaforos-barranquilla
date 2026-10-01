import { createHash } from "node:crypto";
import type { JunctionProps, Question } from "../types.ts";

/**
 * v3 — richer state + context corrected with facts measured on the TUNE half of the signalized junctions:
 *  - main road / crossing street described separately (v2 sent highest/lowest class of any leg, so a stub of a
 *    residential street made an avenue × collector crossing look like avenue × residential);
 *  - distance to the next signal ALONG the main road, in addition to straight-line;
 *  - police crash records 2018–2022 as a worded bucket, framed as exposure (busy junction), not as proof;
 *  - spacing: in Barranquilla 58 % of the signalized junctions have another signal within 150 m and 89 % within
 *    300 m, so v2's "never closer than 300 m" made the model reject almost every real signalized junction
 *    (baseline recall 1 %). The 300 m rule of the Manual only applies to signals justified by coordination.
 *  - OSM classes: 46 % of the signalized junctions have a crossing street tagged residential.
 * Wording notes of v2 still apply (English, worded buckets next to every number, self-standing Score levels).
 */
export const STATE_VERSION = 3;

export const CONTEXT =
  "Barranquilla is a Caribbean port city in Colombia with about 1.3 million inhabitants. " +
  "Streets form a grid of numbered 'Calles' and 'Carreras'; a few wide arterial avenues (for example Calle 30, " +
  "Via 40, Calle 72, Carrera 38, Carrera 46 with the Transmetro bus corridor, Avenida Circunvalar) carry most " +
  "through traffic, while most other streets are narrow neighbourhood streets. Motorcycles, buses and informal " +
  "transport are a large share of traffic, many people walk, and drivers often do not yield at unsignalized " +
  "junctions. The city has about 350 signalized intersections, concentrated in the centre and the north. " +
  "Road classes come from OpenStreetMap: trunk and primary are major arterials, secondary are important " +
  "avenues, tertiary are collector streets, residential, unclassified and living_street are local streets. " +
  "These classes are imperfect: in the grid, many streets tagged residential are continuous through streets, and " +
  "almost half of the city's signalized intersections have a crossing street tagged residential. " +
  "Colombian rules (Manual de Senalizacion Vial 2024, chapter 4) justify a traffic signal when the main street " +
  "and the side street both carry sustained traffic for many hours of the day, when continuous main-street " +
  "traffic causes undue delay or risk to side-street vehicles entering or crossing, when many pedestrians, " +
  "cyclists or schoolchildren must cross a heavily trafficked street with no safe crossing nearby, when a " +
  "signal fills a gap in a coordinated signalized corridor, or when crashes persist after cheaper measures " +
  "were tried. Cheaper measures come first, in this order: stop or yield priority signs, traffic calming, " +
  "roundabout, then a signal; stop signs on all approaches are not allowed in Colombia. " +
  "Signal spacing in practice: on the arterial and collector corridors of the consolidated grid, consecutive " +
  "significant crossings are signalized, so existing signals one to three blocks apart (100 to 300 m) are normal " +
  "and are not a reason against a signal. Only a signal less than about 80 m away, in the same block, already " +
  "serves the crossing. " +
  "No traffic counts are available. Police crash records for 2018-2022 matched by street address are given in " +
  "`junction.crash_records`. Crash counts mostly reflect how much conflicting traffic uses a junction: " +
  "intersections that the city has already signalized typically have 5 to 15 matched crashes in that period, " +
  "while quiet local junctions have none or one. Many crashes therefore indicate a busy conflict point, not by " +
  "themselves a missing signal.";

const CLASS_WORDS: Record<string, string> = {
  motorway: "motorway (grade-separated highway)",
  trunk: "trunk (major arterial highway)",
  primary: "primary (major arterial avenue)",
  secondary: "secondary (important avenue)",
  tertiary: "tertiary (collector street)",
  unclassified: "unclassified (minor local street)",
  residential: "residential (neighbourhood street, may be a through street of the grid)",
  living_street: "living_street (very slow shared local street)",
};
const classWords = (c: string | null | undefined) => (c ? (CLASS_WORDS[c.replace(/_link$/, "")] ?? c) : "none (nothing crosses the main road here)");

function shapeWords(legs: number): string {
  if (legs <= 2) return "two legs (a bend or a change of street, not a real crossing)";
  if (legs === 3) return "three-leg T or Y junction: the side street ends here";
  if (legs === 4) return "four-leg cross intersection: the crossing street continues on both sides";
  return "complex junction with five or more legs";
}
function lanesWords(l: number | null): string {
  if (l == null) return "unknown (not mapped)";
  if (l <= 1) return "single lane";
  if (l === 2) return "two lanes";
  if (l === 3) return "three lanes (wide road)";
  return "four or more lanes (very wide road)";
}
function straightWords(d: number | null): string {
  if (d == null || !Number.isFinite(d) || d < 0) return "unknown";
  if (d < 80) return "same block: a signal less than 80 m away already serves this crossing";
  if (d < 150) return "one block away: normal spacing inside the signalized grid";
  if (d < 300) return "two or three blocks away: normal spacing on a signalized corridor";
  if (d < 600) return "several blocks away";
  return "far: no traffic signal anywhere near";
}
function alongWords(d: number | null | undefined, road: string | null | undefined): string {
  if (!road) return "unknown (main road has no name)";
  if (d == null) return "no traffic signal found along the main road within 3 km, or the road changes name";
  if (d < 80) return "the next signal on the main road is in the same block";
  if (d < 300) return "the next signal on the main road is one to three blocks away: this junction sits on a signalized corridor";
  if (d < 600) return "the next signal on the main road is several blocks away";
  return "long stretch of the main road without any signal (more than 600 m)";
}
function crashWords(total: number | undefined): string {
  if (total == null) return "unknown";
  if (total === 0) return "none recorded: typical of quiet junctions";
  if (total <= 2) return "few (1-2): typical of minor junctions";
  if (total <= 4) return "some (3-4): above the median of junctions with crashes";
  if (total <= 9) return "many (5-9): top quarter of unsignalized junctions, the level typical of intersections the city has signalized";
  return "very many (10 or more): top tenth of unsignalized junctions, a very busy conflict point";
}
function structureWords(p: JunctionProps): string {
  const s = p.structure;
  if (p.crossClass === null) return "carriageway split or merge: no street actually crosses";
  if (s?.roundabout || s?.nearRoundabout) return "part of a roundabout or of its entries: already controlled by the roundabout";
  if (s?.ramp) return "ramp or connector of an interchange: not an ordinary at-grade crossing";
  if (s?.gradeSeparated || s?.nearGradeSeparated) return "next to a bridge, overpass or underpass: part of a grade-separated interchange";
  if (p.onewayT) return "ordinary at-grade junction; T access onto a one-way carriageway (right-in, right-out)";
  return "ordinary at-grade junction";
}
function countWords(n: number, one: string, many: string): string | null {
  if (!n) return null;
  return n === 1 ? `one ${one}` : n <= 3 ? `a few ${many} (${n})` : `many ${many} (${n})`;
}

/** The `state` sent to Jev: named JSON fields, only what the questions need. */
export function buildState(p: JunctionProps): Record<string, unknown> {
  const named = p.streets.filter((s) => s && s.trim());
  const pois = p.pois ?? { school: 0, hospital: 0, market: 0, busStop: 0, worship: 0, park: 0 };
  const generators = [
    countWords(pois.school, "school", "schools"),
    countWords(pois.hospital, "hospital or clinic", "hospitals or clinics"),
    countWords(pois.market, "market or supermarket", "markets or supermarkets"),
    countWords(pois.busStop, "bus stop", "bus stops"),
    countWords(pois.worship, "place of worship", "places of worship"),
    countWords(pois.park, "park", "parks"),
  ].filter((x): x is string => x !== null);
  const d = p.distNearestSignalM == null || p.distNearestSignalM < 0 ? null : Math.round(p.distNearestSignalM);
  const c = p.crashes ?? null;

  return {
    city_context: CONTEXT,
    junction: {
      street_names: named.length ? named : ["(unnamed streets)"],
      main_road: {
        name: p.majorStreet ?? "(unnamed)",
        road_class: classWords(p.majorClass ?? p.maxClass),
        widest_leg: lanesWords(p.maxLanes),
        divided_dual_carriageway: p.divided ? "yes: two separate carriageways, hard to cross" : "no",
      },
      crossing_street: { name: p.crossStreet ?? "(unnamed)", road_class: classWords(p.crossClass === undefined ? p.minClass : p.crossClass) },
      junction_shape: shapeWords(p.legs),
      junction_structure: structureWords(p),
      currently_has_traffic_signal: p.hasSignal,
      nearest_traffic_signal: {
        straight_line_m: d,
        straight_line: straightWords(d),
        along_main_road_m: p.distSignalAlongM ?? null,
        along_main_road: alongWords(p.distSignalAlongM, p.majorStreet),
        source: "signal locations checked against the city's official 2023 inventory and OpenStreetMap",
      },
      crash_records: c
        ? { period: c.period, crashes: c.total, with_injuries: c.injuries, with_deaths: c.deaths, pedestrians_hit: p.crashesPedestrian ?? 0, level: crashWords(c.total) }
        : { level: "unknown (no crash data)" },
      pedestrian_generators_within_200_m: generators.length ? generators.join(", ") : "none mapped",
    },
  };
}

/** Spanish labels for Score levels, index = level number. */
export const NEED_LEVELS = ["ninguna", "baja", "media", "alta", "crítica"] as const;

/** Choice option key (sent to the model) -> Spanish label written to the output. */
export const CONTROL_LABELS = {
  vehicle_traffic_signal: "semáforo vehicular",
  pedestrian_signal: "semáforo peatonal",
  stop_or_yield_sign: "señal de PARE / ceda el paso",
  speed_reducers: "reductores de velocidad",
  roundabout: "glorieta",
  no_intervention: "ninguna intervención",
} as const;

export const QUESTIONS = {
  needLevel: {
    type: "score",
    instructions:
      "How much does the unsignalized street junction described in `junction` need a traffic signal, " +
      "given the local conditions in `city_context`?",
    criteria: [
      // 0 ninguna
      "Only quiet local streets meet here, or the place is not an ordinary crossing (roundabout, ramp, carriageway " +
        "split, a signal in the same block). Few or no crashes are recorded. A traffic signal would serve no purpose.",
      // 1 baja
      "A local street meets a collector or avenue, crash records are few, and gaps to enter or cross are frequent. " +
        "A stop or yield sign on the minor street is enough.",
      // 2 media
      "A collector street or an avenue meets another street with steady traffic; some crashes are recorded, or a " +
        "school, bus stops or shops bring regular pedestrian crossings. A traffic signal might become justified and " +
        "the junction deserves a traffic study.",
      // 3 alta
      "A collector, avenue or arterial is crossed by a through street, and many crashes are recorded (the level " +
        "typical of intersections the city has already signalized), or the main road is wide and divided. Side-street " +
        "drivers and pedestrians face long waits and risky crossings, so a traffic signal is probably justified.",
      // 4 crítica
      "A major arterial or very wide multi-lane avenue is crossed at grade by another important street, with very " +
        "many crashes recorded including injuries or deaths, or with schools, hospitals, markets or bus stops bringing " +
        "many pedestrians. Crossing is dangerous for most of the day and signal control is urgently needed.",
    ],
  },
  warrantProb: {
    type: "noul",
    instructions:
      "Does the junction described in `junction` warrant a traffic signal under typical Colombian urban " +
      "criteria and the city's practice, as summarised in `city_context`?",
    criteria: {
      true:
        "It is an ordinary at-grade crossing where a collector, avenue or arterial meets a street that carries " +
        "through traffic, and the evidence points to sustained conflicting flows: many recorded crashes, a wide or " +
        "divided main road, a four-leg crossing, or many pedestrians from schools, hospitals, markets or bus stops. " +
        "No signal exists in the same block. Priority signs alone would not be enough.",
      false:
        "Both streets are quiet local streets, or the side street is a minor access with few or no recorded crashes, " +
        "so stop or yield signs or traffic calming are sufficient; or the place is a roundabout, a ramp, a bridge or " +
        "a carriageway split; or a traffic signal in the same block already serves the crossing.",
    },
  },
  control: {
    type: "choice",
    instructions:
      "Which single type of traffic control is the best fit for the junction described in `junction`, " +
      "given the local conditions in `city_context`?",
    criteria: {
      vehicle_traffic_signal:
        "Full traffic signal for vehicles and pedestrians. Fits an at-grade crossing where a collector, avenue or " +
        "arterial meets a through street and both carry significant traffic, shown by many recorded crashes, a " +
        "four-leg layout or a wide main road.",
      pedestrian_signal:
        "Pedestrian-activated signal or signalized crosswalk. Fits a busy road that many pedestrians must " +
        "cross (school, hospital, market, bus stops nearby, or pedestrians hit in the crash records) where the side " +
        "street itself carries little vehicle traffic.",
      stop_or_yield_sign:
        "Stop or yield sign on the minor street. Fits a junction where a minor street meets a clearly more " +
        "important street, traffic is moderate and few crashes are recorded, so priority rules are enough.",
      speed_reducers:
        "Speed humps, raised crossings or other traffic calming. Fits local or collector streets where the " +
        "problem is vehicle speed near schools, parks or homes rather than conflicting traffic volumes.",
      roundabout:
        "Roundabout or mini-roundabout. Fits a junction of streets of similar importance with four or more " +
        "legs or an irregular layout, moderate balanced traffic and enough space, outside the dense grid.",
      no_intervention:
        "No new control is needed. Fits a quiet junction of local streets with no crash history, a bend, a ramp, " +
        "a roundabout, or a crossing already served by a traffic signal in the same block.",
    },
  },
} as const satisfies Record<string, Question>;

export type QuestionId = keyof typeof QUESTIONS;

function sha(x: unknown): string {
  return createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
}

/** Hash of everything that is the same for all junctions: questions, context text, state layout. */
export const QUESTION_HASH = sha({ v: STATE_VERSION, context: CONTEXT, questions: QUESTIONS });

export function stateHash(state: unknown): string {
  return sha(state);
}
