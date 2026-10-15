# /app/ — "¿A dónde quieres ir?" (diseño)

Fecha: 2026-10-15

## Objetivo
Una webapp estática en `/app/` (GitHub Pages, sin backend ni build) donde el usuario
indica un destino en Aranda de Duero y obtiene qué línea de bus coger, desde qué parada,
dónde bajarse y cuándo sale el próximo. Complementa a `/mapa`, que es un visor de
líneas, paradas y horarios.

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
- `app/core.js`: funciones puras (parseo CSV, servicios activos, distancia, emparejado
  de paradas, próximas salidas). Se carga en el navegador y es `require`-able desde Node.
- `tests/test_app_core.js`: pruebas con Node (`node --test`).
- Enlaces desde `index.html` y `mapa.html`; mención en `README.md`.

`mapa.js` no se modifica.

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
- Funciona en móvil y se despliega con el workflow de Pages existente sin cambios.
