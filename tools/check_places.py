#!/usr/bin/env python3
"""Compara app/places.json con OpenStreetMap (Overpass) y lista diferencias.

Solo librería estándar. No modifica places.json: imprime
  - candidatos NUEVOS en OSM que no están en places.json (ni en tools/places_ignore.txt)
  - lugares de places.json SIN ningún elemento OSM a menos de 60 m (¿cerrado o movido?)
La curación (nombre visible, categoría, tags) se hace a mano en app/places.json.

Uso:
  python3 tools/check_places.py                # informe
  python3 tools/check_places.py --ignore-current  # marca lo que hoy no está en places.json como «ya revisado»
"""
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLACES = ROOT / "app" / "places.json"
IGNORE = Path(__file__).resolve().parent / "places_ignore.txt"
# Casco urbano de Aranda de Duero (incluye Sinovas y Costaján, que sirve el bus)
LAT = (41.640, 41.725)
LON = (-3.745, -3.640)
QUERY = """[out:json][timeout:60];
area["name"="Aranda de Duero"]["boundary"="administrative"]["admin_level"="8"]->.a;
(
  nwr(area.a)["amenity"~"^(townhall|hospital|clinic|cinema|theatre|library|community_centre|arts_centre|police|courthouse|post_office|school|college|university|fire_station|bus_station|marketplace|events_venue|museum)$"]["name"];
  nwr(area.a)["tourism"~"^(museum|attraction|information|gallery|viewpoint|hotel)$"]["name"];
  nwr(area.a)["leisure"~"^(sports_centre|stadium|swimming_pool|park)$"]["name"];
  nwr(area.a)["shop"~"^(mall|supermarket)$"]["name"];
  nwr(area.a)["amenity"~"^(pharmacy|bank)$"]["name"];
  nwr(area.a)["building"="public"]["name"];
  nwr(area.a)["office"="government"]["name"];
  nwr(area.a)["historic"~"^(monument|castle|ruins)$"]["name"];
  nwr(area.a)["amenity"="place_of_worship"]["name"];
);
out center tags;"""


def dist_m(a, b):
    k = math.cos(math.radians(a[0]))
    return math.hypot((a[0] - b[0]) * 110574, (a[1] - b[1]) * 111320 * k)


def fetch():
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": QUERY}).encode(),
        headers={"User-Agent": "gtfs-busurbano-check-places/1.0"},
    )
    last = None
    for intento in range(1, 5):  # Overpass devuelve 502/504 de vez en cuando
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)["elements"]
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            print(f"Overpass no responde (intento {intento}/4): {e}", file=sys.stderr)
            time.sleep(8 * intento)
    sys.exit(f"No se pudo consultar Overpass: {last}. Reintenta en unos minutos.")


def main():
    places = json.loads(PLACES.read_text(encoding="utf-8"))
    ignored = set(IGNORE.read_text(encoding="utf-8").splitlines()) if IGNORE.exists() else set()
    osm = []  # (nombre, (lat, lon)); un mismo nombre puede repetirse (cadenas)
    for e in fetch():
        c = e.get("center") or e
        pos = (c["lat"], c["lon"])
        if LAT[0] <= pos[0] <= LAT[1] and LON[0] <= pos[1] <= LON[1]:
            osm.append((e["tags"]["name"], pos))

    near = lambda pos, items, r: any(dist_m(pos, p) <= r for p in items)
    place_pos = [(p["lat"], p["lon"]) for p in places]
    osm_pos = [p for _, p in osm]

    new = {n: p for n, p in osm if not near(p, place_pos, 60) and n not in ignored}
    gone = [p for p in places if not near((p["lat"], p["lon"]), osm_pos, 60)]

    if "--ignore-current" in sys.argv:
        pending = sorted({n for n, p in osm if not near(p, place_pos, 60)} | ignored)
        IGNORE.write_text("\n".join(pending) + "\n", encoding="utf-8")
        print(f"{len(pending)} nombres marcados como revisados en {IGNORE.relative_to(ROOT)}")
        return

    print(f"places.json: {len(places)} lugares · OSM (casco urbano): {len(osm)} elementos\n")
    print(f"== Nuevos en OSM, no incluidos ({len(new)}) ==")
    for n, p in sorted(new.items()):
        print(f"  {n}  [{p[0]:.5f}, {p[1]:.5f}]")
    print(f"\n== En places.json sin elemento OSM a <60 m ({len(gone)}) — revisar si siguen existiendo ==")
    for p in gone:
        print(f"  {p['name']}  [{p['lat']}, {p['lon']}]")


if __name__ == "__main__":
    main()
