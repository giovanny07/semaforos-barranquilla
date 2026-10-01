import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ResultCache } from "./cache.ts";
import { HttpError, withRetry, type Transport } from "./transport.ts";
import type { SystemOneRequest, SystemOneResponse } from "./types.ts";

/** docs.typesafe.ai/models (2026-09-20): $0.042 per million input tokens, output free. */
export const USD_PER_MTOK = 0.042;
/** Fixed per-request overhead observed in the docs' examples (no public tokenizer). */
export const REQUEST_OVERHEAD_TOKENS = 280;
export const estTokens = (req: unknown, divisor: number) => REQUEST_OVERHEAD_TOKENS + Math.ceil(JSON.stringify(req).length / divisor);
export const usd = (tokens: number) => (tokens / 1e6) * USD_PER_MTOK;

export interface Job {
  id: string;
  key: string;
  questionHash: string;
  req: SystemOneRequest;
}

export interface RunStats { done: number; failed: number; inputTokens: number; usd: number; fatal: unknown }

/**
 * Sends every job that is not in the cache, with bounded concurrency and retries, and appends each answer to the
 * cache. `validate` must throw when a response cannot be mapped (it is then not cached). Real token usage of the
 * run is appended to `spendLog` so total spend can be audited.
 */
export async function runJobs(
  jobs: Job[],
  transport: Transport,
  cache: ResultCache,
  opts: { concurrency: number; retries: number; validate: (r: SystemOneResponse) => void; spendLog?: string; label?: string },
): Promise<RunStats> {
  const todo = jobs.filter((j) => !cache.get(j.key));
  let next = 0, done = 0, failed = 0, fatal: unknown = null, realIn = 0;
  const latencies: number[] = [];
  const started = Date.now();

  async function worker() {
    while (!fatal) {
      const job = todo[next++];
      if (!job) return;
      try {
        const t0 = performance.now();
        const response = await withRetry(() => transport.send(job.req), {
          retries: opts.retries,
          onRetry: (n, err, wait) => console.warn(`  retry ${n}/${opts.retries} for ${job.id} in ${Math.round(wait)} ms: ${(err as Error).message.slice(0, 120)}`),
        });
        const latencyMs = Math.round(performance.now() - t0);
        opts.validate(response);
        for (const a of Object.values(response.answers)) if (a.type === "score") delete a.legend; // echo of our own criteria
        cache.put({ key: job.key, id: job.id, questionHash: job.questionHash, stateHash: job.key.split(":").at(-1)!, route: transport.route, at: new Date().toISOString(), latencyMs, response });
        realIn += response.usage?.input_tokens ?? 0;
        latencies.push(latencyMs);
        done++;
        if (done % 250 === 0) console.log(`  ${done}/${todo.length} scored`);
      } catch (err) {
        failed++;
        if (err instanceof HttpError && (err.status === 401 || err.status === 403)) { fatal = err; return; } // never hammer the API with a bad key
        console.error(`  FAILED ${job.id}: ${(err as Error).message.slice(0, 300)}`);
        if (failed >= 20 && failed > done) { fatal = new Error("Too many failures; aborting."); return; }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));

  if (done) {
    latencies.sort((a, b) => a - b);
    const p = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
    console.log(`Requests OK: ${done}, failed: ${failed}, wall time: ${((Date.now() - started) / 1000).toFixed(1)} s, latency p50 ${p(0.5)} ms / p95 ${p(0.95)} ms`);
    console.log(`Reported input tokens: ${realIn.toLocaleString()} (${Math.round(realIn / done)}/request) -> real cost $${usd(realIn).toFixed(4)}`);
    if (opts.spendLog) {
      mkdirSync(dirname(opts.spendLog), { recursive: true });
      appendFileSync(opts.spendLog, JSON.stringify({ at: new Date().toISOString(), label: opts.label ?? "", requests: done, inputTokens: realIn, usd: +usd(realIn).toFixed(5) }) + "\n");
    }
  }
  return { done, failed, inputTokens: realIn, usd: usd(realIn), fatal };
}
