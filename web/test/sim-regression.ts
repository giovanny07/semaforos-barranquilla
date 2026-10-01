// Regression check for lib/sim.ts (the illustrative junction simulation): overlaps, stop position, red-light running,
// gridlock, bounded kinematics, and the forced-entry figures of the today view, on the first N simulable junctions of
// public/data. Exits non-zero on a regression. Run from web/ (`pnpm test` uses N = 10, about 6 s):
//   pnpm exec tsx --tsconfig tsconfig.json test/sim-regression.ts [maxJunctions] [streetNameFilter]
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { CAR_LEN, JunctionSim, STOP_LINE, legsFor, type Car } from "../lib/sim";

const streets = JSON.parse(readFileSync("public/data/streets.geojson", "utf8"));
const all = JSON.parse(readFileSync("public/data/intersections.geojson", "utf8")).features;
const ui = all.filter((f: any) => ["prioritario", "recomendado", "observacion"].includes(f.properties.priority) && /sem.foro vehicular/i.test(f.properties.recommendation ?? ""));
const max = Number(process.argv[2] ?? 60), only = process.argv[3];
const W = 1.9;

function corners(sim: JunctionSim, c: Car) {
  const { p, h } = sim.position(c), n = [-h[1], h[0]];
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [p[0] + h[0] * a * CAR_LEN / 2 + n[0] * b * W / 2, p[1] + h[1] * a * CAR_LEN / 2 + n[1] * b * W / 2]);
}
function overlap(A: number[][], B: number[][]) { // separating axis test, with 0.15 m tolerance
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const ax = [P[(i + 1) % 4][1] - P[i][1], P[i][0] - P[(i + 1) % 4][0]], l = Math.hypot(ax[0], ax[1]);
    const pr = (Q: number[][]) => Q.map((q) => (q[0] * ax[0] + q[1] * ax[1]) / l);
    const a = pr(A), b = pr(B);
    if (Math.min(...a) > Math.max(...b) - 0.15 || Math.min(...b) > Math.max(...a) - 0.15) return false;
  }
  return true;
}

// Two seeds, and the two step sizes the UI uses (×1 and ×4), one each: [seed, speed].
const RUNS = [[7, 1], [11, 4]] as const;
let sims = 0, skipped = 0;
const tot = { pairs: 0, overlapSec: 0, pastLine: 0, stops: 0, red: 0, maxDecel: [0, 0], maxAccel: 0, emergencies: 0, stuck: 0, broken: 0, lateRed: 0, sneaks: 0, hours: 0 };
const worst: string[] = [], grid: string[] = [];
const kinds: Record<string, number> = {};
const rows: string[] = [];
const busy = { n: 0, main: 0 }; // today view, junctions where a busy side street meets a busy main road
for (const f of ui.filter((f: any) => !only || `${f.properties.majorStreet} × ${f.properties.crossStreet}`.includes(only)).slice(0, max)) {
  const p = f.properties, [lng, lat] = f.geometry.coordinates;
  const legs = legsFor(streets, lng, lat, { names: p.streets, major: p.majorStreet });
  if (!legs) { skipped++; continue; }
  const name = `${p.majorStreet} × ${p.crossStreet}`;
  const row: string[] = [name.padEnd(44)];
  (["today", "signal"] as const).forEach((mode, m) => {
    for (const [seed, speed] of RUNS) {
      const sim = new JunctionSim(legs, mode, seed);
      sim.warmUp(120, 600);
      const seen = new Set<string>(); let ovSec = 0, past = 0, stops = 0, red = 0, maxDecel = 0, longestStand = 0, longestHead = 0;
      const prev = new Map<Car, { v: number; s: number }>(), wasCommitted = new Set<Car>();
      const standing = new Map<Car, number>(), atLine = new Map<Car, number>(); // s standing inside the junction; when a side-street car reached the line
      const dt = 0.011 * speed, T = 900, redSince = [Infinity, Infinity];
      for (let t = 0; t < T; t += dt) {
        sim.step(dt);
        for (const g of [0, 1] as const) { if (sim.light(g) !== "red") redSince[g] = Infinity; else if (redSince[g] === Infinity) redSince[g] = t; }
        for (const c of sim.cars) {
          const was = prev.get(c);
          if (was) {
            const a = (c.v - was.v) / dt;
            maxDecel = Math.max(maxDecel, -a); tot.maxAccel = Math.max(tot.maxAccel, a);
            if (-a > 4.6 && was.v - c.v > 0.01) tot.emergencies += dt;
            if (!Number.isFinite(c.v) || !Number.isFinite(c.s) || c.v < 0 || c.s < was.s - 1e-9) tot.broken++; // NaN, reversing
          }
          prev.set(c, { v: c.v, s: c.s });
          // entering on red: only a car that could no longer stop when the yellow ended may do it, so it must be early in the
          // red. Left-turners who waited the whole green clear on the all-red: counted apart
          if (c.committed && !wasCommitted.has(c)) { wasCommitted.add(c); if (mode === "signal" && sim.light(legs[c.leg].group) === "red") { red++; if (c.path.turn === "left" && c.dwell > 0) tot.sneaks++; else tot.lateRed = Math.max(tot.lateRed, t - redSince[legs[c.leg].group]); } }
          // gridlock: nobody may stand in the middle of the road for long (waiting at its edge for a gap is another matter),
          // and the first car of a side street must get through
          if ((c.inRoad || (c.rank === 0 && c.s > 0)) && c.s < c.box && c.v < 0.1) { const n = (standing.get(c) ?? 0) + dt; standing.set(c, n); longestStand = Math.max(longestStand, n); } else standing.delete(c);
          if (mode === "today" && legs[c.leg].group === 1) {
            if (c.s + CAR_LEN / 2 > -STOP_LINE - 2 && !atLine.has(c)) atLine.set(c, t);
            if (atLine.has(c) && c.s < c.box) longestHead = Math.max(longestHead, t - atLine.get(c)!);
          }
        }
        if (Math.round(t / dt) % Math.round(0.25 / dt) === 0) {
          const cs = sim.cars.map((c) => ({ c, k: corners(sim, c), p: sim.position(c).p }));
          for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
            if (Math.hypot(cs[i].p[0] - cs[j].p[0], cs[i].p[1] - cs[j].p[1]) > 6 || !overlap(cs[i].k, cs[j].k)) continue;
            const a = cs[i].c, b = cs[j].c; const kind = a.leg === b.leg && a.lane === b.lane ? "sameLane" : a.exit === b.exit && a.exitLane === b.exitLane ? "sameExitLane" : a.leg === b.leg ? "sameLegOtherLane" : legs[a.leg].group === legs[b.leg].group ? "sameRoadOtherLeg" : "mainVsSide";
            const where = a.s < 0 && b.s < 0 ? "approach" : a.s > a.box && b.s > b.box ? "exit" : "box"; kinds[`${mode}/${kind}/${where}`] = (kinds[`${mode}/${kind}/${where}`] ?? 0) + 0.25;
            ovSec += 0.25; seen.add(`${sims}:${i}:${j}:${Math.floor(t / 5)}`);
          }
          // the stop line binds where there is one to obey: at the signal. Today the side street rolls over its line on
          // purpose, and a main-road car that lets a creeper in stops at the creeper, not at a line that is not painted
          if (mode === "signal") for (const c of sim.cars) if (!c.committed && c.v < 0.05 && c.dwell > 0 && c.dwell < 0.3) { stops++; if (-c.s - CAR_LEN / 2 < STOP_LINE - 0.05) past++; }
        }
      }
      const st = sim.stats();
      // signal: a committed car must never stand still. Today: standing in the road is the behaviour, but it must end
      const stuck = mode === "signal" ? sim.cars.filter((c) => c.committed && c.v < 0.1).length : 0;
      // (a left-turner stranded for minutes in front of a saturated avenue is saturation, not a locked junction)
      if (longestStand > (st.saturatedMain || st.saturatedSide ? 400 : 90) || (longestHead > 300 && !st.saturatedSide)) grid.push(`${name} ${mode} seed ${seed}: stood ${longestStand.toFixed(0)} s in the junction, head of side street took ${longestHead.toFixed(0)} s`);
      tot.pairs += seen.size; tot.overlapSec += ovSec; tot.pastLine += past; tot.stops += stops; tot.red += red; tot.stuck += stuck;
      tot.maxDecel[m] = Math.max(tot.maxDecel[m], maxDecel); tot.hours += T / 3600; sims++;
      if (mode === "today" && Math.max(...legs.filter((l) => l.group === 0).map((l) => l.flow)) >= 700 && Math.max(...legs.filter((l) => l.group === 1).map((l) => l.flow)) >= 250) { busy.n++; busy.main += st.waitMain; }
      row.push(`${mode[0]}${seed} ov=${ovSec.toFixed(1)} side=${st.waitSide.toFixed(0)}${st.saturatedSide ? "+" : ""} main=${st.waitMain.toFixed(0)}${st.saturatedMain ? "+" : ""} q=${st.queueSide}`
        + (mode === "today" ? ` hard=${st.hardBrakes.toFixed(0)}/h yield=${st.yields.toFixed(0)}/h squeeze=${st.squeezes.toFixed(0)}/h near=${st.nearMisses.toFixed(0)}/h blocked=${(st.blocked * 100).toFixed(0)}% stand=${longestStand.toFixed(0)}s head=${longestHead.toFixed(0)}s` : ""));
      if (ovSec > 1) worst.push(`${name} ${mode} seed ${seed}: ${ovSec.toFixed(1)} s overlapping`);
    }
  });
  rows.push(row.join(" | "));
}
console.log(rows.join("\n"));
console.log(`\n${sims} runs over ${ui.length} UI junctions (${skipped} not simulable of first ${max})`);
console.log(`overlap: ${(tot.overlapSec / tot.hours).toFixed(2)} car-pair-seconds per simulated hour; events ${tot.pairs}`);
console.log(`signal: stops sampled ${tot.stops}, front bumper past the stop line: ${tot.pastLine}; committed on red: ${tot.red} (latest ${tot.lateRed.toFixed(2)} s into the red; plus ${tot.sneaks} waiting left-turners who cleared in the first 1.5 s of all-red, by design); committed cars standing still at end: ${tot.stuck}`);
console.log(`max deceleration today ${tot.maxDecel[0].toFixed(2)} / signal ${tot.maxDecel[1].toFixed(2)} m/s²; max acceleration ${tot.maxAccel.toFixed(2)}; car-seconds braking over 4.6: ${tot.emergencies.toFixed(1)}; NaN or reversing: ${tot.broken}`);
console.log(`today, busy junctions (${busy.n} runs): mean main-road delay ${(busy.main / Math.max(1, busy.n)).toFixed(1)} s`);
console.log(`gridlock: ${grid.length}\n${grid.slice(0, 12).join("\n")}`);
console.log(JSON.stringify(kinds));
console.log(worst.slice(0, 12).join("\n"));
const fail = tot.pastLine || tot.stuck || tot.broken || grid.length || tot.maxDecel[1] > 4.6 || tot.lateRed > 1 || tot.maxDecel[0] > 7.05 || tot.maxAccel > 2.55
  || tot.overlapSec / tot.hours > 0.5 || (busy.n > 4 && busy.main / busy.n < 0.5);
process.exit(fail ? 1 : 0);
