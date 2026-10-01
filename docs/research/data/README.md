# Inventario oficial de semáforos / Official signal inventory

`semaforos-oficial-2023.geojson`: 342 intersecciones semaforizadas de Barranquilla, con nombre, código, estado y
fecha de inicio de funcionamiento. El pipeline lo lee para saber qué cruces tienen semáforo según la Secretaría de
Tránsito (ver `pipeline/src/config.ts` y `docs/validation.md`, sección 2).

- Fuente: Alcaldía Distrital de Barranquilla, Atlántico, «Semaforización en Barranquilla», Portal de Datos Abiertos
  www.datos.gov.co, <https://www.datos.gov.co/d/svyb-d6ts> (gemelo con geometría:
  <https://www.datos.gov.co/d/xknx-agu2>).
- Versión: la publicada por la Secretaría de Tránsito como «Semaforos Baq Sep2023 (Act)»; 339 de 341 puntos coinciden
  en código y coordenadas con `svyb-d6ts`.
- Licencia: **CC BY-SA 4.0**, <https://creativecommons.org/licenses/by-sa/4.0/deed.es>. Esta carpeta no está cubierta
  por la licencia CC BY 4.0 del resto de `docs/`.
- Cambios: convertido a GeoJSON (propiedades `no`, `nombre`, `codigo`, `estado`, `fechaInicio`).

*English:* official inventory of 342 signalized junctions in Barranquilla, from the Alcaldía Distrital de Barranquilla
(datos.gov.co `svyb-d6ts`), licensed CC BY-SA 4.0 and converted to GeoJSON. This folder is not covered by the CC BY 4.0
license of the rest of `docs/`. See [`data/LICENSE.md`](../../../data/LICENSE.md).
