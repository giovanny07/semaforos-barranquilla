// Illustrative microsimulation of one junction: today (side street has a PARE sign) vs. with a traffic signal.
// Geometry (legs, lanes, one-ways) is real, taken from the street network. Traffic volumes are NOT measured:
// they are typical peak-hour values per road class, so results illustrate the mechanism, not a forecast.

import type { Feature, FeatureCollection, LineString } from "geojson";
import { baseClass, fetchJson } from "./data";

interface StreetProps { name: string | null; highway: string; lanes: number | null; oneway: boolean }
export type StreetFC = FeatureCollection<LineString, StreetProps>;

type Vec = [number, number];

let streetsCache: Promise<StreetFC> | null = null;
export const loadStreets = () => (streetsCache ??= fetchJson<StreetFC>("/data/streets.geojson"));

export interface Leg {
  dir: Vec; // unit vector from the junction outwards (x east, y north)
  name: string | null;
  highway: string;
  rank: number;
  inLanes: number; // lanes carrying traffic towards the junction (0 = exit only)
  outLanes: number;
  group: 0 | 1; // 0 = main road (keeps priority today), 1 = side street
  flow: number; // assumed vehicles per hour entering from this leg
}

const RANK: Record<string, number> = {
  living_street: 0, residential: 1, unclassified: 1, tertiary: 2, secondary: 3, primary: 4, trunk: 5, motorway: 5,
};
/**
 * Assumed peak-hour vehicles (cars and motorcycles) per hour on one approach, by road class, capped per lane. Order of
 * magnitude only. The one published count on our list, Vía 40 × Calle 58 (Unicauca thesis, 2018), gives 2,000–2,900
 * pcu/h per Vía 40 approach and ~410 on Calle 58: the top of this scale, not above it.
 */
export const FLOW_BY_RANK = [60, 150, 400, 800, 1300, 1800];
const FLOW_PER_LANE = 700;
const SPEED_BY_RANK = [5.5, 6.9, 8.3, 8.3, 9.7, 9.7]; // m/s (20–35 km/h: peak hour in the city)

export const LANE_W = 3.2;
export const VIEW_R = 60; // metres from the junction to the edge of the (square) view
export const CAR_LEN = 4.5;
/** Distance (m) from the junction edge back to the stop line; the zebra crossing lies between the two. */
export const STOP_LINE = 3.4;
/** Where the centre of a waiting car sits: front bumper 0.6 m behind the stop line. */
const HOLD = -(STOP_LINE + CAR_LEN / 2 + 0.6);
const BRAKE = 3, BRAKE_MAX = 4.5; // m/s²: comfortable braking, and the hardest a driver will brake (acceleration is the driver's own)
const GAP_MIN = 1.4, GAP_MAX = 2.6; // m between stopped cars: it depends on the driver

/**
 * How drivers treat a PARE sign ("today" view): they slow down but rarely stop, take the first gap they consider
 * enough, and otherwise creep over the zebra to the edge of the first lane and push the nose in until the drivers of
 * every lane they need have either left a gap or stopped for them; then they cross in one go, with the cars behind
 * tailgating through. Every behavioural number lives here so it can be re-tuned in one place. Sources and caveats: docs/research/pare-behaviour.md (row numbers in brackets). Nothing was measured
 * in Barranquilla. [COMP] measured in a comparable context (Córdoba, Argentina; India) · [SUP] declared assumption.
 */
export const PARE = {
  fullStopShare: 0.1, // [SUP #1] drivers who stop completely even when nothing forces them to
  noSlowShare: 0.25, // [SUP #2] drivers who barely slow down when they see the way clear
  stopDwell: 0.6, // [SUP] s a full stop lasts
  rollSpeed: 2, // [SUP #3] m/s over the stop line ("rolling stop" = under 2.2 m/s)
  noSlowSpeed: 5, // [SUP] m/s over the line for a driver who does not slow and sees the way clear
  gap: { right: 4.6, straight: 4.9, left: 5.3, leftT: 4.8 }, // [COMP #4-6] s, mean critical gap: HCM × 0.75, as found in Córdoba
  gapSd: 1.35, // [COMP #6] s between drivers (Córdoba, n = 308)
  gapPerLane: 0.35, // [SUP #7] s more per extra main-road lane
  stageGap: 4.1, // [COMP #28] s, mean critical gap once the driver has claimed his turn and only checks that the way is still free
  motoShare: 0.3, // [SUP #21] motorcycles in the stream. Assumption bracketed by fleet data only; no traffic count found
  motoGap: 3, motoGapSd: 0.8, motoForcer: 2.1, motoForcerShare: 0.23, // [COMP #24, #26] s: India, two-wheelers
  forcerShare: 0.3, // [COMP #9] a trait of the driver, not of how long he has waited (India: 35–37 % of entries forced)
  gapForcer: 2.2, gapFloor: 3.5, // [COMP #10] [SUP #11] s: the shortest gap a forcer / a patient driver ever takes
  impatience: [8, 30] as const, // [SUP #12] s holding: the accepted gap starts to shrink, and reaches the floor
  clearSlack: 0.5, // s: whatever the driver accepts, the gap is never shorter than the time his tail needs to get out of the lane
  mergeExtra: 1, // [SUP] s more to join a stream than to cross it: speeds have to match
  creepSpeed: 1, // [SUP #15] m/s while edging forward past the line
  creepPulse: [1.6, 0.6] as const, // [SUP] s per little advance, and share of it spent moving
  noseMax: 0.2, // m the nose is pushed past the edge of the conflict zone. [SUP #14] says ~1 m into the lane, but cars here cannot swerve:
  // this is as far as it goes while main-road cars can still squeeze past without touching
  noseTime: 4, // [SUP] s of holding at the lane edge to push the nose that far in
  yieldToNose: 0.5, // [SUP #13] chance that a main-road driver who can still stop gently lets the nose in
  yieldFollow: 0.9, // [SUP] the same chance once a driver in another lane has already stopped for that car: nobody wants to be the one who hits it
  yieldSlow: 0.4, // [SUP] added in proportion to how much slower than cruising he already is
  yieldPatience: 6, // [SUP] s a driver who stopped to let a car in waits for it to move before driving on
  yieldDecel: 3, // [SUP #16] m/s² he is willing to brake to do so
  squeezeFactor: 0.5, // [SUP] share of cruising speed while squeezing past a nose that pokes into the lane
  followProb: 0.5, followMax: 3, followGap: 5, // [SUP #19] cars behind go bumper to bumper through a gap somebody else opened
  softBrake: 2, // m/s² a driver plans for when he sees the obstacle in time
  caution: 1, // [SUP] s of extra room a main-road driver leaves behind a car crossing in front of him: he cannot know it will make it
  jamAfter: 2, // s a car has stood behind another car's body after which others stop expecting it to arrive
  turnAfter: 15, // s a creeper has held after which creepers from other streets let it go first (no starvation)
  pushAfter: 10, // s standing in the middle of the junction after which everybody lets the car out, longest first (deadlock breaker)
  hardBrake: 2.5, // m/s² needed at the moment of surprise for a braking to count as a "frenada brusca"
  emergency: 7, // m/s² absolute limit; needing more than BRAKE_MAX counts as a near-miss
};
const TOUCH = 1.8; // m between the centre lines of two paths below which car bodies there would overlap visibly
const NOSE_BACK = 0.3; // m a holding car keeps from a conflict zone before it starts pushing in

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
const norm = (a: Vec): Vec => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

export interface LegOptions {
  /** Street names that really meet at this junction; keeps parallel streets a block away out of the picture. */
  names?: string[];
  /** Name of the road that keeps priority today, when the road classes alone cannot tell. */
  major?: string | null;
}

/** Legs of the junction at (lng, lat), derived from the street lines that pass through it. */
export function legsFor(streets: StreetFC, lng: number, lat: number, opts: LegOptions = {}): Leg[] | null {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
  const local = (c: number[]): Vec => [(c[0] - lng) * kx, (c[1] - lat) * ky];
  const dLng = 120 / kx, dLat = 120 / ky;
  const names = opts.names?.length ? new Set(opts.names) : null;

  interface Raw { dir: Vec; f: Feature<LineString, StreetProps>; inbound: boolean; outbound: boolean }
  const raw: Raw[] = [];
  for (const f of streets.features) {
    const cs = f.geometry.coordinates;
    let best = -1, bestD = 25;
    for (let i = 0; i < cs.length; i++) {
      if (Math.abs(cs[i][0] - lng) > dLng || Math.abs(cs[i][1] - lat) > dLat) continue;
      const p = local(cs[i]);
      const d = Math.hypot(p[0], p[1]);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) continue;
    // a way 10–25 m from the centre belongs here only if it is one of the junction's own streets (wide divided
    // roads); otherwise it is a neighbouring street
    if (bestD > 10 && names && !(f.properties.name && names.has(f.properties.name))) continue;
    for (const step of [1, -1]) {
      // walk away from the junction until the line is clearly outside it, to get a stable direction
      let far: Vec | null = null, last: Vec | null = null;
      for (let i = best + step; i >= 0 && i < cs.length; i += step) {
        last = local(cs[i]);
        if (Math.hypot(last[0], last[1]) >= 28) { far = last; break; }
      }
      // a short block ends before 28 m: its end point still gives the direction, unless it ends inside the
      // junction (link between the two halves of a divided road)
      if (!far && last && Math.hypot(last[0], last[1]) >= 14) far = last;
      if (!far) continue;
      const oneway = f.properties.oneway;
      // on a one-way line, walking with the line's direction means traffic is leaving the junction
      raw.push({ dir: norm(far), f, inbound: !oneway || step === -1, outbound: !oneway || step === 1 });
    }
  }

  const legs: (Leg & { n: number })[] = [];
  for (const r of raw) {
    const p = r.f.properties;
    // ramps and slip roads (*_link) must not make the street they join look like the main road
    const rank = Math.max(0, (RANK[baseClass(p.highway)] ?? 1) - (p.highway.endsWith("_link") ? 2 : 0));
    const def = rank >= 4 ? 2 : 1;
    const total = p.lanes ?? (p.oneway ? def : def * 2);
    const per = Math.min(3, Math.max(1, p.oneway ? total : Math.floor(total / 2)));
    const inL = r.inbound ? per : 0, outL = r.outbound ? per : 0;
    const m = legs.find((l) => dot(l.dir, r.dir) > 0.87); // within ~30°: same leg (e.g. divided road)
    if (m) {
      m.dir = norm([m.dir[0] * m.n + r.dir[0], m.dir[1] * m.n + r.dir[1]]);
      m.n++;
      m.inLanes = Math.max(m.inLanes, inL);
      m.outLanes = Math.max(m.outLanes, outL);
      if (rank > m.rank) { m.rank = rank; m.highway = p.highway; m.name = p.name ?? m.name; }
      m.name ??= p.name;
    } else {
      legs.push({ dir: r.dir, name: p.name, highway: p.highway, rank, inLanes: inL, outLanes: outL, group: 1, flow: 0, n: 1 });
    }
  }
  if (legs.length < 3 || legs.length > 6) return null;

  // main road: the named priority road if we know it, else the highest-class leg; plus whatever continues its axis
  const byName = opts.major ? legs.filter((l) => l.name === opts.major) : [];
  const main = (byName.length ? byName : [...legs]).sort((a, b) => b.rank - a.rank || b.inLanes + b.outLanes - (a.inLanes + a.outLanes))[0];
  for (const l of legs) {
    l.group = l === main || byName.includes(l) || (Math.abs(dot(l.dir, main.dir)) > 0.8 && l.rank >= main.rank - 1) ? 0 : 1;
    l.flow = Math.min(FLOW_BY_RANK[l.rank], FLOW_PER_LANE * l.inLanes);
  }
  // The main road is one straight-through pair of legs. Forks, service roads and slip lanes that share its name
  // are left out: they turn the picture into an interchange this simple model cannot represent honestly.
  const mains = legs.filter((l) => l.group === 0);
  let pair: [Leg, Leg] | null = null, best = -0.7;
  for (const a of mains) for (const b of mains) {
    const d = dot(a.dir, b.dir);
    if (a !== b && d < best) { best = d; pair = [a, b]; }
  }
  if (!pair) return null;
  const kept = legs.filter((l) => l.group === 1 || pair!.includes(l));
  const mainIn = kept.filter((l) => l.group === 0 && l.inLanes), sideIn = kept.filter((l) => l.group === 1 && l.inLanes);
  if (!mainIn.length || !sideIn.length || kept.length < 3) return null;
  // main-road traffic must be able to carry on along the main road, or the picture makes no sense
  if (!mainIn.every((l) => kept.some((o) => o !== l && o.group === 0 && o.outLanes))) return null;
  // neighbouring legs at such a sharp angle that their lanes overlap outside the largest junction the engine draws
  const half = (l: Leg) => Math.max(l.inLanes, l.outLanes, 1) * LANE_W;
  const order = [...kept].sort((a, b) => Math.atan2(a.dir[1], a.dir[0]) - Math.atan2(b.dir[1], b.dir[0]));
  if (order.some((a, i) => { const b = order[(i + 1) % order.length]; return (half(a) + half(b)) / (2 * Math.sqrt((1 - dot(a.dir, b.dir)) / 2)) + 1 > 18; })) return null;
  return kept;
}

// ---------- engine ----------

export type Mode = "today" | "signal";
export type Light = "green" | "yellow" | "red";
type Turn = "left" | "straight" | "right";

/** Path through the junction: a curve tangent to the entry and exit lanes, sampled so cars move along it at true speed. */
interface Path { key: string; id: number; leg: number; lane: number; exit: number; exitLane: number; pts: Vec[]; cum: number[]; len: number; turn: Turn; vMax: number; stage?: Stage }
/**
 * Stretch of path `a` (in..out, metres along it) where a car could come close to a car on path `b` (oIn..oOut along b).
 * `reach`: [s, lo, hi] for every 15 cm of `a` where a body would actually touch a body standing between lo and hi on `b`.
 */
interface Zone { in: number; out: number; oIn: number; oOut: number; merge: boolean; reach: [number, number, number][] }
/**
 * Where a path that must give way meets the traffic it gives way to: first and last metre of it. Only cars in view count
 * for the gaps: the edge of the view is 6 s away, more than the gap most drivers want.
 */
interface Stage { first: number; last: number }

export interface Car {
  leg: number; lane: number; exit: number; exitLane: number;
  s: number; // metres along the route: <0 approaching, 0 = junction edge, 0..box crossing, >box leaving
  v: number;
  box: number; // path length inside the junction
  path: Path;
  tArr: number; // when the car arrived at the edge of the model (it may have queued outside the view first)
  free: number; // seconds an unimpeded car needs from there to the junction
  wait: number; // seconds spent standing, shown on the timer bubble
  dwell: number; // seconds standing at the head of the queue (PARE sign)
  committed: boolean; // past the stop line (signal view: will not stop again)
  counted: boolean;
  forced: boolean; // made a main-road car brake hard or give up its right of way
  id: number;
  // the driver: same person in both views
  agg: number; // 0 timid .. 1 aggressive
  v0: number; // desired speed as a share of the road's speed
  acc: number; // m/s²
  react: number; // s before moving off when the car ahead moves
  gap: number; // m kept to the car ahead when stopped
  stopper: boolean; // makes a full stop at a PARE
  moto: boolean; // a motorcycle: keeps a car's slot in the lane (the geometry stays honest), but stands closer, pulls away faster and takes shorter gaps
  look: () => number; // this driver's own dice, so decisions do not depend on what other cars do
  // state of the PARE behaviour
  idle: number; // s standing behind a car that has already moved
  hold: number; // s holding at the edge of a lane, waiting or pushing in
  need: number; // s: this driver's critical gap for his movement
  forcer: boolean; noSlow: boolean;
  rank: 0 | 1 | 2; // 0 main road, 1 main-road left turn, 2 side street
  lim: number; // how far the nose may go along the path right now
  ok: Set<Car>; // main-road cars this driver has decided to go in front of
  yieldTo: Car | null; // creeper this driver is letting through
  yieldAt: number; // last moment the offer was being used
  nextLook: number;
  platoon: Car | null; // leader of the group crossing through the same gap
  go: boolean; // about to enter the road, nothing holding him back
  queued: boolean; // standing in a queue behind another standing car: not going anywhere yet
  inRoad: boolean; // nose inside the main road, tail not yet out of it; or about to be: on his way in, nothing holding him
  braking: boolean;
  surprised: Set<Car>; // creepers that already made this driver brake hard
  by: Car | null; // the car whose body stops this one right now
  jam: number; // s it has stood like that
  stand: number; // s it has stood in the middle of the junction, for whatever reason
  pass: Car | null; // the car this one is edging past after a nose-to-flank stand-off
  gave: boolean; // has already offered to let a creeper in, once
  shocked: boolean; // a main-road driver who had to brake hard for a creeper
  near: boolean; // had to brake beyond BRAKE_MAX once: counted as a near-miss
}

export interface Stats {
  waitMain: number; waitSide: number; queueSide: number;
  /** true when queues outgrew the model, so the real figures are higher than shown */
  saturatedMain: boolean; saturatedSide: boolean;
  /** per hour: cars that got in by force; main-road cars that braked hard for a creeper, that gave way to one, that squeezed past a nose, emergency stops */
  forced: number; hardBrakes: number; yields: number; squeezes: number; nearMisses: number;
  /** share of the time (0..1) some main-road car stands behind a car that is crossing in stages */
  blocked: number;
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class JunctionSim {
  cars: Car[] = [];
  t = 0;
  readonly boxR: number;
  private rand: () => number; // arrivals only, so both views receive the same traffic whatever happens inside
  private released: number[]; // cars put on the road so far, per leg: seeds each driver
  private ids = 0;
  private next: number[];
  private backlog: number[][]; // arrival times of cars still waiting outside the view, per leg
  private edge: number[]; // distance from the centre at which each leg leaves the view
  private green: [number, number];
  private yellow: number; private allRed: number; private cycle: number;
  private paths = new Map<string, Path>();
  private conflicts = new Map<string, boolean>();
  private zones = new Map<number, Zone | null>();
  private mainLanes: number;
  private sum = [0, 0]; private n = [0, 0]; private t0 = 0; private maxQ = 0; private sat = [false, false];
  private shield = new Map<number, Car>(); // per lane, the first car that is standing to let a creeper through
  private letIn = new Set<Car>(); // creepers somebody is standing for right now
  private slowOn = new Set<number>(); // legs with slow or standing cars on the approach
  private nextIn: Car | null = null; // the creeper that has held longest at the edge of the road: next to cross in stages
  private owner = -1; // the street whose cars are finding their way across the road right now: one street at a time
  private events = { forced: 0, hardBrakes: 0, yields: 0, squeezes: 0, nearMisses: 0, blocked: 0 };

  constructor(readonly legs: Leg[], readonly mode: Mode, private seed = 7) {
    this.rand = rng(seed);
    this.released = legs.map(() => 0);
    this.mainLanes = Math.max(...legs.filter((l) => l.group === 0).map((l) => l.inLanes));
    // Junction size: room for the widest road, and enough for neighbouring legs not to overlap at skewed angles.
    const half = (l: Leg) => Math.max(l.inLanes, l.outLanes, 1) * LANE_W;
    let r = Math.max(9, ...legs.map((l) => half(l) + 3));
    const order = [...legs].sort((a, b) => Math.atan2(a.dir[1], a.dir[0]) - Math.atan2(b.dir[1], b.dir[0]));
    order.forEach((a, i) => {
      const b = order[(i + 1) % order.length];
      const theta = Math.acos(Math.max(-1, Math.min(1, dot(a.dir, b.dir))));
      if (theta > 0.5 && theta < Math.PI * 0.9) r = Math.max(r, (half(a) + half(b)) / (2 * Math.sin(theta / 2)) + 1);
    });
    this.boxR = Math.min(15, r); // a larger junction would take so long to cross that nobody could ever pull out
    // a leg leaves the square view further out when it runs diagonally
    this.edge = legs.map((l) => VIEW_R / Math.max(Math.abs(l.dir[0]), Math.abs(l.dir[1])) + CAR_LEN);
    this.next = legs.map((l) => (l.flow ? this.headway(l.flow) : Infinity));
    this.backlog = legs.map(() => []);

    // Two-phase signal. Green is shared in proportion to the busiest lane of each road (Webster-style);
    // yellow and all-red depend on speed and on how long the junction takes to clear.
    const y = [0, 1].map((g) => Math.max(0.05, ...legs.filter((l) => l.group === g && l.inLanes).map((l) => l.flow / l.inLanes / 1800)));
    this.yellow = Math.max(...legs.filter((l) => l.group === 0).map((l) => SPEED_BY_RANK[l.rank])) > 11 ? 4 : 3;
    this.allRed = Math.min(5, Math.max(2, (2 * this.boxR + CAR_LEN) / 7));
    const lost = 2 * (this.yellow + this.allRed);
    const cycle = Math.min(100, Math.max(60, (1.5 * lost + 5) / (1 - Math.min(0.85, y[0] + y[1]))));
    const g0 = Math.max(15, ((cycle - lost) * y[0]) / (y[0] + y[1]));
    this.green = [g0, Math.max(15, cycle - lost - g0)];
    this.cycle = this.green[0] + this.green[1] + lost;
  }

  private headway(flow: number) { return -Math.log(1 - this.rand()) * (3600 / flow); }

  light(group: 0 | 1): Light {
    if (this.mode === "today") return "green";
    const c = this.t % this.cycle, [g0, g1] = this.green;
    const start = group === 0 ? 0 : g0 + this.yellow + this.allRed;
    const g = group === 0 ? g0 : g1;
    if (c >= start && c < start + g) return "green";
    if (c >= start + g && c < start + g + this.yellow) return "yellow";
    return "red";
  }

  private yellowLeft(group: 0 | 1): number {
    const c = this.t % this.cycle, end = (group === 0 ? this.green[0] : this.green[0] + this.yellow + this.allRed + this.green[1]) + this.yellow;
    return end - c;
  }

  /** Centre of a lane at `dist` metres from the junction centre. Lane 0 is next to the centre line. */
  lanePoint(leg: Leg, lane: number, inbound: boolean, dist: number): Vec {
    const [dx, dy] = leg.dir;
    const off = (lane + 0.5) * LANE_W;
    // traffic keeps to the right: inbound cars head towards the centre (-dir), outbound cars along dir
    const r: Vec = inbound ? [-dy, dx] : [dy, -dx];
    return [dx * dist + r[0] * off, dy * dist + r[1] * off];
  }

  private turnOf(i: number, exit: number): Turn {
    const h: Vec = [-this.legs[i].dir[0], -this.legs[i].dir[1]], e = this.legs[exit].dir;
    if (dot(h, e) > 0.7) return "straight";
    return cross(h, e) > 0 ? "left" : "right";
  }

  private pathFor(i: number, lane: number, exit: number, exitLane: number): Path {
    const key = `${i}:${lane}:${exit}:${exitLane}`;
    let p = this.paths.get(key);
    if (p) return p;
    const leg = this.legs[i], out = this.legs[exit];
    const p0 = this.lanePoint(leg, lane, true, this.boxR), p3 = this.lanePoint(out, exitLane, false, this.boxR);
    const h: Vec = [-leg.dir[0], -leg.dir[1]], e = out.dir;
    // cubic curve leaving p0 along the entry heading and reaching p3 along the exit heading: no kinks at either end
    const k = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) * 0.4;
    const p1: Vec = [p0[0] + h[0] * k, p0[1] + h[1] * k], p2: Vec = [p3[0] - e[0] * k, p3[1] - e[1] * k];
    const N = 40, pts: Vec[] = [], cum = [0];
    for (let j = 0; j <= N; j++) {
      const u = j / N, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
      pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
      if (j) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    }
    const len = cum[N], turn = this.turnOf(i, exit);
    // turning speed from the curve's radius (lateral acceleration ≈ 2 m/s²)
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(h, e))));
    const vMax = turn === "straight" ? Infinity : Math.max(3.5, Math.min(9, Math.sqrt(2 * (len / Math.max(angle, 0.3)))));
    p = { key, id: this.paths.size, leg: i, lane, exit, exitLane, pts, cum, len, turn, vMax };
    this.paths.set(key, p);
    return p;
  }

  /** Where cars on `a` and `b` could touch: centre lines closer than a car's width plus 0.4 m. Cached per pair. */
  private zone(a: Path, b: Path): Zone | null {
    if (a === b) return null;
    const key = a.id * 4096 + b.id;
    let z = this.zones.get(key);
    if (z === undefined) {
      const span = (p: Path, q: Path): [number, number] | null => {
        let lo = -1, hi = -1;
        p.pts.forEach((u, i) => { if (q.pts.some((w) => Math.hypot(u[0] - w[0], u[1] - w[1]) < 2.3)) { if (lo < 0) lo = i; hi = i; } });
        // the zone starts and ends somewhere between two samples
        return lo < 0 ? null : [(p.cum[Math.max(0, lo - 1)] + p.cum[lo]) / 2, (p.cum[Math.min(p.cum.length - 1, hi + 1)] + p.cum[hi]) / 2];
      };
      const sa = span(a, b), sb = span(b, a), merge = a.exit === b.exit && a.exitLane === b.exitLane;
      // fine samples of both centre lines: the hold positions of creepers are tuned to a few decimetres of this
      const fine = (p: Path) => p.pts.flatMap((u, i): [number, number, number][] => {
        const w = p.pts[i + 1];
        return w ? [0, 1, 2, 3].map((k) => [u[0] + ((w[0] - u[0]) * k) / 4, u[1] + ((w[1] - u[1]) * k) / 4, p.cum[i] + ((p.cum[i + 1] - p.cum[i]) * k) / 4]) : [[u[0], u[1], p.cum[i]]];
      });
      const fb = sa && sb ? fine(b).filter((w) => w[2] > sb[0] - 1 && w[2] < sb[1] + 1) : [];
      const reach: [number, number, number][] = [];
      if (fb.length) for (const u of fine(a)) {
        if (u[2] < sa![0] - 1 || u[2] > sa![1] + 1) continue;
        let lo = Infinity, hi = -Infinity;
        for (const w of fb) if (Math.hypot(u[0] - w[0], u[1] - w[1]) < TOUCH) { lo = Math.min(lo, w[2]); hi = Math.max(hi, w[2]); }
        if (lo <= hi) reach.push([u[2], lo, hi]);
      }
      z = sa && sb ? { in: sa[0], out: merge ? a.len : sa[1], oIn: sb[0], oOut: merge ? b.len : sb[1], merge, reach } : null;
      this.zones.set(key, z);
    }
    return z;
  }

  /** For a path that has to give way: where it meets the main road, and the lanes that cars still out of view will use. */
  private stage(p: Path): Stage {
    if (p.stage) return p.stage;
    const st: Stage = { first: Infinity, last: -Infinity };
    this.legs.forEach((l, i) => {
      if (i === p.leg || !l.inLanes) return;
      // The car holds clear of every path it will meet, not only of the main road's through lanes: a nose left in the
      // way of a car that is already finding its way across (one turning into this very street, say) locks the junction.
      // Holding at the edge of the first through lane instead was tried with the denser traffic, and did lock it.
      this.legs.forEach((out, k) => {
        if (k === i || !out.outLanes) return;
        const turn = this.turnOf(i, k);
        const z = this.zone(p, turn === "left" ? this.pathFor(i, 0, k, 0) : this.pathFor(i, l.inLanes - 1, k, out.outLanes - 1));
        if (z && !z.merge) st.first = Math.min(st.first, z.in);
      });
      if (l.group !== 0) return;
      const on = this.legs.findIndex((e, k) => k !== i && e.outLanes && this.turnOf(i, k) === "straight");
      if (on < 0) return;
      for (let k = 0; k < Math.min(l.inLanes, this.legs[on].outLanes); k++) {
        const z = this.zone(p, this.pathFor(i, k, on, k));
        if (!z) continue;
        st.first = Math.min(st.first, z.in); st.last = Math.max(st.last, z.merge ? z.in + CAR_LEN : z.out);
      }
    });
    return (p.stage = st);
  }

  /** Do two paths through the junction come close enough for cars on them to touch? */
  private conflict(a: Path, b: Path): boolean {
    if (a === b) return false;
    const key = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
    let hit = this.conflicts.get(key);
    if (hit === undefined) {
      hit = false;
      const near = a.turn === "straight" && b.turn === "straight" ? 2.1 : 2.6; // two through lanes may run close without touching
      for (const p of a.pts) { for (const q of b.pts) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < near) { hit = true; break; } if (hit) break; }
      this.conflicts.set(key, hit);
    }
    return hit;
  }

  private startS(i: number) { return this.boxR - this.edge[i]; }

  /** Put the oldest waiting arrival of leg `i` on the road if there is room at the edge of the view. */
  private release(i: number) {
    const leg = this.legs[i];
    const heading: Vec = [-leg.dir[0], -leg.dir[1]];
    // each driver has his own dice, seeded by his place in the arrivals: same person, same choices, in both views
    const dice = rng((this.seed * 9973 + i * 7919 + this.released[i] * 104729) | 0);
    // most cars carry straight on; fewer turn, and fewer still into a street quieter than their own
    const quiet = (l: Leg) => Math.min(1, FLOW_BY_RANK[l.rank] / FLOW_BY_RANK[leg.rank]);
    const opts = this.legs.map((l, k) => ({ k, w: k === i || !l.outLanes ? 0 : dot(heading, l.dir) > 0.7 ? 0.7 : dot(heading, l.dir) > -0.3 ? 0.15 * quiet(l) : 0.01 }));
    const total = opts.reduce((a, o) => a + o.w, 0);
    if (!total) { this.backlog[i].shift(); return; }
    let pick = dice() * total, exit = opts[0].k;
    for (const o of opts) { pick -= o.w; if (pick <= 0) { exit = o.k; break; } }
    const out = this.legs[exit], turn = this.turnOf(i, exit);
    // turn from the proper lane: left from the lane next to the centre line, right from the kerb lane
    const lanes = turn === "left" ? [0] : turn === "right" ? [leg.inLanes - 1]
      : Array.from({ length: Math.min(leg.inLanes, out.outLanes) }, (_, k) => k);
    const s0 = this.startS(i);
    let lane = -1, room = CAR_LEN + GAP_MAX + 1;
    for (const k of lanes) {
      let last = Infinity;
      for (const c of this.cars) if (c.leg === i && c.lane === k && c.s < 0) last = Math.min(last, c.s);
      if (last - s0 > room) { room = last - s0; lane = k; }
    }
    if (lane < 0) return; // queue reaches the edge of the view: the car keeps waiting outside
    this.released[i]++;
    const exitLane = turn === "left" ? 0 : turn === "right" ? out.outLanes - 1 : Math.min(lane, out.outLanes - 1);
    const path = this.pathFor(i, lane, exit, exitLane);
    const moto = dice() < PARE.motoShare;
    const agg = dice(), v0 = 0.88 + 0.24 * dice(), acc = moto ? 2.5 : 1.7 + 0.8 * dice(), react = 0.4 + 0.9 * dice(), gap = (moto ? 0.5 : 1) * (GAP_MIN + (GAP_MAX - GAP_MIN) * dice());
    const stopper = dice() < PARE.fullStopShare, noSlow = !stopper && dice() < PARE.noSlowShare / (1 - PARE.fullStopShare);
    const forcer = dice() < (moto ? PARE.motoForcerShare : PARE.forcerShare);
    const bell = Math.sqrt(-2 * Math.log(1 - dice())) * Math.cos(2 * Math.PI * dice()); // standard normal
    const mean = (turn === "left" && this.legs.length === 3 ? PARE.gap.leftT : PARE.gap[turn]) + PARE.gapPerLane * (this.mainLanes - 1);
    const need = forcer ? (moto ? PARE.motoForcer : PARE.gapForcer) + 0.15 * Math.max(-1.5, Math.min(1.5, bell))
      : moto ? Math.max(PARE.motoForcer, PARE.motoGap + PARE.motoGapSd * bell) : Math.max(PARE.gapFloor, mean + PARE.gapSd * bell);
    const vRoad = SPEED_BY_RANK[leg.rank] * v0;
    const v = Math.min(vRoad, Math.sqrt(2 * BRAKE * Math.max(0, room - CAR_LEN - GAP_MAX)));
    this.cars.push({
      leg: i, lane, exit, exitLane, s: s0, v, box: path.len, path, tArr: this.backlog[i].shift()!,
      free: -s0 / vRoad + path.len / Math.min(SPEED_BY_RANK[out.rank] * v0, path.vMax),
      wait: 0, dwell: 0, committed: false, counted: false, forced: false, id: this.ids++,
      agg, v0, acc, react, gap, stopper, moto, noSlow, forcer, need, look: dice, idle: 0, hold: 0,
      rank: leg.group === 1 ? 2 : turn === "left" ? 1 : 0, lim: Infinity, ok: new Set(), yieldTo: null, yieldAt: 0, nextLook: 0,
      platoon: null, go: false, queued: false, inRoad: false, braking: false, surprised: new Set(), by: null, jam: 0, stand: 0, pass: null, gave: false, shocked: false, near: false,
    });
  }

  /** On yellow: would the car reach the line after the light turns red? Half a second to spare: cars slow down for their turn. */
  private lateForYellow(c: Car): boolean {
    return (HOLD - c.s) / Math.max(Math.min(c.v, c.path.vMax), 0.1) + 0.5 > this.yellowLeft(this.legs[c.leg].group);
  }

  /** On yellow: true for a car that will stop at the line (same test as in `mayEnter` and `step`). */
  private stopsForYellow(o: Car): boolean {
    const toLine = HOLD - o.s;
    return this.lateForYellow(o) && (o.v * o.v) / (2 * BRAKE_MAX) <= toLine + 0.5;
  }

  /**
   * Signal view: seconds until oncoming traffic of `c`'s own road reaches the junction. Only cars in view count: the
   * edge of the view is further away than the gap a left turn needs, and waiting for cars nobody can see reads as a bug.
   */
  private oncomingGap(c: Car, clearing: boolean): number {
    const group = this.legs[c.leg].group;
    let tta = Infinity;
    for (const o of this.cars) {
      if (o === c || o.committed || o.s >= 0 || this.legs[o.leg].group !== group || o.leg === c.leg || o.path.turn === "left") continue;
      if (clearing && this.stopsForYellow(o)) continue; // the light is changing and this one will stop
      if (!this.conflict(c.path, o.path)) continue;
      tta = Math.min(tta, this.travel(o, -o.s + 0.4 * o.box)); // time until it reaches the middle of the junction, pulling away if it is slow now
    }
    return tta;
  }

  /** Signal view: may the first car of a lane go past the stop line now? */
  private mayEnter(c: Car): boolean {
    const g = this.legs[c.leg].group, l = this.light(g);
    // A driver who has waited at the line to turn left and found no gap goes as the light turns red, once the oncoming
    // cars have stopped: it is what the all-red second is for, and otherwise he could stand there cycle after cycle.
    const late = c.path.turn === "left" && c.dwell > 0 && l === "red" && -this.yellowLeft(g) > 0 && -this.yellowLeft(g) <= 1.5;
    if (l === "red" && !late) return false;
    // yellow: carry on only if the car reaches the line before red; otherwise stop
    if (l === "yellow" && this.lateForYellow(c)) return false;
    // never drive into the path of a car that is already crossing
    for (const o of this.cars) {
      if (o === c || !o.committed || o.s > o.box + CAR_LEN) continue;
      if (o.leg === c.leg && o.lane === c.lane) continue; // the car ahead in my own lane: handled by car-following
      if (!this.conflict(c.path, o.path)) continue;
      const z = this.zone(c.path, o.path);
      if (!z || z.merge || o.s - CAR_LEN / 2 < z.oOut + 1) return false; // once its tail is past the spot where we meet, it is gone
    }
    // two cars heading for the same spot at the same moment: the one that gets there first goes first
    const eta = (x: Car) => (HOLD - x.s) / Math.max(x.v, 1);
    for (const o of this.cars) {
      if (o === c || o.committed || (o.leg === c.leg && o.lane === c.lane) || eta(o) > 3 || !this.conflict(c.path, o.path)) continue;
      const og = this.legs[o.leg].group;
      if (this.light(og) === "red") continue;
      if (og === g && o.path.turn === "left" && c.path.turn !== "left") continue; // the left-turner waits for me
      if (eta(o) < eta(c) - 0.01 || (Math.abs(eta(o) - eta(c)) <= 0.01 && o.leg * 8 + o.lane < c.leg * 8 + c.lane)) return false;
    }
    // a left turn gives way to oncoming traffic of its own road. On yellow the oncoming flow is stopping, so a
    // driver already waiting to turn clears the junction, but only in front of cars that really stop: one that
    // runs the yellow still needs the full gap.
    if (c.path.turn === "left") {
      // long enough to get the tail out of the oncoming lanes from where he stands, and half a second to spare
      const far = 0.6 * c.box + CAR_LEN - c.s, vm = Math.max(c.v, Math.min(c.path.vMax, SPEED_BY_RANK[this.legs[c.exit].rank])), ramp = (vm * vm - c.v * c.v) / (2 * c.acc);
      const crossing = (far <= ramp ? (Math.sqrt(c.v * c.v + 2 * c.acc * far) - c.v) / c.acc : (vm - c.v) / c.acc + (far - ramp) / vm) + 0.5;
      if (this.oncomingGap(c, c.dwell > 0 && l !== "green") <= Math.max(3.5, crossing)) return false;
    }
    return true;
  }

  // ---------- today view: position-based give and take ----------
  // Every pair of paths has a conflict zone. A car body is an obstacle the others stop short of; nobody "reserves" the
  // junction. Who goes first when a zone is empty: main-road through traffic, then main-road left turns, then the side
  // street, except that a car already in the road finishes first, and a driver who has decided to let a creeper in
  // (yieldTo) waits for it and for whoever tails it. Cars that have to find their own way across (side street, main-road
  // left turns) hold at the edge of the first lane they meet, clear of every path, and leave it only when the whole way
  // across is theirs; one street at a time (`owner`). Without reversing, anything looser can lock the junction for good.

  /** `o` got in, or is getting in, by making somebody on the main road brake hard or give way. */
  private force(o: Car) {
    if (!o.forced && this.t >= this.t0) this.events.forced++;
    o.forced = true;
  }

  /** Is `o` standing, or about to stand, for `c` (or the car `c` tails, or behind a car that stands for it)? */
  private yieldsTo(o: Car, c: Car): boolean {
    const direct = (x: Car) => x.yieldTo !== null && (x.yieldTo === c || x.yieldTo === c.platoon);
    if (direct(o)) return true;
    const h = this.shield.get(o.leg * 8 + o.lane); // the car at the head of its lane already stands for c: those behind it cannot arrive
    return !!h && h !== o && h.s > o.s && direct(h);
  }

  /** ...or is `o` not coming anyway: standing to let somebody else in, or stuck behind somebody's body? */
  private lets(o: Car, c: Car): boolean {
    return this.yieldsTo(o, c) || (o.yieldTo !== null && o.v < 0.5) || o.jam > PARE.jamAfter;
  }

  private first(c: Car, o: Car, z: Zone): boolean {
    // every rule here must give opposite answers to the two cars: if both believed they went first, nothing but
    // their bumpers would stop them
    const y = this.yieldsTo(o, c), w = this.yieldsTo(c, o);
    if (y !== w) return y; // a promise comes before everything else
    const a = this.lets(o, c), b = this.lets(c, o);
    if (a !== b) return a;
    // a car whose way out is blocked by my body cannot go before I do
    const stuckOn = (x: Car, y: Car) => (x.by === y || x.pass === y) && x.v < 0.1;
    if (stuckOn(o, c) !== stuckOn(c, o)) return stuckOn(o, c);
    // deadlock breaker: whoever has stood longest in the middle of the junction is let out first, by everybody
    if (Math.max(c.stand, o.stand) > PARE.pushAfter && c.stand !== o.stand) return c.stand > o.stand;
    if (c.rank && o.rank && c.inRoad !== o.inRoad) return c.inRoad; // whoever already stands in the road gets out first, or nobody does
    // no starvation: among cars that have to find their own way across, one that has held long goes before the others
    if (c.rank && o.rank && c.leg !== o.leg && Math.max(c.hold, o.hold) > PARE.turnAfter && c.hold !== o.hold) return c.hold > o.hold;
    if (c.rank !== o.rank) return c.rank < o.rank;
    const cl = c.path.turn === "left", ol = o.path.turn === "left";
    if (cl !== ol) return ol;
    const ec = (z.in - c.s) / Math.max(c.v, 1), eo = (z.oIn - o.s) / Math.max(o.v, 1);
    return ec !== eo ? ec < eo : c.id < o.id;
  }

  /** Could `c` move a car's width forward without its body touching `o`'s? Exact rectangles, 0.25 m to spare. */
  private clear(c: Car, o: Car): boolean {
    const box = (x: Car, ds: number) => {
      const { p, h } = this.position(ds ? { ...x, s: x.s + ds } : x);
      return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]): Vec => [p[0] + h[0] * a * (CAR_LEN / 2 + 0.25) - h[1] * b * 1.2, p[1] + h[1] * a * (CAR_LEN / 2 + 0.25) + h[0] * b * 1.2]);
    };
    const B = box(o, 0);
    return [0.7, 1.4, 2.1].every((ds) => {
      const A = box(c, ds);
      // separating axis test
      return [A, B].some((P) => P.some((u, i) => {
        const w = P[(i + 1) % 4], ax: Vec = [w[1] - u[1], u[0] - w[0]];
        const a = A.map((q) => dot(q, ax)), b = B.map((q) => dot(q, ax));
        return Math.min(...a) > Math.max(...b) || Math.min(...b) > Math.max(...a);
      }));
    });
  }

  /** Seconds `c` needs to cover `d` metres from its current speed. */
  private travel(c: Car, d: number): number {
    const vc = Math.max(c.v, Math.min(c.path.vMax, SPEED_BY_RANK[this.legs[c.exit].rank] * c.v0)), ramp = (vc * vc - c.v * c.v) / (2 * c.acc);
    return d <= 0 ? 0 : d <= ramp ? (Math.sqrt(c.v * c.v + 2 * c.acc * d) - c.v) / c.acc : (vc - c.v) / c.acc + (d - ramp) / vc;
  }

  /** The gap this driver wants right now: his own critical gap, shorter for one stage, for a tailgater, and as patience runs out. */
  private needOf(c: Car): number {
    const floor = c.moto ? PARE.motoForcer : c.forcer ? PARE.gapForcer : PARE.gapFloor, [from, to] = PARE.impatience;
    if (c.platoon) return PARE.gapForcer;
    const need = c.inRoad ? c.need * (PARE.stageGap / PARE.gap.straight) : c.need;
    return Math.max(floor, need - (need - floor) * Math.min(1, Math.max(0, (c.hold - from) / (to - from))));
  }

  /** Book-keeping once per step: who stands in the road, who tails whom, which promises to yield are over. */
  private negotiate(order: Car[]) {
    this.nextIn = null;
    this.shield.clear(); this.slowOn.clear(); this.letIn.clear();
    let owned = false;
    const front = new Map<number, Car>(); // per lane, the car ahead that is not across yet (`order` runs front to back)
    for (const c of order) {
      const ahead = front.get(c.leg * 8 + c.lane);
      if (c.s < 0 && c.v < 2) this.slowOn.add(c.leg);
      c.queued = c.v < 1 && !!ahead && ahead.v < 1 && ahead.s - c.s < 12;
      if (c.s < c.box / 2) front.set(c.leg * 8 + c.lane, c);
      if (c.rank) {
        const st = this.stage(c.path), was = c.inRoad;
        c.inRoad = (c.go || c.s + CAR_LEN / 2 > st.first + PARE.noseMax + 0.3) && c.s - CAR_LEN / 2 < st.last;
        if (c.inRoad && c.leg === this.owner) owned = true;
        if (!c.inRoad && c.hold > 0 && c.hold > (this.nextIn?.hold ?? 0)) this.nextIn = c;
        if (c.inRoad && !was && !c.platoon) {
          // the cars right behind go through the same gap, bumper to bumper, instead of looking for their own
          let tail = c.s - CAR_LEN / 2, n = 0;
          for (const f of order) {
            if (f.leg !== c.leg || f.lane !== c.lane || f.s >= c.s || f.platoon) continue;
            if (n >= PARE.followMax || tail - f.s - CAR_LEN / 2 > PARE.followGap || f.look() >= PARE.followProb) break;
            f.platoon = c; tail = f.s - CAR_LEN / 2; n++;
          }
        }
      }
      if (c.yieldTo) {
        const y = c.yieldTo;
        let taken = false; // is anybody making use of it?
        const pending = c.s < c.box && this.cars.some((x) => {
          if (x !== y && x.platoon !== y) return false;
          const z = this.zone(c.path, x.path);
          if (!z || x.s - CAR_LEN / 2 >= (z.merge ? z.oIn + CAR_LEN : z.oOut) || x.s + CAR_LEN / 2 <= -6) return false; // (a follower still far up its street does not keep the offer alive)
          taken ||= x.v > 0.3;
          return true;
        });
        if (taken) c.yieldAt = this.t;
        // an offer nobody takes is withdrawn, and not repeated for a while: he drives on past the nose
        if (pending && this.t - c.yieldAt > PARE.yieldPatience) { c.yieldTo = null; c.nextLook = this.t + 2 * PARE.yieldPatience; continue; }
        if (!pending) { c.yieldTo = null; continue; }
        this.letIn.add(y);
        if (!this.shield.has(c.leg * 8 + c.lane)) this.shield.set(c.leg * 8 + c.lane, c); // `order` runs front to back
      }
    }
    if (!owned) this.owner = -1;
  }

  /** Today view: the speed `c` should aim for now, the braking that takes, and the car that causes it. */
  private pare(c: Car, dt: number): { target: number; need: number; cause: Car | null } {
    const leg = this.legs[c.leg], nose = c.s + CAR_LEN / 2, vIn = SPEED_BY_RANK[leg.rank] * c.v0;
    let target = c.s < 0 ? vIn : SPEED_BY_RANK[this.legs[c.exit].rank] * c.v0, need = 0, cause: Car | null = null, lim = Infinity, by: Car | null = null;
    if (c.s < c.box) target = Math.min(target, Math.sqrt(c.path.vMax ** 2 + 2 * BRAKE * Math.max(0, -c.s))); // the speed the turn allows
    const stopAt = (at: number, brake: number, who: Car | null) => {
      const space = at - nose;
      lim = Math.min(lim, at);
      target = Math.min(target, Math.sqrt(2 * brake * Math.max(0, space)));
      const n = c.v > 1 ? (c.v * c.v) / (2 * Math.max(space, 0.05)) : 0;
      if (n > need) { need = n; cause = who; }
    };
    const gapOk = (tO: number, z: Zone, o: Car | null) => {
      const tC = this.travel(c, (z.merge ? z.in + CAR_LEN + 6 : z.out + CAR_LEN / 2) - c.s) + PARE.clearSlack + (z.merge ? PARE.mergeExtra : 0);
      // once he has decided to go he only changes his mind if he would not make it
      const pass = tO > Math.max(tC, o && c.ok.has(o) ? 0 : this.needOf(c) + (z.merge ? PARE.mergeExtra : 0));
      if (o) { if (pass) c.ok.add(o); else c.ok.delete(o); }
      return pass;
    };

    // a car that has to find its own way across, and has not gone into the road yet
    const first = c.rank ? this.stage(c.path).first : 0;
    const outside = c.rank > 0 && nose <= first + PARE.noseMax + 0.3;
    let hold = Infinity, taken = false; // start of the first zone this driver may not enter yet; and whether somebody is in it
    for (const o of this.cars) {
      if (o === c) continue;
      const oNose = o.s + CAR_LEN / 2, oTail = o.s - CAR_LEN / 2;
      if (o.leg === c.leg && o.lane === c.lane) {
        // the car ahead in my lane, until our paths have parted
        if (o.s <= c.s) continue;
        const z = o.path === c.path || o.s < 0 ? null : this.zone(c.path, o.path);
        if (o.path === c.path || o.s < 0 || (z && oTail < z.oOut)) stopAt(oTail - c.gap, BRAKE, o);
        continue;
      }
      // far from the junction only the lane matters; so do cars that have left it, unless they are in my exit lane
      if ((c.s >= c.box || c.s < -30 || o.s >= o.box) && (o.exit !== c.exit || o.exitLane !== c.exitLane)) continue;
      const z = this.zone(c.path, o.path);
      if (!z) continue;
      const inside = nose > z.in + PARE.noseMax;
      // a creeper that is still waiting for its turn is not in the lane, however far its nose has crept: only its body counts
      const isIn = oNose > z.oIn + PARE.noseMax && (o.rank === 0 || oNose > this.stage(o.path).first + PARE.noseMax + 0.3);
      if (z.merge && isIn) {
        // it has joined my exit lane: follow it if it is ahead
        const ahead = o.s - o.box - (c.s - c.box);
        if (ahead > 0) stopAt(nose + ahead - CAR_LEN - c.gap, BRAKE, o);
        else if (!inside) stopAt(z.in - NOSE_BACK, BRAKE, o);
        continue;
      }
      if (oTail >= z.oOut) continue; // it has passed
      const mine = this.first(c, o, z), edge = z.in - NOSE_BACK;
      // a driver who stops for a car that is not moving out of his way does so before the junction if he still can:
      // standing in the middle of it he would be in somebody else's way
      const wait = nose < 0 ? Math.min(edge, 0) : edge;
      if (c.s < c.box && oNose > z.oIn - (mine ? 3 : 8)) {
        // Whatever anybody has decided, nobody drives into a car body: stop short of the first spot of my path that its
        // body covers, or is about to cover (seen from further ahead by the one who has to give way).
        const from = oTail + 0.3, to = oNose - 0.3 + (mine ? 0.5 * o.v : Math.max(2 * o.v, o.lim > oNose + 1 ? 4 : 0));
        let hit = z.reach.find((r) => r[0] > nose - 0.25 && r[1] < to && r[2] > from);
        if (hit && mine && o.inRoad) {
          // having to stop for a car that is stranded in the road, stop clear of its way out too, not nose to flank
          const out = z.reach.find((r) => r[0] > nose - 0.25 && r[2] > from)!;
          if (out[0] - 0.4 > nose - 0.3) hit = out;
        }
        if (!hit) { if (c.pass === o) c.pass = null; }
        else if (c.pass === o && this.clear(c, o)) target = Math.min(target, PARE.creepSpeed);
        else if (c.pass === o) { c.pass = null; stopAt(hit[0] - 0.4, BRAKE, o); by = o; }
        // stopped short of a standing car with more caution than the space asks for (or both did, nose to flank):
        // whoever really has room edges past
        else if (c.v < 0.05 && o.v < 0.05 && o.pass !== c && (o.by === c ? mine || !this.clear(o, c) : c.jam > PARE.jamAfter) && this.clear(c, o)) c.pass = o;
        else { stopAt(hit[0] - 0.4, BRAKE, o); by = o; }
      }
      if (inside || o.queued) continue; // I am already in; or it cannot come before the car it is queueing behind
      // A car stranded across the road, waiting for my stream: whoever can still stop before the junction does, and lets
      // it out. It is the only way it will ever leave, and a driver who goes in anyway ends up standing in the middle too.
      const keepClear = mine && c.rank === 0 && o.rank > 0 && o.inRoad && o.v < 1.5 && nose < 0 && (c.v * c.v) / (2 * Math.max(0.1, wait - nose)) <= PARE.yieldDecel;
      if (mine) {
        if (o.v < 0.1 && by !== o && o.by === c) {
          // it stands there because my body is in its way, and its own body is not in mine: I am the one who has to move
        } else if (isIn || (o.lim > z.oIn + PARE.noseMax + 0.1 && (o.rank === 0 ? oNose > z.oIn - 2.5 : o.inRoad && !o.go)) || keepClear) {
          // it is in my way, or on its way in (a car that is crossing the road will not stop for me any more). If it will
          // get out, arrive just after it; otherwise stop short of it
          if (keepClear && !c.ok.has(o)) { c.ok.add(o); this.force(o); if (this.t >= this.t0) this.events.yields++; }
          const T = o.v > 0.5 && o.lim >= z.oOut + CAR_LEN ? this.travel(o, z.oOut + CAR_LEN / 2 - o.s) : Infinity, d = edge - nose;
          if (T === Infinity || d <= 0) stopAt(wait, PARE.softBrake, o);
          else if (c.v * (T + PARE.caution) > d) {
            // he eases off as if it needed a second more than it does; what he is forced to do is measured on the real time
            lim = Math.min(lim, edge);
            target = Math.min(target, Math.max(Math.sqrt(2 * PARE.softBrake * d), d / (T + PARE.caution)));
            const t = T + 0.2, n = c.v * t > d ? Math.min((2 * (c.v * t - d)) / (t * t), (c.v * c.v) / (2 * d)) : 0;
            if (n > need) { need = n; cause = o; }
          }
        } else if (c.rank === 0 && o.rank && o.v < 1.5 && (oNose > z.oIn - 1.2 || o.hold > 0)) {
          // a creeper at the edge of my lane. Let it in, or squeeze past its nose
          const d = wait - nose;
          if (c.yieldTo && (c.yieldTo === o || c.yieldTo === o.platoon)) { stopAt(wait, PARE.softBrake, o); continue; }
          // (a driver makes the offer once: if nobody takes it he drives on, or the avenue would stand still for good)
          // He looks once at each creeper; again while crawling; and again when drivers in other lanes are stopping for it.
          if (!c.yieldTo && !c.gave && nose < 0 && (!c.ok.has(o) || ((c.v < 2 || this.letIn.has(o.platoon ?? o)) && this.t >= c.nextLook))) { // only while he can still stop clear of the junction
            c.ok.add(o); c.nextLook = this.t + 1;
            const depth = Math.min(1, Math.max(0, (oNose - z.oIn + NOSE_BACK) / (NOSE_BACK + PARE.noseMax)));
            if (d > 0 && (c.v * c.v) / (2 * d) <= PARE.yieldDecel && (c.look() < (this.letIn.has(o.platoon ?? o) ? PARE.yieldFollow : PARE.yieldToNose * depth + PARE.yieldSlow * (1 - c.v / vIn)))) {
              c.yieldTo = o.platoon ?? o; c.yieldAt = this.t; c.gave = true; this.force(o);
              if (this.t >= this.t0) this.events.yields++;
              stopAt(wait, PARE.softBrake, o);
              continue;
            }
            if (depth > 0.5 && this.t >= this.t0) this.events.squeezes++;
          }
          if (oNose > z.oIn - NOSE_BACK && d > 0) target = Math.min(target, Math.sqrt((PARE.squeezeFactor * vIn) ** 2 + 2 * PARE.softBrake * d));
        }
      } else if (c.rank > 0 && !outside) {
        // he is in the road and gets out of it: whoever comes has to brake. Stopping half way is what locks junctions
      } else if (oNose > z.oIn - NOSE_BACK || !gapOk(Math.max(0, z.oIn - oNose) / Math.max(o.v, 0.5 * SPEED_BY_RANK[this.legs[o.leg].rank]), z, o)) {
        hold = Math.min(hold, c.rank ? z.in : wait + NOSE_BACK); // it is in the zone or about to be, or the gap is not enough for this driver
        if (oNose > z.oIn - NOSE_BACK) taken = true;
      }
    }
    if (c.rank) {
      // no gridlock: cars from one street at a time find their way across, longest wait first
      // (a car already too close to stop is not asked to give its turn away: it would end up in the road all the same)
      const near = nose > first - 4 - (c.v * c.v) / (2 * BRAKE);
      // (nor is a car whose nose already stands in the way of the street whose turn it is: it cannot back out)
      const crowded = outside && (this.owner >= 0 ? this.owner !== c.leg && !this.cars.some((o) => o.leg === this.owner && o.by === c) : !near && this.nextIn !== null && this.nextIn.leg !== c.leg && this.nextIn.hold > Math.max(PARE.turnAfter, c.hold));
      if (crowded) { hold = Math.min(hold, first); taken = true; }
      // All or nothing: he leaves the edge of the road only when the whole way across is his, by gap or because they
      // let him. Crossing lane by lane and standing in between was tried and locked wide junctions for good.
      // (further back still if a car with priority is about to sweep past the mouth of his street)
      else if (outside && hold < Infinity) hold = Math.min(hold, first);
    }

    const line = -STOP_LINE - 0.6; // where the nose of a car stopped at the line is
    if (hold < Infinity) {
      // hold at the edge of that zone, pushing the nose in little by little
      const at = hold - NOSE_BACK + (NOSE_BACK + PARE.noseMax - 0.1) * Math.min(1, c.hold / PARE.noseTime);
      if (taken || (c.v * c.v) / (2 * BRAKE_MAX) <= hold + PARE.noseMax - nose) { // otherwise it is too late to stop: he goes, and they brake
        stopAt(Math.max(at, Math.min(nose, hold + PARE.noseMax - 0.05)), BRAKE, null);
        if (c.rank === 2 ? nose > line : at - nose < 3) {
          const [period, share] = PARE.creepPulse;
          target = Math.min(target, (this.t / period + c.agg) % 1 < share ? PARE.creepSpeed : 0); // little advances
        }
        if (at - nose < 1.5) c.hold += dt;
      }
    } else if (c.v > 1.5) c.hold = 0;
    if (c.rank === 2 && nose < line) {
      // the PARE sign: most roll over it; a few stop; some hardly slow down if they see nobody coming
      if (c.stopper && c.dwell < PARE.stopDwell) stopAt(line, BRAKE, null);
      else target = Math.min(target, Math.sqrt((hold === Infinity && (c.noSlow || c.platoon) ? PARE.noSlowSpeed : PARE.rollSpeed) ** 2 + 2 * BRAKE * (line - nose)));
    }
    c.lim = lim; c.by = by;
    // About to go into the road (claimed from as far back as he would need to stop, so that whoever comes second can
    // always still stop): the road is his street's from this very moment, within the step. Two cars never both decide.
    c.go = outside && hold === Infinity && nose > first - 4 - (c.v * c.v) / (2 * BRAKE);
    if (c.go) { this.owner = c.leg; c.inRoad = true; }
    // both fade rather than vanish when the car budges, or priorities would flip back and forth and nobody would go
    c.jam = by && c.v < 0.1 ? c.jam + dt : Math.max(0, c.jam - 3 * dt);
    c.stand = c.v < 0.1 && (c.inRoad || (c.rank === 0 && nose > 0 && c.s < c.box)) ? c.stand + dt : c.s < c.box ? Math.max(0, c.stand - 3 * dt) : 0;
    return { target, need, cause };
  }

  step(dt: number) {
    this.t += dt;
    this.legs.forEach((l, i) => {
      while (this.t >= this.next[i]) { this.backlog[i].push(this.next[i]); this.next[i] += Math.max(1.5 / l.inLanes, this.headway(l.flow)); } // 1.5 s apart in each lane, at least
      if (this.backlog[i].length) this.release(i);
      if (this.backlog[i].length >= 4 && this.t >= this.t0) this.sat[l.group] = true; // cars are queueing beyond the edge of the view
    });

    const today = this.mode === "today", order = [...this.cars].sort((a, b) => b.s - a.s);
    if (today) this.negotiate(order);
    const lead = new Map<string, Car>();
    const track = new Map<string, Car[]>(); // signal view: committed cars by exit lane, for following through the junction and beyond
    if (!today) for (const c of this.cars) if (c.committed) { const k = `${c.exit}:${c.exitLane}`; (track.get(k) ?? track.set(k, []).get(k)!).push(c); }
    let blocked = false;

    for (const c of order) {
      const leg = this.legs[c.leg], key = `${c.leg}:${c.lane}`, ahead = lead.get(key); // nearest car ahead in my lane that has not left the approach
      // a turning car stays the lane's leader until its tail has cleared the lane
      if (c.s < (c.path.turn === "straight" ? 8 : Math.min(c.box, 12))) lead.set(key, c);
      let target: number, brake = BRAKE_MAX;
      if (today) {
        const p = this.pare(c, dt), by = p.cause;
        target = p.target;
        // brake as hard as the situation asks for, not more; beyond BRAKE_MAX only to avoid a crash
        brake = p.need > BRAKE_MAX ? Math.min(PARE.emergency, p.need * 1.05) : Math.max(BRAKE, Math.min(BRAKE_MAX, p.need * 1.2));
        if (by && (by.rank > 0 || c.rank > 0) && c.v > 3 && this.t >= this.t0) { // at walking pace nothing is a near-miss
          if (p.need > BRAKE_MAX && !c.near) { c.near = true; this.events.nearMisses++; }
          if (c.rank === 0 && by.rank > 0 && p.need > PARE.hardBrake && c.s > -25 && !c.surprised.has(by)) { c.surprised.add(by); c.shocked = true; this.force(by); this.events.hardBrakes++; }
        }
        if (c.rank === 0 && c.v < 0.5 && (c.yieldTo || (by && by.rank > 0))) blocked = true;
      } else {
        let space = Infinity;
        // follow whoever is ahead on the way out (cars from other approaches merge into the same lane)
        for (const o of track.get(`${c.exit}:${c.exitLane}`) ?? []) {
          const gap = o.s - o.box - (c.s - c.box);
          if (o !== c && gap > 0) space = Math.min(space, gap - CAR_LEN - c.gap);
        }
        let v0 = SPEED_BY_RANK[this.legs[c.exit].rank] * c.v0;
        if (ahead) space = Math.min(space, ahead.s - c.s - CAR_LEN - c.gap); // also once committed: the car ahead may be turning off slowly
        if (!c.committed) {
          v0 = SPEED_BY_RANK[leg.rank] * c.v0;
          // first at the line decides whether to go. Stop at the line, unless that is no longer physically possible
          const toLine = HOLD - c.s;
          if ((!ahead || ahead.committed) && !this.mayEnter(c) && (c.v * c.v) / (2 * BRAKE_MAX) <= toLine + 0.5) space = Math.min(space, Math.max(0, toLine));
        }
        // slow down before the junction to the speed the turn allows
        if (c.s < c.box) v0 = Math.min(v0, Math.sqrt(c.path.vMax ** 2 + 2 * BRAKE * Math.max(0, -c.s)));
        target = Math.min(v0, Math.sqrt(2 * BRAKE * Math.max(0, space)));
      }
      // in a queue nobody moves off the instant the car ahead does
      if (c.v < 0.1 && target > 0.3 && ahead && ahead.s - c.s < 12) { c.idle += dt; if (c.idle < c.react) target = 0; } else if (c.v > 0.5) c.idle = 0;
      const v = Math.max(0, c.v - brake * dt, Math.min(c.v + c.acc * dt, target));
      c.braking = c.v - v > 1.2 * dt;
      c.v = v;
      c.s += c.v * dt;

      if (c.s < c.box && c.v < 1) c.wait += dt;
      if (!c.committed) {
        if (c.v < 0.05 && c.s > HOLD - 1.5 && (today || !ahead || ahead.committed)) c.dwell += dt;
        if (c.s > HOLD + 0.3) c.committed = true;
      }
      if (c.s >= c.box && !c.counted) {
        c.counted = true;
        if (this.t >= this.t0) { this.sum[leg.group] += Math.max(0, this.t - c.tArr - c.free); this.n[leg.group]++; }
      }
    }
    this.cars = this.cars.filter((c) => c.s - c.box < this.edge[c.exit] - this.boxR);
    if (this.t >= this.t0) {
      if (blocked) this.events.blocked += dt;
      let q = 0; // cars in view; beyond that it is "more than"
      this.legs.forEach((l, i) => { if (l.group === 1) { let n = 0; for (const c of this.cars) if (c.leg === i && c.s < c.box && c.v < 1) n++; q = Math.max(q, n); } });
      this.maxQ = Math.max(this.maxQ, q);
    }
  }

  /** Run ahead without drawing: `settle` seconds to fill the roads, then `measure` seconds so the figures start out stable. */
  warmUp(settle: number, measure: number) {
    for (let t = 0; t < settle; t += 0.1) this.step(0.1);
    this.t0 = this.t;
    for (let t = 0; t < measure; t += 0.1) this.step(0.1);
  }

  position(c: Car): { p: Vec; h: Vec } {
    const leg = this.legs[c.leg], out = this.legs[c.exit];
    if (c.s < 0) return { p: this.lanePoint(leg, c.lane, true, this.boxR - c.s), h: [-leg.dir[0], -leg.dir[1]] };
    const { pts, cum, len } = c.path;
    if (c.s >= len) { const e = pts[pts.length - 1]; return { p: [e[0] + out.dir[0] * (c.s - len), e[1] + out.dir[1] * (c.s - len)], h: out.dir }; }
    let j = 1;
    while (cum[j] < c.s) j++;
    const u = (c.s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1), a = pts[j - 1], b = pts[j];
    return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], h: norm([b[0] - a[0], b[1] - a[1]]) };
  }

  stats(): Stats {
    const hours = Math.max(1, this.t - this.t0) / 3600;
    return {
      waitMain: this.n[0] ? this.sum[0] / this.n[0] : 0,
      waitSide: this.n[1] ? this.sum[1] / this.n[1] : 0,
      queueSide: this.maxQ,
      saturatedMain: this.sat[0], saturatedSide: this.sat[1],
      forced: this.events.forced / hours, hardBrakes: this.events.hardBrakes / hours, yields: this.events.yields / hours, squeezes: this.events.squeezes / hours,
      nearMisses: this.events.nearMisses / hours, blocked: this.events.blocked / (hours * 3600),
    };
  }
}
