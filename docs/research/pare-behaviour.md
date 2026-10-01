# Comportamiento real en un PARE: parámetros para el panel "Hoy, sin semáforo"

Fecha de la búsqueda: 2026-09-20. Alcance: evidencia publicada sobre cómo se comportan los conductores en
intersecciones de prioridad (PARE) en Colombia y en contextos comparables, para fijar los parámetros del
modo `today` de `web/lib/sim.ts`.

Aviso de honestidad, antes de la tabla: **no se encontró ninguna medición publicada, hecha en Barranquilla ni en
otra ciudad colombiana, de brechas críticas vehiculares, cumplimiento del PARE o frecuencia de entradas
forzadas.** Lo único [medido en Colombia] en esta tabla es la composición del parque automotor y la
descripción cualitativa del comportamiento de los motociclistas. El resto procede de Argentina (Córdoba),
India, Líbano, Australia y EE. UU., o es un supuesto declarado. La tabla lo dice fila por fila.

Etiquetas: `[COL]` = medido en Colombia · `[COMP]` = medido en contexto comparable · `[SUP]` = supuesto razonable.
"Verificado" significa que el texto de la fuente se abrió y se leyó al preparar este documento; "no abierto" significa que
solo se vio el resumen o un fragmento del buscador (editorial con muro de pago o error 403).

## 1. PARAMETER TABLE (pegable en un comentario de código)

```
PARE behaviour, "today" mode. Sources and caveats: docs/research/pare-behaviour.md
Tags: [COL] measured in Colombia  [COMP] measured in a comparable context  [SUP] reasonable assumption

 #  parameter                      recommended        plausible range   tag     source
 1  fullStopShare                  0.10               0.05-0.35         [SUP]   upper bound 0.35 = USA, Woldeamanuel 2012 (n=2400: 35% full, 52% rolling, 13% none)
    (voluntary full stop when nothing forces it; cars blocked by traffic still stop)
 2  rollingShare / noSlowShare     0.65 / 0.25        0.50-0.75/0.13-0.40 [SUP] same; India (Dutta & Ahmed 2018): 37-75% of entries taken on the lag, without waiting
 3  rollSpeedAtLine                2.0 m/s            1.0-3.0 m/s       [SUP]   "rolling stop" defined as <= 5 mph (2.2 m/s) in Woldeamanuel 2012
 4  criticalGap car, right turn    4.6 s              4.0-6.2 s         [COMP]  HCM2010 6.2 s x 0.75 (Cordoba found -25%); no direct Latin American measurement for this movement
 5  criticalGap car, through       4.9 s              4.0-6.5 s         [COMP]  HCM2010 6.5 s x 0.75; same basis
 6  criticalGap car, left turn     4.8 s (T) / 5.3 s  4.3-7.1 s         [COMP]  Cordoba, Depiante & Galarraga 2012: 4.77 +/- 1.35 s (n=308) vs HCM 6.4-7.1; India 4.3-5.4 s (Ashalatha & Chandra 2011, not opened)
 7  extra per additional main lane +0.35 s            0-0.7 s           [SUP]   keeps the engine's current rule; HCM2010 adds 0.4-0.7 s from 2 to 4 lanes
 8  followUpTime (normal queue)    2.8 s              2.5-3.5 s         [COMP]  Cordoba: 2.80 +/- 0.86 s (n=225), 20% below HCM2010 (3.3-4.0 s)
 9  forcerShare (driver trait)     0.30 of cars       0.10-0.37         [COMP]  India: 35-37% of accepted entries were forced (Dutta & Ahmed 2018, 3 sites, n=636); Australia >9% at high saturation (Troutbeck & Kako 1999, not opened)
10  minAcceptedGap, forcer         2.2 s              2.0-2.5 s         [COMP]  Dutta & Ahmed 2018: critical gap of aggressive drivers 2.06-2.44 s; every forced entry used a gap <= 6 s
11  minAcceptedGap, patient driver 3.5 s              3.0-4.0 s         [SUP]   engine uses 4.0 s today; no measurement of the floor
12  impatience: wait to reach min  30 s (start at 8 s, -0.06 s per s)   15-60 s [SUP]   direction is documented (Mahmassani & Sheffi 1981; Pollatschek et al. 2002, not opened), magnitude is not
    NOTE forcing is NOT driven by waiting: Beirut (Kaysi & Abbany 2007) and India (Dutta & Ahmed 2018) both found
    waiting time insignificant; most forced entries happen on arrival. Model forcing as a driver trait (#9), not a timer.
13  pMainYieldsToNose (courtesy)   0.5 per main car   0.3-0.8           [SUP]   no measurement found. Once the nose blocks > half a lane the main car must brake or swerve (p = 1)
14  encroachTrigger                1.0 m into near lane 0.5-1.5 m       [SUP]   no measurement found
15  creepSpeed while nosing        1.0 m/s            0.5-1.5 m/s       [SUP]   no measurement found
16  mainRoadDecelForced            3.0 m/s2 (max 4.5) 2.0-4.5 m/s2      [SUP]   matches engine BRAKE / BRAKE_MAX. Measured effect is on speed, see #17
17  mainRoadSpeedDropForced        to <= 30% of approach speed  0-30%   [COMP]  India, Advani et al. 2020: a forced entry = main vehicle loses >= 73% of its speed; some are brought to a full halt (Dutta & Ahmed 2018, Fig. 7)
18  swerveInsteadOfBrake           0.3 if a second lane or >= 1.5 m is free, else 0   0-0.5   [SUP]   described qualitatively only; motorcycles ~always swerve
19  followersPerForcedGap          mean 1.5 (each next car goes with p=0.5, cap 3)  0-3   [SUP]   no measurement found
20  followerHeadwayForced          2.2 s              2.0-2.8 s         [SUP]   below #8 because the main stream is already stopped; upper bound = Cordoba follow-up 2.8 s
21  motoShareInTraffic             0.30               0.20-0.45         [SUP]   fleet data only: Barranquilla-registered fleet 14.8% motorcycles [COL] (datos.gov.co, June 2026), Atlantico 47% [COL] (RUNT via El Heraldo 2017). No traffic count found
22  taxiShareInTraffic             0.15               0.10-0.25         [SUP]   public-service cars = 6.0% of Barranquilla fleet [COL]; taxis drive all day, so stream share is higher
23  busShareInTraffic              0.05               0.03-0.08         [SUP]   bus+buseta+microbus = 3.8% of Barranquilla fleet [COL]
24  criticalGap motorcycle         3.0 s (forcer 2.1) 2.0-3.4 s         [COMP]  Dutta & Ahmed 2018: two-wheelers 2.97-3.37 s patient, 2.06-2.44 s aggressive
25  motoFilterToFront              yes, 2 abreast beside the head car   -       [COL]   qualitative: Pena Cabra (Uniandes, Medellin video, c. 2013); Ospina-Mateus 2021 (Cartagena, 17 junctions, 36 h video)
26  motoForcerShare                0.23               0.18-0.30         [COMP]  Dutta & Ahmed 2018: 22-24% of two-wheelers forced vs 50-57% of cars (motos slip through without needing to force)
27  twoStageUse (divided or >= 4-lane main road, through/left) 0.8 when far side is busy   0.5-1.0   [SUP]   behaviour documented (Cordoba; HCM2010), frequency not measured
28  twoStageCriticalGap per stage  4.1 s              3.5-5.5 s         [COMP]  HCM2010 5.5 s per stage x 0.75; refuge holds 1 car or 2-3 motos
29  yieldToPedestrianWaiting       0.3                0.1-0.5           [SUP]   no Colombian observation found; Argentina: pedestrian priority ignored "in more than 50%" of cases (Depiante et al. 2007, cited)
30  yieldToPedestrianAlreadyInLane 1.0 (brake or go round)  -           [SUP]   physical necessity
```

Cómo encaja con el motor actual (`mayEnter`): hoy el código exige `dwell >= 1` s (parada completa universal),
usa las brechas HCM sin ajuste (6,2 / 6,5 / 7,1 s), empieza la impaciencia a los 20 s y nunca baja de 4 s; la
vía principal jamás cede (`og === 1 && g === 0 → continue`). Las filas 1-3, 4-6, 9-12 y 13-17 sustituyen
exactamente esos cuatro puntos.

## 2. Evidencia detrás de cada fila

### 2.1 Cumplimiento del PARE (filas 1-3)

- **Woldeamanuel (2012), St. Cloud, Minnesota, EE. UU.** Verificado (PDF leído). 2.400 vehículos en cuatro
  intersecciones: 35 % parada completa, 52 % *rolling stop* (definido como ≤ 5 mph, unos 8 km/h, sin llegar a
  cero), 13 % sin parar. La presencia de policía a menos de una cuadra es la variable que más aumenta la parada
  completa (+17 puntos). Es un contexto de cumplimiento alto, por eso se usa como **techo**, no como valor.
  *Journal of the Transportation Research Forum* 51(3):109-123.
  https://trforum.org/wp-content/uploads/2017/04/2012v51n3_07_StopControlledIntersections.pdf
- El mismo artículo cita a National Safe Kids Campaign (2003): casi la mitad de 25.660 vehículos no paró del
  todo, más de un tercio rodó y cerca de un décimo ni redujo velocidad. Cita secundaria, no abierta.
- **Dutta y Ahmed (2018), noreste de la India.** Verificado. Describe literalmente el fenómeno que relata el
  autor del proyecto: donde hay señal de pare en la vía secundaria, "en muchos casos los conductores no paran
  ni reducen velocidad ni ceden el paso... los vehículos de la vía principal se ven obligados a frenar o incluso
  a detenerse". Entre el 37 % y el 75 % de las entradas se hicieron en el primer hueco disponible (*lag*), es
  decir, al llegar, sin esperar. https://doi.org/10.1007/s40534-017-0151-9 (acceso abierto:
  https://d-nb.info/1152189255/34)
- América Latina: no se halló ningún estudio observacional con porcentajes. Una búsqueda devolvió una
  estimación de 794.000 PARE no respetados al día en Buenos Aires, pero no se pudo localizar la fuente
  primaria; **no se usa**.
- Velocidad en la línea (fila 3): no hay medición. 2 m/s es coherente con la definición operativa de *rolling
  stop* (≤ 2,2 m/s) y con la geometría del motor (3,4 m entre línea de pare y borde de calzada).

### 2.2 Brechas críticas y tiempo de seguimiento (filas 4-8)

- **Depiante y Galarraga (2012), Córdoba, Argentina.** Verificado (dos ponencias leídas). Giro a la izquierda
  desde la secundaria en una T: brecha crítica por máxima verosimilitud **4,77 ± 1,35 s (n = 308)** y tiempo de
  seguimiento **2,80 ± 0,86 s (n = 225)**, "inferiores a los propuestos en el HCM2010 en un 25 % y 20 %". Por
  el método de Siegloch: 4,96-5,26 s y 2,68-2,86 s. Con el mayor volumen conflictivo la brecha bajó a 4,28 s.
  Los autores citan además a Galarraga et al. (2002): en cinco intersecciones de la ciudad **todos** los
  movimientos de la secundaria dieron valores inferiores al manual (cifras no reproducidas en el texto abierto).
  Con 1.500 veh/h en conflicto, la capacidad real fue un 35 % mayor que la del HCM (345 frente a 256 veh/h).
  http://redpgv.coppe.ufrj.br/index.php/es/produccion/articulos-cientificos/2012-1/621-recomendaciones-para-la-aplicacion-de-la-metodologia-del-hcm-para-intersecciones-no-semaforizadas/file
  y .../2012-1/619-intervalos-criticos-y-capacidad-en-intersecciones-no-semaforizadas-de-tres-ramas/file
  (el servidor tiene el certificado TLS caducado; se descargó por HTTP).
- **Valores base HCM2010** (reproducidos en la misma ponencia, verificados ahí): giro a la derecha 6,2 / 6,9 /
  7,1 s (2 / 4 / 6 carriles en la principal); cruce 6,5 s; giro a la izquierda 7,1 / 7,5 / 6,4 s; seguimiento
  3,3 / 4,0 / 3,5 s. En T se restan 0,7 s al giro a la izquierda.
- **Ashalatha y Chandra (2011), India**, *KSCE J. Civil Eng.* 15(8):1427-1434. No abierto (solo fragmento del
  buscador): giro desde la secundaria cruzando el flujo, 4,30-5,40 s (media 5,01 s), entre un 11 % y un 28 %
  por debajo del HCM2000. https://link.springer.com/article/10.1007/s12205-011-1392-5
- **Dutta y Ahmed (2018)**, Tabla 9, verificado: automóviles 4,79 s (no agresivos) y 2,12 s (agresivos);
  motos 2,97-3,37 s y 2,06-2,44 s. Velocidades en la principal de unos 20 km/h en hora punta, lo que explica
  valores tan bajos; por eso se toman como **suelo** (fila 10) y no como valor central para automóviles.
- Por qué 0,75 × HCM y no los valores indios: Córdoba es el contexto más parecido con medición formal
  (ciudad latinoamericana, automóviles, prioridad señalizada pero poco respetada). Aplicar su reducción del
  25 % a los tres movimientos es una extrapolación: solo se midió el giro a la izquierda. Queda etiquetado
  `[COMP]` con esa salvedad.

### 2.3 Entrada forzada, prioridad limitada y prioridad compartida (filas 9-10, 13-18)

- **Troutbeck y Kako (1999)**, "Limited priority merge at unsignalized intersections", *Transp. Res. A*
  33(3-4):291-304. No abierto (muro de pago). Según el resumen, las observaciones de campo mostraron que con
  flujos altos los intervalos de la corriente principal **aumentan** por los vehículos que se incorporan: la
  principal se retrasa ligeramente para acomodarlos. Un artículo posterior (Qu et al. 2014, no abierto, visto
  como fragmento) resume que las brechas forzadas superaron el **9 %** de las incorporaciones en alta
  saturación, en rotondas australianas. De memoria, sin poder verificarlo aquí: la prioridad limitada aparece
  cuando la brecha crítica es menor que la suma del tiempo de seguimiento y el intervalo mínimo de la principal
  (tc < tf + τ). Tratar esa condición como no verificada.
  https://www.sciencedirect.com/science/article/abs/pii/S0965856498000469
- **Depiante y Galarraga (2012), Córdoba.** Verificado. Observación de campo: con los volúmenes más altos "los
  vehículos de la corriente principal debían frenar ante el ingreso de algunos de los vehículos de la calle
  secundaria... A volúmenes cercanos a la capacidad los conductores de las corrientes conflictivas
  'comparten' prioridades". Los datos disponibles se concentraban entre **1.000 y 1.500 veh/h** en conflicto.
  Es la mejor referencia latinoamericana de **cuándo** empieza el fenómeno; no da frecuencia.
- **Dutta y Ahmed (2018).** Verificado. Definen *forced entry* como la entrada que obliga a frenar a la
  principal. **35-37 % de las entradas aceptadas fueron forzadas** en los tres sitios (n = 200, 238, 198). Por
  tipo: forzó el 50-57 % de los automóviles y el 18-24 % de las motos. El 73 %, 53 % y 31 % de los conductores
  agresivos forzó en el primer hueco. Todos los forzadores aceptaron huecos ≤ 6 s; los no agresivos, hasta 11 s.
- **Kaysi y Abbany (2007), Beirut**, *Accid. Anal. Prev.* 39(4):671-678. Resumen verificado (PubMed
  17157794). Intersección "de prioridad pero con poco respeto a las medidas de control". Determinantes de la
  maniobra agresiva: edad, prestaciones del vehículo y velocidad media de la principal. "El tiempo total de
  espera... tiene poca significación para provocar el comportamiento de forzar."
- **Advani, Gupta, Velmurugan, Madhu y Chandra (2020), India (CSIR-CRRI, proyecto Indo-HCM)**, *Transp. Res.
  Rec.* 2674(8):420-428. Resumen verificado (Crossref). Una entrada se clasifica como forzada cuando el vehículo
  de la principal pierde **el 73 % o más de su velocidad**. https://doi.org/10.1177/0361198120925258
- **Pawar y Patil (2018)**, simulador de conducción, *Transp. Res. F* 52:164-175. No abierto. Tiempo de
  respuesta del conductor de la principal ante la maniobra agresiva: percentil 90 entre 0,1 y 1,8 s, percentil
  10 entre 6,3 y 9,4 s. No se obtuvo la deceleración.
- Deceleración (fila 16): no se encontró valor medido para esta situación. 3,0 m/s² es la frenada cómoda que ya
  usa el motor y está cerca de los 3,4 m/s² que AASHTO emplea para la distancia de parada (dato de manual, no
  abierto para este documento). Supuesto.
- Probabilidad de ceder ante el morro (fila 13), distancia de invasión (14), velocidad de avance (15) y esquive
  (18): **nada medido**. Son supuestos calibrados para reproducir las frecuencias de las filas 9 y 17.

### 2.4 Impaciencia (filas 11-12)

- La dirección del efecto está en la literatura clásica (Mahmassani y Sheffi 1981; Pollatschek, Polus y Livneh
  2002, *Transp. Res. B* 36; Polus et al. sobre rotondas: brecha crítica como función lineal decreciente de la
  espera media), citada y resumida en **Viti et al. (2013)**, Lovaina, texto verificado:
  https://lirias.kuleuven.be/retrieve/674df19f-c1f9-427b-9ba1-8533bb79d067. No se obtuvo una pendiente en
  segundos por segundo de espera utilizable. Los números de la fila 12 son supuestos.
- Lo que sí está medido (Beirut, India) es que **forzar no depende de la espera**. Implicación para el modelo:
  dos mecanismos separados. (a) Rasgo del conductor: un 30 % entra forzando desde que llega. (b) Impaciencia
  suave para el resto, de la brecha base a 3,5 s en unos 30 s.

### 2.5 Avance poco a poco y cruce en dos etapas (filas 14-15, 27-28)

- **HCM2010** (tabla verificada en Depiante y Galarraga 2012): con refugio en la mediana, el cruce pasa de una
  brecha de 6,5 s a dos de 5,5 s, y el giro a la izquierda de 7,1 s a dos de 6,1 s. Base teórica: Brilon, Wu y
  Troutbeck (1996), https://homepage.rub.de/ning.wu/pdf/TWOSTAGE_TRR_1555.pdf (no abierto).
- **Córdoba**, verificado: un "pequeño cordón divisorio" era usado "por solamente un vehículo para cruzar en
  etapas de manera forzada afectando de alguna manera la circulación sobre la calle principal". Confirma que
  en América Latina se cruza en dos etapas aunque el refugio sea mínimo y que el vehículo detenido en el centro
  estorba a la principal.
- El HCM2010 anota que en vías principales de seis carriles se observaron entradas desde la secundaria con
  vehículos en conflicto en el carril más lejano: el conductor ocupa los carriles cercanos antes de que el
  lejano esté libre. Es el mismo mecanismo que el avance por carriles.
- No se encontró medición de cuánto invade el morro antes de que la principal ceda, ni de la frecuencia del
  cruce en dos etapas. Supuestos.

### 2.6 Pelotón tras una brecha forzada (filas 19-20)

- No se encontró ninguna medición del número de seguidores por brecha forzada ni de sus intervalos. La única
  cifra cercana es el tiempo de seguimiento normal de Córdoba (2,8 s), usado como techo. El valor de 2,2 s y la
  media de 1,5 seguidores son supuestos. Conviene limitar a 3 para que la principal recupere el paso.

### 2.7 Composición vehicular y motos (filas 21-26)

- **Parque automotor activo matriculado en Barranquilla, junio de 2026.** Verificado y calculado al preparar este documento
  desde la API de Datos Abiertos (conjunto `g4h5-prph`, Secretaría de Tránsito): 214.572 automotores, de ellos
  automóvil 51,3 %, camioneta 23,1 %, **motocicleta 14,8 % (31.714)**, campero 4,6 %, bus 2,4 %, camión 1,7 %,
  microbús 0,8 %, buseta 0,6 %. Automóviles de servicio público (taxis en su mayoría): 12.914, el 6,0 %.
  https://www.datos.gov.co/Transporte/Parque-Automotor-Activo-de-Barranquilla-Acumulado-/g4h5-prph
- **Atlántico, RUNT (El Heraldo, 12-08-2017).** Verificado: 438.754 vehículos, **47 % motos** (205.245).
  Matrícula por municipio: Sabanagrande 87.245, Galapa 37.654, Soledad 36.276, Barranquilla 33.871. Las motos
  que circulan en Barranquilla están matriculadas sobre todo fuera del distrito, así que el 14,8 % subestima
  su presencia en la calle.
  https://www.elheraldo.co/atlantico/en-atlantico-47-del-parque-automotor-son-motocicletas-392019
- **No se encontró ningún aforo con composición vehicular de Barranquilla** (el documento de Fundesarrollo
  sobre movilidad es un PDF escaneado sin texto; el Plan Maestro no apareció). El 30 % de motos en el flujo
  es un supuesto entre ambos datos de parque. El decreto 0913 de 2024 restringe la circulación de motos en
  ciertas zonas y horarios, lo que puede bajar la cifra en algunos cruces.
- **Brecha crítica de motos:** Dutta y Ahmed (2018), arriba. Un estudio de rotondas en Vietnam da 1,25 s y otro
  de Malasia una reducción de 0,17-0,20 s cuando hay motos (ambos solo como fragmento, no abiertos).
- **Filtrado al frente de la cola.** Verificado: Peña Cabra, tesis de maestría, Universidad de los Andes
  (asesor J. P. Bocarejo; vídeo de Medellín; c. 2013, la portada extraída no trae fecha), describe el
  filtrado entre carriles y la aglomeración al frente de la cola, que depende de la separación lateral entre
  autos y desaparece a velocidades altas.
  https://repositorio.uniandes.edu.co/server/api/core/bitstreams/9767a3de-6a1d-4001-b4c8-31e9fdb45dc4/content
- **Ospina-Mateus (2021), tesis doctoral, Pontificia Universidad Javeriana**, Cartagena: 10 intersecciones en T
  y 7 en cruz, 36 h de vídeo. Conductas inseguras de los motociclistas: exceso de velocidad, **no detenerse en
  la intersección**, observación inadecuada al entrar, adelantamientos ilegales. Las intersecciones sin
  semáforo presentaron el mayor riesgo. Solo se leyó la ficha de la tesis; no se obtuvieron porcentajes.
  https://www.iit.comillas.edu/publicacion/tesis/es/10196/

### 2.8 Seguridad: qué cambia el semáforo (para el pie de figura)

- **CMF Clearinghouse (FHWA), entradas 317, 318, 320 y 321.** Verificado. NCHRP Report 491 (McGee et al. 2003),
  antes-después con Bayes empírico, zona urbana, de PARE a semáforo: choques en ángulo **CMF 0,66** (3 ramas) y
  **0,33** (4 ramas); alcances por detrás **CMF 1,50** (3 ramas) y **1,38** (4 ramas). Entradas 322-324 (4
  ramas, principal ≥ 40 mph): todos los choques 0,95, ángulo 0,33, alcance 2,43.
  https://cmfclearinghouse.fhwa.dot.gov/detail.php?facid=317
- Lectura honesta para el pie: el semáforo reduce entre un tercio y dos tercios los choques en ángulo (los
  graves, los que produce la entrada forzada) y aumenta los alcances (más leves) en torno a un 40-50 %. El total
  baja poco. Son datos de EE. UU.; **no se encontró ninguna evaluación antes-después colombiana.**
- India, Bhopal (Singh, Das y Ghosh 2024, *Heliyon*, verificado): en cinco intersecciones sin semáforo, entre
  el 25 % y el 43 % de los conflictos fueron críticos; las motos sumaron el 46-58 % de los vehículos
  implicados. https://pmc.ncbi.nlm.nih.gov/articles/PMC10943440
- Barranquilla: notas de la Alcaldía sobre las medidas para motociclistas señalan "no respetar las señales de
  tránsito" como hipótesis más frecuente, e incluyen "no respetar el PARE"; en 2024, 40 de 84 víctimas fatales
  (48 %) eran motociclistas. Visto solo como fragmento del buscador; la página no se pudo abrir. **No verificado:**
  no citar estas cifras sin abrir antes la fuente.

### 2.9 Peatones (filas 29-30)

- No se halló ningún estudio observacional colombiano con el porcentaje de conductores que cede el paso en la
  cebra. La ANSV anuncia un estudio observacional nacional de comportamiento, pero la página no muestra cifras.
- Córdoba, verificado como cita secundaria: el peatón tiene prioridad legal "aunque esta prioridad en la
  práctica no se cumpla, en algunos casos hasta en más del 50 %" (Depiante et al. 2007).
- Tunja (Guío-Burgos et al. 2023, UPTC, *Rev. Fac. Ing. Univ. Antioquia*) estudia las brechas que aceptan los
  **peatones** al cruzar a mitad de cuadra: en Colombia es el peatón quien busca el hueco. No abierto (el
  servidor de SciELO rechazó la conexión).
- Recomendación para la animación: en "hoy", los autos no se detienen por un peatón que espera en el andén
  (0,3); sí frenan o lo rodean si ya está en su carril. En "con semáforo", el peatón cruza con su fase. No
  mostrar en "hoy" una cebra respetada de forma sistemática.

## 3. Lo que no se pudo encontrar

1. Cualquier medición colombiana de brecha crítica o tiempo de seguimiento vehicular en intersecciones de
   prioridad (se buscó en Uninorte, Nacional, Andes, UPTC, Cauca; solo aparecieron brechas peatonales en Tunja).
2. Porcentajes de parada completa, *rolling* y sin frenar en un PARE en cualquier ciudad de América Latina.
3. Frecuencia de entradas forzadas en América Latina (Córdoba lo describe, no lo cuantifica).
4. Probabilidad de que el conductor de la principal ceda ante un vehículo que asoma, y distancia de invasión que
   lo provoca. Tampoco en la literatura india consultada.
5. Deceleración medida de la principal cuando la fuerzan (solo la caída relativa de velocidad, 73 %).
6. Seguidores por brecha forzada y sus intervalos.
7. Pendiente cuantitativa de la impaciencia (segundos de brecha por segundo de espera).
8. Aforos con composición vehicular en Barranquilla (motos, taxis, buses en el flujo).
9. Evaluación antes-después de semaforización en Colombia.
10. Tasa de cesión del paso al peatón en Colombia.
11. Bonneson y Fitts: lo localizado trata de la demora a la principal por giros a la izquierda y del efecto de
    un semáforo aguas arriba, no de inversión de prioridad. No aporta parámetros aquí.
12. Textos completos no abiertos por muro de pago: Troutbeck y Kako (1999), Troutbeck (1999), Advani et al.
    (2020, solo resumen), Ashalatha y Chandra (2011), Pawar y Patil (2018), Patil y Pawar (2014).

Cómo cerrar los huecos 1-6 y 8 con poco coste: una hora de vídeo en hora punta desde un punto elevado en dos de
los cruces del proyecto basta para medir filas 1-3, 9, 13-14, 19 y 21-23 con el mismo método de Dutta y Ahmed
(unas 200 entradas por sitio). Hasta entonces, el pie de la simulación debería decir que el comportamiento es
"ilustrativo, calibrado con estudios de Argentina e India y con supuestos declarados", no medido en Barranquilla.
