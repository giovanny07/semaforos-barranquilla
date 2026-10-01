# scorer-jev/ — optional scoring of junctions with TypeSafe Jev

> **You do not need this package, or any API key, to build or run the map.** The scores it produced are committed
> in `data/out/jev-scores.json` and `data/out/jev-scores-nocrash.json`, and `pnpm data` / `pnpm dev` use them as they
> are. This package is only for re-scoring (paid, about $1 for a full run from scratch) after changing the pipeline,
> the questions or the city.

Reads `data/out/intersections.geojson` (plus the crash fields from `data/out/crashes-by-intersection.json`, joined by
id), asks Jev three typed questions about every **unsignalized**
junction (not signalized, not covered by a contiguous signalized crossing; `--min-score` defaults to 0), and
writes `data/out/jev-scores.json`:

```json
{ "<intersectionId>": { "needLevel": "alta", "needScore": 85.8, "warrantProb": 0.81, "control": "semáforo vehicular", "confidence": 0.35 } }
```

| Field | Source | Values |
| --- | --- | --- |
| `needLevel` | Score, rounded to the nearest level | `ninguna`, `baja`, `media`, `alta`, `crítica` |
| `needScore` | Score position (0–4) rescaled to 0–100, for ranking next to `heuristicScore` | number |
| `warrantProb` | Noul: P(junction warrants a signal under typical Colombian urban criteria) | 0–1 |
| `control` | Choice | `semáforo vehicular`, `semáforo peatonal`, `señal de PARE / ceda el paso`, `reductores de velocidad`, `glorieta`, `ninguna intervención` |
| `confidence` | `min(confidence of the Score, confidence of the Choice)`; Noul answers carry no confidence | 0–1 |

Jev is a decision model: outputs are *judgments from map attributes and crash records*, not traffic engineering.
There are no traffic counts in the state. Treat results as a screening signal; how far it can be trusted is
measured by the backtest below and explained in `docs/validation.md`.

## Backtest — the trust metric

`pnpm backtest --variant v3 --choose --role main` scores `data/out/backtest-input.json` (written by the pipeline):

- **signalized** — junctions confirmed by the official 2023 inventory AND OSM, described *as if their own signal
  did not exist* (distance to the nearest other signal; everything else identical). Fixed tune / holdout halves
  (hash of the id). Wording and thresholds are chosen on tune only; holdout numbers are the ones to quote.
- **quiet** — 400 random unsignalized local × local junctions (false alarms).
- **comparable** — 300 random unsignalized at-grade junctions on a collector or higher (selectivity check).
- **osm_only** — signalized per OSM but absent from the inventory (mostly newer); never used for tuning.

Threshold rule (tune half, fixed before looking at holdout): lowest `warrantProb` threshold at which no quiet
junction is flagged, then the one maximising recall − share of comparable junctions flagged.

| Variant | What changed | Tune recall @0.5 | Holdout at chosen threshold |
| --- | --- | --- | --- |
| `v2` | original questions/state | 1.2 % | — (2.9 % @0.5) |
| `v3` (**production**, `src/questions.ts`) | main/crossing street separately, along-road distance, crash bucket framed as exposure, spacing premise corrected (58 % of real signals have another one < 150 m) | 77 % | **≥ 0.7 → recall 68.8 %, quiet false alarms 0 %, comparable flagged 18.2 %** |
| `v3nc` (`--variant nocrash`) | v3 with the crash records withheld: independent second opinion, used only for the tiers' agreement | 68 % | ≥ 0.6 → recall 50.9 %, quiet 0 %, comparable 10.3 % |

Every variant's metrics are kept in `scorer-jev/backtest-log.json`; the chosen ones go to `data/out/backtest.json`, which the
pipeline reads for the tier thresholds. Real token spend of every run is appended to `scorer-jev/cache/spend.jsonl`
(local, git-ignored).

Finding worth knowing: with crash records in the state, the verdict is driven mostly by the crash bucket
(recall 88 % when ≥ 5 crashes, ~15 % below). That is why the pipeline also asks for the crash-blind pass
(`pnpm score --variant nocrash --collector-only` → `data/out/jev-scores-nocrash.json`).

## Setup

From the repository root (one pnpm workspace; Node 24):

```sh
pnpm install
cp scorer-jev/.env.example scorer-jev/.env   # then paste your key; the file is git-ignored
pnpm data                                    # writes data/out/intersections.geojson and backtest-input.json
```

`scorer-jev/.env` and a repo-root `.env` are both loaded; variables already set in the shell win.

| Env var | Purpose |
| --- | --- |
| `TYPESAFE_API_KEY` | Direct TypeSafe API (`POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer`). Keys look like `apikey_…`. |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway route (AI SDK `experimental_evaluate`, model `typesafe-ai/jev`). Keys look like `vck_…`. |
| `JEV_ROUTE` | `auto` (default: TypeSafe key if present, else Gateway), `typesafe`, `gateway` |
| `JEV_MODEL` | Override the model id (`jev-latest` / `typesafe-ai/jev`). Pin `jev-1.13.0` to keep thresholds stable. |
| `TYPESAFE_BASE_URL` | Override the API root (default `https://api.typesafe.ai`) |

The key is only ever sent in the `Authorization` header to the chosen API host. It is never logged or cached.

## Run

From the repository root, `pnpm score …` runs `src/cli.ts`; the other commands below run inside `scorer-jev/` (or
with `pnpm --filter @semaforos/scorer-jev <script>` from the root).

**Without a key** nothing is ever sent: `--dry-run` prints the exact request and the cost estimate, and a normal
run (`pnpm score`, `pnpm backtest`) prints how many junctions it would score and exits without changing any file.
If every junction is already in the local cache (`scorer-jev/cache/results.jsonl`), the output files are rebuilt
from it with zero requests and no key.

```sh
pnpm dry-run                 # exact payload for one junction + token/cost estimate. NO network call.
pnpm score --limit 25        # top 25 by heuristicScore
pnpm score                   # every unsignalized junction (≈ $0.80 from scratch; cached by state hash)
pnpm score --variant nocrash --collector-only   # crash-blind second opinion on collector+ junctions (≈ $0.25)
pnpm backtest --variant v3 --choose --role main && pnpm backtest --variant v3nc --choose --role blind
pnpm score --min-score 40 --concurrency 8
pnpm score --id <intersectionId>
pnpm typecheck && pnpm test
```

Flags: `--input`, `--output`, `--cache`, `--min-score N`, `--limit N`, `--concurrency N` (default 6),
`--retries N` (default 5), `--route`, `--model`, `--max-cost USD` (default 5; aborts before any request
if the pessimistic estimate is higher), `--dry-run`, `--id`.

- **Resumable**: every answer is appended to `scorer-jev/cache/results.jsonl`, keyed by
  `intersectionId : questionHash : stateHash`. Re-runs only pay for junctions that are new, whose
  attributes changed, or after the questions/context were edited. Raw answers (full probability
  distributions, reported usage, latency) are stored, so changing the mapping never needs re-inference.
- **Retries**: exponential backoff with jitter (0.5 s → 20 s), honours `retry-after`, for 408/429/5xx/529
  and network errors. 401/403 abort the run immediately; 422 and malformed answers are not retried.
- The output file is rebuilt from the cache at the end of each run and is **not written when there are
  no real results** (no fabricated scores).
- Cost: $0.042 per million input tokens, output free. About 1,700 input tokens per junction
  (measured), i.e. about $0.07 per 1,000 junctions.

## What is sent

One request per junction; the three questions are independent and evaluated in parallel over the same
state (docs: "Ask multiple questions together"). See `src/questions.ts`.

- `state.city_context`: short description of Barranquilla, OSM road classes and Colombian signal practice.
- `state.junction`: street names, main road and crossing street (name, class, lanes, divided), shape, structure
  (roundabout / ramp / overpass / ordinary), straight-line and along-main-road distance to the nearest signal
  (signals confirmed against the official inventory), police crash records 2018–2022 (count, injuries, deaths,
  pedestrians hit, worded level), pedestrian generators within 200 m. Every number also comes as a worded bucket computed in code
  (`"far: no signal within several blocks"`), because the docs say Jev is weak with raw numbers.
- `heuristicScore` / `heuristicReasons` are deliberately **not** sent, so Jev's judgment is independent
  of the pipeline's heuristic.
- State, instructions and criteria are in English (Jev's primary training language per the docs);
  Spanish labels are applied in code. Score levels describe self-standing situations, not degrees,
  because each level is judged without seeing its number or neighbours.

`src/questions.ts` re-exports the production variant (`src/variants/v3.ts`); `v2.ts` is the frozen baseline.
Editing a variant changes its question hash, so affected junctions are re-scored on the next run.

## API notes (from the live docs, 2026-09-20)

- Direct: `POST https://api.typesafe.ai/v1/systemone`, body `{ state, model, questions }`, question
  types `noul` / `choice` / `score`. Answers: `{type:"noul", noul}`, `{type:"choice", choice, probabilities, confidence}`,
  `{type:"score", score, legend, probabilities, confidence}`; plus `model` and `usage.input_tokens`.
  Verified with real requests.
- Limits: 64k tokens per request (32k for state + longest question), 1,200 requests/min, 250k tokens/s.
- Gateway: model `typesafe-ai/jev` is listed at `https://ai-gateway.vercel.sh/v1/models` (type `evaluation`).
  The documented way to call it is the AI SDK: `experimental_evaluate({ model: 'typesafe-ai/jev', state, questions })`,
  where Noul is called `boolean` and returns `probability`, and TypeSafe's confidence is at
  `providerMetadata.typesafe.confidence[questionId]`. **This route is implemented but has not been exercised
  with a real Gateway key.**
