# Comparación GTFS ↔ OpenStreetMap (Bus Urbano Aranda)

Datos de OSM consultados con Overpass el 2026-10-15. Relaciones existentes: **Línea 1** ([17331123](https://www.openstreetmap.org/relation/17331123)) y **Línea 2** ([19597152](https://www.openstreetmap.org/relation/19597152)).

## Resumen

| | GTFS | OSM |
|---|---|---|
| Líneas | L1, L2, L3 | L1, L2 (**falta L3**) |
| Paradas | 44 | 40 `highway=bus_stop` en el área (34 en las relaciones L1/L2) |
| Paradas GTFS con nodo OSM a <40 m | 41 de 44 | |
| Paradas GTFS sin plataforma en OSM | 23, 37, 38 | |

## Hallazgos

1. **Falta la Línea 3** (Sinovas – Urb. Costaján – Policía Nacional). Sus paradas 34, 35 y 36 existen como `bus_stop` pero no pertenecen a ninguna relación `route=bus`.
2. **Paradas sin plataforma `highway=bus_stop`**:
   - GTFS 37 *Calle Juan de Juni 2 (instituto Sandoval y Rojas)*: no hay nada en OSM (el nodo más cercano está a 460 m).
   - GTFS 23 *Calle Sol de las Moreras 6* y GTFS 38 *Plaza Jardines de Don Diego*: solo existen como `public_transport=stop_position` ([11713637262](https://www.openstreetmap.org/node/11713637262) y [13684697688](https://www.openstreetmap.org/node/13684697688)), sin plataforma.
3. **Paradas duplicadas en el GTFS**: los pares 1/44, 2/43, 3/42, 4/41, 5/40 y 6/39 están a 5–12 m entre sí y corresponden a un único nodo OSM cada uno. Son la misma parada física; el GTFS las separa según el recorrido (`Linea_2_2`, `Linea_2_4`). Conviene unificarlas en el GTFS.
4. **L1 y L2 en OSM, etiquetas**:
   - L2 tiene `ref=Linea 2` y `name=Linea 2` (L1 usa `ref=1`, `name=Línea 1`).
   - Ninguna de las dos tiene `operator`; el GTFS indica *UTE Clemente-Dávila*.
   - L1 no tiene `from`/`to`.
5. **Parada "stop" suelta**: ambas relaciones incluyen [11713637262](https://www.openstreetmap.org/node/11713637262) con rol `stop` (en el centro del recorrido) y el resto con `platform`. Mezcla de esquemas; sería mejor un `stop_position` por parada o ninguno.
6. **Parada sin nombre en L2**: [13141501462](https://www.openstreetmap.org/node/13141501462) (`bus_stop` sin `name`), cerca de GTFS 30.
7. **Nodos de plataforma en OSM sin parada GTFS** (<60 m): [6531568735](https://www.openstreetmap.org/node/6531568735), [6935115310](https://www.openstreetmap.org/node/6935115310) y [8576261858](https://www.openstreetmap.org/node/8576261858), sin nombre ni relación; probablemente de otras líneas interurbanas.
8. **Paradas de L2 no incluidas en la relación** (según el GTFS pasan por ellas): GTFS 6/39 (*San Francisco 15*), 23 y 38.
9. **Nombres distintos**: OSM usa topónimos cortos ("Hospital", "Rotonda Fuentespina") y el GTFS la dirección o referencia. No los he cambiado en el fichero JOSM; elige cuál prefieres.
10. **Horarios (`opening_hours`)**:
    - L1 en OSM: `Mo-Fr 09:00-21:00; Sa 11:00-20:30`. En el GTFS la última salida entre semana es a las 21:10 (`L1_LV_PLZ_2110`, trayecto corto) y en sábado a las 20:40.
    - L2 en OSM: `Mo-Fr 07:30-19:45`, coincide con la última salida GTFS (19:45).
    - Convendría confirmar si OSM expresa primera/última salida o primera salida/llegada.

## Correspondencia parada a parada

| GTFS | Nombre GTFS | Nombre OSM | Nodo OSM | Distancia |
|---|---|---|---|---|
| 1 | Ambulatorio Norte | Ambulatorio Norte | [11713637268](https://www.openstreetmap.org/node/11713637268) | 7 m |
| 2 | Avenida El Ferial (esquina Calle Francisco Maldonado) | Avenida el Ferial | [11713759969](https://www.openstreetmap.org/node/11713759969) | 7 m |
| 3 | Calle María Pacheco 16 | Calle María Pacheco | [11713759970](https://www.openstreetmap.org/node/11713759970) | 6 m |
| 4 | Carretera Sinovas Bloques 3-5-7-9 | Carretera Sinovas | [11713759971](https://www.openstreetmap.org/node/11713759971) | 4 m |
| 5 | Calle San Francisco 41 | San Francisco 41 | [11713759972](https://www.openstreetmap.org/node/11713759972) | 6 m |
| 6 | Calle San Francisco 51 (frente colegio Vera Cruz) | San Francisco 15 | [11713759973](https://www.openstreetmap.org/node/11713759973) | 8 m |
| 7 | Arco Isilla | Arco Isilla | [11713759974](https://www.openstreetmap.org/node/11713759974) | 12 m |
| 8 | Plaza Mayor (Calle Postas) | Plaza Mayor | [11713637261](https://www.openstreetmap.org/node/11713637261) | 4 m |
| 9 | Calle Ruperta Baraya (Hospital) | Hospital | [4252365557](https://www.openstreetmap.org/node/4252365557) | 4 m |
| 10 | Rotonda (entre estación autobus y asilo) | Rotonda Ruperta Baraya | [7273318782](https://www.openstreetmap.org/node/7273318782) | 7 m |
| 11 | Avenida Santa Teresa de Jesús Jornet | Edificio Tomás Pascual | [11713637247](https://www.openstreetmap.org/node/11713637247) | 7 m |
| 12 | Plaza Mediterráneo (quiosco) | Quiosco Plaza Mediterráneo | [3355070176](https://www.openstreetmap.org/node/3355070176) | 16 m |
| 13 | Calle Duero (esquina Gallocanta) | Calle Duero | [11713637248](https://www.openstreetmap.org/node/11713637248) | 8 m |
| 14 | Avenida Castilla (rotonda) | Rotonda Fuentespina | [11713637249](https://www.openstreetmap.org/node/11713637249) | 9 m |
| 15 | Avenida Goya (canchas deportivas) | Avenida Goya | [11713637250](https://www.openstreetmap.org/node/11713637250) | 16 m |
| 16 | Avenida Murillo (frente Polideportivo Chelva) | Polideportivo Chelva | [11713637253](https://www.openstreetmap.org/node/11713637253) | 7 m |
| 17 | Avenida Castilla 67 | Avenida Castilla, 67 | [10027938677](https://www.openstreetmap.org/node/10027938677) | 39 m |
| 18 | Avenida Castilla (farmacia) | Avenida Castilla, 55 | [11713637254](https://www.openstreetmap.org/node/11713637254) | 5 m |
| 19 | Calle Las Francesas (piscinas cubiertas) | Piscinas Cubiertas | [11713637255](https://www.openstreetmap.org/node/11713637255) | 2 m |
| 20 | Calle Burgo de Osma (Ambulatorio Sur) | Centro de Salud Sur | [11713637256](https://www.openstreetmap.org/node/11713637256) | 5 m |
| 21 | Calle Burgo de Osma (Agencia Tributaria) | Burgo de Osma 7 | [11713637257](https://www.openstreetmap.org/node/11713637257) | 3 m |
| 22 | Calle Postas (Cine) | Calle Postas - Cine | [11713637258](https://www.openstreetmap.org/node/11713637258) | 3 m |
| 24 | Calle Pedro Sanz (Parque La Huerta) | Parque la Huerta | [11713637264](https://www.openstreetmap.org/node/11713637264) | 3 m |
| 25 | Avenida Burgos 1 (iglesia Santa Catalina) | Avda. Burgos 1 | [4705880184](https://www.openstreetmap.org/node/4705880184) | 6 m |
| 26 | Calle Montelatorre (instituto FP Santa Catalina) | Instituto FP Santa Catalina | [11713637265](https://www.openstreetmap.org/node/11713637265) | 5 m |
| 27 | Calle Santiago (Calle Marqués de Ahumada) | Calle Santiago 13 | [11713637267](https://www.openstreetmap.org/node/11713637267) | 5 m |
| 28 | Avenida Luis Mateos (frente Gasolinera) | Avenida Luis Mateos (Parque de Bomberos) | [11713756288](https://www.openstreetmap.org/node/11713756288) | 6 m |
| 29 | Avenida Luis Mateos (frente Michelin) | Frente Michelín | [13141501461](https://www.openstreetmap.org/node/13141501461) | 3 m |
| 30 | Avenida Luis Mateos (rotonda) | Michelín Puerta 2 | [11713756290](https://www.openstreetmap.org/node/11713756290) | 11 m |
| 31 | Avenida Luis Mateos (Michelin) | Michelín Puerta 1 | [11713756289](https://www.openstreetmap.org/node/11713756289) | 37 m |
| 32 | Avenida Luis Mateos (instituto empecinado) | Instituto Empecinado | [11713756287](https://www.openstreetmap.org/node/11713756287) | 15 m |
| 33 | Avenida Aragón (instituto Vela Zanetti) | Vela Zanetti | [11713637252](https://www.openstreetmap.org/node/11713637252) | 32 m |
| 34 | Sinovas | Sinovas | [6823857650](https://www.openstreetmap.org/node/6823857650) | 6 m |
| 35 | Urbanización Costaján (rotonda H. Montehermoso) | Costaján | [11713756285](https://www.openstreetmap.org/node/11713756285) | 11 m |
| 36 | Carretera de Burgos (Policía Nacional) | Policía Nacional | [11713756286](https://www.openstreetmap.org/node/11713756286) | 7 m |
| 39 | Calle San Francisco 51 (colegio Vera Cruz) | San Francisco 15 | [11713759973](https://www.openstreetmap.org/node/11713759973) | 19 m |
| 40 | Calle San Francisco 34 | San Francisco 41 | [11713759972](https://www.openstreetmap.org/node/11713759972) | 11 m |
| 41 | Carretera Sinovas sin numero | Carretera Sinovas | [11713759971](https://www.openstreetmap.org/node/11713759971) | 9 m |
| 42 | Parque María Pacheco | Calle María Pacheco | [11713759970](https://www.openstreetmap.org/node/11713759970) | 13 m |
| 43 | Avenida El Ferial (esquina Calle Francisco Maldonado) (sentido contrario) | Avenida el Ferial | [11713759969](https://www.openstreetmap.org/node/11713759969) | 7 m |
| 44 | Calle Santiago (frente Ambulatorio Norte) | Ambulatorio Norte | [11713637268](https://www.openstreetmap.org/node/11713637268) | 13 m |
| 23 | Calle Sol de las Moreras 6 | (solo stop_position) | nuevo | 0 m |
| 37 | Calle Juan de Juni 2 (instituto Sandoval y Rojas) | — | nuevo | — |
| 38 | Plaza Jardines de Don Diego | (solo stop_position) | nuevo | 0 m |

## Fichero JOSM: `aranda_bus_urbano.osm`

Contiene los objetos de las relaciones L1 y L2 (para que JOSM no pida descargar miembros incompletos) y estos cambios, ya marcados como modificados:

- **Paradas existentes (35 nodos)**: se añade `network=Bus Urbano Aranda` y `operator=UTE Clemente-Dávila`.
- **Relaciones L1/L2**: `operator`; en L2 `ref=2` y `name=Línea 2`; en L1 se confirma `ref=1`.
- **3 plataformas nuevas** (GTFS 23, 37, 38) con `fixme` para colocarlas en la acera.
- **Relación nueva Línea 3** (`route=bus`, `roundtrip=yes`) con las 28 paradas en orden. **Faltan las ways del recorrido**: hay que trazarlas en JOSM (puede ayudar copiar las de L1/L2 en el tramo común) y revisar `opening_hours`.

**No he cambiado**: nombres de paradas existentes, `wheelchair`, `opening_hours` de L1/L2, ni nada del GTFS.

### Antes de subirlo
1. Abre el fichero en JOSM y descarga los datos del área (Ctrl+Shift+Down) para detectar conflictos con ediciones recientes. La última edición de L1/L2 es del 2026-07-21 (usuario MarinoBM).
2. Revisa en el validador de JOSM los avisos de la relación L3.
3. Usa un `source=` apropiado en el conjunto de cambios (p. ej. `source=GTFS Bus Urbano Aranda; survey`) y un comentario claro.
4. Consulta con la comunidad local de OSM antes de subir, sobre todo la línea 3 y los cambios de `ref`/`name`.
