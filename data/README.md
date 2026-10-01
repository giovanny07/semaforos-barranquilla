# Datos / Data

*English summary at the end.*

Todo lo que el mapa muestra sale de los archivos de esta carpeta. Corte de los datos: **20 de septiembre de 2026**.
Las licencias están en [`LICENSE.md`](LICENSE.md); los campos de cada archivo, en
[`docs/data-schema.md`](../docs/data-schema.md).

## Fuentes

| Fuente | Qué aporta | Licencia | Consulta | Última actualización en la fuente |
| --- | --- | --- | --- | --- |
| [OpenStreetMap](https://www.openstreetmap.org), vía la API Overpass | Calles, cruces, semáforos, colegios, centros de salud, mercados, paraderos, límite municipal | ODbL 1.0 | 20 sep 2026 (21 sep, 01:54 UTC) | continua |
| «Accidentalidad en Barranquilla», Alcaldía Distrital de Barranquilla, datos.gov.co [`yb9r-2dsi`](https://www.datos.gov.co/d/yb9r-2dsi) | Siniestros viales registrados por la policía (IPAT), 2018 a junio de 2026 | CC BY-SA 4.0 | 20 sep 2026 | 28 jul 2026 |
| «Semaforización en Barranquilla», Alcaldía Distrital de Barranquilla, datos.gov.co [`svyb-d6ts`](https://www.datos.gov.co/d/svyb-d6ts) | Inventario oficial de 342 intersecciones semaforizadas | CC BY-SA 4.0 | 20 sep 2026 | versión sep/oct 2023 de la Secretaría de Tránsito; las filas en datos.gov.co figuran actualizadas en sep 2022 |
| Jev, de TypeSafe (modelo `jev-1.13.0`, API de pago) | Evaluación de cada cruce sin semáforo | resultados publicados bajo ODbL como parte de la base | 20 sep 2026 | — |

Fuente de los datos de la Alcaldía: Portal de Datos Abiertos www.datos.gov.co.

## Archivos

### `data/raw/`: la descarga original

Se guarda en el repositorio para que `pnpm data` reproduzca los números publicados sin conexión. Una descarga nueva
(`pnpm run fetch --force`) da otros resultados, porque OpenStreetMap cambia cada día.

| Archivo | Contenido | Licencia |
| --- | --- | --- |
| `ways.json` | 14.383 vías de OpenStreetMap en el área de estudio | ODbL 1.0 |
| `signals.json` | Nodos de semáforo de OpenStreetMap | ODbL 1.0 |
| `pois.json` | Colegios, centros de salud, mercados, paraderos, iglesias y parques de OpenStreetMap. Solo se guardan el nombre y el tipo: se quitaron teléfonos, correos y demás datos de contacto. | ODbL 1.0 |
| `boundary.json` | Límite del distrito de Barranquilla en OpenStreetMap | ODbL 1.0 |
| `crashes-yb9r-2dsi.json` | Los 28.523 registros de siniestros, reducidos a cuatro campos: año, gravedad, clase y dirección escrita. Sin fecha exacta, hora ni datos de personas. | CC BY-SA 4.0 |

Área de estudio: `10.89,-74.93,11.07,-74.74` (sur, oeste, norte, este), recortada luego al límite del distrito.

### `data/out/`: la base completa

La produce `pnpm data` (sin conexión). Los archivos `jev-scores*.json` y `backtest.json` los producen `pnpm score` y
el *backtest* de `scorer-jev/` (de pago), y se guardan aquí para que nadie más tenga que pagar.

| Archivo | Contenido | Licencia |
| --- | --- | --- |
| `intersections.geojson` | Los 9.658 cruces, con jerarquía vial, distancias, equipamientos cercanos, evaluación, nivel, recomendación y evidencia | ODbL 1.0 |
| `streets.geojson` | 9.272 vías con nombre, tipo, carriles, sentido y velocidad máxima | ODbL 1.0 |
| `signals.geojson` | 1.223 nodos de semáforo y el cruce al que pertenecen | ODbL 1.0 |
| `summary.json` | Conteos, umbrales y resultados de la validación | ODbL 1.0 |
| `jev-scores.json` | Evaluación de 9.230 cruces sin semáforo (generada con IA) | ODbL 1.0 |
| `jev-scores-nocrash.json` | Segunda evaluación, sin mostrarle los siniestros al modelo, de 3.260 cruces sobre vías colectoras o mayores (generada con IA) | ODbL 1.0 |
| `backtest.json` | Resultados de la prueba contra los cruces ya semaforizados y umbrales elegidos | ODbL 1.0 |
| `reports/crash-match.json` | Cómo se asignaron los siniestros a los cruces, con una muestra de direcciones | **CC BY-SA 4.0** |
| `reports/signals-reconciliation.json` | Comparación entre OpenStreetMap y el inventario oficial (incluye nombres, estados y fechas del inventario) | **CC BY-SA 4.0** |
| `crashes-by-intersection.json` | Siniestros por cruce (2018–2022 y víctimas 2023–2025), unidos por el `id` del cruce | **CC BY-SA 4.0** |
| `official-signals.geojson` | Los 342 puntos del inventario oficial, cada uno con el cruce de OpenStreetMap que le corresponde | **CC BY-SA 4.0** |

Los datos de la Alcaldía van en archivos aparte para que conserven su licencia CC BY-SA 4.0; el mapa los une a los
cruces por `id` en el navegador.

### `web/public/data/`: lo que descarga el mapa

Copia reducida de `data/out/` que hace `pnpm data`: solo los 836 cruces que el mapa dibuja (51 prioritarios,
131 recomendados, 293 en observación y 361 con semáforo) y solo los campos que la interfaz usa. Mismas licencias.

### Otros

- `scorer-jev/fixtures/intersections.sample.geojson`: cuatro cruces de ejemplo para las pruebas. ODbL 1.0.
- `docs/research/data/semaforos-oficial-2023.geojson`: el inventario oficial en la forma que lee el pipeline.
  CC BY-SA 4.0.

## Lo que no está

- Las respuestas completas del modelo (unas 23.000, con sus probabilidades) se guardan solo en la caché local del
  evaluador (`scorer-jev/cache/`, fuera de git). Con ellas cualquiera podría rehacer las evaluaciones y la prueba sin
  pagar. No se publican por ahora, hasta confirmar con TypeSafe que se pueden redistribuir.
- Ningún registro individual de siniestros con fecha, hora o datos de las personas. El conjunto hermano de la Alcaldía
  con edad y sexo de las víctimas (`y628-5q9a`) no se usa.
- Aforos (conteos de tránsito). Existen en la Secretaría de Tránsito, pero sin coordenadas; ver
  [Trae mejores datos](../README.md#trae-mejores-datos).

## Cómo citar los datos

> Pay, V. (2026). *Semáforos de Barranquilla: base de datos de cruces, semáforos y candidatos para estudio técnico*
> (corte 20-sep-2026, v0.1.0). ODbL 1.0. © colaboradores de OpenStreetMap; incluye datos de la Alcaldía Distrital de
> Barranquilla (datos.gov.co, CC BY-SA 4.0). https://github.com/Victorpay1/semaforos-barranquilla

Si usas solo los siniestros o el inventario oficial, cita también a la fuente original: «Alcaldía Distrital de
Barranquilla, Atlántico, “Accidentalidad en Barranquilla” (`yb9r-2dsi`) / “Semaforización en Barranquilla”
(`svyb-d6ts`), Portal de Datos Abiertos www.datos.gov.co, CC BY-SA 4.0».

## Correcciones y actualizaciones

Cada corrección o actualización de datos queda anotada, con fecha y motivo, en [`CHANGELOG.md`](../CHANGELOG.md).
Para reportar un error usa el formulario
[Corrección de datos](https://github.com/Victorpay1/semaforos-barranquilla/issues/new/choose).

---

## English summary

Everything the map shows comes from this folder. Data cut-off: **20 September 2026**. Licenses are in
[`LICENSE.md`](LICENSE.md); field definitions in [`docs/data-schema.md`](../docs/data-schema.md).

**Sources:** OpenStreetMap via Overpass (streets, junctions, signals, points of interest, boundary; ODbL 1.0;
downloaded 20 Sep 2026); the Alcaldía Distrital de Barranquilla's crash records "Accidentalidad en Barranquilla"
(datos.gov.co `yb9r-2dsi`, police reports 2018 to June 2026, CC BY-SA 4.0, source last updated 28 Jul 2026) and
official signal inventory "Semaforización en Barranquilla" (`svyb-d6ts`, 342 signalized junctions, Sep/Oct 2023
version, CC BY-SA 4.0); and the Jev decision model by TypeSafe (`jev-1.13.0`, paid API), whose outputs are published
under the ODbL as part of the database.

**Files:** `data/raw/` holds the original download so `pnpm data` can reproduce the published numbers offline (POIs
keep only name and type; crash records keep only year, severity, type and written address). `data/out/` holds the
full database: `intersections`, `streets`, `signals`, `summary`, the model scores and the backtest (ODbL 1.0), plus
`crashes-by-intersection.json` and `official-signals.geojson` (CC BY-SA 4.0), kept in separate files so the
Alcaldía's data keeps its license. `web/public/data/` is the trimmed copy the map downloads (836 junctions).

**Not included:** the model's raw answers (about 23,000, kept only in the scorer's local cache; not published until TypeSafe confirms
they can be redistributed), individual crash records with date, time or personal data, and traffic counts.

**How to cite:** Pay, V. (2026). *Semáforos de Barranquilla: database of junctions, traffic signals and candidates for
technical study* (cut-off 20 Sep 2026, v0.1.0). ODbL 1.0. © OpenStreetMap contributors; includes Alcaldía Distrital de
Barranquilla data (datos.gov.co, CC BY-SA 4.0). https://github.com/Victorpay1/semaforos-barranquilla

Data corrections and refreshes are logged, with date and reason, in [`CHANGELOG.md`](../CHANGELOG.md).
