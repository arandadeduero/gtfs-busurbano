// Lógica pura de /app/: sin DOM ni red, para poder probarla desde Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AppCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const WALK_M_PER_MIN = 80;
  const WALK_DETOUR = 1.25; // la distancia a pie real es mayor que la línea recta

  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift() || [];
    return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  }

  const toSec = (t) => { const [h, m, s] = t.split(":").map(Number); return h * 3600 + m * 60 + (s || 0); };
  const hhmm = (s) => String(Math.floor(s / 3600) % 24).padStart(2, "0") + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0");

  // Conjunto de service_id activos en una fecha ISO (calendar + calendar_dates).
  function activeServices(calendar, exceptions, dateISO) {
    const d = dateISO.replace(/-/g, "");
    const wd = DAYS[new Date(dateISO + "T12:00:00Z").getUTCDay()];
    const on = new Set();
    calendar.forEach((c) => { if (c.start_date <= d && d <= c.end_date && c[wd] === "1") on.add(c.service_id); });
    exceptions.forEach((e) => { if (e.date === d) e.exception_type === "1" ? on.add(e.service_id) : on.delete(e.service_id); });
    return on;
  }

  function addDays(dateISO, n) {
    const d = new Date(dateISO + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function distanceM(lat1, lon1, lat2, lon2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  const walkMin = (m) => Math.max(1, Math.ceil((m * WALK_DETOUR) / WALK_M_PER_MIN));
  const walkSec = (m) => walkMin(m) * 60;

  // Paradas a menos de radius metros, ordenadas por cercanía.
  function nearbyStops(stops, lat, lon, radius) {
    return Object.values(stops)
      .map((s) => ({ stop: s, dist: distanceM(lat, lon, s.lat, s.lon) }))
      .filter((x) => x.dist <= radius)
      .sort((a, b) => a.dist - b.dist);
  }

  function nearestStops(stops, lat, lon, n) {
    return Object.values(stops)
      .map((s) => ({ stop: s, dist: distanceM(lat, lon, s.lat, s.lon) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, n);
  }

  // Mejor viaje directo por (línea, sentido) saliendo a partir de nowSec.
  // trips: [{trip_id, route_id, direction_id, shape_id, trip_headsign, times:[{stop, seq, arr, dep}]}]
  // Devuelve opciones ordenadas por llegada al destino.
  function findOptions({ trips, stops, origin, dest, nowSec, radius = 600, maxDepartures = 3 }) {
    const O = new Map(nearbyStops(stops, origin.lat, origin.lon, radius).map((x) => [x.stop.stop_id, x.dist]));
    const D = new Map(nearbyStops(stops, dest.lat, dest.lon, radius).map((x) => [x.stop.stop_id, x.dist]));
    if (!O.size || !D.size) return [];

    // Para cada viaje, el mejor par (subida, bajada): sale tras llegar a pie y llega antes al destino.
    const cands = [];
    for (const t of trips) {
      let best = null;
      for (let i = 0; i < t.times.length; i++) {
        const a = t.times[i];
        if (!O.has(a.stop)) continue;
        const ready = nowSec + walkSec(O.get(a.stop));
        if (a.dep < ready) continue;
        for (let j = i + 1; j < t.times.length; j++) {
          const b = t.times[j];
          if (!D.has(b.stop) || b.stop === a.stop) continue;
          const arrive = b.arr + walkSec(D.get(b.stop));
          if (!best || arrive < best.arrive) best = { trip: t, i, j, a, b, arrive };
        }
      }
      if (best) cands.push(best);
    }

    // Agrupar por línea (una sola opción, la que antes llega); el par de paradas lo marca el viaje que antes llega.
    const groups = new Map();
    cands.sort((x, y) => x.arrive - y.arrive);
    for (const c of cands) {
      const key = c.trip.route_id;
      if (!groups.has(key)) groups.set(key, { first: c, all: [] });
      const g = groups.get(key);
      if (c.a.stop === g.first.a.stop && c.b.stop === g.first.b.stop) g.all.push(c);
    }

    return [...groups.values()].map(({ first, all }) => {
      const deps = all.slice().sort((x, y) => x.a.dep - y.a.dep).slice(0, maxDepartures);
      const walkTo = O.get(first.a.stop), walkFrom = D.get(first.b.stop);
      return {
        routeId: first.trip.route_id,
        directionId: first.trip.direction_id,
        headsign: first.trip.trip_headsign,
        shapeId: first.trip.shape_id,
        boardStop: stops[first.a.stop],
        alightStop: stops[first.b.stop],
        stops: first.j - first.i,
        walkToM: walkTo, walkFromM: walkFrom,
        walkToMin: walkMin(walkTo), walkFromMin: walkMin(walkFrom),
        rideMin: Math.round((first.b.arr - first.a.dep) / 60),
        departures: deps.map((c) => ({ dep: c.a.dep, arrive: c.arrive, boardAt: c.a.dep, tripId: c.trip.trip_id })),
        arrive: first.arrive,
        totalMin: Math.round((first.arrive - nowSec) / 60),
      };
    }).sort((x, y) => x.arrive - y.arrive);
  }

  // Tramo del shape entre dos paradas (puntos [lat, lon]); soporta circulares que cierran el bucle.
  function sliceShape(points, a, b) {
    if (!points.length) return [];
    const nearest = (p, from, to) => {
      let bi = -1, bd = Infinity;
      for (let i = from; i < to; i++) {
        const d = distanceM(p.lat, p.lon, points[i].lat, points[i].lon);
        if (d < bd) { bd = d; bi = i; }
      }
      return { i: bi, d: bd };
    };
    const ia = nearest(a, 0, points.length).i;
    const after = nearest(b, ia, points.length);
    const before = nearest(b, 0, ia);
    const pts = (x, y) => points.slice(x, y + 1).map((p) => [p.lat, p.lon]);
    if (before.i >= 0 && before.d + 5 < after.d) return pts(ia, points.length - 1).concat(pts(0, before.i));
    return pts(ia, after.i);
  }

  // true si hay que recargar los datos GTFS (feed_version distinta o sin versión guardada).
  function needsDataRefresh(stored, remote) {
    return stored == null || String(stored) !== String(remote);
  }

  function feedVersion(feedInfoText) {
    const r = parseCSV(feedInfoText)[0];
    return r ? r.feed_version : "";
  }

  function gmapsUrl(origin, dest) {
    const f = (p) => p.lat.toFixed(5) + "," + p.lon.toFixed(5);
    return "https://www.google.com/maps/dir/?api=1&origin=" + f(origin) + "&destination=" + f(dest) + "&travelmode=transit";
  }

  return { parseCSV, toSec, hhmm, activeServices, addDays, distanceM, walkMin, walkSec, nearbyStops, nearestStops, findOptions, sliceShape, needsDataRefresh, feedVersion, gmapsUrl };
});
