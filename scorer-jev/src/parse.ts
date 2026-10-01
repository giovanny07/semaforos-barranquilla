import { CONTROL_LABELS, NEED_LEVELS } from "./questions.ts";
import type { Answer, ChoiceAnswer, JevScore, NoulAnswer, ScoreAnswer, SystemOneResponse } from "./types.ts";

export class ResponseShapeError extends Error {}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function prob(x: unknown, what: string): number {
  if (typeof x !== "number" || !Number.isFinite(x) || x < -1e-6 || x > 1 + 1e-6) {
    throw new ResponseShapeError(`${what}: expected a probability in [0,1], got ${JSON.stringify(x)}`);
  }
  return Math.min(1, Math.max(0, x));
}
function probMap(x: unknown, what: string): Record<string, number> {
  if (!isObj(x)) throw new ResponseShapeError(`${what}: expected a map of probabilities`);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(x)) out[k] = prob(v, `${what}.${k}`);
  return out;
}

/**
 * Fallback only. The docs state `confidence` is "derived from the probability distribution" and their
 * interactive demo approximates it as (n * peak - 1) / (n - 1); the exact formula is not published.
 * Used only if a response lacks `confidence` (possible on the AI Gateway route, where it lives in
 * providerMetadata). Native TypeSafe responses always carry it.
 */
export function approxConfidence(probabilities: Record<string, number>): number {
  const v = Object.values(probabilities);
  if (v.length < 2) return 1;
  const peak = Math.max(...v);
  return Math.min(1, Math.max(0, (v.length * peak - 1) / (v.length - 1)));
}

/** Validate one native TypeSafe answer (https://docs.typesafe.ai/api.md#answer-types). */
export function parseAnswer(raw: unknown, id: string): Answer {
  if (!isObj(raw)) throw new ResponseShapeError(`answers.${id}: not an object`);
  switch (raw.type) {
    case "noul":
      return { type: "noul", noul: prob(raw.noul, `answers.${id}.noul`) };
    case "choice": {
      if (typeof raw.choice !== "string") throw new ResponseShapeError(`answers.${id}.choice: not a string`);
      const probabilities = probMap(raw.probabilities, `answers.${id}.probabilities`);
      const confidence =
        raw.confidence == null ? approxConfidence(probabilities) : prob(raw.confidence, `answers.${id}.confidence`);
      return { type: "choice", choice: raw.choice, probabilities, confidence };
    }
    case "score": {
      if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) {
        throw new ResponseShapeError(`answers.${id}.score: not a number`);
      }
      const probabilities = probMap(raw.probabilities, `answers.${id}.probabilities`);
      const confidence =
        raw.confidence == null ? approxConfidence(probabilities) : prob(raw.confidence, `answers.${id}.confidence`);
      const legend = isObj(raw.legend) ? (raw.legend as Record<string, string>) : undefined;
      return { type: "score", score: raw.score, probabilities, confidence, ...(legend ? { legend } : {}) };
    }
    default:
      throw new ResponseShapeError(`answers.${id}.type: unknown type ${JSON.stringify(raw.type)}`);
  }
}

/** Validate a native TypeSafe response body. */
export function parseSystemOneResponse(raw: unknown): SystemOneResponse {
  if (!isObj(raw) || !isObj(raw.answers)) throw new ResponseShapeError("response has no `answers` map");
  const answers: Record<string, Answer> = {};
  for (const [id, a] of Object.entries(raw.answers)) answers[id] = parseAnswer(a, id);
  const usage = isObj(raw.usage)
    ? {
        input_tokens: typeof raw.usage.input_tokens === "number" ? raw.usage.input_tokens : undefined,
        output_tokens: typeof raw.usage.output_tokens === "number" ? raw.usage.output_tokens : undefined,
      }
    : undefined;
  return { model: typeof raw.model === "string" ? raw.model : "unknown", answers, ...(usage ? { usage } : {}) };
}

/**
 * Convert an AI SDK `experimental_evaluate` result (AI Gateway route) into the native shape.
 * Differences (https://ai-sdk.dev/docs/ai-sdk-core/evaluation): Noul is called `boolean` and returns
 * `probability`; Choice/Score `probabilities` are optional; TypeSafe's confidence is at
 * `providerMetadata.typesafe.confidence[questionId]`.
 */
export function fromAiSdkResult(result: {
  answers: Record<string, unknown>;
  usage?: { inputTokens?: number; outputTokens?: number };
  providerMetadata?: Record<string, unknown>;
  response?: { modelId?: string };
}): SystemOneResponse {
  const ts = result.providerMetadata?.typesafe;
  const conf = isObj(ts) && isObj(ts.confidence) ? ts.confidence : {};
  const native: Record<string, unknown> = {};
  for (const [id, a] of Object.entries(result.answers)) {
    if (!isObj(a)) throw new ResponseShapeError(`answers.${id}: not an object`);
    if (a.type === "boolean") native[id] = { type: "noul", noul: a.probability };
    else {
      if (a.probabilities == null) {
        throw new ResponseShapeError(`answers.${id}: gateway returned no probability distribution`);
      }
      native[id] = { ...a, confidence: conf[id] };
    }
  }
  return parseSystemOneResponse({
    model: result.response?.modelId ?? "unknown",
    answers: native,
    usage: { input_tokens: result.usage?.inputTokens, output_tokens: result.usage?.outputTokens },
  });
}

function expect<T extends Answer["type"]>(r: SystemOneResponse, id: string, type: T): Extract<Answer, { type: T }> {
  const a = r.answers[id];
  if (!a) throw new ResponseShapeError(`missing answer "${id}"`);
  if (a.type !== type) throw new ResponseShapeError(`answer "${id}" is ${a.type}, expected ${type}`);
  return a as Extract<Answer, { type: T }>;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Map the three answers to the contract entry.
 * - needLevel: Score rounded to the nearest level (docs: "round it to the nearest level when your code
 *   needs one outcome"), as its Spanish label.
 * - needScore: the Score position (0..4) rescaled to 0..100 so it is comparable with `heuristicScore`.
 *   Use it for ranking/thresholds only; the docs warn Score is not numerically calibrated between levels.
 * - warrantProb: the Noul value, P(yes).
 * - control: Spanish label of the chosen option.
 * - confidence: min(confidence of the Score, confidence of the Choice). Noul answers carry none.
 */
export function toJevScore(r: SystemOneResponse): JevScore {
  const need: ScoreAnswer = expect(r, "needLevel", "score");
  const warrant: NoulAnswer = expect(r, "warrantProb", "noul");
  const control: ChoiceAnswer = expect(r, "control", "choice");

  const top = NEED_LEVELS.length - 1;
  if (need.score < -1e-6 || need.score > top + 1e-6) {
    throw new ResponseShapeError(`needLevel.score ${need.score} outside 0..${top}`);
  }
  const level = Math.min(top, Math.max(0, Math.round(need.score)));
  const label = (CONTROL_LABELS as Record<string, string>)[control.choice];
  if (!label) throw new ResponseShapeError(`control.choice "${control.choice}" is not one of the offered options`);

  return {
    needLevel: NEED_LEVELS[level]!,
    needScore: round((need.score / top) * 100, 1),
    warrantProb: round(warrant.noul, 4),
    control: label,
    confidence: round(Math.min(need.confidence, control.confidence), 4),
  };
}
