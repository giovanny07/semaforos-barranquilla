/**
 * Backtest: would the evaluation have flagged the junctions the city actually signalized?
 *
 *   pnpm backtest --variant v3 [--max-cost 0.2] [--dry-run] [--choose]
 *
 * Input: data/out/backtest-input.json (written by the pipeline):
 *   - "signalized": junctions confirmed by BOTH the official inventory and OSM, described AS IF their own signal
 *     did not exist (distance to the nearest OTHER signal; everything else identical)
 *   - "quiet": random sample of 400 unsignalized local × local junctions (expected answer: no signal)
 *   - "comparable": random sample of 300 unsignalized at-grade junctions on a collector or higher road. Not a
 *     false-alarm set (real candidates live here) but a selectivity check: a rule that flags most of them is useless.
 * Each item carries a fixed `half` (tune / holdout, by hash of the id). Question wording and thresholds are
 * chosen looking at the tune half only; the numbers to quote are the holdout ones.
 *
 * Output: data/out/backtest.json (metrics of the chosen variant) and scorer-jev/backtest-log.json (every variant tried).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ResultCache, cacheKey } from "./cache.ts";
import { toJevScore } from "./parse.ts";
import { estTokens, runJobs, usd, type Job } from "./runner.ts";
import { DEFAULT_MODEL, typesafeTransport } from "./transport.ts";
import type { JevScore, JunctionProps, SystemOneRequest } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const JEV_DIR = resolve(HERE, "..");
const ROOT = resolve(JEV_DIR, "..");

const { values: flags } = parseArgs({
  options: {
    variant: { type: "string", default: "final" },
    input: { type: "string", default: resolve(ROOT, "data/out/backtest-input.json") },
    output: { type: "string", default: resolve(ROOT, "data/out/backtest.json") },
    log: { type: "string", default: resolve(JEV_DIR, "backtest-log.json") },
    cache: { type: "string", default: resolve(JEV_DIR, "cache/results.jsonl") },
    "max-cost": { type: "string", default: "0.25" },
    concurrency: { type: "string", default: "8" },
    "dry-run": { type: "boolean", default: false },
    /** write data/out/backtest.json from this variant (otherwise only the log is updated) */
    choose: { type: "boolean", default: false },
    /** with --choose: "main" = the evaluation used for the tiers, "blind" = crash-blind second opinion (agreement only) */
    role: { type: "string", default: "main" },
    note: { type: "string", default: "" },
  },
});

for (const f of [resolve(JEV_DIR, ".env"), resolve(ROOT, ".env")]) if (existsSync(f)) process.loadEnvFile(f);

type Variant = { QUESTIONS: SystemOneRequest["questions"]; QUESTION_HASH: string; buildState: (p: JunctionProps) => Record<string, unknown>; stateHash: (s: unknown) => string };
type Item = { id: string; set: "signalized" | "quiet" | "comparable" | "osm_only"; half: "tune" | "holdout"; lat: number; lon: number; props: JunctionProps };

const THRESHOLDS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
/**
 * Threshold rule, applied to the TUNE half only (fixed before looking at the holdout half):
 *  1. lowest threshold at which NO quiet local × local junction of the tune half is flagged;
 *  2. among thresholds at or above it, the one that maximises (recall on signalized − share flagged among
 *     comparable unsignalized junctions), i.e. keeps recall while staying selective.
 */
const THRESHOLD_RULE = "tune half: lowest threshold with 0 quiet junctions flagged, then max(recall − flagged share of comparable unsignalized junctions)";
const SIGNAL_CONTROLS = new Set(["semáforo vehicular", "semáforo peatonal"]);
const pct = (n: number, d: number) => (d ? +((100 * n) / d).toFixed(1) : 0);

function metrics(rows: Array<{ item: Item; s: JevScore }>) {
  const n = rows.length;
  const controls: Record<string, number> = {};
  for (const r of rows) controls[r.s.control] = (controls[r.s.control] ?? 0) + 1;
  return {
    n,
    needAltaOrCritica: pct(rows.filter((r) => r.s.needLevel === "alta" || r.s.needLevel === "crítica").length, n),
    needMediaOrMore: pct(rows.filter((r) => ["media", "alta", "crítica"].includes(r.s.needLevel)).length, n),
    warrantGe: Object.fromEntries(THRESHOLDS.map((t) => [t.toFixed(1), pct(rows.filter((r) => r.s.warrantProb >= t).length, n)])),
    /** the rule used for the tiers: control is a signal AND warrantProb ≥ t */
    signalAndWarrantGe: Object.fromEntries(THRESHOLDS.map((t) => [t.toFixed(1), pct(rows.filter((r) => SIGNAL_CONTROLS.has(r.s.control) && r.s.warrantProb >= t).length, n)])),
    controlSignal: pct(rows.filter((r) => SIGNAL_CONTROLS.has(r.s.control)).length, n),
    controls: Object.fromEntries(Object.entries(controls).map(([k, v]) => [k, pct(v, n)])),
    meanWarrantProb: +(rows.reduce((a, r) => a + r.s.warrantProb, 0) / Math.max(1, n)).toFixed(3),
  };
}

/** Probability that a random signalized junction gets a higher warrantProb than a random quiet one. */
function auc(pos: number[], neg: number[]) {
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return +(wins / Math.max(1, pos.length * neg.length)).toFixed(3);
}

async function main() {
  const variant = (await import(flags.variant === "final" ? "./questions.ts" : `./variants/${flags.variant}.ts`)) as Variant;
  const input = JSON.parse(readFileSync(flags.input!, "utf8")) as { items: Item[] };
  const transport = typesafeTransport({ apiKey: process.env.TYPESAFE_API_KEY?.trim() || undefined, model: process.env.JEV_MODEL?.trim() || DEFAULT_MODEL.typesafe });
  const cache = new ResultCache(flags.cache!);

  const jobs: Array<Job & { item: Item }> = input.items.map((item) => {
    const state = variant.buildState({ ...item.props, id: item.id, hasSignal: false });
    const req: SystemOneRequest = { state, model: transport.model, questions: variant.QUESTIONS };
    return { item, id: item.id, questionHash: variant.QUESTION_HASH, req, key: cacheKey(item.id, variant.QUESTION_HASH, variant.stateHash(state)) };
  });
  const todo = jobs.filter((j) => !cache.get(j.key));
  const worst = usd(todo.reduce((s, j) => s + estTokens(j.req, 3), 0));
  console.log(`variant ${flags.variant} (question hash ${variant.QUESTION_HASH}): ${jobs.length} items, ${todo.length} to request, pessimistic cost $${worst.toFixed(4)}`);
  if (flags["dry-run"]) {
    console.log(JSON.stringify(jobs.find((j) => j.item.set === "signalized")!.req.state, null, 2));
    return;
  }
  if (todo.length && !process.env.TYPESAFE_API_KEY?.trim()) {
    console.log(`No TYPESAFE_API_KEY set: skipping ${todo.length} paid requests. Nothing was sent and no file was changed.`);
    return;
  }
  if (worst > Number(flags["max-cost"])) { console.error(`exceeds --max-cost ${flags["max-cost"]}; aborting`); process.exit(3); }
  const stats = await runJobs(todo, transport, cache, { concurrency: Number(flags.concurrency), retries: 5, validate: (r) => void toJevScore(r), spendLog: resolve(JEV_DIR, "cache/spend.jsonl"), label: `backtest ${flags.variant}` });
  if (stats.fatal) { console.error(`ABORTED: ${(stats.fatal as Error).message}`); process.exit(1); }

  const rows = jobs.flatMap((j) => { const e = cache.get(j.key); return e ? [{ item: j.item, s: toJevScore(e.response) }] : []; });
  const sel = (set: Item["set"], half?: Item["half"]) => rows.filter((r) => r.item.set === set && (!half || r.item.half === half));
  const roc = (half: Item["half"]) => THRESHOLDS.map((t) => {
    const S = sel("signalized", half), Q = sel("quiet", half), C = sel("comparable", half);
    const hit = (r: { s: JevScore }) => SIGNAL_CONTROLS.has(r.s.control) && r.s.warrantProb >= t;
    return { threshold: t, recallSignalized: pct(S.filter(hit).length, S.length), falseAlarmQuiet: pct(Q.filter(hit).length, Q.length), flaggedComparable: pct(C.filter(hit).length, C.length), recallWarrantOnly: pct(S.filter((r) => r.s.warrantProb >= t).length, S.length), falseAlarmWarrantOnly: pct(Q.filter((r) => r.s.warrantProb >= t).length, Q.length) };
  });
  const byClass: Record<string, { n: number; hit50: number }> = {};
  for (const r of sel("signalized", "tune")) {
    const k = `${(r.item.props as any).majorClass}×${(r.item.props as any).crossClass}`;
    const b = (byClass[k] ??= { n: 0, hit50: 0 });
    b.n++;
    if (SIGNAL_CONTROLS.has(r.s.control) && r.s.warrantProb >= 0.5) b.hit50++;
  }
  const result = {
    variant: flags.variant,
    note: flags.note,
    questionHash: variant.QUESTION_HASH,
    model: transport.model,
    at: new Date().toISOString(),
    scored: rows.length,
    missing: jobs.length - rows.length,
    tune: { signalized: metrics(sel("signalized", "tune")), quiet: metrics(sel("quiet", "tune")), comparable: metrics(sel("comparable", "tune")), roc: roc("tune"), auc: auc(sel("signalized", "tune").map((r) => r.s.warrantProb), sel("quiet", "tune").map((r) => r.s.warrantProb)) },
    holdout: { signalized: metrics(sel("signalized", "holdout")), quiet: metrics(sel("quiet", "holdout")), comparable: metrics(sel("comparable", "holdout")), osmOnlySignalized: metrics(sel("osm_only", "holdout")), roc: roc("holdout"), auc: auc(sel("signalized", "holdout").map((r) => r.s.warrantProb), sel("quiet", "holdout").map((r) => r.s.warrantProb)) },
    signalizedByClassPair: Object.fromEntries(Object.entries(byClass).sort((a, b) => b[1].n - a[1].n)),
    perJunction: rows.map((r) => ({ id: r.item.id, set: r.item.set, half: r.item.half, ...r.s })),
  };

  const log = existsSync(flags.log!) ? (JSON.parse(readFileSync(flags.log!, "utf8")) as any[]) : [];
  const { perJunction: _drop, ...slim } = result;
  const i = log.findIndex((e) => e.questionHash === result.questionHash && e.variant === result.variant);
  if (i >= 0) log[i] = slim; else log.push(slim);
  writeFileSync(flags.log!, JSON.stringify(log, null, 1));

  const show = (h: "tune" | "holdout") => {
    const m = result[h];
    console.log(`\n[${h}] signalized n=${m.signalized.n}: alta/crítica ${m.signalized.needAltaOrCritica}% · control=semáforo ${m.signalized.controlSignal}% · AUC(warrant) ${m.auc}`);
    console.log(`[${h}] quiet      n=${m.quiet.n}: alta/crítica ${m.quiet.needAltaOrCritica}% · control=semáforo ${m.quiet.controlSignal}%`);
    console.table(m.roc);
    console.log("controls signalized:", m.signalized.controls, "\ncontrols quiet:", m.quiet.controls);
  };
  show("tune");
  if (flags.choose) show("holdout");
  console.log("\nsignalized by class pair (hit = signal control & warrant ≥ 0.5):", JSON.stringify(result.signalizedByClassPair));

  if (flags.choose) {
    const zero = result.tune.roc.filter((r) => r.falseAlarmQuiet === 0);
    const best = [...zero].sort((a, b) => b.recallSignalized - b.flaggedComparable - (a.recallSignalized - a.flaggedComparable) || a.threshold - b.threshold)[0];
    if (!best) throw new Error("no threshold with zero quiet false alarms on the tune half");
    const t = best.threshold;
    const at = (h: "tune" | "holdout") => result[h].roc.find((r) => r.threshold === t)!;
    const chosen = {
      variant: flags.variant, questionHash: result.questionHash, warrantProb: t, rule: THRESHOLD_RULE,
      tune: at("tune"), holdout: at("holdout"),
    };
    const file = existsSync(flags.output!) ? JSON.parse(readFileSync(flags.output!, "utf8")) : {};
    const role = flags.role === "blind" ? "blind" : "main";
    file[role] = result;
    if (role === "main") file.chosen = chosen; else file.chosenBlind = chosen;
    const H = result.holdout;
    const block = {
      variant: flags.variant, model: result.model, threshold: t, thresholdRule: THRESHOLD_RULE,
      design: "Cruces semaforizados confirmados por inventario oficial 2023 y OSM, descritos como si su propio semáforo no existiera; mitad de ajuste / mitad de verificación (holdout) fijadas por hash del id",
      holdout: {
        signalizedN: H.signalized.n, quietN: H.quiet.n, comparableN: H.comparable.n,
        recallPct: at("holdout").recallSignalized, falseAlarmQuietPct: at("holdout").falseAlarmQuiet, flaggedComparablePct: at("holdout").flaggedComparable,
        needAltaOrCriticaPct: H.signalized.needAltaOrCritica, needAltaOrCriticaQuietPct: H.quiet.needAltaOrCritica,
        warrantGe05Pct: H.signalized.warrantGe["0.5"], warrantGe06Pct: H.signalized.warrantGe["0.6"],
        osmOnlySignalizedN: H.osmOnlySignalized.n,
        osmOnlySignalizedRecallPct: (H.osmOnlySignalized.signalAndWarrantGe as Record<string, number>)[t.toFixed(1)],
        controls: H.signalized.controls, controlsQuiet: H.quiet.controls, auc: H.auc, roc: H.roc,
      },
      tune: { signalizedN: result.tune.signalized.n, recallPct: at("tune").recallSignalized, falseAlarmQuietPct: at("tune").falseAlarmQuiet, flaggedComparablePct: at("tune").flaggedComparable },
    };
    file.summary = { ...(file.summary ?? {}), [role]: block, variantsTried: log.map((e) => ({ variant: e.variant, note: e.note, tuneRecallAt05: e.tune.roc.find((r: any) => r.threshold === 0.5)?.recallSignalized, tuneFalseAlarmQuietAt05: e.tune.roc.find((r: any) => r.threshold === 0.5)?.falseAlarmQuiet, tuneAuc: e.tune.auc })) };
    writeFileSync(flags.output!, JSON.stringify(file, null, 1));
    console.log(`\nchosen threshold (${role}): warrantProb ≥ ${t}  → holdout recall ${block.holdout.recallPct}% · quiet false alarms ${block.holdout.falseAlarmQuietPct}% · comparable flagged ${block.holdout.flaggedComparablePct}%`);
    console.log(`wrote ${flags.output}`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
