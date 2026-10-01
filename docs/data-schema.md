# Diccionario de datos / Data dictionary

*English note at the end. Field names are in English; values shown to people are in Spanish.*

Todos los archivos geográficos son GeoJSON `FeatureCollection` en WGS84 (longitud, latitud). Las distancias están en
metros. Las fuentes y licencias de cada archivo están en [`data/README.md`](../data/README.md) y
[`data/LICENSE.md`](../data/LICENSE.md).

## `data/out/intersections.geojson` (ODbL)

Un punto por cruce: nodos compartidos por dos o más vías, con los nodos a menos de 20 m fusionados en uno (por
ejemplo, las dos calzadas de una avenida). 9.658 cruces.

| Campo | Tipo | Qué es |
| --- | --- | --- |
| `id` | texto | Identificador del cruce (`n` + id del nodo de OpenStreetMap). Une todos los archivos. |
| `streets` | texto[] | Nombres de las vías que se cruzan |
| `classes` | texto[] | Tipo de cada vía en OpenStreetMap (`trunk`, `primary`, `secondary`, `tertiary`, `unclassified`, `residential`, `living_street`) |
| `maxClass`, `minClass` | texto | El tipo más alto y el más bajo entre las vías del cruce |
| `majorStreet`, `majorClass` | texto | La vía principal (la de mayor jerarquía) y su tipo |
| `crossStreet`, `crossClass` | texto o `null` | La vía transversal y su tipo |
| `legs` | número | Accesos al cruce (las dos calzadas de una avenida cuentan como uno) |
| `maxLanes` | número o `null` | Máximo de carriles mapeados entre las vías del cruce |
| `divided` | sí/no | La vía principal tiene dos calzadas |
| `onewayT` | sí/no | Cruce en T sobre una vía de un solo sentido |
| `structure` | objeto | `roundabout`, `ramp`, `gradeSeparated`, `nearRoundabout`, `nearGradeSeparated`: si es o está junto a una glorieta, un ramal o un paso a desnivel |
| `pois` | objeto | Cuántos `school`, `hospital`, `market`, `busStop`, `worship` y `park` hay a menos de 200 m |
| `hasSignal` | sí/no | El cruce tiene semáforo (según OpenStreetMap, el inventario oficial o ambos) |
| `signalSource` | texto o `null` | Quién dice que hay semáforo: `osm`, `oficial` o `ambos` |
| `coveredBy` | texto o `null` | Si el cruce queda cubierto por el semáforo de un cruce contiguo, el `id` de ese cruce |
| `twinOf` | texto (opcional) | Si otro registro del mismo par de calles representa este cruce (por ejemplo, la otra calzada), su `id`. Este registro no entra en la lista. |
| `distNearestSignalM` | número | Distancia en línea recta al semáforo más cercano |
| `distSignalAlongM` | número o `null` | Distancia al semáforo más cercano siguiendo la vía principal (hasta 3 km) |
| `heuristicScore` | número o `null` | Puntaje de 0 a 100 calculado solo con reglas (`null` si hay semáforo). Hoy no se muestra en el mapa. |
| `heuristicReasons` | texto[] | Razones del puntaje por reglas |
| `status` | texto | Resultado de las reglas solas: `signalized`, `needs_high`, `needs_medium`, `needs_low`, `ok` |
| `jev` | objeto o `null` | Evaluación del modelo de IA, ver abajo. `null` si el cruce no se evaluó (tiene semáforo o está cubierto). |
| `priority` | texto | Nivel final: `prioritario`, `recomendado`, `observacion`, `sin_accion` o `semaforizado` (ver [`validation.md`](validation.md), sección 5) |
| `priorityScore` | número | De 0 a 100; ordena los cruces dentro de un nivel |
| `recommendation` | texto | Medida sugerida para estudio: `Semáforo vehicular`, `Semáforo peatonal`, `PARE / ceda el paso`, `Reductores de velocidad`, `Glorieta` o `Ninguna` |
| `evidence` | texto[] | Hechos que cualquiera puede verificar, en español (por ejemplo «Semáforo más cercano a 605 m sobre la Vía 40») |
| `agreement` | texto | ¿Coinciden las señales independientes (modelo, reglas, siniestros)? `alto`, `medio` o `bajo` |

### El objeto `jev` y el archivo `data/out/jev-scores.json` (generados con IA)

`jev-scores.json` es un objeto `{ "<id del cruce>": { ... } }` con estos campos, que también se copian en `jev`:

| Campo | Qué es |
| --- | --- |
| `needLevel` | Necesidad según el modelo: `ninguna`, `baja`, `media`, `alta`, `crítica` |
| `needScore` | La misma necesidad en escala de 0 a 100 |
| `warrantProb` | Probabilidad, según el modelo, de que el cruce justifique un semáforo con criterios urbanos colombianos típicos (0 a 1). Es la que se compara con el umbral de 0,7. |
| `control` | Medida que el modelo elegiría: `semáforo vehicular`, `semáforo peatonal`, `señal de PARE / ceda el paso`, `reductores de velocidad`, `glorieta`, `ninguna intervención` |
| `confidence` | Confianza del modelo en sus respuestas (0 a 1) |

`jev-scores-nocrash.json` tiene la misma forma: es la segunda evaluación, hecha sin mostrarle los siniestros al
modelo. Cómo se hacen las preguntas está en [`scorer-jev/README.md`](../scorer-jev/README.md).

## `data/out/crashes-by-intersection.json` (CC BY-SA 4.0)

Objeto `{ "<id del cruce>": { ... } }` con una entrada por cruce:

| Campo | Qué es |
| --- | --- |
| `crashes` | `{ total, injuries, deaths, period }`: siniestros asignados al cruce en 2018–2022, cuántos con heridos y cuántos con muertos |
| `crashesRecentVictims` | Siniestros con víctimas en 2023–2025 (desde 2023 ya no se registran los de solo daños) |
| `crashesPedestrian` | Atropellos en 2018–2022 |
| `crashPct` | Percentil (0 a 100) del total de siniestros frente a los cruces sin semáforo con al menos uno; `null` si no hay siniestros |
| `crashRank` | El mismo percentil, solo para cruces sin semáforo; `null` en los demás |

## `data/out/official-signals.geojson` (CC BY-SA 4.0)

Un punto por intersección del inventario oficial (342). Propiedades: `no`, `nombre`, `codigo`, `estado`
(`Funcionando`, `En Obras`, `Preventiva Funcionando`, `Funcionando Peatonal`), `fechaInicio` (fecha de inicio de
funcionamiento, tal como viene en la fuente; 145 puntos tienen 1999, probablemente una fecha por defecto) e
`intersectionId` (el cruce de OpenStreetMap asociado, o `null`). El archivo incluye `name`, `attribution` y `license`
en el nivel superior.

## `data/out/streets.geojson` y `signals.geojson` (ODbL)

- `streets`: líneas con `id` (vía de OpenStreetMap), `name`, `highway`, `lanes` (o `null`), `oneway`, `maxspeed` (o
  `null`).
- `signals`: puntos con `id` (nodo de OpenStreetMap), `kind` (`signal` para semáforos de cruce, `crossing_signal`
  para semáforos peatonales) e `intersectionId` (el cruce al que pertenece, o `null`).

## `data/out/summary.json` (ODbL)

`generatedAt` (fecha de la descarga de OpenStreetMap, para que reconstruir dé el mismo archivo), `counts` (conteos
por tipo y por nivel), `byClassPair` (conteos por par de tipos de vía), `clippedToMunicipality`, `bbox`,
`hasJevScores`, `thresholds` (umbrales en uso) y `validation` (resultados de la prueba, ver
[`validation.md`](validation.md)).

## `web/public/data/`

Las mismas estructuras, reducidas: solo los cruces con nivel distinto de `sin_accion`, y en `intersections` solo los
campos que la interfaz usa. `crashes-by-intersection.json` lleva allí solo `crashes` y `crashRank`.

---

**English note.** All geographic files are GeoJSON FeatureCollections in WGS84; distances are in metres. Every file is
keyed by the junction `id`. `intersections.geojson` (ODbL) holds geometry and road attributes from OpenStreetMap
(`streets`, `classes`, `majorStreet`, `crossStreet`, `legs`, `maxLanes`, `divided`, `structure`, `pois`), signal status
(`hasSignal`, `signalSource`, `coveredBy`, distances), the rules-only result (`heuristicScore`, `heuristicReasons`,
`status`), the AI model's answers (`jev`: `needLevel`, `needScore`, `warrantProb`, `control`, `confidence`), and the
final tier (`priority`, `priorityScore`, `recommendation`, `evidence`, `agreement`). Crash fields
(`crashes-by-intersection.json`) and the official inventory (`official-signals.geojson`) live in separate files under
CC BY-SA 4.0. `web/public/data/` holds trimmed copies with only what the UI reads.
