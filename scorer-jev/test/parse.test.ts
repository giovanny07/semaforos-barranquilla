import assert from "node:assert/strict";
import { test } from "node:test";
import { approxConfidence, fromAiSdkResult, parseSystemOneResponse, toJevScore, ResponseShapeError } from "../src/parse.ts";
import { CONTROL_LABELS, NEED_LEVELS, QUESTIONS, QUESTION_HASH, buildState, stateHash } from "../src/questions.ts";
import { toAiSdkQuestions, withRetry, HttpError } from "../src/transport.ts";
import * as NO_CRASH from "../src/variants/v3nc.ts";

// ---- Example responses copied verbatim from the docs ----
// https://docs.typesafe.ai/api.md#noul-answer
const DOC_NOUL = { model: "jev-1.13.0", answers: { is_urgent: { type: "noul", noul: 0.95 } }, usage: { input_tokens: 307, output_tokens: 20 } };
// https://docs.typesafe.ai/api.md#choice-answer
const DOC_CHOICE = {
  model: "jev-1.13.0",
  answers: { department: { type: "choice", choice: "billing", probabilities: { billing: 0.88, technical: 0.12, sales: 0.0 }, confidence: 0.81 } },
  usage: { input_tokens: 318, output_tokens: 34 },
};
// https://docs.typesafe.ai/primitives/score.md#response-structure
const DOC_SCORE = {
  model: "jev-1.13.0",
  answers: {
    bug_severity: {
      type: "score", score: 1.43, confidence: 0.35,
      legend: { "0": "Cosmetic; no impact to functionality", "1": "Broken or degraded feature, but workaround exists", "2": "Blocking issue; no workaround exists" },
      probabilities: { "0": 0.0, "1": 0.57, "2": 0.43 },
    },
  },
  usage: { input_tokens: 332, output_tokens: 18 },
};

test("parses the docs' noul / choice / score example responses", () => {
  const n = parseSystemOneResponse(DOC_NOUL);
  assert.deepEqual(n.answers.is_urgent, { type: "noul", noul: 0.95 });
  assert.equal(n.usage?.input_tokens, 307);

  const c = parseSystemOneResponse(DOC_CHOICE).answers.department;
  assert.ok(c?.type === "choice");
  assert.equal(c.choice, "billing");
  assert.equal(c.confidence, 0.81);
  assert.equal(c.probabilities.technical, 0.12);

  const s = parseSystemOneResponse(DOC_SCORE).answers.bug_severity;
  assert.ok(s?.type === "score");
  assert.equal(s.score, 1.43);
  assert.equal(s.confidence, 0.35);
  assert.equal(s.legend?.["2"], "Blocking issue; no workaround exists");
});

// Same wire shapes as the docs, with this project's question ids / options.
const ours = (score: number, probs: Record<string, number>, sConf: number, noul: number, choice: string, cConf: number) => ({
  model: "jev-1.13.0",
  answers: {
    needLevel: { type: "score", score, confidence: sConf, probabilities: probs, legend: {} },
    warrantProb: { type: "noul", noul },
    control: { type: "choice", choice, confidence: cConf, probabilities: { [choice]: 1 } },
  },
  usage: { input_tokens: 1200, output_tokens: 60 },
});

test("maps answers to the contract entry", () => {
  const r = parseSystemOneResponse(ours(3.43, { "0": 0, "1": 0, "2": 0, "3": 0.57, "4": 0.43 }, 0.35, 0.8123456, "vehicle_traffic_signal", 0.9));
  assert.deepEqual(toJevScore(r), {
    needLevel: "alta", // 3.43 rounds to level 3
    needScore: 85.8, // 3.43 / 4 * 100
    warrantProb: 0.8123,
    control: "semáforo vehicular",
    confidence: 0.35, // min(score confidence, choice confidence)
  });
  assert.equal(toJevScore(parseSystemOneResponse(ours(0, { "0": 1 }, 1, 0.02, "no_intervention", 1))).needLevel, "ninguna");
  assert.equal(toJevScore(parseSystemOneResponse(ours(4, { "4": 1 }, 1, 0.99, "pedestrian_signal", 1))).needLevel, "crítica");
  assert.equal(toJevScore(parseSystemOneResponse(ours(4, { "4": 1 }, 1, 0.99, "pedestrian_signal", 1))).needScore, 100);
});

test("rejects malformed or unexpected responses instead of inventing values", () => {
  assert.throws(() => parseSystemOneResponse({ model: "x" }), ResponseShapeError);
  assert.throws(() => parseSystemOneResponse({ answers: { a: { type: "noul", noul: 1.7 } } }), ResponseShapeError);
  assert.throws(() => parseSystemOneResponse({ answers: { a: { type: "noul" } } }), ResponseShapeError);
  assert.throws(() => parseSystemOneResponse({ answers: { a: { type: "text", text: "hi" } } }), ResponseShapeError);
  assert.throws(() => toJevScore(parseSystemOneResponse(DOC_NOUL)), /missing answer "needLevel"/);
  assert.throws(() => toJevScore(parseSystemOneResponse(ours(2, { "2": 1 }, 1, 0.5, "traffic_cop", 1))), /not one of the offered options/);
  assert.throws(() => toJevScore(parseSystemOneResponse(ours(7, { "2": 1 }, 1, 0.5, "roundabout", 1))), /outside/);
});

test("AI SDK (gateway) result is normalised: boolean -> noul, confidence from providerMetadata", () => {
  const r = fromAiSdkResult({
    answers: {
      needLevel: { type: "score", score: 1.05, probabilities: { "0": 0, "1": 0.95, "2": 0.05, "3": 0, "4": 0 } },
      warrantProb: { type: "boolean", probability: 0.22 },
      control: { type: "choice", choice: "stop_or_yield_sign", probabilities: { stop_or_yield_sign: 0.88, no_intervention: 0.12 } },
    },
    usage: { inputTokens: 1100, outputTokens: 0 },
    providerMetadata: { typesafe: { confidence: { needLevel: 0.92, control: 0.81 } } },
    response: { modelId: "typesafe-ai/jev" },
  });
  assert.deepEqual(toJevScore(r), { needLevel: "baja", needScore: 26.3, warrantProb: 0.22, control: "señal de PARE / ceda el paso", confidence: 0.81 });
  assert.equal(r.usage?.input_tokens, 1100);
  // without provider confidence we fall back to the docs' demo approximation
  assert.equal(approxConfidence({ a: 0.9, b: 0.06, c: 0.04 }).toFixed(2), "0.85");
});

test("questions follow the API limits and the label maps stay in sync", () => {
  assert.equal(QUESTIONS.needLevel.criteria.length, NEED_LEVELS.length);
  assert.ok(QUESTIONS.needLevel.criteria.length <= 10);
  assert.deepEqual(Object.keys(QUESTIONS.control.criteria), Object.keys(CONTROL_LABELS));
  assert.match(QUESTION_HASH, /^[0-9a-f]{16}$/);
  const q = toAiSdkQuestions(QUESTIONS) as Record<string, { type: string }>;
  assert.equal(q.warrantProb?.type, "boolean");
  assert.equal(q.needLevel?.type, "score");
});

test("state has named fields, worded buckets, and a stable hash", () => {
  const p = { id: "x", streets: ["Calle 30", ""], classes: ["primary", "tertiary"], maxClass: "primary", minClass: "tertiary", legs: 4, maxLanes: null,
    hasSignal: false, distNearestSignalM: 520.4, pois: { school: 1, hospital: 0, market: 0, busStop: 5, worship: 0, park: 0 }, heuristicScore: 70 };
  const s = buildState(p) as { junction: Record<string, any> };
  assert.deepEqual(s.junction.street_names, ["Calle 30"]);
  assert.equal(s.junction.nearest_traffic_signal.straight_line_m, 520);
  assert.match(String(s.junction.nearest_traffic_signal.straight_line), /^several blocks/);
  assert.equal(s.junction.pedestrian_generators_within_200_m, "one school, many bus stops (5)");
  assert.equal(s.junction.main_road.widest_leg, "unknown (not mapped)");
  assert.match(s.junction.main_road.road_class, /^primary/); // falls back to maxClass / minClass for older inputs
  assert.match(s.junction.crossing_street.road_class, /^tertiary/);
  assert.match(s.junction.crash_records.level, /^unknown/);
  assert.ok(!JSON.stringify(s).includes("heuristic"), "heuristic score must not leak into the state");
  assert.equal(stateHash(s), stateHash(buildState({ ...p })));
});

test("v2 facts: main/crossing street, along-road distance, crash bucket, structure; ablation hides crashes only", () => {
  const p = { id: "y", streets: ["Carrera 38", "Calle 74"], classes: ["secondary", "tertiary"], maxClass: "secondary", minClass: "residential", legs: 4, maxLanes: 2,
    hasSignal: false, distNearestSignalM: 152, distSignalAlongM: 161, majorClass: "secondary", crossClass: "tertiary", majorStreet: "Carrera 38", crossStreet: "Calle 74",
    divided: true, onewayT: false, structure: { roundabout: false, ramp: false, gradeSeparated: false, nearRoundabout: false, nearGradeSeparated: false },
    crashes: { total: 41, injuries: 2, deaths: 0, period: "2018–2022" }, crashesPedestrian: 2,
    pois: { school: 0, hospital: 0, market: 0, busStop: 0, worship: 0, park: 0 }, heuristicScore: 40 };
  const j = (buildState(p) as { junction: Record<string, any> }).junction;
  assert.match(j.crossing_street.road_class, /^tertiary/); // not the residential stub
  assert.equal(j.nearest_traffic_signal.along_main_road_m, 161);
  assert.match(j.nearest_traffic_signal.along_main_road, /signalized corridor/);
  assert.equal(j.crash_records.crashes, 41);
  assert.match(j.crash_records.level, /^very many/);
  assert.equal(j.junction_structure, "ordinary at-grade junction");
  const r = (buildState({ ...p, structure: { ...p.structure, nearRoundabout: true } }) as any).junction;
  assert.match(r.junction_structure, /roundabout/);
  const blind = (NO_CRASH.buildState(p) as any).junction;
  assert.match(blind.crash_records.level, /^unknown/);
  assert.deepEqual({ ...blind, crash_records: null }, { ...j, crash_records: null });
});

test("withRetry retries 429/529 but never 401", async () => {
  let n = 0;
  const v = await withRetry(async () => { if (++n < 3) throw new HttpError(n === 1 ? 429 : 529, "busy"); return "ok"; }, { retries: 5, baseMs: 1 });
  assert.equal(v, "ok");
  assert.equal(n, 3);
  let m = 0;
  await assert.rejects(withRetry(async () => { m++; throw new HttpError(401, "bad key"); }, { retries: 5, baseMs: 1 }), /401/);
  assert.equal(m, 1);
});
