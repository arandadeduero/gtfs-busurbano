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
- Autocompletado local: lugares en `app/places.json` (extraídos de OpenStreetMap con Overpass, curados;
  coordenadas dentro de Aranda de Duero, cada uno con `cat` y `tags`; incluye farmacias,
  supermercados y bancos, con calle o parada cercana cuando el nombre se repite) + las paradas del GTFS; sin red. Nominatim solo al enviar.
- La lógica pura va en `app/core.js` (con prueba); la UI en `app/app.js`.
- Spec y mockup: `docs/superpowers/specs/` y `docs/superpowers/mockups/`.

## Mantenimiento periódico (recordar al usuario)

**Claude: al empezar una sesión en este repo, mira la fecha de hoy y, si toca alguno de
estos puntos, avisa al usuario antes de seguir con otra cosa.**

### 1. Festivos y calendario escolar del año siguiente — último trimestre (oct–dic)
Cada año, entre octubre y diciembre, hay que cargar los datos del **año siguiente**
(precedente: commit `b37a72c`, «festivos y calendario escolar de 2027», hecho en oct 2026).
Comprobar si `calendar_dates.txt` ya tiene fechas del año siguiente; si no, avisar.

Qué actualizar:
- **Festivos** en `calendar_dates.txt` (`exception_type=2` para quitar servicio):
  nacionales, autonómicos de Castilla y León y **locales de Aranda de Duero**
  (en 2027 fueron 13 y 14 de septiembre; verificar cada año en el BOCYL / calendario
  laboral del Ayuntamiento, porque cambian).
- **Calendario escolar** de Castilla y León: Navidad, Carnaval, Semana Santa y verano.
  Define los servicios `L-V_Lectivo` / `L-V_NoLectivo`: las líneas que llevan a los
  **institutos** (L2) solo circulan sus viajes de refuerzo en días lectivos, así que hay
  que fechar bien los días no lectivos (`L-V_NoLectivo`) para que L2 recupere los viajes
  base en vacaciones.
- `calendar.txt`: ampliar `end_date` si el año nuevo queda fuera (hoy llega a 2028).
- `feed_info.txt`: subir `feed_version` y, si procede, `feed_end_date`.
- `tests/test_gtfs.py`: añadir pruebas de festivos y vacaciones del año nuevo.
- Verificar con `python3 -m unittest discover -s tests -v`.

Hay además una **rutina programada en la nube** (claude.ai/code/routines/trig_01Ga18PguBeby3zPcNxEYRk6)
que el 1 de octubre a las 9:00 (Madrid) abre un issue «Actualizar festivos y calendario
escolar de <año>» en este repo con la checklist. Si se cambia el procedimiento, actualizar
también su prompt.

### 2. Puntos de interés del autocompletado (`app/places.json`) — revisar ~cada 12 meses
Los lugares vienen de OpenStreetMap (Overpass), curados a mano. Para actualizarlos:
1. `python3 tools/check_places.py` → lista nuevos elementos de OSM no incluidos y lugares
   que ya no aparecen en OSM (reintenta solo si Overpass da 502). Michelin es una
   excepción conocida (no está en OSM por nombre).
2. Añadir/quitar a mano en `app/places.json` (campos `name`, `cat`, `lat`, `lon`, `tags`;
   nombres únicos; categorías con icono en `CAT_ICON` de `app/app.js`).
3. `python3 tools/check_places.py --ignore-current` para marcar como revisado lo que se
   descarte (`tools/places_ignore.txt`).
4. Subir `APP_VERSION` en `app/sw.js` y pasar `node --test tests/test_app_core.js`.
Avisar también si pasa de ~12 meses desde el último commit que toque `app/places.json`
(`git log -1 --format=%cd -- app/places.json`) o cuando se abra/cierre un servicio
importante (hospital, estación, institutos).
