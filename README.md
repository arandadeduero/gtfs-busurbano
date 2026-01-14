# Bus Urbano Aranda - Dataset GTFS

Este repositorio contiene los datos del sistema de transporte público del Bus Urbano de Aranda en formato GTFS (General Transit Feed Specification).

## Sobre el servicio

- **Operador**: Dávila Autocares
- **Zona**: Aranda de Duero
- **Web**: [busurbanoaranda.com](https://busurbanoaranda.com/)
- **Vigencia del feed**: Del 1 de diciembre de 2025 al 31 de diciembre de 2026

## ¿Qué es GTFS?

GTFS (General Transit Feed Specification) es un formato estándar internacional para datos de transporte público que permite a los desarrolladores crear aplicaciones de planificación de viajes y a los usuarios consultar horarios e información del servicio.

## Archivos incluidos

Este dataset contiene los siguientes archivos conforme a la especificación GTFS:

### Archivos obligatorios

- **`agency.txt`**: Información sobre la agencia de transporte (nombre, URL, zona horaria, idioma, contacto).
- **`stops.txt`**: Información sobre las paradas (ubicación, nombre, identificadores).
- **`routes.txt`**: Información sobre las líneas de autobús (nombre, tipo, colores, descripción).
- **`trips.txt`**: Viajes individuales de cada línea (identificadores, dirección, calendario).
- **`stop_times.txt`**: Horarios de llegada y salida en cada parada para cada viaje.
- **`calendar.txt`**: Calendario de servicio regular (días de la semana que opera cada servicio).

### Archivos opcionales

- **`calendar_dates.txt`**: Excepciones al calendario regular (días festivos, cambios de servicio).
- **`frequencies.txt`**: Información sobre la frecuencia de paso cuando el servicio opera con intervalos regulares.
- **`shapes.txt`**: Representación geográfica del trazado de las rutas (coordenadas GPS).
- **`feed_info.txt`**: Metadatos del feed (versión, vigencia, editor).

## Líneas disponibles

El servicio incluye las siguientes líneas:

- **L1**: Línea 1 - Aranda
- **L2**: Línea 2 - Aranda - Polígono Industrial - Institutos
- **L3**: Línea 3 - Aranda - Sinovas - Urb. Costaján - Policía Nacional

## Descarga

Puedes descargar la última versión del feed GTFS desde:

- **[Releases de GitHub](../../releases/latest)**: Descarga el archivo `gtfs_YYYYMMDD.zip` de la última versión
- **[Página web](https://arandadeduero.github.io/gtfs-busurbano/)**: Accede a la web con información y enlace de descarga directo

## Uso

Estos datos pueden ser utilizados para:

- Aplicaciones de planificación de viajes
- Integración en mapas y navegadores
- Análisis de rutas y cobertura
- Desarrollo de aplicaciones móviles de transporte público
- Integración con servicios como Google Maps, Apple Maps, Transit App, etc.

## Licencia

Consulta el archivo `LICENSE` para información sobre los términos de uso de estos datos.

## Recursos adicionales

- [Especificación GTFS oficial](https://gtfs.org/)
- [GTFS Reference](https://developers.google.com/transit/gtfs/reference)
- [Validador GTFS](https://gtfs-validator.mobilitydata.org/)

---

_Última actualización: Diciembre 2025_
