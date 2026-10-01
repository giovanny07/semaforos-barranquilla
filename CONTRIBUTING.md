# Cómo contribuir / Contributing

*[English below](#english)*

Gracias por querer aportar. Este mapa lo hizo una persona con datos públicos, y mejora cada vez que alguien que conoce
la ciudad, los datos o el código le dedica un rato. No hace falta programar para ayudar.

Al participar aceptas el [Código de Conducta](CODE_OF_CONDUCT.md).

## Formas de aportar

**Sin programar**

- **Reportar un dato equivocado.** Un semáforo que existe y no aparece, uno que aparece y no existe, un cruce mal
  nombrado o un candidato que no tiene sentido cuando lo ves en la calle. Usa el formulario
  [Corrección de datos](https://github.com/Victorpay1/semaforos-barranquilla/issues/new/choose). Una foto tuya o un
  enlace a Street View ayuda mucho.
- **Corregir OpenStreetMap.** Las calles y los semáforos del mapa vienen de [OpenStreetMap](https://www.openstreetmap.org).
  Si falta un semáforo, lo mejor es agregarlo allá (un nodo con `highway=traffic_signals` en el cruce); la próxima
  actualización de datos lo recoge y de paso queda bien para todos los que usan OSM. Hazlo solo con lo que hayas
  visto tú mismo o con fuentes que OSM permita. **No copies a OSM el inventario de la Alcaldía ni nada de Google
  Maps**: sus licencias no lo permiten.
- **Verificar candidatos en la calle o en Street View** y contar lo que viste en un *issue*.
- **Traer mejores datos.** Aforos, un inventario de semáforos más reciente, siniestros con coordenadas. Mira la
  sección «Trae mejores datos» del [README](README.md#trae-mejores-datos).
- **Traducir y mejorar la documentación.**

**Programando**

- Busca los *issues* marcados `good first issue` o `help wanted`.
- Para cambios grandes (otra metodología, otra ciudad, un rediseño), abre primero un *issue* para hablarlo. Así no
  trabajas en algo que luego no encaje.

## Preparar el entorno

Necesitas Node 24 LTS y pnpm (la versión exacta está en `package.json`; Corepack la instala sola).

```sh
git clone https://github.com/Victorpay1/semaforos-barranquilla.git
cd semaforos-barranquilla
nvm use              # lee .nvmrc (Node 24)
corepack enable      # activa la versión de pnpm del proyecto
pnpm install
pnpm dev             # abre http://localhost:3000
```

No necesitas ninguna llave: los datos ya procesados están en el repositorio.

| Comando | Qué hace | Red | Llave | Costo |
| --- | --- | --- | --- | --- |
| `pnpm dev` | Sitio en modo desarrollo | solo para el mapa base | no | no |
| `pnpm build` | Compila el sitio | no | no | no |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Revisiones | no | no | no |
| `pnpm data` | Reconstruye los datos del mapa desde `data/raw/`, sin conexión | no | no | no |
| `pnpm run fetch --force` | Descarga de nuevo OpenStreetMap y los siniestros (sin `--force`, solo lo que falte) | sí | no | no |
| `pnpm score` | Vuelve a evaluar los cruces con el modelo Jev | sí | `TYPESAFE_API_KEY` en `scorer-jev/.env` | **sí** |

Una descarga nueva cambia los resultados, porque OpenStreetMap cambia cada día. `pnpm score` cuesta dinero: no lo corras
salvo que sepas lo que haces, y nunca lo pongas en la integración continua.

## Antes de abrir un *pull request*

- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan.
- [ ] Si tocaste `pipeline/`: corriste `pnpm data` e incluiste los datos regenerados. Si cambian los números del mapa
      (51 / 131 / 293 / 361), explica por qué en el PR y anótalo en `CHANGELOG.md`.
- [ ] Si tocaste el mapa: revisaste el cambio en el celular (375 px de ancho) y en un par de cruces conocidos, por
      ejemplo Vía 40 × Calle 75 y Carrera 38 × Calle 52.
- [ ] No hay llaves, archivos `.env` ni rutas de tu computador en el cambio.
- [ ] Los datos nuevos vienen de una fuente cuya licencia permite publicarlos bajo ODbL o CC BY-SA (nunca Google
      Maps). Dices de dónde salieron.
- [ ] Separaste los cambios de datos de los cambios de código cuando fue posible.
- [ ] Cada *commit* está firmado con `git commit -s` (ver abajo).

Puedes escribir *issues*, *commits* y PRs en español o en inglés.

Si usas un asistente de IA para programar, bienvenido: este proyecto se construyó así. Revisa y entiende lo que vas a
enviar, porque respondes por ello y por la firma del DCO.

## Licencia de tus aportes y firma (DCO)

Tus aportes se publican con la licencia de los archivos que cambias: Apache-2.0 para el código, ODbL 1.0 para los
datos derivados de OpenStreetMap, CC BY-SA 4.0 para los datos re-publicados de la Alcaldía y CC BY 4.0 para la
documentación. Ver [`LICENSE`](LICENSE), [`data/LICENSE.md`](data/LICENSE.md) y [`docs/LICENSE.md`](docs/LICENSE.md).

Cada *commit* debe llevar la firma del [Developer Certificate of Origin 1.1](https://developercertificate.org): con ella
certificas que escribiste el aporte (o que tienes derecho a enviarlo) y que puede publicarse con la licencia indicada.
Se agrega sola con:

```sh
git commit -s -m "Corrige el nombre de la Calle 72 en el cruce con la Carrera 46"
```

Eso añade al final del mensaje una línea `Signed-off-by: Tu Nombre <tu@correo>` con el nombre y correo de tu
configuración de git. Si olvidaste firmar, `git commit --amend -s` arregla el último *commit*, y
`git rebase --signoff main` los de toda la rama. No hay que firmar ningún contrato aparte.

## Qué esperar

El proyecto lo mantiene una persona en su tiempo libre, así que las respuestas pueden tardar. Las correcciones de
datos se hacen en público y quedan anotadas, con fecha, en [`CHANGELOG.md`](CHANGELOG.md).

---

## English

Thanks for wanting to help. One person built this map from public data, and it gets better every time someone who
knows the city, the data or the code spends some time on it. You don't need to code to help.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md) (in Spanish; it is the official Spanish
translation of the Contributor Covenant 2.1).

### Ways to help

**Without code**

- **Report wrong data.** A signal that exists but doesn't show, one that shows but doesn't exist, a misnamed
  junction, or a candidate that makes no sense once you see it on the street. Use the
  [data correction form](https://github.com/Victorpay1/semaforos-barranquilla/issues/new/choose). A photo you took or
  a Street View link helps a lot.
- **Fix OpenStreetMap.** The map's streets and signals come from [OpenStreetMap](https://www.openstreetmap.org). If a
  signal is missing, the best fix is to add it there (a node tagged `highway=traffic_signals` at the junction); the
  next data refresh picks it up, and everyone else who uses OSM benefits. Only add what you have seen yourself or what
  sources OSM allows. **Don't copy the Alcaldía's inventory or anything from Google Maps into OSM**: their licenses
  don't allow it.
- **Check candidates on the street or in Street View**, and report what you saw in an issue.
- **Bring better data.** Traffic counts, a newer signal inventory, crash records with coordinates. See "Bring better
  data" in the [English README](README.en.md#bring-better-data).
- **Translate and improve the docs.**

**With code**

- Look for issues labelled `good first issue` or `help wanted`.
- For big changes (a different methodology, another city, a redesign), open an issue first to talk it through, so you
  don't build something that won't fit.

### Setup

You need Node 24 LTS and pnpm (the exact version is in `package.json`; Corepack installs it for you).

```sh
git clone https://github.com/Victorpay1/semaforos-barranquilla.git
cd semaforos-barranquilla
nvm use              # reads .nvmrc (Node 24)
corepack enable      # turns on the project's pnpm version
pnpm install
pnpm dev             # opens http://localhost:3000
```

No key is needed: the processed data is already in the repository.

| Command | What it does | Network | Key | Cost |
| --- | --- | --- | --- | --- |
| `pnpm dev` | Site in development mode | only for the basemap | no | no |
| `pnpm build` | Builds the site | no | no | no |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks | no | no | no |
| `pnpm data` | Rebuilds the map data from `data/raw/`, offline | no | no | no |
| `pnpm run fetch --force` | Downloads OpenStreetMap and the crash records again (without `--force`, only what's missing) | yes | no | no |
| `pnpm score` | Re-scores junctions with the Jev model | yes | `TYPESAFE_API_KEY` in `scorer-jev/.env` | **yes** |

A fresh download changes the results, because OpenStreetMap changes every day. `pnpm score` costs money: don't run it
unless you know what you're doing, and never put it in CI.

### Before opening a pull request

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.
- [ ] If you touched `pipeline/`: you ran `pnpm data` and included the regenerated data. If the map's numbers change
      (51 / 131 / 293 / 361), explain why in the PR and add a line to `CHANGELOG.md`.
- [ ] If you touched the map: you checked the change on a phone (375 px wide) and on a couple of known junctions, for
      example Vía 40 × Calle 75 and Carrera 38 × Calle 52.
- [ ] The change contains no keys, `.env` files or paths from your computer.
- [ ] New data comes from a source whose license allows publishing it under ODbL or CC BY-SA (never Google Maps), and
      you say where it came from.
- [ ] Data changes and code changes are in separate PRs where possible.
- [ ] Every commit is signed off with `git commit -s` (see below).

Issues, commits and PRs can be in Spanish or English.

AI coding assistants are welcome; this project was built with them. Review and understand what you send, because you
are responsible for it and for the DCO sign-off.

### License of your contributions and sign-off (DCO)

Your contributions are published under the license of the files you change: Apache-2.0 for code, ODbL 1.0 for data
derived from OpenStreetMap, CC BY-SA 4.0 for re-published Alcaldía data, and CC BY 4.0 for documentation. See
[`LICENSE`](LICENSE), [`data/LICENSE.md`](data/LICENSE.md) and [`docs/LICENSE.md`](docs/LICENSE.md).

Every commit must be signed off under the [Developer Certificate of Origin 1.1](https://developercertificate.org). The
sign-off certifies that you wrote the contribution (or have the right to submit it) and that it can be published under
the license indicated. Add it with:

```sh
git commit -s -m "Fix the name of Calle 72 at Carrera 46"
```

That appends a `Signed-off-by: Your Name <you@example.com>` line using the name and email in your git config. If you
forgot, `git commit --amend -s` fixes the last commit and `git rebase --signoff main` fixes the whole branch. There is
no separate agreement to sign.

### What to expect

One person maintains the project in their spare time, so replies can take a while. Data corrections are made in the
open and logged, with a date, in [`CHANGELOG.md`](CHANGELOG.md).
