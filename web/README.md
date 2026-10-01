# web/ — el mapa

Aplicación Next.js (exportación estática a `out/`) que muestra las calles, los semáforos y los cruces priorizados.
Lee solo los archivos de `public/data/`, que vienen versionados en el repositorio: no necesita ninguna clave de API.
Instrucciones generales, licencias y contexto: [README del repositorio](../README.md).

Desde la raíz del repositorio (Node 24, pnpm):

```sh
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # exporta el sitio estático a web/out/
pnpm --filter @semaforos/web start   # sirve web/out/ con las cabeceras de web/vercel.json (CSP incluida)
```

| Ruta | Qué es |
| --- | --- |
| `app/` | Página del mapa (`page.tsx`), página «Licencias y créditos» (`licencias/`), metadatos, íconos e imagen para redes |
| `components/` | Mapa (MapLibre), panel lateral, ficha del cruce, simulación ilustrativa, aviso inicial |
| `lib/` | Carga de datos (`data.ts`, une `crashes-by-intersection.json` por id), simulación (`sim.ts`), direcciones públicas (`site.ts`) |
| `public/data/` | Copia recortada de `data/out/` que escribe `pnpm data` (no editar a mano) |
| `test/sim-regression.ts` | Prueba de regresión de la simulación (`pnpm test`) |
| `vercel.json` | Cabeceras de seguridad del despliegue (la exportación estática no admite `headers()` en `next.config.ts`) |

`pnpm --filter @semaforos/web fixture` genera datos sintéticos en `public/data/` solo si faltan los archivos.
