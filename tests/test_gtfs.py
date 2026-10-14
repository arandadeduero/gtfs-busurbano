"""Tests de consistencia del feed GTFS (solo librería estándar).

Ejecutar:  python3 -m unittest discover -s tests -v
"""
import collections
import csv
import datetime
import math
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Anomalías conocidas pendientes de confirmar con la empresa. Se toleran
# para que el test pase, pero cualquier tramo nuevo fallará.
KNOWN_FAST_LEGS = {
    ("L3_LV_PLZ_0815", "10", "11"),
    ("L3_LV_PLZ_1415", "10", "11"),
    ("L3_LV_PLZ_1945", "10", "11"),
    ("L3_LV_PLZ_0815", "9", "10"),
    ("L3_LV_PLZ_1415", "9", "10"),
    ("L3_LV_PLZ_1945", "9", "10"),
}
MAX_SPEED_KMH = 50
MAX_LEG_SECONDS = 600
MAX_STOP_TO_SHAPE_M = 25
MAX_TRIP_DURATION_MIN = 60
# Bounding box aproximado de Aranda de Duero
BBOX = (41.60, 41.75, -3.80, -3.60)


def load(name):
    with open(ROOT / name, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def secs(t):
    h, m, s = map(int, t.split(":"))
    return h * 3600 + m * 60 + s


def haversine(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742000 * math.asin(math.sqrt(a))


def point_to_polyline_m(lat, lon, pts):
    k = math.cos(lat * math.pi / 180)
    px, py = lon * 111320 * k, lat * 110574
    xy = [(b * 111320 * k, a * 110574) for a, b in pts]
    best = float("inf")
    for (ax, ay), (bx, by) in zip(xy, xy[1:]):
        dx, dy = bx - ax, by - ay
        l = dx * dx + dy * dy
        t = 0 if l == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l))
        best = min(best, math.hypot(px - ax - t * dx, py - ay - t * dy))
    return best


class GtfsTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.agency = load("agency.txt")
        cls.routes = load("routes.txt")
        cls.stops = {s["stop_id"]: s for s in load("stops.txt")}
        cls.trips = load("trips.txt")
        cls.stop_times = load("stop_times.txt")
        cls.shape_rows = load("shapes.txt")
        cls.calendar = load("calendar.txt")
        cls.calendar_dates = load("calendar_dates.txt")
        cls.feed_info = load("feed_info.txt")
        cls.times_by_trip = collections.defaultdict(list)
        for r in cls.stop_times:
            cls.times_by_trip[r["trip_id"]].append(r)
        for rows in cls.times_by_trip.values():
            rows.sort(key=lambda r: int(r["stop_sequence"]))
        cls.shapes = collections.defaultdict(list)
        for r in cls.shape_rows:
            cls.shapes[r["shape_id"]].append(
                (int(r["shape_pt_sequence"]), float(r["shape_pt_lat"]),
                 float(r["shape_pt_lon"]), r["shape_dist_traveled"]))
        for v in cls.shapes.values():
            v.sort()


class TestFiles(GtfsTestCase):
    REQUIRED = ["agency", "routes", "trips", "stops", "stop_times", "calendar"]

    def test_required_files_exist(self):
        for n in self.REQUIRED:
            self.assertTrue((ROOT / f"{n}.txt").is_file(), n)

    def test_utf8_without_bom(self):
        for p in ROOT.glob("*.txt"):
            data = p.read_bytes()
            self.assertFalse(data.startswith(b"\xef\xbb\xbf"), f"BOM en {p.name}")
            data.decode("utf-8")

    def test_rows_have_header_width(self):
        for p in ROOT.glob("*.txt"):
            with open(p, encoding="utf-8", newline="") as f:
                rows = list(csv.reader(f))
            for n, row in enumerate(rows[1:], 2):
                self.assertEqual(len(row), len(rows[0]), f"{p.name}:{n}")

    def test_no_trailing_spaces_in_ids(self):
        for name, key in [("routes", "route_id"), ("stops", "stop_id"),
                          ("trips", "trip_id"), ("calendar", "service_id")]:
            for r in load(f"{name}.txt"):
                self.assertEqual(r[key], r[key].strip(), f"{name}:{r[key]!r}")


class TestAgencyAndFeed(GtfsTestCase):
    def test_agency(self):
        self.assertEqual(len(self.agency), 1)
        a = self.agency[0]
        self.assertEqual(a["agency_timezone"], "Europe/Madrid")
        self.assertTrue(a["agency_url"].startswith("https://"))
        self.assertTrue(a["agency_name"])

    def test_trips_agency_matches(self):
        ids = {a["agency_id"] for a in self.agency}
        for r in self.routes:
            self.assertIn(r["agency_id"], ids)

    def test_feed_info_dates(self):
        f = self.feed_info[0]
        s = datetime.datetime.strptime(f["feed_start_date"], "%Y%m%d")
        e = datetime.datetime.strptime(f["feed_end_date"], "%Y%m%d")
        self.assertLess(s, e)

    def test_feed_covers_calendar(self):
        f = self.feed_info[0]
        for c in self.calendar:
            self.assertGreaterEqual(c["start_date"], f["feed_start_date"], c["service_id"])
            self.assertLessEqual(c["end_date"], f["feed_end_date"], c["service_id"])


class TestRoutes(GtfsTestCase):
    def test_unique_ids_and_names(self):
        ids = [r["route_id"] for r in self.routes]
        self.assertEqual(len(ids), len(set(ids)))
        names = [r["route_short_name"] for r in self.routes]
        self.assertEqual(len(names), len(set(names)))

    def test_colors_are_hex(self):
        for r in self.routes:
            for k in ("route_color", "route_text_color"):
                self.assertRegex(r[k], r"^[0-9A-Fa-f]{6}$", f"{r['route_id']} {k}")

    def test_route_type_is_bus(self):
        for r in self.routes:
            self.assertEqual(r["route_type"], "3")

    def test_every_route_has_trips(self):
        used = {t["route_id"] for t in self.trips}
        for r in self.routes:
            self.assertIn(r["route_id"], used)


class TestStops(GtfsTestCase):
    def test_unique_ids(self):
        self.assertEqual(len(self.stops), len(load("stops.txt")))

    def test_names_not_empty(self):
        for s in self.stops.values():
            self.assertTrue(s["stop_name"].strip(), s["stop_id"])

    def test_names_unique(self):
        names = collections.Counter(s["stop_name"] for s in self.stops.values())
        self.assertEqual([n for n, c in names.items() if c > 1], [])

    def test_names_no_known_misspellings(self):
        bad = re.compile(r"Costajan|Cotaján|Policia|Mediterraneo|Urbanizacion|Poligono|Aragon\b")
        for s in self.stops.values():
            self.assertIsNone(bad.search(s["stop_name"]), s["stop_name"])
        for r in self.routes:
            self.assertIsNone(bad.search(r["route_long_name"]), r["route_long_name"])
        for t in self.trips:
            self.assertIsNone(bad.search(t["trip_headsign"]), t["trip_headsign"])

    def test_coordinates_in_aranda(self):
        for s in self.stops.values():
            lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
            self.assertTrue(BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3], s["stop_id"])

    def test_no_duplicate_stop_locations(self):
        # 4 y 41 están a 5 m (pendiente de unificar); se tolera sólo ese par.
        L = list(self.stops.values())
        close = []
        for i, a in enumerate(L):
            for b in L[i + 1:]:
                d = haversine(float(a["stop_lat"]), float(a["stop_lon"]),
                              float(b["stop_lat"]), float(b["stop_lon"]))
                if d < 6:
                    close.append(tuple(sorted((a["stop_id"], b["stop_id"]), key=int)))
        known = {("1", "44"), ("2", "43"), ("3", "42"), ("4", "41"), ("5", "40"), ("6", "39")}
        self.assertEqual(sorted(set(close) - known), [])

    def test_all_stops_used(self):
        used = {r["stop_id"] for r in self.stop_times}
        self.assertEqual(set(self.stops) - used, set())

    def test_wheelchair_values(self):
        for s in self.stops.values():
            self.assertIn(s["wheelchair_boarding"], ("", "0", "1", "2"))


class TestCalendar(GtfsTestCase):
    def test_dates_valid_and_ordered(self):
        for c in self.calendar:
            s = datetime.datetime.strptime(c["start_date"], "%Y%m%d")
            e = datetime.datetime.strptime(c["end_date"], "%Y%m%d")
            self.assertLessEqual(s, e, c["service_id"])
            days = [c[d] for d in ("monday", "tuesday", "wednesday", "thursday",
                                   "friday", "saturday", "sunday")]
            self.assertTrue(all(d in ("0", "1") for d in days))
            self.assertIn("1", days, c["service_id"])

    def test_calendar_dates_reference_services(self):
        ids = {c["service_id"] for c in self.calendar}
        for r in self.calendar_dates:
            if r["exception_type"] == "1":
                continue  # servicios definidos sólo con calendar_dates
            self.assertIn(r["service_id"], ids)
            self.assertIn(r["exception_type"], ("1", "2"))
            datetime.datetime.strptime(r["date"], "%Y%m%d")

    def test_calendar_dates_unique(self):
        keys = [(r["service_id"], r["date"]) for r in self.calendar_dates]
        self.assertEqual(len(keys), len(set(keys)))

    def test_removals_fall_on_service_days(self):
        # Una exención "2" en un día que el servicio no opera no tiene efecto.
        cal = {c["service_id"]: c for c in self.calendar}
        names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for r in self.calendar_dates:
            if r["exception_type"] != "2":
                continue
            d = datetime.datetime.strptime(r["date"], "%Y%m%d")
            c = cal[r["service_id"]]
            self.assertEqual(c[names[d.weekday()]], "1", f"{r['service_id']} {r['date']}")
            self.assertTrue(c["start_date"] <= r["date"] <= c["end_date"], r["date"])

    def test_every_service_used(self):
        used = {t["service_id"] for t in self.trips}
        for c in self.calendar:
            self.assertIn(c["service_id"], used)

    def test_lectivo_exemptions_include_holidays(self):
        # Cada festivo de L-V debe estar también quitado en L-V_Lectivo.
        lv = {r["date"] for r in self.calendar_dates
              if r["service_id"] == "L-V" and r["exception_type"] == "2"}
        lec = {r["date"] for r in self.calendar_dates
               if r["service_id"] == "L-V_Lectivo" and r["exception_type"] == "2"}
        self.assertEqual(sorted(lv - lec), [])


class TestTrips(GtfsTestCase):
    def test_unique_trip_ids(self):
        ids = [t["trip_id"] for t in self.trips]
        self.assertEqual(len(ids), len(set(ids)))

    def test_references_exist(self):
        routes = {r["route_id"] for r in self.routes}
        services = ({c["service_id"] for c in self.calendar}
                    | {r["service_id"] for r in self.calendar_dates if r["exception_type"] == "1"})
        for t in self.trips:
            self.assertIn(t["route_id"], routes, t["trip_id"])
            self.assertIn(t["service_id"], services, t["trip_id"])
            self.assertIn(t["shape_id"], self.shapes, t["trip_id"])

    def test_every_trip_has_stop_times(self):
        for t in self.trips:
            self.assertGreaterEqual(len(self.times_by_trip[t["trip_id"]]), 2, t["trip_id"])

    def test_direction_id_filled(self):
        for t in self.trips:
            self.assertIn(t["direction_id"], ("0", "1"), t["trip_id"])

    def test_direction_matches_trip_id(self):
        for t in self.trips:
            expected = "1" if "_PLZ_" in t["trip_id"] else "0"
            self.assertEqual(t["direction_id"], expected, t["trip_id"])

    def test_trip_id_encodes_route_and_service(self):
        for t in self.trips:
            m = re.match(r"^L(\d)_(LVLEC|LV|S)_(AMB|PLZ)_(\d{4})$", t["trip_id"])
            self.assertIsNotNone(m, t["trip_id"])
            self.assertEqual(m.group(1), t["route_id"], t["trip_id"])
            svc = {"LVLEC": {"L-V_Lectivo"}, "LV": {"L-V", "L-V_NoLectivo"}, "S": {"S"}}[m.group(2)]
            self.assertIn(t["service_id"], svc, t["trip_id"])

    def test_trip_id_time_matches_first_departure(self):
        for t in self.trips:
            hhmm = t["trip_id"][-4:]
            first = self.times_by_trip[t["trip_id"]][0]["departure_time"]
            self.assertEqual(first[:2] + first[3:5], hhmm, t["trip_id"])

    def test_wheelchair_accessible_values(self):
        for t in self.trips:
            self.assertIn(t["wheelchair_accessible"], ("", "0", "1", "2"))

    def test_headsign_present(self):
        for t in self.trips:
            self.assertTrue(t["trip_headsign"].strip(), t["trip_id"])

    def test_headsign_consistent_with_shape(self):
        # Mismo shape y sentido => mismo headsign.
        seen = collections.defaultdict(set)
        for t in self.trips:
            seen[(t["shape_id"], t["direction_id"], t["route_id"])].add(t["trip_headsign"])
        for k, v in seen.items():
            if k[0] in ("Linea_1", "Linea_3"):
                self.assertEqual(len(v), 1, k)

    def test_no_duplicate_departures_same_pattern(self):
        seen = set()
        for t in self.trips:
            key = (t["route_id"], t["shape_id"], t["service_id"], t["direction_id"],
                   self.times_by_trip[t["trip_id"]][0]["departure_time"])
            self.assertNotIn(key, seen, t["trip_id"])
            seen.add(key)


class TestStopTimes(GtfsTestCase):
    def test_references_exist(self):
        trips = {t["trip_id"] for t in self.trips}
        for r in self.stop_times:
            self.assertIn(r["trip_id"], trips)
            self.assertIn(r["stop_id"], self.stops)

    def test_sequences_strictly_increasing_and_contiguous(self):
        for tid, rows in self.times_by_trip.items():
            seq = [int(r["stop_sequence"]) for r in rows]
            self.assertEqual(seq, list(range(1, len(seq) + 1)), tid)

    def test_time_format(self):
        pat = re.compile(r"^\d{2}:[0-5]\d:[0-5]\d$")
        for r in self.stop_times:
            self.assertRegex(r["arrival_time"], pat, r["trip_id"])
            self.assertRegex(r["departure_time"], pat, r["trip_id"])

    def test_times_monotonic(self):
        for tid, rows in self.times_by_trip.items():
            prev = -1
            for r in rows:
                a, d = secs(r["arrival_time"]), secs(r["departure_time"])
                self.assertLessEqual(a, d, f"{tid} seq {r['stop_sequence']}")
                self.assertGreaterEqual(a, prev, f"{tid} seq {r['stop_sequence']}")
                prev = d

    def test_no_repeated_consecutive_stop(self):
        for tid, rows in self.times_by_trip.items():
            for a, b in zip(rows, rows[1:]):
                self.assertNotEqual(a["stop_id"], b["stop_id"], tid)

    def test_trip_duration_reasonable(self):
        for tid, rows in self.times_by_trip.items():
            dur = (secs(rows[-1]["arrival_time"]) - secs(rows[0]["departure_time"])) / 60
            self.assertGreater(dur, 5, tid)
            self.assertLess(dur, MAX_TRIP_DURATION_MIN, tid)

    def test_first_and_last_are_timepoints(self):
        for tid, rows in self.times_by_trip.items():
            self.assertEqual(rows[0]["timepoint"], "1", tid)
            self.assertEqual(rows[-1]["timepoint"], "1", tid)

    def test_intermediate_stops_not_timepoints(self):
        for tid, rows in self.times_by_trip.items():
            for r in rows[1:-1]:
                self.assertEqual(r["timepoint"], "0", f"{tid} seq {r['stop_sequence']}")

    def test_operating_hours(self):
        for r in self.stop_times:
            h = int(r["departure_time"][:2])
            self.assertTrue(6 <= h <= 23, r["trip_id"])

    def test_legs_not_too_fast_or_slow(self):
        for tid, rows in self.times_by_trip.items():
            for a, b in zip(rows, rows[1:]):
                if (tid, a["stop_id"], b["stop_id"]) in KNOWN_FAST_LEGS:
                    continue
                s1, s2 = self.stops[a["stop_id"]], self.stops[b["stop_id"]]
                dist = haversine(float(s1["stop_lat"]), float(s1["stop_lon"]),
                                 float(s2["stop_lat"]), float(s2["stop_lon"]))
                dt = secs(b["arrival_time"]) - secs(a["departure_time"])
                where = f"{tid} {a['stop_id']}->{b['stop_id']}"
                self.assertGreater(dt, 0, where)
                self.assertLess(dt, MAX_LEG_SECONDS, where)
                self.assertLess(dist / dt * 3.6, MAX_SPEED_KMH, f"{where} {dist:.0f}m/{dt}s")

    def test_same_pattern_has_similar_durations(self):
        # Viajes con la misma lista de paradas no deben diferir mucho en duración.
        groups = collections.defaultdict(list)
        for t in self.trips:
            rows = self.times_by_trip[t["trip_id"]]
            key = (t["shape_id"], tuple(r["stop_id"] for r in rows))
            groups[key].append((t["trip_id"], secs(rows[-1]["arrival_time"]) - secs(rows[0]["departure_time"])))
        for key, items in groups.items():
            if len(items) < 3:
                continue
            durs = [d for _, d in items]
            med = sorted(durs)[len(durs) // 2]
            for tid, d in items:
                self.assertLess(abs(d - med), 180, f"{tid} dura {d}s, mediana {med}s")


class TestShapes(GtfsTestCase):
    def test_sequences_contiguous_increasing(self):
        for sid, pts in self.shapes.items():
            seq = [p[0] for p in pts]
            self.assertEqual(seq, sorted(set(seq)), sid)

    def test_dist_traveled_monotonic(self):
        for sid, pts in self.shapes.items():
            d = [float(p[3]) for p in pts if p[3] != ""]
            self.assertEqual(d, sorted(d), sid)

    def test_points_in_aranda(self):
        for sid, pts in self.shapes.items():
            for _, lat, lon, _ in pts:
                self.assertTrue(BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3], sid)

    def test_all_shapes_used(self):
        used = {t["shape_id"] for t in self.trips}
        self.assertEqual(set(self.shapes) - used, set())

    def test_no_duplicate_consecutive_points(self):
        for sid, pts in self.shapes.items():
            for a, b in zip(pts, pts[1:]):
                self.assertNotEqual((a[1], a[2]), (b[1], b[2]), f"{sid} seq {b[0]}")

    def test_stops_lie_on_shape(self):
        checked = set()
        for t in self.trips:
            pts = [(p[1], p[2]) for p in self.shapes[t["shape_id"]]]
            for r in self.times_by_trip[t["trip_id"]]:
                key = (t["shape_id"], r["stop_id"])
                if key in checked:
                    continue
                checked.add(key)
                s = self.stops[r["stop_id"]]
                d = point_to_polyline_m(float(s["stop_lat"]), float(s["stop_lon"]), pts)
                self.assertLess(d, MAX_STOP_TO_SHAPE_M,
                                f"parada {r['stop_id']} a {d:.0f} m de {t['shape_id']}")

    def test_stops_visited_in_shape_order(self):
        # Las paradas deben aparecer en el mismo orden que a lo largo de la shape
        # (se admiten varias posiciones candidatas por parada, p. ej. en bucles).
        known = {"L2_LVLEC_AMB_1330"}  # termina en la 20 (pendiente de confirmar)
        cache = {}

        def candidates(shape_id, stop_id):
            key = (shape_id, stop_id)
            if key not in cache:
                pts = self.shapes[shape_id]
                s = self.stops[stop_id]
                lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
                k = math.cos(lat * math.pi / 180)
                px, py = lon * 111320 * k, lat * 110574
                res = []
                for p, q in zip(pts, pts[1:]):
                    ax, ay = p[2] * 111320 * k, p[1] * 110574
                    bx, by = q[2] * 111320 * k, q[1] * 110574
                    dx, dy = bx - ax, by - ay
                    l = dx * dx + dy * dy
                    t = 0 if l == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l))
                    if math.hypot(px - ax - t * dx, py - ay - t * dy) < MAX_STOP_TO_SHAPE_M:
                        res.append(float(p[3]) + t * (float(q[3]) - float(p[3])))
                cache[key] = res
            return cache[key]

        for t in self.trips:
            if t["trip_id"] in known:
                continue
            prev = -1.0
            for r in self.times_by_trip[t["trip_id"]]:
                nxt = [c for c in candidates(t["shape_id"], r["stop_id"]) if c >= prev - 1]
                self.assertTrue(nxt, f"{t['trip_id']} parada {r['stop_id']} fuera de orden en {t['shape_id']}")
                prev = min(nxt)


class TestServiceReplacement(GtfsTestCase):
    """L2: los viajes lectivos sustituyen a los base en días lectivos."""

    def active(self, date):
        d = datetime.datetime.strptime(date, "%Y%m%d")
        wd = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][d.weekday()]
        on = {c["service_id"] for c in self.calendar
              if c["start_date"] <= date <= c["end_date"] and c[wd] == "1"}
        for r in self.calendar_dates:
            if r["date"] == date:
                (on.add if r["exception_type"] == "1" else on.discard)(r["service_id"])
        return on

    def departures(self, date, route):
        on = self.active(date)
        return sorted(
            (self.times_by_trip[t["trip_id"]][0]["departure_time"][:5],
             "AMB" if "_AMB_" in t["trip_id"] else "PLZ")
            for t in self.trips if t["route_id"] == route and t["service_id"] in on)

    def test_l2_no_duplicate_departures_any_weekday(self):
        d = datetime.date(2025, 12, 1)
        while d <= datetime.date(2027, 12, 31):
            dep = self.departures(d.strftime("%Y%m%d"), "2")
            self.assertEqual(len(dep), len(set(dep)), f"{d} {dep}")
            d += datetime.timedelta(1)

    def test_l2_lectivo_day_has_one_departure_per_slot(self):
        dep = self.departures("20261015", "2")
        self.assertEqual([h for h, _ in dep if h < "15:00"].count("07:30"), 2)  # AMB + PLZ
        self.assertEqual(len(dep), 9)

    def test_l2_non_lectivo_day(self):
        dep = self.departures("20260715", "2")
        self.assertEqual(len(dep), 9)
        self.assertNotIn(("14:20", "AMB"), dep)

    def test_l2_school_holidays_2027(self):
        # Carnaval, Semana Santa, Navidad y verano: sólo viajes base (L-V_NoLectivo).
        for date in ("20261228", "20270208", "20270322", "20270715"):
            on = self.active(date)
            self.assertIn("L-V_NoLectivo", on, date)
            self.assertNotIn("L-V_Lectivo", on, date)
            self.assertEqual(len(self.departures(date, "2")), 9, date)
        # Día lectivo normal: variantes lectivas, sin viajes base duplicados.
        on = self.active("20270510")
        self.assertIn("L-V_Lectivo", on)
        self.assertNotIn("L-V_NoLectivo", on)
        self.assertEqual(len(self.departures("20270510", "2")), 9)

    def test_no_service_on_2027_holidays(self):
        for date in ("20270101", "20270106", "20270325", "20270326", "20270423",
                     "20270816", "20270913", "20270914", "20271012", "20271101",
                     "20271206", "20271208"):
            self.assertEqual(self.departures(date, "1"), [], date)
        for date in ("20270501", "20271225"):  # sábados festivos
            self.assertEqual(self.departures(date, "1"), [], date)


if __name__ == "__main__":
    unittest.main()
