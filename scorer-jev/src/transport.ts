import { fromAiSdkResult, parseSystemOneResponse } from "./parse.ts";
import type { Question, SystemOneRequest, SystemOneResponse } from "./types.ts";

export type Route = "typesafe" | "gateway";

export class HttpError extends Error {
  constructor(public status: number, public body: string, public retryAfterMs?: number) {
    super(`HTTP ${status}: ${body.slice(0, 500)}`);
  }
}

export interface Transport {
  route: Route;
  model: string;
  /** The exact JSON body / call arguments this transport sends (for --dry-run). */
  describe(req: SystemOneRequest): { target: string; payload: unknown };
  send(req: SystemOneRequest): Promise<SystemOneResponse>;
}

export const DEFAULT_MODEL: Record<Route, string> = {
  typesafe: "jev-latest", // docs.typesafe.ai/models: alias of jev-1.13.0
  gateway: "typesafe-ai/jev", // id listed by https://ai-gateway.vercel.sh/v1/models
};

/** Direct route: POST {base}/v1/systemone, `Authorization: Bearer <key>` (docs.typesafe.ai/api). */
export function typesafeTransport(opts: { apiKey?: string; baseURL?: string; model?: string }): Transport {
  const base = (opts.baseURL ?? "https://api.typesafe.ai").replace(/\/+$/, "");
  const url = `${base}/v1/systemone`;
  const model = opts.model ?? DEFAULT_MODEL.typesafe;
  return {
    route: "typesafe",
    model,
    describe: (req) => ({ target: `POST ${url}`, payload: req }),
    async send(req) {
      if (!opts.apiKey) throw new Error("TYPESAFE_API_KEY is not set");
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!res.ok) {
        const ra = Number(res.headers.get("retry-after"));
        throw new HttpError(res.status, text, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
      }
      return parseSystemOneResponse(JSON.parse(text));
    },
  };
}

/** AI SDK names the Noul primitive `boolean`; everything else is the same question shape. */
export function toAiSdkQuestions(questions: Record<string, Question>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => [id, q.type === "noul" ? { ...q, type: "boolean" } : q]),
  );
}

/**
 * Vercel AI Gateway route, through the AI SDK's `experimental_evaluate` (string model ids resolve to the
 * Gateway, authenticated by AI_GATEWAY_API_KEY). UNVERIFIED against a live key: written from
 * https://ai-sdk.dev/docs/ai-sdk-core/evaluation and the @ai-sdk/gateway source.
 */
export function gatewayTransport(opts: { apiKey?: string; model?: string }): Transport {
  const model = opts.model ?? DEFAULT_MODEL.gateway;
  const args = (req: SystemOneRequest) => ({
    model,
    state: req.state,
    questions: toAiSdkQuestions(req.questions),
    maxRetries: 0, // retries are handled by our own loop
  });
  return {
    route: "gateway",
    model,
    describe: (req) => ({ target: "ai.experimental_evaluate(...) -> Vercel AI Gateway /evaluation-model", payload: args(req) }),
    async send(req) {
      if (!opts.apiKey) throw new Error("AI_GATEWAY_API_KEY is not set");
      const { experimental_evaluate } = await import("ai");
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await experimental_evaluate(args(req) as any);
        return fromAiSdkResult(result as never);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (typeof status === "number") throw new HttpError(status, String((e as Error).message));
        throw e;
      }
    },
  };
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);

/** Exponential backoff with jitter; honours retry-after. 401/403/422 and shape errors are not retried. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseMs?: number; maxMs?: number; onRetry?: (attempt: number, err: unknown, waitMs: number) => void },
): Promise<T> {
  const base = opts.baseMs ?? 500;
  const max = opts.maxMs ?? 20_000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable =
        err instanceof HttpError
          ? RETRYABLE.has(err.status)
          : err instanceof Error && (err.name === "TimeoutError" || err.name === "TypeError" || /fetch failed|ECONN|network/i.test(err.message));
      if (!retryable || attempt >= opts.retries) throw err;
      const backoff = Math.min(max, base * 2 ** attempt) * (1 - Math.random() * 0.25);
      const wait = Math.max(backoff, err instanceof HttpError ? (err.retryAfterMs ?? 0) : 0);
      opts.onRetry?.(attempt + 1, err, wait);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
