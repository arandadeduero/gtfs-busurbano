// Pruebas de app/core.js.  Ejecutar:  node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../app/core.js");

const ROOT = path.join(__dirname, "..");
const load = (f) => C.parseCSV(fs.readFileSync(path.join(ROOT, f), "utf8"));

function realData() {
  const stops = Object.fromEntries(load("stops.txt").map((s) => [s.stop_id, { ...s, lat: +s.stop_lat, lon: +s.stop_lon }]));
  const trips = Object.fromEntries(load("trips.txt").map((t) => [t.trip_id, { ...t, times: [] }]));
  load("stop_times.txt").forEach((r) => trips[r.trip_id].times.push({ stop: r.stop_id, seq: +r.stop_sequence, arr: C.toSec(r.arrival_time), dep: C.toSec(r.departure_time) }));
  Object.values(trips).forEach((t) => t.times.sort((a, b) => a.seq - b.seq));
  return { stops, trips, calendar: load("calendar.txt"), exceptions: load("calendar_dates.txt") };
}

// Dos paradas A (0,0) y B (0, 0.01 ≈ 1.1 km); viaje 10:00→10:10.
const S = { A: { stop_id: "A", lat: 0, lon: 0 }, B: { stop_id: "B", lat: 0, lon: 0.01 }, C: { stop_id: "C", lat: 0, lon: 0.02 } };
const trip = (id, route, dir, times) => ({ trip_id: id, route_id: route, direction_id: dir, shape_id: "s", trip_headsign: "h",
  times: times.map(([stop, t], i) => ({ stop, seq: i + 1, arr: C.toSec(t), dep: C.toSec(t) })) });

test("parseCSV gestiona comillas y BOM", () => {
  const r = C.parseCSV('﻿a,b\n"x,1","y ""q"""\n');
  assert.deepStrictEqual(r, [{ a: "x,1", b: 'y "q"' }]);
});

test("activeServices aplica calendar y calendar_dates", () => {
  const cal = [{ service_id: "LV", monday: "1", tuesday: "1", wednesday: "1", thursday: "1", friday: "1", saturday: "0", sunday: "0", start_date: "20260101", end_date: "20261231" }];
  assert.ok(C.activeServices(cal, [], "2026-10-15").has("LV")); // jueves
  assert.ok(!C.activeServices(cal, [], "2026-10-17").has("LV")); // sábado
  const ex = [{ service_id: "LV", date: "20261012", exception_type: "2" }];
  assert.ok(!C.activeServices(cal, ex, "2026-10-12").has("LV")); // festivo
});

test("distanceM y walkMin", () => {
  assert.ok(Math.abs(C.distanceM(0, 0, 0, 0.01) - 1112) < 5);
  assert.strictEqual(C.walkMin(80), 2); // 80 m ×1,25 / 80 = 1,25 → 2
});

test("findOptions: viaje directo, orden de parada respetado", () => {
  const trips = [trip("t1", "1", "0", [["A", "10:00:00"], ["B", "10:10:00"]]), trip("t2", "1", "0", [["A", "11:00:00"], ["B", "11:10:00"]])];
  const o = C.findOptions({ trips, stops: S, origin: { lat: 0, lon: 0 }, dest: { lat: 0, lon: 0.01 }, nowSec: C.toSec("09:30:00") });
  assert.strictEqual(o.length, 1);
  assert.strictEqual(o[0].boardStop.stop_id, "A");
  assert.strictEqual(o[0].departures.length, 2);
  assert.strictEqual(o[0].departures[0].dep, C.toSec("10:00:00"));
});

test("findOptions: sentido contrario no vale (B antes que A)", () => {
  const trips = [trip("t1", "1", "1", [["B", "10:00:00"], ["A", "10:10:00"]])];
  const o = C.findOptions({ trips, stops: S, origin: { lat: 0, lon: 0 }, dest: { lat: 0, lon: 0.01 }, nowSec: 0 });
  assert.strictEqual(o.length, 0);
});

test("findOptions: no cuenta salidas que no da tiempo a coger andando", () => {
  const trips = [trip("t1", "1", "0", [["A", "10:00:00"], ["B", "10:10:00"]])];
  // origen a ~550 m de A (7 min andando); son las 09:56 → no llega
  const origin = { lat: 0, lon: -0.005 };
  const o = C.findOptions({ trips, stops: S, origin, dest: { lat: 0, lon: 0.01 }, nowSec: C.toSec("09:56:00") });
  assert.strictEqual(o.length, 0);
});

test("findOptions: circular elige el tramo hacia delante más corto", () => {
  const trips = [trip("c", "1", "0", [["A", "10:00:00"], ["B", "10:05:00"], ["C", "10:10:00"], ["A", "10:20:00"]])];
  const o = C.findOptions({ trips, stops: S, origin: { lat: 0, lon: 0.02 }, dest: { lat: 0, lon: 0 }, nowSec: 0 });
  assert.strictEqual(o[0].boardStop.stop_id, "C");
  assert.strictEqual(o[0].rideMin, 10);
});

test("findOptions: distintas líneas → una opción por línea ordenadas por llegada", () => {
  const trips = [trip("a", "1", "0", [["A", "10:00:00"], ["B", "10:20:00"]]), trip("b", "2", "0", [["A", "10:05:00"], ["B", "10:10:00"]])];
  const o = C.findOptions({ trips, stops: S, origin: { lat: 0, lon: 0 }, dest: { lat: 0, lon: 0.01 }, nowSec: 0 });
  assert.deepStrictEqual(o.map((x) => x.routeId), ["2", "1"]);
});

test("findOptions: sin paradas cerca → vacío", () => {
  const o = C.findOptions({ trips: [], stops: S, origin: { lat: 10, lon: 10 }, dest: { lat: 0, lon: 0 }, nowSec: 0 });
  assert.deepStrictEqual(o, []);
});

test("findOptions con el feed real: Ambulatorio Norte → Plaza Mayor un jueves", () => {
  const d = realData();
  const on = C.activeServices(d.calendar, d.exceptions, "2026-10-15");
  const trips = Object.values(d.trips).filter((t) => on.has(t.service_id));
  assert.ok(trips.length > 0);
  const o = C.findOptions({ trips, stops: d.stops,
    origin: { lat: d.stops["1"].lat, lon: d.stops["1"].lon },
    dest: { lat: d.stops["8"].lat, lon: d.stops["8"].lon }, nowSec: C.toSec("08:00:00") });
  assert.ok(o.length >= 1, "debería haber al menos una línea directa");
  o.forEach((x) => assert.ok(x.departures[0].dep >= C.toSec("08:00:00")));
});

test("sliceShape recorta entre paradas y cierra bucles", () => {
  const pts = [0, 1, 2, 3, 4].map((i) => ({ lat: 0, lon: i * 0.001 }));
  const mid = C.sliceShape(pts, { lat: 0, lon: 0.001 }, { lat: 0, lon: 0.003 });
  assert.strictEqual(mid.length, 3);
  const wrap = C.sliceShape(pts, { lat: 0, lon: 0.003 }, { lat: 0, lon: 0.001 });
  assert.deepStrictEqual(wrap[0], [0, 0.003]);
  assert.deepStrictEqual(wrap[wrap.length - 1], [0, 0.001]);
});

test("needsDataRefresh y feedVersion", () => {
  assert.strictEqual(C.needsDataRefresh(null, "1"), true);
  assert.strictEqual(C.needsDataRefresh("1", "1"), false);
  assert.strictEqual(C.needsDataRefresh("1", "2"), true);
  assert.strictEqual(C.feedVersion(fs.readFileSync(path.join(ROOT, "feed_info.txt"), "utf8")), "1");
});

test("gmapsUrl: siempre transporte público", () => {
  const u = C.gmapsUrl({ lat: 41.675138, lon: -3.685868 }, { lat: 41.669202, lon: -3.691206 });
  assert.strictEqual(u, "https://www.google.com/maps/dir/?api=1&origin=41.67514,-3.68587&destination=41.66920,-3.69121&travelmode=transit");
});
