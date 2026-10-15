# /app/ — "¿A dónde quieres ir?" (diseño)

Fecha: 2026-10-15

## Objetivo
Una webapp estática en `/app/` (GitHub Pages, sin backend ni build) donde el usuario
indica un destino en Aranda de Duero y obtiene qué línea de bus coger, desde qué parada,
dónde bajarse y cuándo sale el próximo. Complementa a `/mapa`, que es un visor de
líneas, paradas y horarios.

## Identidad
- Logo nuevo del Ayuntamiento de Aranda de Duero (`images/ayuntamiento.png`, 640×208,
  procedente de `firmas-correo/images/colores/`) en la cabecera, sobre una pastilla
  blanca porque no existe variante en blanco; `alt` y altura ~34 px, enlazado a la
  web del Ayuntamiento. Se añade a la lista de assets cacheados por el Service Worker.

## Alcance
- Dentro: búsqueda de destino con Nominatim (OSM), origen por geolocalización o toque
  en el mapa, viajes **directos** (sin transbordos), próximas salidas, tramos a pie,
  mapa OSM con Leaflet.
- Fuera: transbordos, buses en vivo, autocompletado, favoritos.

## Restricciones
- Sitio estático; los datos son los `.txt` GTFS de la raíz (`../*.txt` desde `/app/`).
- UI en español, móvil primero, estilo coherente con `/mapa` (fuente Outfit, Leaflet).
- Nominatim: sólo al enviar la búsqueda (sin autocompletar), `viewbox` de Aranda,
  `bounded=1`, `countrycodes=es`, máx. 1 petición/s, resultados limitados a 5.
- Zona horaria Europe/Madrid; servicios activos = calendar + calendar_dates.

## Arquitectura
Ficheros nuevos:
- `app/index.html`, `app/app.css`, `app/app.js` (UI y mapa).
- `app/sw.js`: Service Worker con la estrategia de caché (ver «Caché y versionado»).
- `app/core.js`: funciones puras (parseo CSV, servicios activos, distancia, emparejado
  de paradas, próximas salidas). Se carga en el navegador y es `require`-able desde Node.
- `tests/test_app_core.js`: pruebas con Node (`node --test`).
- Enlaces desde `index.html` y `mapa.html`; mención en `README.md`.

`mapa.js` no se modifica.

## Caché y versionado
Objetivo: los ficheros se descargan una sola vez y no se vuelven a pedir salvo que cambien.
GitHub Pages sólo da `Cache-Control: max-age=600`, así que se controla desde la app:

- **Service Worker** (`app/sw.js`, registrado con rutas relativas para funcionar bajo
  `/<repo>/app/`). Intercepta todas las peticiones de la página, incluidas las de
  `../*.txt`, `app/*`, la fuente Outfit y Leaflet.
- **Versión de la app**: constante `APP_VERSION` en `sw.js` (p. ej. `2026.10.15-1`).
  El caché se llama `aranda-app-<APP_VERSION>`; al activarse una versión nueva se borran
  los cachés antiguos. Se incrementa al cambiar `app/*`.
- **Versión de los datos**: se usa `feed_version` de `feed_info.txt` (fichero pequeño).
  En cada arranque se pide `feed_info.txt` con `cache: "no-store"`; si la versión
  coincide con la guardada se sirven los `.txt` desde caché (cero descargas); si difiere
  (o no hay red, entonces se usa lo cacheado) se recargan los `.txt` con
  `cache: "reload"` y se guarda la nueva versión. Al publicar datos nuevos hay que
  subir `feed_version` (y se añade una prueba en `tests/test_gtfs.py` que lo recuerde
  si cambian los `.txt` sin cambiar la versión, si es viable).
- **Estrategia**: cache-first para assets y datos versionados; Leaflet vendorizado o
  fijado por versión (`unpkg.com/leaflet@1.9.4`) y cacheado igual. Teselas OSM: sólo
  caché HTTP del navegador (no se precachean, por la política de uso de OSM).
- **Offline**: tras la primera visita la app arranca sin red (salvo teselas y búsqueda
  Nominatim, que muestran un aviso).
- **Pruebas**: `core.js` expone `needsDataRefresh(storedVersion, remoteVersion)` (pura,
  probada en Node); el resto se verifica a mano en DevTools (Application → Cache).

## Flujo
1. **Destino**: campo de búsqueda → Nominatim → lista de hasta 5 resultados; también
   se puede tocar el mapa.
2. **Origen**: geolocalización del navegador; si falla o queda fuera de Aranda, aviso y
   selección manual en el mapa.
3. **Emparejado**: paradas a ≤ 600 m del origen y del destino. Para cada viaje activo,
   pares (parada origen antes que parada destino por `stop_sequence`). Se elige la mejor
   opción por línea y sentido (menor llegada). En L1 circular se usa el tramo hacia
   delante más corto.
4. **Resultados**: tarjeta por opción con insignia de línea, "X min a pie → parada A →
   bus → parada B → Y min a pie", próximas 3 salidas y hora de llegada. Al elegirla se
   dibujan en el mapa los tramos a pie y el segmento de la línea.
5. **Casos límite**: sin línea directa → mostrar paradas cercanas e indicar que haría
   falta transbordo; sin más servicio hoy → primeras salidas de mañana; sin permiso de
   ubicación → origen manual.

## Pruebas
- Unitarias (Node) sobre `core.js`: servicios activos con festivos, emparejado de
  paradas por orden de secuencia, circular L1, cruce de medianoche, sin servicio.
- Manual en navegador con respuesta de Nominatim simulada (para no abusar del servicio).

## Criterios de éxito
- Dado un destino en Aranda, se muestra en < 2 s (tras cargar datos) la mejor línea
  directa con la próxima salida correcta respecto al calendario real.
- En la segunda visita no hay descargas de datos ni assets (sólo la comprobación de
  `feed_info.txt`); un cambio de `APP_VERSION` o `feed_version` los renueva.
- Funciona en móvil y se despliega con el workflow de Pages existente sin cambios.
