import { createHash } from "node:crypto";
import type { JunctionProps, Question } from "../types.ts";

/**
 * Bump when the shape/wording of the state changes, so cached answers made with an older
 * state layout are not reused.
 */
export const STATE_VERSION = 2;

/**
 * Wording notes (all from the TypeSafe docs):
 * - English is Jev's primary language, so state, instructions and criteria are in English;
 *   Spanish labels are applied in code when writing the output (NEED_LEVELS / CONTROL_LABELS).
 * - Jev reads literally and is weak with raw numbers ("pass a computed number or a named bucket"),
 *   so every number in the state is accompanied by a worded bucket computed in code.
 * - Score levels are judged one by one, without seeing their index or neighbours: each level
 *   describes a self-standing situation, not a degree ("worse than the previous" is meaningless).
 * - Question ids are not sent to the model, so instructions carry the full question.
 * - Fields are referenced with backticks (`junction`), as the docs recommend.
 */

export const CONTEXT =
  "Barranquilla is a Caribbean port city in Colombia with about 1.3 million inhabitants. " +
  "Streets form a grid of numbered 'Calles' and 'Carreras'; a few wide arterial avenues (for example Calle 30, " +
  "Via 40, Calle 72, Carrera 38, Carrera 46 with the Transmetro bus corridor, Avenida Circunvalar) carry most " +
  "through traffic, while most other streets are narrow neighbourhood streets. Motorcycles, buses and informal " +
  "transport are a large share of traffic, many people walk, and drivers often do not yield at unsignalized " +
  "junctions. The city has roughly 750 traffic signals, concentrated in the centre and the north. " +
  "Road classes come from OpenStreetMap: trunk and primary are major arterials, secondary are important " +
  "avenues, tertiary are collector streets, residential, unclassified and living_street are local streets. " +
  "Colombian rules (Manual de Senalizacion Vial 2024, chapter 4) justify a traffic signal when the main street " +
  "and the side street both carry sustained traffic for many hours of the day, when continuous main-street " +
  "traffic causes undue delay or risk to side-street vehicles entering or crossing, when many pedestrians, " +
  "cyclists or schoolchildren must cross a heavily trafficked street with no safe crossing nearby, when a " +
  "signal fills a gap in a coordinated signalized corridor, or when crashes persist after cheaper measures " +
  "were tried. A side street that is only residential almost never carries enough traffic to meet the volume " +
  "conditions. A new signal should not be closer than about 300 m to an existing one. Cheaper measures must be " +
  "ruled out first, in this order: stop or yield priority signs, traffic calming, roundabout, then a signal; " +
  "stop signs on all approaches are not allowed in Colombia. " +
  "No traffic counts or crash records are available for this junction: judge from the road hierarchy, " +
  "geometry and surroundings given.";

const CLASS_WORDS: Record<string, string> = {
  motorway: "motorway (grade-separated highway)",
  trunk: "trunk (major arterial highway)",
  primary: "primary (major arterial avenue)",
  secondary: "secondary (important avenue)",
  tertiary: "tertiary (collector street)",
  unclassified: "unclassified (minor local street)",
  residential: "residential (local neighbourhood street)",
  living_street: "living_street (very slow shared local street)",
};

function classWords(c: string): string {
  const base = c.replace(/_link$/, "");
  const w = CLASS_WORDS[base];
  if (!w) return c;
  return c.endsWith("_link") ? `${c} (ramp or connector of a ${base} road)` : w;
}

function shapeWords(legs: number): string {
  if (legs <= 2) return "two legs (a bend or a change of street, not a real crossing)";
  if (legs === 3) return "three-leg T or Y junction";
  if (legs === 4) return "four-leg cross intersection";
  return "complex junction with five or more legs";
}

function lanesWords(l: number | null): string {
  if (l == null) return "unknown (not mapped)";
  if (l <= 1) return "single lane";
  if (l === 2) return "two lanes";
  if (l === 3) return "three lanes (wide road)";
  return "four or more lanes (very wide road)";
}

function signalProximityWords(d: number | null): string {
  if (d == null || !Number.isFinite(d)) return "unknown";
  if (d < 150) return "very close: an existing traffic signal is about a block away, far below the minimum spacing";
  if (d < 300) return "close: an existing traffic signal is two or three blocks away, below the recommended minimum spacing";
  if (d < 500) return "moderate: the nearest traffic signal is just beyond the recommended minimum spacing";
  if (d < 1000) return "far: no traffic signal within several blocks, a gap in signal coverage";
  return "very far: no traffic signal anywhere in the surrounding area";
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

  return {
    city_context: CONTEXT,
    junction: {
      street_names: named.length ? named : ["(unnamed streets)"],
      road_classes_present: p.classes,
      highest_road_class: classWords(p.maxClass),
      lowest_road_class: classWords(p.minClass),
      number_of_legs: p.legs,
      junction_shape: shapeWords(p.legs),
      max_lanes_on_any_leg: p.maxLanes,
      widest_leg: lanesWords(p.maxLanes),
      currently_has_traffic_signal: p.hasSignal,
      distance_to_nearest_traffic_signal_m:
        p.distNearestSignalM == null ? null : Math.round(p.distNearestSignalM),
      nearest_traffic_signal_proximity: signalProximityWords(p.distNearestSignalM),
      places_within_200_m: {
        schools: pois.school,
        hospitals_or_clinics: pois.hospital,
        markets: pois.market,
        bus_stops: pois.busStop,
        places_of_worship: pois.worship,
        parks: pois.park,
      },
      pedestrian_generators_nearby: generators.length ? generators.join(", ") : "none mapped",
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
      "Only quiet local or residential streets meet here. Traffic is light and slow, drivers and pedestrians " +
        "cross easily by yielding to each other, and a traffic signal would serve no purpose.",
      // 1 baja
      "A local street meets a collector street with moderate traffic. A stop or yield sign on the minor " +
        "street is enough: gaps to enter or cross are frequent and few pedestrians cross here.",
      // 2 media
      "A collector street or an avenue crosses another street with steady traffic. Entering or crossing takes " +
        "some waiting at peak hours, or a school, bus stops or shops bring regular pedestrian crossings. " +
        "A traffic signal might become justified and the junction deserves a traffic study.",
      // 3 alta
      "A busy arterial or multi-lane avenue is crossed or joined by another significant street, and there is " +
        "no nearby traffic signal creating gaps in the flow. Side-street drivers and pedestrians face long " +
        "waits and risky crossings, so a traffic signal is probably justified.",
      // 4 crítica
      "Two major arterials, or a very wide and fast multi-lane arterial and another important street, cross " +
        "at grade with no traffic signal anywhere near, while schools, hospitals, markets or bus stops bring " +
        "many pedestrians. Crossing is dangerous for most of the day and signal control is urgently needed.",
    ],
  },
  warrantProb: {
    type: "noul",
    instructions:
      "Does the junction described in `junction` warrant a traffic signal under typical Colombian urban " +
      "criteria, as summarised in `city_context`?",
    criteria: {
      true:
        "The junction plausibly meets at least one condition of the Colombian manual: the main street and the " +
        "side street both carry sustained traffic; or continuous main-street traffic causes undue delay or " +
        "risk to side-street vehicles; or many pedestrians or schoolchildren must cross a heavily trafficked " +
        "street with no safe crossing nearby; or a signal would fill a gap in a signalized corridor. No " +
        "existing traffic signal is closer than the minimum spacing, and priority signs would not be enough.",
      false:
        "The junction does not plausibly meet any condition: the side street is local or residential and " +
        "carries light traffic, stop or yield signs or traffic calming are sufficient, the junction is only " +
        "a bend, a ramp or a minor side access, or an existing traffic signal closer than the minimum " +
        "spacing already serves the crossing.",
    },
  },
  control: {
    type: "choice",
    instructions:
      "Which single type of traffic control is the best fit for the junction described in `junction`, " +
      "given the local conditions in `city_context`?",
    criteria: {
      vehicle_traffic_signal:
        "Full traffic signal for vehicles and pedestrians. Fits a junction where two streets that both " +
        "carry significant traffic cross, typically an arterial or avenue crossed by a collector or another " +
        "avenue, with no signal close by.",
      pedestrian_signal:
        "Pedestrian-activated signal or signalized crosswalk. Fits a busy road that many pedestrians must " +
        "cross (school, hospital, market, bus stops nearby) where the side street itself carries little " +
        "vehicle traffic.",
      stop_or_yield_sign:
        "Stop or yield sign on the minor street. Fits a junction where a minor street meets a clearly more " +
        "important street and traffic is moderate, so priority rules are enough.",
      speed_reducers:
        "Speed humps, raised crossings or other traffic calming. Fits local or collector streets where the " +
        "problem is vehicle speed near schools, parks or homes rather than conflicting traffic volumes.",
      roundabout:
        "Roundabout or mini-roundabout. Fits a junction of streets of similar importance with four or more " +
        "legs or an irregular layout, moderate balanced traffic and enough space, outside the dense centre.",
      no_intervention:
        "No new control is needed. Fits a quiet junction of local streets, a bend with only two legs, or a " +
        "junction already served by an existing traffic signal very close by.",
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
