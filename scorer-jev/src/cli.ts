import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ResultCache, cacheKey } from "./cache.ts";
import { toJevScore } from "./parse.ts";
import * as FINAL from "./questions.ts";
import * as NO_CRASH from "./variants/v3nc.ts";
import { USD_PER_MTOK, estTokens, runJobs, usd } from "./runner.ts";
import { DEFAULT_MODEL, gatewayTransport, typesafeTransport, type Route, type Transport } from "./transport.ts";
import type { JevScore, Junction, JunctionProps, SystemOneRequest } from "./types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const JEV_DIR = resolve(HERE, "..");
const ROOT = resolve(JEV_DIR, "..");

const { values: flags } = parseArgs({
  options: {
    input: { type: "string", default: resolve(ROOT, "data/out/intersections.geojson") },
    /** crash fields per junction (CC BY-SA file written by the pipeline), joined into the input by id */
    crashes: { type: "string", default: resolve(ROOT, "data/out/crashes-by-intersection.json") },
    output: { type: "string", default: resolve(ROOT, "data/out/jev-scores.json") },
    cache: { type: "string", default: resolve(JEV_DIR, "cache/results.jsonl") },
    "min-score": { type: "string", default: "0" },
    /** "final" = questions.ts (crash-aware state). "nocrash" = same questions with the crash records withheld: an
     *  independent second opinion used only for the `agreement` field. */
    variant: { type: "string", default: "final" },
    /** only junctions whose main road is a collector or higher (used for the nocrash pass) */
    "collector-only": { type: "boolean", default: false },
    limit: { type: "string" },
    concurrency: { type: "string", default: "6" },
    retries: { type: "string", default: "5" },
    route: { type: "string", default: process.env.JEV_ROUTE ?? "auto" },
    model: { type: "string" },
    "max-cost": { type: "string", default: "5" },
    "dry-run": { type: "boolean", default: false },
    id: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (flags.help) {
  console.log(`Usage: pnpm score [--dry-run] [--limit N] [--min-score 25] [--concurrency 6] [--retries 5]
                  [--route auto|typesafe|gateway] [--model ID] [--max-cost 5] [--id INTERSECTION_ID]
                  [--input path] [--crashes path] [--output path] [--cache path]
Without an API key nothing is sent: --dry-run shows the requests, and a normal run exits without changes
unless every junction is already in the local cache.`);
  process.exit(0);
}

for (const f of [resolve(JEV_DIR, ".env"), resolve(ROOT, ".env")]) {
  if (existsSync(f)) process.loadEnvFile(f); // does not override variables already set
}

function loadJunctions(file: string, crashFile: string): Junction[] {
  const fc = JSON.parse(readFileSync(file, "utf8")) as {
    features: { geometry: { coordinates: [number, number] }; properties: JunctionProps }[];
  };
  // The pipeline publishes the crash fields in their own file (Alcaldía data, CC BY-SA 4.0). Join them back so the
  // model state, and therefore the cache keys, are the same as when they lived inside intersections.geojson.
  const crashes = existsSync(crashFile) ? (JSON.parse(readFileSync(crashFile, "utf8")) as Record<string, Partial<JunctionProps>>) : {};
  return fc.features.map((f) => ({
    props: { ...f.properties, ...crashes[String(f.properties.id)], id: String(f.properties.id) },
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

const hasKey = (route: Route) => !!(route === "typesafe" ? process.env.TYPESAFE_API_KEY : process.env.AI_GATEWAY_API_KEY)?.trim();

function pickTransport(): Transport {
  const tsKey = process.env.TYPESAFE_API_KEY?.trim() || undefined;
  const gwKey = process.env.AI_GATEWAY_API_KEY?.trim() || undefined;
  let route = flags.route as Route | "auto";
  if (route === "auto") route = tsKey ? "typesafe" : gwKey ? "gateway" : "typesafe";
  const model = flags.model ?? (process.env.JEV_MODEL?.trim() || undefined) ?? DEFAULT_MODEL[route];
  if (route === "gateway") return gatewayTransport({ apiKey: gwKey, model });
  if (route === "typesafe") return typesafeTransport({ apiKey: tsKey, baseURL: process.env.TYPESAFE_BASE_URL, model });
  throw new Error(`Unknown --route ${String(route)}`);
}

const V = flags.variant === "nocrash" ? NO_CRASH : FINAL;
const { QUESTIONS, QUESTION_HASH, buildState, stateHash } = V;
if (flags.variant === "nocrash" && flags.output === resolve(ROOT, "data/out/jev-scores.json")) flags.output = resolve(ROOT, "data/out/jev-scores-nocrash.json");
const COLLECTOR = new Set(["trunk", "primary", "secondary", "tertiary"]);

async function main() {
  const input = flags.input!;
  if (!existsSync(input)) {
    console.error(`Input not found: ${input}\nRun \`pnpm data\` first, or pass --input scorer-jev/fixtures/intersections.sample.geojson`);
    process.exit(2);
  }
  const minScore = Number(flags["min-score"]);
  const all = loadJunctions(input, flags.crashes!);
  let selected = all
    .filter((j) => !j.props.hasSignal && !j.props.coveredBy && j.props.heuristicScore != null && j.props.heuristicScore >= minScore)
    .filter((j) => !flags["collector-only"] || COLLECTOR.has(j.props.majorClass ?? j.props.maxClass))
    .sort((a, b) => b.props.heuristicScore! - a.props.heuristicScore! || a.props.id.localeCompare(b.props.id));
  if (flags.id) selected = all.filter((j) => j.props.id === flags.id);
  const eligible = selected.length;
  if (flags.limit) selected = selected.slice(0, Number(flags.limit));

  const transport = pickTransport();
  const cache = new ResultCache(flags.cache!);
  const jobs = selected.map((j) => {
    const state = buildState(j.props);
    const req: SystemOneRequest = { state, model: transport.model, questions: QUESTIONS };
    return { j, req, key: cacheKey(j.props.id, QUESTION_HASH, stateHash(state)) };
  });
  const todo = jobs.filter((x) => !cache.get(x.key));

  const tok4 = todo.reduce((s, x) => s + estTokens(x.req, 4), 0);
  const tok3 = todo.reduce((s, x) => s + estTokens(x.req, 3), 0);

  console.log(`Input: ${input}`);
  console.log(`Junctions: ${all.length} total, ${eligible} unsignalized with heuristicScore >= ${minScore}` +
    (flags.limit ? `, limited to ${selected.length}` : ""));
  console.log(`Route: ${transport.route}  model: ${transport.model}  question hash: ${QUESTION_HASH}`);
  console.log(`Cache: ${flags.cache} (${cache.size} entries) -> ${jobs.length - todo.length} already scored, ${todo.length} to request`);
  console.log(`Estimated input tokens: ${tok4.toLocaleString()} (chars/4) .. ${tok3.toLocaleString()} (chars/3), ` +
    `~${todo.length ? Math.round(tok4 / todo.length) : 0} per request`);
  console.log(`Estimated cost @ $${USD_PER_MTOK}/Mtok input, output free: $${usd(tok4).toFixed(4)} .. $${usd(tok3).toFixed(4)}`);

  if (flags["dry-run"]) {
    const sample = jobs[0];
    if (sample) {
      const d = transport.describe(sample.req);
      console.log(`\n--- DRY RUN: exact request for junction ${sample.j.props.id} (no network call made) ---`);
      console.log(d.target);
      console.log(JSON.stringify(d.payload, null, 2));
    } else console.log("\nNo junction passes the filter; nothing to show.");
    return;
  }

  if (todo.length && !hasKey(transport.route)) {
    console.log(`\nNo ${transport.route === "typesafe" ? "TYPESAFE_API_KEY" : "AI_GATEWAY_API_KEY"} set: skipping the paid scoring of ${todo.length} junctions. Nothing was sent and no file was changed.`);
    console.log("The map and `pnpm data` use the committed data/out/jev-scores.json; they need no key.");
    console.log("To inspect the exact requests and the cost estimate without a key: pnpm score --dry-run");
    return;
  }

  const maxCost = Number(flags["max-cost"]);
  if (usd(tok3) > maxCost) {
    console.error(`Estimated cost $${usd(tok3).toFixed(2)} exceeds --max-cost $${maxCost}. Aborting without any request.`);
    process.exit(3);
  }

  const stats = await runJobs(
    todo.map((x) => ({ id: x.j.props.id, key: x.key, questionHash: QUESTION_HASH, req: x.req })),
    transport,
    cache,
    { concurrency: Number(flags.concurrency), retries: Number(flags.retries), validate: (r) => void toJevScore(r), spendLog: resolve(JEV_DIR, "cache/spend.jsonl"), label: `score ${flags.variant}` },
  );
  const fatal = stats.fatal;
  if (fatal) console.error(`\nABORTED: ${(fatal as Error).message}`);

  // ---- write output from the cache (every junction of the input that has a current-hash result) ----
  const out: Record<string, JevScore> = {};
  for (const j of all) {
    if (j.props.hasSignal || j.props.coveredBy) continue;
    const e = cache.get(cacheKey(j.props.id, QUESTION_HASH, stateHash(buildState(j.props))));
    if (e) out[j.props.id] = toJevScore(e.response);
  }
  const n = Object.keys(out).length;
  if (n === 0) {
    console.log("No real results available; NOT writing the output file.");
  } else {
    const file = flags.output!;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file + ".tmp", JSON.stringify(out, null, 1));
    renameSync(file + ".tmp", file);
    console.log(`Wrote ${n} scores to ${file}`);
  }
  if (fatal) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
