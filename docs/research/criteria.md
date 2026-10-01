# Criterios para semaforizar una intersección urbana

Estado: redactado 2026-09-20. Marcas de verificación:
**[V]** = leído directamente en la fuente primaria al preparar este documento. **[V-sec]** = leído en un resumen
automático de la fuente (WebFetch), no en el texto crudo. **[NV]** = no verificado en la fuente; tratar como hipótesis.

## 0. Resumen para quien tenga prisa

- Norma vigente en Colombia: **Manual de Señalización Vial 2024** (Res. MinTransporte 20243040045005 del
  17-sep-2024), **Capítulo 4 "Semaforización"**, numeral **4.3.3**. Reemplaza al Manual 2015 (donde semáforos era el Cap. 7). [V]
- Son 6 condiciones (A-F). A y B son calcos numéricos exactos del Warrant 1 del MUTCD (tabla 4C-1). [V]
- Umbral clave vehicular: vía principal **500-600 veh/h (A)** o **750-900 veh/h (B)** sumando ambos sentidos,
  y vía secundaria **150-200 veh/h (A)** o **75-100 veh/h (B)** en el acceso más cargado, **durante cada una de 8 horas**. [V]
- Peatones: **>= 250 peatones-ciclistas/h** cruzando la vía principal + **>= 1.200 veh en 2 h** (sin separador)
  o **>= 1.600** (con separador >= 1,8 m). Escolar: >250 peatones/h por 2 h, >1.600 veh, y **ningún paso seguro a < 300 m**. [V]
- Espaciamiento: un semáforo justificado solo por coordinación (Cond. D) **nunca a menos de 300 m** de otro. [V]
- Sin aforos no se puede *demostrar* ninguna condición; el puntaje del proyecto es un **tamizaje** ("candidato a
  estudio de tránsito"), no un dictamen. La UI debería decirlo así.
- El Manual **prohíbe PARE en todos los accesos** (no existe el "all-way stop" en Colombia), así que la
  escalera de alternativas es: prelación PARE/CEDA -> pacificación/reductores -> glorieta -> semáforo. [V]

## 1. Fuente colombiana: Manual de Señalización Vial 2024, Cap. 4

- PDF oficial (102 MB, descargado y leído para este documento):
  https://www.ansv.gov.co/sites/default/files/2025/Publicaciones/Manual_de_Senalizacion_Vial/Manual_de_Senalizacion_Vial.pdf
  (página índice: https://ansv.gov.co/es/publicaciones/manual-de-senalizacion-vial)
- Resolución de adopción: https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=166597 [V-sec: existencia y fecha; texto no leído]
- Manual 2015 (Res. 1885 de 2015), Cap. 7 Semáforos, sigue publicado por capítulos en
  https://mintransporte.gov.co/documentos/29/manuales-de-senalizacion-vial/ . **[NV]** No abrí el Cap. 7 de 2015;
  no afirmo que sus valores sean idénticos a los de 2024, aunque ambos derivan del MUTCD.

Las páginas citadas abajo son las impresas del Manual 2024 (pp. 383-391, 411-412).

### 1.1 Procedimiento (num. 4.3.1-4.3.2, pp. 383-386) [V]

1. La necesidad la identifica la comunidad, la autoridad de tránsito o un proyecto urbanístico generador de viajes.
2. Visita técnica cualitativa: volúmenes en conflicto (vehicular, peatonal, bici), trayectorias, **uso del suelo
   aledaño**, **antecedentes de siniestralidad**, **rutas de transporte público**.
3. Se decide si hay "soluciones diferentes al control semafórico (de menor costo y menor tiempo de implementación)".
   Solo si no las hay se pasa al estudio detallado.
4. Estudio de tránsito: aforos promediados sobre **tres días de registro**, velocidad percentil 85 en accesos no
   controlados, siniestros de **al menos el último año** (tipo, ubicación, severidad, hora), demoras por acceso, brechas.

### 1.2 Condiciones (num. 4.3.3) [V]

**Condición A - Volumen mínimo de vehículos (4.3.3.1, Tabla 4-1).** Cumplir en *cada una de las 8 horas* de
máxima demanda de un día promedio representativo:

| Carriles por acceso, vía principal | Carriles por acceso, vía secundaria | Veh/h vía principal (total ambos accesos) | Veh/h acceso más cargado de la secundaria (un sentido) |
| --- | --- | --- | --- |
| 1 | 1 | 500 | 150 |
| 2 o más | 1 | 600 | 150 |
| 2 o más | 2 o más | 600 | 200 |
| 1 | 2 o más | 500 | 200 |

**Condición B - Interrupción al tránsito continuo (4.3.3.2, Tabla 4-2).** Para cuando la secundaria sufre
"retardo o riesgo indebido" al entrar o cruzar; mismas 8 horas; aplica si el semáforo no afecta la circulación progresiva:

| Principal | Secundaria | Veh/h principal | Veh/h secundaria |
| --- | --- | --- | --- |
| 1 | 1 | 750 | 75 |
| 2 o más | 1 | 900 | 75 |
| 2 o más | 2 o más | 900 | 100 |
| 1 | 2 o más | 750 | 100 |

Reducción al **70 %** en A y B si el percentil 85 de velocidad en la principal **excede 50 km/h**, o población
<= 10 mil habitantes (lo segundo no aplica a Barranquilla). Con 70 %: A = 350-420 / 105-140; B = 525-630 / 53-70 (cálculo propio).

**Condición C - Volumen mínimo de peatones / ciclistas (4.3.3.3).** Simultáneamente, en 2 horas continuas:
- >= **1.200 veh** entrando por la vía principal (ambos sentidos) si no hay separador o mide < 1,8 m; o
- >= **1.600 veh** si hay separador >= 1,8 m; y
- >= **250 peatones/ciclistas por hora** en el paso peatonal de mayor volumen vehicular sobre la principal.
- Reducción al 70 % del volumen peatonal (175/h) si V85 > 50 km/h.
- Nota: el texto es ambiguo sobre si 1.200/1.600 es total de las 2 horas o por hora. **[NV]** la interpretación;
  en el MUTCD 1988, del que deriva, era por hora... no lo confirmé.
- **Pasos escolares**: > 250 peatones/h durante 2 h consecutivas **y** > 1.600 veh por el paso en cada una de esas
  horas **y** "no hay un paso peatonal seguro a menos de 300 m". Operación actuada por botón.

**Condición D - Movimiento o circulación progresiva (4.3.3.4).** Cualitativa: (i) vías de un sentido donde los
semáforos adyacentes están demasiado distantes para mantener pelotones; (ii) vías de dos sentidos donde el nuevo
semáforo permite conformar un sistema progresivo. Límite duro: **no instalar bajo esta condición si la
separación entre semáforos resulta inferior a 300 m**.

**Condición E - Riesgo de siniestralidad (4.3.3.5).** Se satisface con **alguna** de:
- prueba técnica de que medidas menos restrictivas (reductores, canalización, cambio de sentidos, pacificación) no redujeron los siniestros;
- volúmenes vehiculares/peatonales >= **80 %** de lo exigido en A, B o C;
- análisis técnico de riesgo que muestre riesgo "continuo e intolerable" para usuarios vulnerables, corregible con semáforo.
- Importante: a diferencia del MUTCD, el Manual 2024 **no fija un número mínimo de siniestros** (el MUTCD 2009
  pide 5 en 12 meses). No encontré cifra en 4.3.3.5.

**Condición F - Combinación (4.3.3.6).** Si ninguna se cumple al 100 % pero **dos o más se cumplen al 80 %**,
puede justificarse; debe precederla una prueba de otras medidas que causen menos demora.

**Priorización (4.3.5).** Las intersecciones justificadas se ordenan mediante "evaluación zonal" del corredor y
de la interacción con semáforos existentes o por instalar, según recursos. No da fórmula.

**Semáforo peatonal (4.6.2, pp. 411-412).** Caras peatonales obligatorias cuando, entre otros: el semáforo se
justificó por Condición C; hay fase exclusiva peatonal; hay **paso escolar** en sitio con semáforo vehicular;
giros de alto volumen; vía tan ancha que el verde vehicular paralelo no alcanza; isla central con cruce en dos etapas.

## 2. Cruce con el MUTCD (FHWA), Capítulo 4C

Fuente leída: MUTCD 2009, https://mutcd.fhwa.dot.gov/htm/2009/part4/part4c.htm **[V-sec]**. Existe la 11.ª edición
(dic-2023, https://mutcd.fhwa.dot.gov/kno_11th_Edition.htm); **[NV]** no comprobé qué cambió en 4C.

| Manual CO 2024 | MUTCD 2009 | Coincidencia |
| --- | --- | --- |
| Cond. A, Tabla 4-1 | Warrant 1 Cond. A, Tabla 4C-1 (Sec. 4C.02) | Valores idénticos (500/600, 150/200) |
| Cond. B, Tabla 4-2 | Warrant 1 Cond. B | Idénticos (750/900, 75/100) |
| 70 % si V85 > 50 km/h o pobl. <= 10 mil | 70 % si > 40 mph (64 km/h) o pobl. < 10.000 | CO es más estricto en velocidad |
| - | Warrant 2 (4 horas) y Warrant 3 (hora pico), por curvas | **Sin equivalente en CO** |
| Cond. C (250 peat/h + 1.200/1.600 veh) | Warrant 4 (Sec. 4C.05): curvas 4 h / 1 h; no aplica a < 300 ft (91 m) de otro semáforo o STOP | CO usa umbral fijo, estilo MUTCD antiguo |
| Cond. C escolar (250 peat/h, 1.600 veh, 300 m) | Warrant 5 (4C.06): brechas insuficientes y >= 20 escolares en la hora pico de cruce | CO mucho más exigente (250 vs 20) |
| Cond. D, mínimo 300 m | Warrant 6 (4C.07): no si el espaciamiento resultante < 1.000 ft (305 m) | Equivalente |
| Cond. E (sin número de siniestros) | Warrant 7 (4C.08): >= 5 choques corregibles en 12 meses + 80 % de volúmenes + alternativas ensayadas | CO conserva el 80 % y las alternativas |
| Cond. F (dos al 80 %) | Warrant 1, combinación A+B al 80 % | Similar |
| - | Warrant 8 Red vial (4C.09): >= 1.000 veh/h entrando en hora pico, cruce de dos rutas principales | Sin equivalente; útil como idea para el proxy |
| - | Warrant 9 cruce ferroviario | No aplica |

Regla común: cumplir una condición **no obliga** a instalar; es requisito necesario, no suficiente.

## 3. Proxy con datos abiertos (sin aforos)

Principio: cada condición pide un *volumen en la vía principal* y un *volumen en la secundaria*. La clase OSM
y los carriles son el mejor sustituto de ambos. Todo lo de esta sección es **una propuesta de este
proyecto**, no norma; los rangos de veh/h por clase son órdenes de magnitud **[NV]** a calibrar.

### 3.1 Qué proxy aproxima cada condición

| Condición | Lo que mide | Proxy OSM / abierto | Calidad |
| --- | --- | --- | --- |
| A Volumen mínimo | principal >= 500-600 y secundaria >= 150-200 veh/h, 8 h | `maxClass` y `minClass`: ambas deben ser altas. El factor limitante es la **secundaria**: un cruce primaria x residencial casi nunca cumple A | Media |
| B Interrupción | principal >= 750-900, secundaria >= 75-100 | `maxClass` >= secondary **y** `maxLanes` >= 2 **y** `minClass` >= tertiary/unclassified; sube si la principal es de dos calzadas (cruzarla es más difícil) | Media |
| C Peatonal | >= 250 peat/h cruzando vía cargada | POIs a 200 m: mercado, hospital, paraderos, culto, parque; densidad de población (WorldPop); `maxLanes` (ancho a cruzar); ausencia de `crossing_signal` cercano | Media-baja |
| C escolar | 250 escolares/h, sin paso seguro a < 300 m | `pois.school` > 0 **y** `maxClass` >= tertiary **y** `distNearestSignalM` > 300 | Media |
| D Coordinación | hueco en un corredor semaforizado | sobre la **misma vía** (mismo `name`/ref), distancia al semáforo anterior y siguiente; hueco >= 600 m entre dos semáforos con un cruce de clase >= tertiary en medio. Nunca puntuar si quedaría a < 300 m | Buena (es geométrica) |
| E Siniestralidad | historial de choques | conteo de siniestros geocodificados a <= 50 m (ver `data-sources.md`); si no hay coordenadas, no usar | Depende del dato |
| F Combinación | dos al 80 % | bonificación cuando dos proxies distintos están altos | - |
| (MUTCD W8) Red vial | cruce de dos rutas principales | `minClass` >= secondary | Buena |

### 3.2 Pesos relativos sugeridos (suma 100)

| Componente | Peso | Cómo puntuar |
| --- | --- | --- |
| Jerarquía del par de vías (A/B/W8) | **40** | Matriz por `maxClass` x `minClass`. Sugerencia: prim/trunk x prim = 40; prim x sec = 36; sec x sec = 32; prim x tert = 28; sec x tert = 24; tert x tert = 16; prim/sec x unclassified = 12; prim/sec x residential = 8; tert x residential = 4; resid x resid = 0 |
| Carriles y geometría | **15** | `maxLanes` >= 3: +8, = 2: +5; 4 ramas: +4 (3 ramas: +1; >= 5: +4); principal de doble calzada: +3. Si `lanes` es null, inferir de la clase y bajar la confianza |
| Espaciamiento / hueco en corredor (D) | **15** | `distNearestSignalM` < 150: x0 (veto práctico); 150-300: +0 y penalizar -10; 300-500: +8; 500-1000: +15; > 1000: +10 (puede ser zona sin red semafórica, menos beneficio de coordinación) |
| Demanda peatonal (C) | **15** | school +6 (tope), hospital +4, market +4, busStop +1 c/u hasta 4, worship/park +1; multiplicar por 1,3 si `maxLanes` >= 3 |
| Siniestralidad (E) | **15** | solo si hay datos con coordenadas; si no, **redistribuir** a jerarquía (+10) y peatonal (+5) |

Reglas duras recomendadas:
1. `minClass` en {residential, living_street} y sin escuela/hospital: tope `needs_low`. La secundaria no alcanzará 75-150 veh/h sostenidos 8 h.
2. `distNearestSignalM` < 300 sobre el mismo corredor: tope `needs_medium` y razón "A menos de 300 m de otro semáforo (Manual 2024, 4.3.3.4)".
3. motorway/trunk con enlaces a desnivel (`*_link`, `bridge`, `tunnel`): excluir, no son intersecciones a nivel.
4. Glorietas (`junction=roundabout`): marcar `ok`, ya tienen control.
5. Cruces de 3 ramas pesan menos que los de 4: menos puntos de conflicto (9 vs 32, cifra clásica de ingeniería de tránsito **[NV]**).

### 3.3 Espaciamiento típico entre semáforos en arterias

- **Colombia, Manual 2024 4.3.3.4: mínimo 300 m** para semáforos justificados por coordinación. [V] Es la única cifra normativa local que encontré.
- MUTCD 2009 Sec. 4C.07: no menos de 1.000 ft (305 m). [V-sec]
- FHWA Access Management: ideal >= 1/2 milla (~800 m) en arterias; pasar de 1/2 a 1/4 de milla empeora demoras;
  cada semáforo adicional por encima de 2 por milla aumenta ~6 % el tiempo de viaje.
  https://ops.fhwa.dot.gov/access_mgmt/docs/benefits_am_trifold.pdf [V-sec, vía resultado de búsqueda]
- Aplicación a Barranquilla: la malla es de manzanas de ~80-120 m **[NV, estimación]**, así que en el centro y
  el norte ya hay corredores con semáforo cada 1-3 cuadras; ahí la cifra útil es el mínimo de 300 m, no el
  ideal de 800 m. Usar 300 m como umbral de penalización y 600-1.000 m como "hueco" candidato.

## 4. Alternativas al semáforo y cuándo preferirlas

El Manual 2024 exige descartar primero medidas de menor costo (4.3.1) y haber probado medidas menos
restrictivas antes de invocar las condiciones E y F. [V]

| Alternativa | Preferir cuando | Fuente |
| --- | --- | --- |
| **CEDA EL PASO (SR-02)** | Jerarquía clara y el conductor de la vía menor ve toda la distancia "Y" de la vía prioritaria (Tabla 2-9 según velocidad) | Manual 2024, 2.2.3, pp. 61-62 [V] |
| **PARE (SR-01)** | Igual que arriba pero sin visibilidad suficiente. Volúmenes por debajo de A/B. **Prohibido ponerlo en todos los accesos** | Manual 2024, 2.2.3 [V] |
| **Reductores de velocidad / pompeyano / pacificación** | El problema es velocidad o cruce peatonal en vía local o colectora, no capacidad; zonas escolares. Es el paso previo que exige la Cond. E | Manual 2024, 4.3.3.5 y cap. 5 (criterios de instalación **[NV]**, no leídos) |
| **Glorieta / miniglorieta** | Volúmenes medios y equilibrados entre ramas, muchos giros a la izquierda, espacio disponible, 3-5 ramas, historial de choques en ángulo. Mal con flujos peatonales altos o un corredor coordinado | **[NV]** El Manual solo regula su señalización (SP-20), no su justificación; criterio de la práctica general (FHWA Roundabouts Guide), no consultado |
| **Semáforo peatonal con botón (actuado)** | Tramo o cruce donde el conflicto es peatón-vehículo y no vehículo-vehículo: colegios, hospitales, paraderos Transmetro, mercados sobre arteria. Requiere cumplir Cond. C | Manual 2024, 4.3.3.3 y 4.6.2 [V] |
| **Canalización, cambio de sentidos, prohibir giros a la izquierda** | Conflictos concentrados en un movimiento; pares viales de un sentido (común en Barranquilla) | Manual 2024, 4.3.3.5 (mencionadas como medidas previas) [V] |
| **Semáforo intermitente / de destello** | Advertencia en cruce de baja demanda o fuera de hora pico | Manual 2024, 4.10 (existe la sección; contenido **[NV]**) |

Sugerencia inicial para el campo `control` de la evaluación (`scorer-jev/`; las etiquetas que usa hoy están en
`docs/data-schema.md`): `semaforo`, `semaforo_peatonal`, `glorieta`, `pare_ceda`,
`pacificacion`, `ninguno`.

## 5. Pendiente / no verificado

- Cap. 7 del Manual 2015: no leído; no sé si difiere de 2024.
- Interpretación de 1.200/1.600 veh de la Cond. C (por hora o por 2 horas).
- MUTCD 11.ª ed. (2023): cambios en 4C no revisados.
- Rangos de veh/h por clase OSM en Barranquilla: sin fuente; calibrar con aforos si aparecen (ver `data-sources.md`).
- Criterios formales para glorietas y reductores: no leídos en fuente.
