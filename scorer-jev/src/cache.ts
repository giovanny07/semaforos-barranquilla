import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SystemOneResponse } from "./types.ts";

export interface CacheEntry {
  key: string; // `${intersectionId}:${questionHash}:${stateHash}`
  id: string;
  questionHash: string;
  stateHash: string;
  route: string;
  at: string;
  latencyMs: number;
  response: SystemOneResponse; // raw judgments, so re-mapping never needs re-inference
}

export const cacheKey = (id: string, questionHash: string, stateHash: string) => `${id}:${questionHash}:${stateHash}`;

/** Append-only JSONL cache. A crash can at worst leave one truncated last line, which is skipped. */
export class ResultCache {
  private map = new Map<string, CacheEntry>();
  constructor(private file: string) {
    if (!existsSync(file)) return;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as CacheEntry;
        if (e.key && e.response) this.map.set(e.key, e);
      } catch {
        /* truncated line */
      }
    }
  }
  get size() { return this.map.size; }
  get(key: string) { return this.map.get(key); }
  put(e: CacheEntry) {
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify(e) + "\n");
    this.map.set(e.key, e);
  }
}
