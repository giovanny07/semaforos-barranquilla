# El contrato con los agentes / The agent contract

**Español.** La primera versión de este proyecto (20 de septiembre de 2026) la programaron varios agentes de
programación con inteligencia artificial que trabajaron a la vez, cada uno a cargo de una carpeta: datos
(`pipeline/`), evaluación (`jev/`, hoy `scorer-jev/`), mapa (`web/`) e investigación (`docs/research/`). Este es el
documento que compartían: qué construir, quién escribía dónde y qué forma debían tener los datos. Lo publicamos para
que se vea cómo se hizo.

Es un registro histórico, no la documentación vigente. Para usar el proyecto lee el [README](../../README.md); los
campos actuales de los datos están en [`docs/data-schema.md`](../data-schema.md).

Respecto al original se quitó lo siguiente:

- reglas de coordinación entre agentes que ya no aplican (por ejemplo, no crear un repositorio git);
- una nota sobre el público al que iba dirigida la primera presentación;
- una indicación sobre cómo nombrar la evaluación en la interfaz. Hoy el proyecto dice abiertamente que la evaluación
  es asistida por IA y qué modelo usa (ver el README);
- una estimación preliminar del tamaño de la red vial que no coincidió con los datos (las cifras reales están en
  `data/out/summary.json`).

Lo demás está tal como se escribió, en inglés. Las notas entre corchetes son de esta edición.

**English.** The first version of this project (20 September 2026) was written by several AI coding agents working in
parallel, each in charge of one folder: data (`pipeline/`), scoring (`jev/`, now `scorer-jev/`), map (`web/`) and
research (`docs/research/`). This is the brief they shared: what to build, who writes where, and what shape the data
must have. We publish it so people can see how the project was made.

It is a historical record, not current documentation. To use the project, read the [README](../../README.en.md); the
current data fields are in [`docs/data-schema.md`](../data-schema.md).

Compared with the original, we removed: coordination rules between agents that no longer apply (for example, "don't
create a git repository"); a note about the audience of the first presentation; an instruction about how to name the
evaluation in the interface (the project now says openly that the evaluation is AI-assisted and which model it uses;
see the README); and a preliminary estimate of the street network's size that did not match the data (the real
figures are in `data/out/summary.json`). Everything else is as written. Notes in square brackets are editorial.

---

# Semáforos Barranquilla — shared contract

Goal: map every street and traffic signal in Barranquilla (Colombia), show the current state of
signalization, and flag intersections that likely need a signal. Output is a 2D web map.

*[Editorial note: Addendum v2 below changed this framing to "a prioritized shortlist for technical study", which is
how the project presents its results today.]*

## Layout (each agent writes ONLY inside its own directory)

| Dir | Owner | Purpose |
| --- | --- | --- |
| `pipeline/` | data agent | Node/TS scripts: fetch OSM → build intersections → heuristic score |
| `jev/` | jev agent | Node/TS scripts: score intersections with TypeSafe Jev |
| `web/` | web agent | Next.js (App Router) + MapLibre GL 2D map |
| `docs/research/` | research agent | Warrant criteria + open-data findings |
| `data/raw/`, `data/out/` | written by `pipeline/` (and `jev/` for `data/out/jev-scores.json`) | Data files |

*[Editorial note: `jev/` is now `scorer-jev/`.]*

Package manager: pnpm. Node 25. Each dir has its own `package.json`.

*[Editorial note: the project now uses Node 24 LTS and a single pnpm workspace at the repository root.]*

## Study area

Bounding box (S,W,N,E): `10.89,-74.93,11.07,-74.74`, then clipped to the Barranquilla municipality
boundary (OSM relation, `name=Barranquilla`, `boundary=administrative`) when obtainable; otherwise keep bbox
and say so.

Overpass: use `https://overpass-api.de/api/interpreter` via POST with header
`User-Agent: jev-semaforos/0.1` and `Accept: */*` (without them it returns 406). Prefer bbox queries over
area queries (area queries time out). Cache raw responses in `data/raw/`; never re-fetch if cached.

## Output files (`data/out/`, all GeoJSON FeatureCollections, WGS84)

### `streets.geojson` — LineString
`id` (OSM way id), `name`, `highway` (OSM class), `lanes` (number|null), `oneway` (bool), `maxspeed` (number|null)

### `signals.geojson` — Point
`id` (OSM node id), `kind`: `"signal"` | `"crossing_signal"`, `intersectionId` (string|null)

### `intersections.geojson` — Point (nodes shared by ≥2 distinct drivable ways, or ≥3 legs; merge nodes within ~20 m into one junction, e.g. dual carriageways)
- `id`: string
- `streets`: string[] (distinct street names)
- `classes`: string[] (OSM highway classes of the legs)
- `maxClass`, `minClass`: highest / lowest class among legs (rank: motorway>trunk>primary>secondary>tertiary>unclassified>residential>living_street)
- `legs`: number
- `maxLanes`: number|null
- `hasSignal`: bool (a signal node within ~30 m of the junction)
- `distNearestSignalM`: number
- `pois`: `{ school, hospital, market, busStop, worship, park }` counts within 200 m
- `heuristicScore`: 0–100 need-for-signal score for unsignalized junctions (null when `hasSignal`)
- `heuristicReasons`: string[] (short Spanish phrases, e.g. `"Cruce de vía primaria con secundaria"`)
- `status`: `"signalized"` | `"needs_high"` | `"needs_medium"` | `"needs_low"` | `"ok"`
- `jev`: null | `{ needLevel: string, needScore: number, warrantProb: number, control: string, confidence: number }`
  (merged in from `data/out/jev-scores.json`, keyed by intersection `id`, when that file exists)

### `summary.json`
`{ generatedAt, counts: { streets, signals, intersections, signalized, needsHigh, needsMedium, needsLow }, byClassPair: {...}, clippedToMunicipality: bool }`

The web app reads these from `web/public/data/` (the pipeline's last step copies `data/out/*` there).
UI language: Spanish.

---

## Addendum v2 — reliability (presentation-grade)

The product no longer shows two rankings. There is ONE evaluation
(internally: Jev + rule checks + real evidence), shown in the UI as "Evaluación".
Framing: the Manual de Señalización Vial 2024 requires traffic counts to justify a signal, so the output is a
**prioritized shortlist for technical study**, each item with verifiable evidence — not a claim that a signal is warranted.

New/changed properties on `intersections.geojson` features (existing ones stay):
- `signalSource`: `"osm"` | `"oficial"` | `"ambos"` | null — which source says this junction has a signal
  (official = Secretaría de Tránsito inventory, `docs/research/data/semaforos-oficial-2023.geojson`)
- `distNearestSignalM`: straight-line (unchanged); `distSignalAlongM`: number|null — distance to nearest signal along the main road
- `crashes`: null | `{ total, injuries, deaths, period }` — crash records matched to this junction (datos.gov.co `yb9r-2dsi`)
- `crashRank`: number|null — percentile 0–100 among unsignalized junctions with ≥1 crash
- `jev`: unchanged shape, re-scored with the richer state
- `priority`: `"prioritario"` | `"recomendado"` | `"observacion"` | `"sin_accion"` | `"semaforizado"`
- `priorityScore`: 0–100, used for ranking inside the app
- `recommendation`: Spanish label of the suggested control (`"Semáforo vehicular"`, `"Semáforo peatonal"`, `"PARE / ceda el paso"`, `"Reductores de velocidad"`, `"Glorieta"`, `"Ninguna"`)
- `evidence`: string[] — short Spanish factual statements a person can verify (e.g. `"38 siniestros registrados 2018–2022, 2 con muertos"`, `"Vía troncal cruza vía secundaria"`, `"Semáforo más cercano a 640 m sobre la Vía 40"`, `"2 colegios a menos de 200 m"`)
- `agreement`: `"alto"` | `"medio"` | `"bajo"` — do the independent signals (model, rules, crashes) agree?

`summary.json` adds: `counts.prioritario`, `counts.recomendado`, `counts.observacion`, `validation: { ... }` (backtest results, see `docs/validation.md`).

*[Editorial note: the crash fields and the official inventory were later moved into their own files under
`data/out/` so they can keep the Alcaldía's CC BY-SA 4.0 license. See `docs/data-schema.md` and `data/LICENSE.md`.]*
