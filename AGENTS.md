# Notes for coding agents (and humans in a hurry)

One pnpm workspace, Node 24 (`.nvmrc`), pnpm 11 (`packageManager`). Packages: `pipeline/` (OSM + datos.gov.co →
`data/out/`), `scorer-jev/` (optional, paid re-scoring with the Jev model), `web/` (Next.js static export).

## Commands (from the repository root)

| Command | What it does | Network | Key |
| --- | --- | --- | --- |
| `pnpm install` | install every package | npm | no |
| `pnpm data` | rebuild `data/out/` and `web/public/data/` from the committed `data/raw/`, then verify | no | no |
| `pnpm run fetch` | refresh `data/raw/` from Overpass and datos.gov.co (`pnpm fetch` is a pnpm built-in, so use `run`) | yes | no |
| `pnpm score` | optional, paid re-scoring; needs `TYPESAFE_API_KEY` in `scorer-jev/.env`; without a key it exits without sending anything | yes | yes |
| `pnpm dev` / `pnpm build` | web dev server / static export to `web/out/` | basemap only | no |
| `pnpm test` / `pnpm lint` / `pnpm typecheck` | checks that CI runs | no | no |

## Rules

- Never run `pnpm score` or `pnpm --filter @semaforos/scorer-jev backtest` in CI, and never without `--dry-run` or a
  `--max-cost` you chose. Never store an API key in the repo or as a CI secret.
- Never commit `.env` files, `scorer-jev/cache/`, `web/.next/` or `web/out/`.
- After changing anything in `pipeline/`, run `pnpm data` and commit the regenerated `data/out/` and
  `web/public/data/`; CI fails if they differ from what `pnpm data` produces.
- Keep the licence split: crash fields go to `crashes-by-intersection.json` and the official inventory to
  `official-signals.geojson` (CC BY-SA 4.0); `intersections.geojson` stays OpenStreetMap-derived (ODbL).
  See `data/LICENSE.md`.
- UI copy is Spanish and says "conviene estudiar primero" (a shortlist for technical study), never "se necesita".
- `web/` is Next.js 16: read `web/AGENTS.md` before changing it.
