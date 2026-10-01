# Adapta el proyecto a tu ciudad

*English summary at the end.*

La idea, desde el video que dio origen al proyecto, es que no solo Barranquilla: cualquier ciudad de Colombia podría
hacer algo parecido. Esta guía explica qué hay que cambiar para hacerlo en otra ciudad o municipio. Si te animas, abre un *issue* con el formulario
[Adaptar a mi ciudad](https://github.com/Victorpay1/semaforos-barranquilla/issues/new/choose) y cuéntanos qué datos
tienes.

Antes de empezar, dos cosas:

- **Ponle otro nombre a tu versión.** El nombre «Semáforos de Barranquilla» no se licencia con el código (ver
  [`TRADEMARKS.md`](../TRADEMARKS.md)). Decir «basado en Semáforos de Barranquilla» sí está bien, y se agradece.
- **Hoy la lista de candidatos depende del modelo de pago.** Sin los archivos `data/out/jev-scores*.json` y
  `data/out/backtest.json` de tu ciudad, el pipeline corre sin errores pero la lista sale vacía: los niveles
  (prioritario, recomendado, en observación) exigen la evaluación. El puntaje por reglas (`heuristicScore`) sí se
  calcula, pero la interfaz no lo usa. Un evaluador abierto que no necesite llave está en la hoja de ruta y es una
  buena forma de aportar.

## 1. Qué datos necesitas

| Dato | Para qué | Obligatorio | En Barranquilla |
| --- | --- | --- | --- |
| Calles y semáforos en OpenStreetMap | Todo el mapa | Sí | Muy completo: 339 de 341 semáforos oficiales ya estaban en OSM |
| Inventario oficial de semáforos, con coordenadas | Confirmar qué cruces tienen semáforo y hacer la prueba de la evaluación | Muy recomendable | datos.gov.co `svyb-d6ts` |
| Registros de siniestros viales | Señal de conflicto y de exposición | Recomendable | datos.gov.co `yb9r-2dsi`, solo con dirección escrita |
| Aforos (conteos de tránsito) | Lo que de verdad exige el Manual 2024 | Opcional (hoy no se usan) | Existen, sin coordenadas |

Empieza por revisar OpenStreetMap en tu ciudad: si faltan muchas calles o semáforos, mapearlos allá es el primer
aporte, y le sirve a todo el mundo. Revisa también la licencia de los datos de tu ciudad: tienen que permitir
publicarlos (ver [`data/LICENSE.md`](../data/LICENSE.md)).

## 2. Qué cambiar en el código

| Qué | Dónde |
| --- | --- |
| Área de estudio (`BBOX`: sur, oeste, norte, este) | `pipeline/src/config.ts` |
| Nombre del límite municipal en OpenStreetMap (`name=Barranquilla`) | `pipeline/src/fetch.ts`, consulta `boundary`. En Colombia los municipios son `admin_level=6` (`pipeline/src/build.ts`, `verify.ts`); en otros países puede ser distinto. |
| Archivo del inventario oficial (`OFFICIAL_SIGNALS`) | `pipeline/src/config.ts`. GeoJSON de puntos con `no`, `nombre`, `codigo`, `estado`, `fechaInicio`. |
| Conjunto de datos de siniestros (identificador, URL y nombres de campos) | `pipeline/src/crashes.ts`. El de Barranquilla usa `sitio_exacto_accidente` con direcciones como «CL 72 CR 46». Si los tuyos traen coordenadas, la asignación es más sencilla pero hay que escribirla. |
| Cómo se leen las direcciones y los alias de las vías (Murillo = Calle 45, Olaya Herrera = Carrera 46, Circunvalar = Calle 110…) | `pipeline/src/streetkeys.ts` |
| Comprobaciones con números mínimos (calles > 3.000, semáforos > 300…) | `pipeline/src/verify.ts` |
| Descripción de la ciudad que recibe el modelo (`city_context`) | `scorer-jev/src/variants/v3.ts` |
| Centro, zoom y límites del mapa | `web/components/MapView.tsx` (`CENTER`, `BOUNDS`) |
| Nombre, títulos y textos del sitio | `web/app/layout.tsx`, `web/components/Sidebar.tsx`, `web/components/About.tsx` |

## 3. Pasos

```sh
# 1. con los cambios de la tabla anterior hechos:
pnpm run fetch --force                           # descarga los datos de tu ciudad en data/raw/ (red, gratis)
pnpm data                                        # arma los cruces; la lista sale vacía hasta tener evaluación

# 2. evaluación (opcional, de pago): pon TYPESAFE_API_KEY (y JEV_MODEL=jev-1.13.0) en scorer-jev/.env
pnpm --filter @semaforos/scorer-jev dry-run      # muestra qué se envía y cuánto costaría, sin conexión
pnpm score                                       # evalúa todos los cruces sin semáforo
pnpm score --variant nocrash --collector-only    # segunda opinión sin siniestros
pnpm --filter @semaforos/scorer-jev backtest --variant v3 --choose --role main
pnpm --filter @semaforos/scorer-jev backtest --variant v3nc --choose --role blind
pnpm data                                        # ahora sí, con niveles

pnpm dev                                         # mira el resultado en http://localhost:3000
```

En Barranquilla, evaluar unos 9.200 cruces desde cero costó alrededor de un dólar; la estimación exacta para tu
ciudad la da el `dry-run`. El *backtest* necesita el inventario oficial, porque compara la evaluación con los cruces
que tu ciudad ya semaforizó; sin él no hay forma de elegir los umbrales con datos. Lee
[`validation.md`](validation.md) para entender el diseño y el [README del evaluador](../scorer-jev/README.md) para
los detalles.

## 4. Antes de publicar

- Revisa a mano la lista de prioritarios: que ninguno esté en una glorieta, un puente o un cruce que ya tenga
  semáforo.
- Escribe tus propias limitaciones, con los números de tu ciudad (cuántos siniestros se pudieron ubicar, de qué fecha
  es el inventario).
- Da crédito a OpenStreetMap y a la fuente de tus datos en el mapa, y publica tus datos derivados bajo ODbL.
- Di que es un proyecto independiente, si lo es, y que la evaluación es asistida por IA.

---

## English summary

To adapt the project to another city: give your version a different name (see [`TRADEMARKS.md`](../TRADEMARKS.md));
check OpenStreetMap coverage first; and know that today the candidate tiers require the paid model scores. Without
`data/out/jev-scores*.json` and `backtest.json` for your city, the pipeline runs but the shortlist is empty. An open
scorer that needs no key is on the roadmap.

What to change: the study bbox (`pipeline/src/config.ts`), the municipal boundary name (`pipeline/src/fetch.ts`;
Colombian municipalities are `admin_level=6`), the official signal inventory file (`OFFICIAL_SIGNALS` in
`config.ts`), the crash dataset and its field names (`pipeline/src/crashes.ts`), address parsing and street aliases
(`pipeline/src/streetkeys.ts`), sanity bounds (`pipeline/src/verify.ts`), the city description sent to the model
(`city_context` in `scorer-jev/src/variants/v3.ts`), and the map centre, bounds and site texts (`web/`). Then run
`pnpm run fetch --force`, `pnpm data`, optionally the paid scoring and backtest (Barranquilla's ~9,200 junctions cost about one
US dollar; `dry-run` estimates yours offline), and `pnpm data` again. The backtest needs an official signal inventory,
because it measures the evaluation against the junctions your city already signalized.
