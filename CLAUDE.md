# Bus Urbano de Aranda de Duero (GTFS + webapps)

Repo estático (GitHub Pages desde la raíz): feed GTFS en los `.txt`, visor `mapa.html` y
la webapp `app/` («¿A dónde quieres ir?»). Sin build; `app/` cachea con un Service Worker.

## Reglas obligatorias de caché (no olvidar)

- **Cualquier cambio en `app/`** (`index.html`, `app.css`, `app.js`, `core.js`, `sw.js`,
  o assets que precachea como `images/ayuntamiento.png` / `images/google-maps.svg`):
  **subir `APP_VERSION` en `app/sw.js`** (formato `AAAA.MM.DD-N`). Si no, los usuarios
  seguirán viendo la versión cacheada. Si añades un asset nuevo a la app, añádelo
  también a `ASSETS` en `sw.js`.
- **Cualquier cambio en los datos GTFS** (`stops.txt`, `stop_times.txt`, `trips.txt`,
  `routes.txt`, `shapes.txt`, `calendar*.txt`, `agency.txt`): **subir `feed_version` en
  `feed_info.txt`**. Es lo que dispara el refresco de los datos cacheados.

## Pruebas

- GTFS: `python3 -m unittest discover -s tests -v`
- Lógica de `app/`: `node --test tests/test_app_core.js`

## Convenciones de `app/`

- Texto visible en español y siempre «Aranda de Duero» completo (nunca solo «Aranda»).
- Solo viajes directos: este servicio no tiene transbordos, no implementarlos.
- Nominatim solo al enviar la búsqueda (sin autocompletar), máx. 1 petición/s.
- La lógica pura va en `app/core.js` (con prueba); la UI en `app/app.js`.
- Spec y mockup: `docs/superpowers/specs/` y `docs/superpowers/mockups/`.
