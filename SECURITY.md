# Seguridad / Security

*[English below](#english)*

## Cómo reportar una vulnerabilidad

**No abras un *issue* público.** Usa el reporte privado de GitHub:

1. Entra a la pestaña [Security](https://github.com/Victorpay1/semaforos-barranquilla/security) del repositorio.
2. Pulsa **Report a vulnerability** (o ve directo a
   <https://github.com/Victorpay1/semaforos-barranquilla/security/advisories/new>).
3. Cuenta qué encontraste, cómo reproducirlo y qué impacto crees que tiene.

Solo el mantenedor ve ese reporte. Si no puedes usar GitHub, escribe por mensaje directo a
[@victorpay en Instagram](https://www.instagram.com/victorpay/) pidiendo un canal privado, sin incluir los detalles
en el primer mensaje.

Este es un proyecto voluntario mantenido por una persona, así que la respuesta puede tardar. Cuando revisemos el
reporte, te contamos qué vamos a hacer. Si quieres, te damos crédito en el aviso cuando se publique la corrección.

## Qué nos interesa

- Una llave, token o contraseña que haya quedado en el repositorio o en su historial.
- Una forma de ejecutar código o inyectar contenido en el sitio (<https://semaforos-baq.vercel.app>), por ejemplo a
  través de los datos que el mapa muestra.
- Problemas en las cabeceras de seguridad del sitio, o en cómo carga recursos de terceros.
- Dependencias con vulnerabilidades conocidas que de verdad afecten al proyecto.
- Cualquier forma en que el *script* de evaluación (`scorer-jev/`) pueda filtrar la llave de la API.

## Qué no es un problema de seguridad

- Un cruce, semáforo o siniestro mal ubicado, o un dato que falta: usa el formulario
  [Corrección de datos](https://github.com/Victorpay1/semaforos-barranquilla/issues/new/choose).
- Desacuerdos con la metodología o con la prioridad de un cruce: abre un *issue*.
- Fallas de servicios de terceros (OpenFreeMap, Google Maps, datos.gov.co, TypeSafe): repórtalas a ellos.

## Cómo está construido (para orientarte)

- El sitio es estático: no tiene servidor propio, cuentas de usuario, formularios ni *cookies* propias. Usa
  `localStorage` solo para recordar el tema claro u oscuro y si ya cerraste el aviso inicial. El mapa base viene de
  OpenFreeMap y la vista de calle es
  un *iframe* de Google Maps que solo se carga cuando abres un cruce.
- El sitio no necesita ninguna variable de entorno ni llave.
- La única llave del proyecto es la de la API de TypeSafe, y solo hace falta para volver a evaluar los cruces
  (`pnpm score`, opcional y de pago). Va en `scorer-jev/.env`, que git ignora. El *script* la envía únicamente en la
  cabecera `Authorization` a la API elegida, y no la guarda en la caché ni en los registros. Nunca debe ir en la
  integración continua ni en la configuración del sitio.

## Investigación de buena fe

Si investigas de buena fe, no publicas detalles antes de que haya una corrección y no afectas a otras personas, no
vamos a tomar acciones en tu contra. Por favor, no hagas pruebas de carga ni de denegación de servicio contra el sitio,
ni lo rastrees de forma masiva: todos los datos ya están en este repositorio.

## Versiones cubiertas

Solo la rama `main` y el sitio oficial. No mantenemos versiones anteriores.

---

## English

### Reporting a vulnerability

**Please don't open a public issue.** Use GitHub's private vulnerability reporting:

1. Open the repository's [Security](https://github.com/Victorpay1/semaforos-barranquilla/security) tab.
2. Click **Report a vulnerability** (or go straight to
   <https://github.com/Victorpay1/semaforos-barranquilla/security/advisories/new>).
3. Describe what you found, how to reproduce it and the impact you expect.

Only the maintainer sees the report. If you can't use GitHub, send a direct message to
[@victorpay on Instagram](https://www.instagram.com/victorpay/) asking for a private channel, without the details in
the first message.

This is a volunteer project run by one person, so a reply may take a while. Once we have looked at the report, we'll
tell you what we plan to do. If you like, we'll credit you in the advisory when the fix is published.

### In scope

- A key, token or password left in the repository or its history.
- A way to run code or inject content into the site (<https://semaforos-baq.vercel.app>), for example through the data
  the map displays.
- Problems with the site's security headers or with how it loads third-party resources.
- Dependencies with known vulnerabilities that actually affect the project.
- Any way the scoring script (`scorer-jev/`) could leak the API key.

### Not security issues

- A misplaced junction, signal or crash, or missing data: use the
  [data correction form](https://github.com/Victorpay1/semaforos-barranquilla/issues/new/choose).
- Disagreements with the methodology or with a junction's priority: open an issue.
- Outages or bugs in third-party services (OpenFreeMap, Google Maps, datos.gov.co, TypeSafe): report them there.

### How it's built (to help you look)

- The site is static: no server of its own, no user accounts, no forms and no first-party cookies. It uses
  `localStorage` only to remember the light or dark theme and whether you closed the opening notice. The basemap comes
  from OpenFreeMap, and the street view is a
  Google Maps iframe that loads only when you open a junction.
- The site needs no environment variables and no keys.
- The project's only key is for the TypeSafe API, and it is only needed to re-score junctions (`pnpm score`, optional
  and paid). It lives in `scorer-jev/.env`, which git ignores. The script sends it only in the `Authorization` header to
  the chosen API, and never writes it to the cache or to logs. It must never go into CI or the site's configuration.

### Good-faith research

If you research in good faith, don't publish details before a fix is out, and don't harm other people, we won't take
action against you. Please don't run load or denial-of-service tests against the site, or crawl it heavily: all the
data is already in this repository.

### Supported versions

Only the `main` branch and the official site. Older versions are not maintained.
