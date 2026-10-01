<!-- Puedes escribir en español o en inglés. / Spanish or English are both fine. -->

## Qué cambia y por qué / What changes and why

<!-- Si cierra un issue: "Cierra #123". / If it closes an issue: "Closes #123". -->

## Tipo de cambio / Type of change

- [ ] Datos / Data
- [ ] Mapa (interfaz) / Map (UI)
- [ ] Pipeline o evaluación / Pipeline or scoring
- [ ] Documentación / Docs
- [ ] Otro / Other

## Cómo lo probaste / How you tested it

<!-- Comandos que corriste, cruces que revisaste, capturas en celular si cambia el mapa. -->
<!-- Commands you ran, junctions you checked, phone screenshots if the map changes. -->

## Lista de revisión / Checklist

- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan. / pass.
- [ ] Si toqué `pipeline/`, corrí `pnpm data` e incluí los datos regenerados. / If I touched `pipeline/`, I ran `pnpm data` and included the regenerated data.
- [ ] Si cambian los números del mapa (51 / 131 / 293 / 361), lo explico arriba y lo anoté en `CHANGELOG.md`. / If the map's numbers change, I explain why above and logged it in `CHANGELOG.md`.
- [ ] No corrí `pnpm score` en CI ni incluí llaves, `.env` o rutas de mi computador. / No `pnpm score` in CI, no keys, `.env` files or local paths.
- [ ] Los datos nuevos tienen fuente y licencia compatibles (nada de Google Maps). / New data has a compatible source and license (nothing from Google Maps).
- [ ] Mis *commits* están firmados con `git commit -s` (DCO). / My commits are signed off with `git commit -s` (DCO).
