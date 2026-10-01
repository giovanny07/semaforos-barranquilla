# Licencias de los datos / Data licenses

*[English below](#english)*

Los datos de este repositorio tienen dos licencias distintas, según de dónde vienen. El código se licencia aparte
(Apache-2.0, ver [`LICENSE`](../LICENSE)) y la documentación también (CC BY 4.0, ver
[`docs/LICENSE.md`](../docs/LICENSE.md)). La lista completa de archivos, con fuentes y fechas, está en
[`data/README.md`](README.md).

## 1. Base de datos derivada de OpenStreetMap: ODbL 1.0

Archivos:

- `data/out/intersections.geojson`
- `data/out/streets.geojson`
- `data/out/signals.geojson`
- `data/out/summary.json`
- `data/out/jev-scores.json`
- los demás archivos derivados que acompañan a estos (`data/out/jev-scores-nocrash.json`, `data/out/backtest.json`), sus copias en `web/public/data/`, la muestra
  `scorer-jev/fixtures/intersections.sample.geojson` y la descarga cruda de OpenStreetMap en `data/raw/`

forman la base de datos «Semáforos de Barranquilla», que se publica bajo la
**Open Database License (ODbL) v1.0**: <https://opendatacommons.org/licenses/odbl/1-0/>

Crédito:

> © colaboradores de OpenStreetMap (<https://www.openstreetmap.org/copyright>); incluye hechos derivados de datos de
> la Alcaldía Distrital de Barranquilla (datos.gov.co); compilada por Victor Pay para «Semáforos de Barranquilla»
> (<https://semaforos-baq.vercel.app>).

Fuente y método: la consulta a Overpass y los scripts de construcción en `pipeline/`.

Si publicas una base de datos derivada de estos archivos, debe seguir bajo ODbL y dar el mismo crédito. No puedes
añadir restricciones encima (por ejemplo, «uso no comercial»).

## 2. Datos re-publicados de la Alcaldía: CC BY-SA 4.0

Archivos:

- `data/out/crashes-by-intersection.json`: siniestros viales agregados por cruce
- `data/out/official-signals.geojson`: inventario oficial de intersecciones semaforizadas
- `docs/research/data/semaforos-oficial-2023.geojson`: el mismo inventario, en la forma que usó la primera versión
- `data/raw/crashes-yb9r-2dsi.json`: los registros de siniestros de datos.gov.co, reducidos a año, gravedad, clase y
  dirección
- `data/out/reports/crash-match.json` y `data/out/reports/signals-reconciliation.json`: reportes de verificación que
  citan direcciones de siniestros y nombres, estados y fechas del inventario oficial

re-publican datos de la **Alcaldía Distrital de Barranquilla, Atlántico** bajo **Creative Commons
Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0)**: <https://creativecommons.org/licenses/by-sa/4.0/deed.es>

- «Accidentalidad en Barranquilla», <https://www.datos.gov.co/d/yb9r-2dsi>. Cambios: las direcciones escritas se
  asociaron a cruces de OpenStreetMap y se publican conteos por cruce. El archivo crudo conserva cada registro, pero
  solo con cuatro campos (año, gravedad, clase y dirección escrita): sin fecha exacta, hora ni datos de personas.
- «Semaforización en Barranquilla», <https://www.datos.gov.co/d/svyb-d6ts> (gemelo con geometría:
  <https://www.datos.gov.co/d/xknx-agu2>). Cambios: convertido a GeoJSON y asociado a cruces de OpenStreetMap.

Fuente: Portal de Datos Abiertos www.datos.gov.co. Fechas de consulta y de actualización en
[`data/README.md`](README.md).

Si re-publicas estos archivos o una adaptación de ellos, deben seguir bajo CC BY-SA 4.0, con el crédito a la Alcaldía.

## 3. Evaluación automatizada con inteligencia artificial

Los campos `jev`, `priority`, `priorityScore`, `recommendation`, `evidence` y `agreement`, y el archivo
`jev-scores.json`, son estimaciones automatizadas para priorizar estudios. Combinan reglas propias y registros de
siniestros con las respuestas de un modelo de IA de decisión (Jev, de TypeSafe, versión `jev-1.13.0`). No son un
estudio de ingeniería de tránsito, no son oficiales y se entregan sin garantía de ningún tipo.

## 4. Independencia

Este proyecto es independiente. Ni la Alcaldía de Barranquilla, ni la Fundación OpenStreetMap, ni TypeSafe lo
respaldan ni están asociadas con él.

---

## English

The data in this repository carries two different licenses, depending on where it comes from. The code is licensed
separately (Apache-2.0, see [`LICENSE`](../LICENSE)), and so are the docs (CC BY 4.0, see
[`docs/LICENSE.md`](../docs/LICENSE.md)). The full file list, with sources and dates, is in
[`data/README.md`](README.md).

### 1. Database derived from OpenStreetMap: ODbL 1.0

`data/out/intersections.geojson`, `streets.geojson`, `signals.geojson`, `summary.json` and `jev-scores.json`, plus the
other derived files that go with them (`jev-scores-nocrash.json`, `backtest.json`),
their copies in `web/public/data/`, the sample `scorer-jev/fixtures/intersections.sample.geojson` and the raw
OpenStreetMap download in `data/raw/`, make up the "Semáforos de Barranquilla" database. It is made
available under the **Open Database License (ODbL) v1.0**: <https://opendatacommons.org/licenses/odbl/1-0/>

Credit:

> © OpenStreetMap contributors (<https://www.openstreetmap.org/copyright>); includes facts derived from Alcaldía
> Distrital de Barranquilla data (datos.gov.co); compiled by Victor Pay for "Semáforos de Barranquilla"
> (<https://semaforos-baq.vercel.app>).

Source and method: the Overpass query and build scripts in `pipeline/`.

A database you derive from these files and publish must stay under the ODbL, with the same credit. You may not add
restrictions on top (for example "non-commercial use only").

### 2. Re-published Alcaldía data: CC BY-SA 4.0

`data/out/crashes-by-intersection.json` (crashes aggregated per junction), `data/out/official-signals.geojson` (the
official inventory of signalized junctions), `docs/research/data/semaforos-oficial-2023.geojson` (the same inventory,
in the form the first version used), `data/raw/crashes-yb9r-2dsi.json` (the datos.gov.co crash records, reduced to
year, severity, type and address) and the check reports in `data/out/reports/` (which quote crash addresses and
inventory names, statuses and dates) re-publish data from the **Alcaldía Distrital de Barranquilla, Atlántico** under
**Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**:
<https://creativecommons.org/licenses/by-sa/4.0/>

- "Accidentalidad en Barranquilla", <https://www.datos.gov.co/d/yb9r-2dsi>. Changes: written addresses were matched to
  OpenStreetMap junctions and published as per-junction counts. The raw file keeps each record, but only four fields
  (year, severity, type and written address): no exact date, time or personal data.
- "Semaforización en Barranquilla", <https://www.datos.gov.co/d/svyb-d6ts> (twin with geometry:
  <https://www.datos.gov.co/d/xknx-agu2>). Changes: converted to GeoJSON and matched to OpenStreetMap junctions.

Source: Portal de Datos Abiertos www.datos.gov.co. Access and update dates are in [`data/README.md`](README.md).

If you re-publish these files or an adaptation of them, they must stay under CC BY-SA 4.0, with credit to the Alcaldía.

### 3. Automated, AI-assisted evaluation

The fields `jev`, `priority`, `priorityScore`, `recommendation`, `evidence` and `agreement`, and the file
`jev-scores.json`, are automated estimates for prioritizing studies. They combine the project's own rules and crash
records with the answers of an AI decision model (Jev, by TypeSafe, version `jev-1.13.0`). They are not a
traffic-engineering study, they are not official, and they are provided without warranty of any kind.

### 4. Independence

This project is independent. The Alcaldía de Barranquilla, the OpenStreetMap Foundation and TypeSafe do not endorse
it and are not affiliated with it.
