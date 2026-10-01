# Fuentes de datos abiertos para enriquecer el mapa (Barranquilla)

Revisado 2026-09-20. "Descargable ahora" = se descargó o se consultó por API al preparar este documento.
Algunos archivos de `barranquilla.gov.co` se consultaron en copias archivadas de Internet Archive (Wayback Machine);
desde un navegador normal deberían abrir en el sitio original.

## Resumen: las 3 más útiles

| # | Dataset | Por qué | Usable ya |
| --- | --- | --- | --- |
| 1 | **Inventario oficial de intersecciones semaforizadas** (342 puntos con lat/lon) | Verdad de terreno para `hasSignal`; evita falsos "necesita semáforo" | Sí. API JSON sin llave. Copia en `docs/research/data/semaforos-oficial-2023.geojson` |
| 2 | **Aforos vehiculares y peatonales 2016-2024** (Secretaría de Tránsito) | Únicos volúmenes reales: permiten evaluar Condiciones A/B/C de verdad en ~cientos de cruces y calibrar el proxy por clase de vía | Sí, con trabajo: ZIP de Excel por cruce, sin coordenadas (nombre "CL 82 - CR 49C") |
| 3 | **Accidentalidad en Barranquilla** (IPAT, 2018-2026, 28.5 mil registros) | Condición E | Parcial: **solo dirección de texto, sin coordenadas**; ~85 % tienen forma de cruce "CL x CR y" y se pueden casar con `streets[]` de cada intersección |

## 1. Semáforos: inventario oficial y validación de OSM

### 1.1 Datos
- **datos.gov.co "Semaforización en Barranquilla"** - https://www.datos.gov.co/d/svyb-d6ts
  API: `https://www.datos.gov.co/resource/svyb-d6ts.json?$limit=1000` (CSV: `.csv`). 342 filas.
  Campos: `no, codigo, location, latitud, longitud, estado, fecha_inicio_de_funcionamiento`.
  Gemelo con geometría: `xknx-agu2` (campo `the_geom` Point; GeoJSON: `https://www.datos.gov.co/resource/xknx-agu2.geojson?$limit=1000`).
  Licencia **CC BY-SA 4.0**. Alcaldía Distrital. **Descargable ahora: sí.**
- Misma fuente como KMZ/XLSX ("Semaforos Baq Sep2023 (Act)") enlazada desde
  https://barranquilla.gov.co/transito/puntos-de-fiscalizacion-electronica-y-semaforizacion
  (KML: `https://www.barranquilla.gov.co/documento/archivo-kml-noviembre-2023/`, listado:
  `https://www.barranquilla.gov.co/documento/intersecciones-semaforizadas-5/`). Consultado en copia archivada.
- Copia convertida: `docs/research/data/semaforos-oficial-2023.geojson` (props: `no, nombre, codigo, estado, fechaInicio`).
  El `.kmz` de barranquilla.gov.co no se redistribuye porque la página no indica su licencia; su contenido coincide
  con `svyb-d6ts` (339 de 341 puntos con el mismo código y coordenadas), que sí es CC BY-SA 4.0.
- Contenido: estados = 335 Funcionando, 3 En Obras, 3 Preventiva Funcionando, 1 Funcionando Peatonal.
  145 de 342 tienen fecha 1999 (fecha por defecto de la red antigua, probablemente). Un punto = una intersección.

### 1.2 Cifras oficiales
| Cifra | Corte | Fuente | Verificación |
| --- | --- | --- | --- |
| **342** intersecciones semaforizadas | oct-2023 | Página de la Secretaría (copia archivada del 2025-11-18) + dataset | Leído directamente |
| **351** | feb-2026 | Misma página, versión actual | **Solo vía resumen del buscador**; no se pudo abrir la página actual. No verificado en fuente |
| +4 (Cl 98 x Cr 57, Cl 99 x Cr 57, Cordialidad x Cr 27, Cl 41 x Cr 8) | 14-abr-2026 | https://www.elheraldo.co/atlantico/2026/04/14/distrito-instala-cuatro-nuevos-semaforos/ | Leído (resumen). Sugiere ~355 a mediados de 2026 si no estaban ya en los 351 |
| Plan de expansión del sistema semafórico | - | http://web2018.barranquilla.gov.co/transito/ (art. 534) | **No accesible** (host caído, sin snapshot) |

### 1.3 OSM frente al inventario oficial (cálculo propio sobre `data/out/` del pipeline, 2026-09-20)
- OSM en el bbox: 1.223 nodos de señal (712 `signal` + 511 `crossing_signal`). Los "~766" de la estimación inicial eran nodos, no cruces:
  una intersección de doble calzada tiene 2-4 nodos.
- Agrupando nodos OSM a <= 40 m: **362 grupos**. El pipeline marca **422** intersecciones `hasSignal`.
- Oficiales con nodo OSM a <= 30 m: **335/342 (98 %)**; a <= 80 m: 339/342. Faltan en OSM: Cl 30 x Cr 21B,
  Cl 106 x Cr 65A (2023), Circunvalar x Ventana al Mundo.
- Grupos OSM sin punto oficial a <= 80 m: **25** (posibles: instalados después de 2023, fuera del distrito
  -Soledad/Puerto Colombia, que el bbox incluye-, o semáforos peatonales/privados).
- Intersecciones marcadas `needs_high/medium` que ya son oficialmente semaforizadas (<= 40 m): **0**.
- Conclusión: **~766 nodos `traffic_signals` ≈ 340-360 intersecciones reales**; OSM es prácticamente completo
  respecto a 2023. Los 422 del pipeline probablemente sobrecuentan (radio de 30 m + cruces adyacentes de doble calzada).
  Recomendación: unir el dataset oficial como segunda fuente de `hasSignal` y exponer `fechaInicio`.

## 2. Siniestralidad

### 2.1 Accidentalidad en Barranquilla (la más prometedora) - muestreada por API
- https://www.datos.gov.co/d/yb9r-2dsi - API `https://www.datos.gov.co/resource/yb9r-2dsi.json` (SoQL, sin llave; máx. 50.000 por página).
- Fuente: IPAT (informes policiales), Alcaldía / Secretaría de Tránsito. Licencia **CC BY-SA 4.0**. Actualización declarada anual; última 2026-07-28; año vigente "preliminar".
- **28.523 filas**, 2018-01-01 a 2026-06-16. Por año: 2018 5.898; 2019 5.645; 2020 3.281; 2021 4.700; 2022 3.683; 2023 1.674; 2024 1.482; 2025 1.656; 2026 504.
  La caída desde 2023 parece cambio de registro (¿choques simples conciliados sin IPAT?), no mejora real: **no comparar años**.
- Gravedad: Solo daños 15.470; Con heridos 12.716; Con muertos 337.
- Campos: `fecha_accidente, hora_accidente, gravedad_accidente, clase_accidente, sitio_exacto_accidente,
  cant_heridos_en_sitio_accidente, cant_muertos_en_sitio_accidente (cuando aplica), cantidad_accidentes, a_o_accidente, mes_accidente, dia_accidente`.
- **Coordenadas: NO. Solo dirección en texto** (`sitio_exacto_accidente`), p. ej. `"CL 110 CR 46"`, `"CL 87 9H 24"`, `"VIA 40 CL 85"`.
  17.070 direcciones distintas; ~24.300 de 28.523 (85 %, regex aproximada) tienen forma de cruce vía-vía.
  Ortografía inconsistente: `CL 110 CR 43` y `CALLE 110 CARRERA 43` aparecen como sitios distintos.
- Sitios más repetidos: CL 110 (Circunvalar) x CR 9G (77), x CR 6 (66), x CR 43 (55); CL 17 x CR 8 (53); VIA 40 x CL 85 (53); CL 30 x CR 8 (53).
- Cómo usarla sin geocodificador: normalizar (`CL|CLL|CLLE|CALLE -> Calle`, `CR|CRA|KR|CARRERA -> Carrera`, alias
  `CL 110 = Avenida Circunvalar`, `CL 30`, `CL 45 = Murillo`, `CR 46 = Olaya Herrera`, `CL 17`, `VIA 40`), y casar el par con
  `streets[]` de `intersections.geojson`. Las direcciones de puerta ("CL 87 9H 24" = Calle 87 # 9H-24) se pueden
  aproximar al cruce Calle 87 x Carrera 9H. Alias de vías: **no verificados**, revisarlos contra OSM.
- Tablas hermanas (misma licencia, mismas direcciones de texto, sin coordenadas):
  `y628-5q9a` víctimas (19.172 filas: `condicion_victima` Peatón/Motociclista/..., `gravedad`, `sexo`, `edad`) - útil para ponderar **atropellos**;
  `nfa3-wgxy` vehículos (51.483 filas: clase y servicio del vehículo).

### 2.2 Otras
- ANSV "Sectores críticos de siniestralidad vial" https://www.datos.gov.co/d/rs3u-8r4q - 316 filas **con lat/lon**, pero son tramos de
  carreteras nacionales (ANI/INVIAS); sirve poco dentro de la ciudad. `ybqk-8s42` = sectores críticos de mortalidad 2022. Descargables.
- ONSV (ANSV) https://ansv.gov.co/observatorio/estadísticas - tableros y boletines por municipio; no se pudo consultar de forma automática. **No se confirmaron**
  microdatos georreferenciados descargables para Barranquilla.
- Fotodetección: https://fotodeteccion.ansv.gov.co/ubicaciones-aprobadas.html (mapa de cámaras aprobadas; no probado).
- Comparendos Barranquilla: `ps7z-yks5` (electrónicos) y `2uuh-awp9` en datos.gov.co; posible proxy de cruces con semáforo en rojo. No muestreados.

## 3. Volúmenes / aforos

- **Aforos vehiculares y peatonales, Secretaría de Tránsito, 2016-2024**, enlazados en la misma página de semaforización:
  `https://www.barranquilla.gov.co/wp-content/uploads/2024/12/aforos-2024.zip` (también `.../2023/12/aforos-2023.zip`,
  `.../2023/11/aforos-2022-enero-diciembre.zip`, `.../2022/10/aforos-2021-enero-diciembre.zip`; 2016-2020 como `/documento/aforos-20XX/`).
- **Descargable ahora:** 2024 sí (copia archivada del 2026-01-09, 77,6 MB, 1.057 archivos). Otros años: no probados.
- Estructura 2024: carpeta por mes -> carpeta por cruce (**345 carpetas mes-cruce**; hay cruces repetidos y "PANTALLA" = conteos de cordón),
  con `V.A.-V.D. <cruce> (<fecha>).xlsx` (vehicular) y `V.P. ... .xls` (peatonal).
  Hojas `G-1`, `G-3` (por grupo de movimiento/acceso), `G-Totales`, `DIRECCIONALIDAD`, `DIAGRAMA DE VOL`.
  Conteos cada **15 min** en tres franjas (7:30-10:00, 11:00-15:00, 16:00-19:00 aprox.), por tipo M/A/B/C (motos, autos, buses, camiones),
  vehículos equivalentes y total horario móvil; encabezado con dirección, `CRUCE No.`, carriles y fecha.
  Ejemplo leído: Cl 82 x Cr 49C, acceso N-S ~1.300-1.500 veq/h; acceso Occ-Or ~650-1.250 veq/h.
- Licencia: no indicada en la página (sitio oficial, Ley 1712 de transparencia). Sin coordenadas: casar por nombre del cruce.
- Limitación: un solo día por cruce (el Manual pide promedio de 3 días) y ~8,5 h no contiguas; sirve para tamizar A/B, no para dictaminar.
  Sesgo: se aforan sobre todo cruces **ya semaforizados** (para reprogramar), así que sirve más para calibrar veh/h por clase OSM que para hallar candidatos.
- Velocidades y tiempos de viaje por corredor 2018, 2019, 2022, 2023: `https://www.barranquilla.gov.co/documento/informacion-de-velocidades-2023/` (no descargado).

## 4. Red vial oficial (POT) - hallazgo adicional
Todas en datos.gov.co, CC BY-SA 4.0, con geometría `the_geom` MultiLineString, API GeoJSON `https://www.datos.gov.co/resource/<id>.geojson`. Muestreadas.
- **Perfiles Viales** `aj6f-wwpi`: 258 tramos de la malla arterial con `categoria` (Principal/Secundaria), `tipo__via` (V1-V6, VTM1-3 = troncales de transporte masivo, AVC, AVR), `nombre_via, desde, hasta, ancho_perf` (ancho del perfil en m).
  Mejor indicador de jerarquía y ancho que `lanes` de OSM, que suele faltar.
- Jerarquía Vial `2him-9pmy`: 21 filas, vías rurales/proyectadas. Poco útil.
- Vías del Distrito `6czp-v8zu`: 18.505 ejes (`id, texto, estado, continuida`). Alternativa a OSM para nombres.
- Manzanas `ui69-dga8`, Barrios según POT `qui6-qeux`: para agregar resultados por barrio.

## 5. Transporte público
- **GTFS de Transmetro: no encontré feed público.** El dataset `ffbp-g6i2` "Especificación GTFS" de datos.gov.co ya no existe (404).
  Transitland exige llave (401); Mobility Database no consultada. Moovit tiene los datos pero no son abiertos.
- **OSM**: 41 relaciones `route=bus` en el bbox (38 `network=Transmetro`) y 493 nodos + 34 vías de paradas/plataformas/estaciones.
  ODbL. Descargable ahora por Overpass. Es la mejor opción práctica; el SITP colectivo (buses tradicionales) casi no está mapeado.
- Lista de rutas: https://es.wikipedia.org/wiki/Anexo:Rutas_de_Transmetro (solo texto).

## 6. Población / densidad
- **WorldPop 2020 constrained, 100 m**: `https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/COL/col_ppp_2020_constrained.tif`
  GeoTIFF WGS84, ~28 MB todo el país, **CC BY 4.0**. HTTP 200 confirmado (HEAD). Metadatos: `https://hub.worldpop.org/rest/data/pop/cic2020_100m?iso3=COL`.
  Recortar al bbox y sumar en radio de 200-300 m por intersección.
- **DANE - Marco Geoestadístico Nacional / CNPV 2018 a nivel manzana**: https://geoportal.dane.gov.co/servicios/descarga-y-metadatos/datos-geoestadisticos/
  (portal responde 200; descarga por departamento -Atlántico, 08- en SHP/GPKG; **no descargué el archivo**). Más preciso que WorldPop pero más pesado.

## 7. Imágenes a nivel de calle (verificación posterior)
- **Mapillary**: API v4 `https://graph.mapillary.com/images?bbox=-74.93,10.89,-74.74,11.07&fields=id,captured_at,geometry` y teselas de
  cobertura `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=...`. **Requiere token gratuito; sin token no pude medir cobertura. No verificado.**
  Imágenes CC BY-SA 4.0. También expone detecciones de `object--traffic-light` (map features) útiles para auditar.
- **KartaView**: la API pública respondió "Restricted access!" (400). Cobertura no verificada.
- Alternativa manual: enlace profundo a Google Street View por lat/lon desde la UI (solo enlace; sin reutilizar imágenes).

## 8. No verificado / pendiente
- Cifra 351 (feb-2026) y cualquier lista posterior a 2023; plan de expansión semafórica.
- Aforos 2016-2023 y archivos de velocidades (enlaces existen; no bajados).
- Microdatos georreferenciados del ONSV; cobertura Mapillary/KartaView; descarga real del MGN-DANE.
- Licencia explícita de los archivos alojados en barranquilla.gov.co.
