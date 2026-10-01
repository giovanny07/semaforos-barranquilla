import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
export const RAW_DIR = path.join(ROOT, "data", "raw");
export const OUT_DIR = path.join(ROOT, "data", "out");
export const WEB_DATA_DIR = path.join(ROOT, "web", "public", "data");
export const CRITERIA_DOC = path.join(ROOT, "docs", "research", "criteria.md");
export const JEV_SCORES = path.join(OUT_DIR, "jev-scores.json");
export const JEV_SCORES_NOCRASH = path.join(OUT_DIR, "jev-scores-nocrash.json");
export const BACKTEST_FILE = path.join(OUT_DIR, "backtest.json");
export const REPORT_DIR = path.join(OUT_DIR, "reports");
/** Input: official inventory of signalized intersections (Alcaldía de Barranquilla, CC BY-SA 4.0). */
export const OFFICIAL_SIGNALS = path.join(ROOT, "docs", "research", "data", "semaforos-oficial-2023.geojson");

/** Outputs that re-publish Alcaldía data (CC BY-SA 4.0), kept apart from the OSM-derived files (ODbL). */
export const CRASHES_OUT = "crashes-by-intersection.json";
export const OFFICIAL_OUT = "official-signals.geojson";
/** Junction properties whose values come only from the crash records: written to CRASHES_OUT, never to intersections. */
export const CRASH_FIELDS = ["crashes", "crashRank", "crashPct", "crashesPedestrian", "crashesRecentVictims"] as const;
/** Junction properties whose values come only from the official inventory: published in OFFICIAL_OUT instead. */
export const OFFICIAL_FIELDS = ["signalOfficialName", "signalSince"] as const;

/** Study area bbox: south, west, north, east. */
export const BBOX = { s: 10.89, w: -74.93, n: 11.07, e: -74.74 } as const;
export const BBOX_STR = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;

export const USER_AGENT = "semaforos-barranquilla/0.1 (+https://github.com/Victorpay1/semaforos-barranquilla)";
export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const OVERPASS_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "*/*",
  "Content-Type": "application/x-www-form-urlencoded",
} as const;

/** Highest → lowest. `_link` variants are normalised to their base class. */
export const CLASS_RANK = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
] as const;
export type RoadClass = (typeof CLASS_RANK)[number];

export const HIGHWAY_REGEX = `^(${CLASS_RANK.join("|")})(_link)?$`;

/** Geometry thresholds (metres). */
export const GEO = {
  /** Junction nodes closer than this are merged into a single intersection. */
  mergeRadiusM: 20,
  /** A cluster may not grow beyond this distance from its seed (prevents chain-merging a whole block). */
  maxClusterSpanM: 45,
  /** A signal node within this distance of the junction marks it as signalized. */
  signalRadiusM: 30,
  /** POI counting radius. */
  poiRadiusM: 200,
  /** Two legs leaving a junction within this bearing difference, with the same name, count as one approach
   *  (both carriageways of a divided road). */
  sameApproachDeg: 35,
  /** Distance along a way at which the leg bearing is sampled. */
  legBearingSampleM: 30,
  /** Junction records of the SAME street pair closer than this are one crossing: dual-carriageway twins, service
   *  roads and staggered halves of a wide avenue (two streets do not cross twice within this distance). Crash
   *  records name only the street pair, so they are attributed to the whole crossing. */
  twinRadiusM: 150,
  /** …and one crossing never spans more than this (prevents chaining along a corridor with a parallel service road). */
  maxCrossingSpanM: 200,
  /** Two shortlisted junctions closer than this are studied together: only the better-ranked one stays in the top tier. */
  nmsRadiusM: 120,
  /** Search limit for the along-road distance to the next signal. */
  alongRoadMaxM: 3000,
  /** A roundabout way this close means the junction is part of / an entry to the roundabout. */
  roundaboutRadiusM: 40,
  /** A bridge / tunnel / ramp of a collector-or-higher road this close means the junction belongs to an interchange. */
  interchangeRadiusM: 60,
} as const;
