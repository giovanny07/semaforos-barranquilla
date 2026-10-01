# La simulación de cada cruce

*English summary at the end.*

Al abrir un cruce en el mapa, un botón muestra una simulación con dos vistas (lado a lado en computador, una debajo de la otra
en el celular): **«Hoy, sin semáforo (simulado)»** (la calle secundaria tiene un PARE) y **«Con semáforo (simulado)»**. Es la parte que más llama la atención, y por eso conviene decir con
claridad qué es: **una ilustración del mecanismo, no un pronóstico.** El sitio la rotula «Simulación ilustrativa».

## Qué es real y qué es supuesto

| Elemento | Origen |
| --- | --- |
| Forma del cruce: cuántos accesos, hacia dónde, carriles y sentidos de cada vía | Real, de OpenStreetMap |
| Nombres de las calles | Real, de OpenStreetMap |
| Cuántos carros y motos llegan por hora a cada acceso | **Supuesto**: un valor típico de hora pico según el tipo de vía (de 60 a 1.800 vehículos por hora), con un tope por carril. No hay aforos. |
| Porcentaje de motos en el flujo (30 %) | **Supuesto**, acotado con datos del parque automotor, no con conteos |
| Cómo se maneja en el PARE: cuántos paran del todo, qué hueco aceptan, cuántos se meten a la fuerza | **Calibrado con estudios de otros lugares** (Córdoba, Argentina; India; EE. UU.) y supuestos declarados. Nada se midió en Barranquilla. |
| Tiempos del semáforo | Calculados en el código: dos fases, verde repartido según la vía más cargada, amarillo y todo rojo según la velocidad y el tamaño del cruce |

Cada número de comportamiento está en un solo lugar del código (`web/lib/sim.ts`, objeto `PARE`), con una etiqueta
que dice si es una medición de un contexto comparable `[COMP]` o un supuesto `[SUP]`. La tabla completa, con sus
fuentes, está en [`research/pare-behaviour.md`](research/pare-behaviour.md).

## Qué muestran las cifras

Debajo de cada vista aparecen, por hora simulada: carros que **se meten a la fuerza** desde la secundaria,
**frenadas en seco** en la vía principal, la **cola más larga** en la secundaria y la **espera** típica en cada vía.
Con semáforo, las entradas forzadas y las frenadas en seco son cero por diseño; a cambio, la vía principal espera más.

Esas cifras sirven para comparar las dos vistas de un mismo cruce, no para afirmar cuántas frenadas hay hoy en ese
cruce. Cambian si cambian los volúmenes supuestos, y los volúmenes reales solo se conocen con aforos.

La nota de seguridad que acompaña la simulación cita evaluaciones de EE. UU. (NCHRP Report 491, vía el CMF
Clearinghouse de la FHWA): donde se pasó de PARE a semáforo, los choques en ángulo bajaron entre un tercio y dos
tercios, y los alcances por detrás, más leves, subieron entre un 40 % y un 50 %. No se encontró ninguna evaluación
de antes y después hecha en Colombia.

## Cómo se prueba

`pnpm test` corre una prueba de regresión de la simulación sobre 10 cruces (`web/test/sim-regression.ts`): verifica
que ningún vehículo se superponga a otro y que el cruce no se bloquee por completo. No verifica que las cifras se
parezcan a la realidad, porque no hay mediciones con qué compararlas.

## Cómo mejorarla

Una hora de video en hora pico, grabada desde un punto alto en dos o tres cruces de la lista, permitiría medir en
Barranquilla cuántos conductores paran en el PARE, qué huecos aceptan y cuántos se meten a la fuerza (el método está
descrito en `research/pare-behaviour.md`, sección 3). Los aforos de la Secretaría de Tránsito permitirían reemplazar
los volúmenes supuestos por medidos. Si tienes alguno de los dos, mira «Trae mejores datos» en el
[README](../README.md#trae-mejores-datos).

---

## English summary

Each junction on the map opens a side-by-side simulation: "today, without a signal" (a stop sign on the side street)
and "with a signal". It is **an illustration of the mechanism, not a forecast**, and the site labels it as
illustrative. The junction's geometry (approaches, lanes, one-way streets) and street names are real, from
OpenStreetMap. Traffic volumes are **assumed** typical peak-hour values per road class (60 to 1,800 vehicles per hour
per approach, capped per lane), because there are no traffic counts. Driver behaviour at the stop sign is calibrated
on studies from Córdoba (Argentina), India and the US plus declared assumptions; nothing was measured in Barranquilla.
Every behavioural number lives in `web/lib/sim.ts` (`PARE`), tagged `[COMP]` (measured in a comparable context) or
`[SUP]` (assumption), with sources in [`research/pare-behaviour.md`](research/pare-behaviour.md) (in Spanish).

The figures under each view (forced entries, hard braking on the main road, longest queue, waits) compare the two
views of the same junction. They are not a measurement of what happens there today. The safety note cites US
before/after studies (NCHRP Report 491): converting a stop-controlled junction to a signal cut angle crashes by one to
two thirds and raised rear-end crashes by 40–50 %. No Colombian before/after evaluation was found.

`pnpm test` runs a regression test on 10 junctions (`web/test/sim-regression.ts`) that checks vehicles never overlap
and the junction never locks up. Video from two or three shortlisted junctions, or the city's traffic counts, would
let the behaviour and volumes be measured locally instead of assumed.
