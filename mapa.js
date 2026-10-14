// Visor del feed GTFS: lee los .txt del propio sitio, sin build ni dependencias salvo Leaflet.
(function () {
  "use strict";

  const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const SERVICE_NAMES = { "L-V": "Lunes a viernes", "L-V_Lectivo": "Lunes a viernes (lectivos)", S: "Sábados" };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
    const head = rows.shift();
    return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  }
  const load = (name) => fetch(name).then((r) => { if (!r.ok) throw new Error(name + ": " + r.status); return r.text(); }).then(parseCSV);

  const toSec = (t) => { const [h, m, s] = t.split(":").map(Number); return h * 3600 + m * 60 + s; };
  const hhmm = (s) => String(Math.floor(s / 3600)).padStart(2, "0") + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0");

  function madridNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, sec: +p.hour * 3600 + +p.minute * 60 + +p.second };
  }

  let D = {}; // datos cargados
  let state = { date: madridNow().date, showBuses: true };
  let map, stopLayer, busLayer;
  const lineLayers = {};

  // ---------- Datos ----------
  function buildData([agency, routes, stops, trips, stopTimes, shapes, calendar, calendarDates]) {
    D.routes = Object.fromEntries(routes.map((r) => [r.route_id, r]));
    D.stops = Object.fromEntries(stops.map((s) => [s.stop_id, { ...s, lat: +s.stop_lat, lon: +s.stop_lon }]));
    D.trips = Object.fromEntries(trips.map((t) => [t.trip_id, { ...t, times: [] }]));
    stopTimes.forEach((r) => D.trips[r.trip_id] && D.trips[r.trip_id].times.push({
      stop: r.stop_id, seq: +r.stop_sequence, arr: toSec(r.arrival_time), dep: toSec(r.departure_time) }));
    Object.values(D.trips).forEach((t) => t.times.sort((a, b) => a.seq - b.seq));
    D.shapes = {};
    shapes.forEach((r) => (D.shapes[r.shape_id] = D.shapes[r.shape_id] || []).push(
      { seq: +r.shape_pt_sequence, lat: +r.shape_pt_lat, lon: +r.shape_pt_lon, dist: +r.shape_dist_traveled }));
    Object.values(D.shapes).forEach((s) => s.sort((a, b) => a.seq - b.seq));
    D.calendar = calendar;
    D.exceptions = calendarDates;
    D.agency = agency[0];
    // paradas -> líneas que las sirven
    D.stopRoutes = {};
    Object.values(D.trips).forEach((t) => t.times.forEach((x) =>
      (D.stopRoutes[x.stop] = D.stopRoutes[x.stop] || new Set()).add(t.route_id)));
  }

  function activeServices(dateISO) {
    const d = dateISO.replace(/-/g, "");
    const wd = DAYS[new Date(dateISO + "T12:00:00Z").getUTCDay()];
    const on = new Set();
    D.calendar.forEach((c) => { if (c.start_date <= d && d <= c.end_date && c[wd] === "1") on.add(c.service_id); });
    D.exceptions.forEach((e) => { if (e.date === d) e.exception_type === "1" ? on.add(e.service_id) : on.delete(e.service_id); });
    return on;
  }
  const tripsOn = (dateISO) => { const s = activeServices(dateISO); return Object.values(D.trips).filter((t) => s.has(t.service_id)); };
  const badge = (rid) => { const r = D.routes[rid]; return `<span class="badge" style="background:#${r.route_color}">${esc(r.route_short_name)}</span>`; };

  // ---------- Geometría de shapes (para buses simulados) ----------
  const projCache = {};
  function stopCandidates(shapeId, stopId) {
    const key = shapeId + "|" + stopId;
    if (projCache[key]) return projCache[key];
    const pts = D.shapes[shapeId], s = D.stops[stopId], k = Math.cos(s.lat * Math.PI / 180);
    const X = (lat, lon) => [lon * 111320 * k, lat * 110574];
    const [px, py] = X(s.lat, s.lon);
    const res = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = X(pts[i].lat, pts[i].lon), [bx, by] = X(pts[i + 1].lat, pts[i + 1].lon);
      const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
      const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l));
      if (Math.hypot(px - ax - t * dx, py - ay - t * dy) < 30)
        res.push(pts[i].dist + t * (pts[i + 1].dist - pts[i].dist));
    }
    return (projCache[key] = res);
  }
  function tripStopDists(trip) {
    if (trip._dists) return trip._dists;
    const shape = D.shapes[trip.shape_id];
    let prev = 0;
    trip._dists = trip.times.map((x) => {
      const c = stopCandidates(trip.shape_id, x.stop).filter((v) => v >= prev - 1);
      prev = c.length ? Math.min(...c) : prev;
      return prev;
    });
    trip._total = shape[shape.length - 1].dist;
    return trip._dists;
  }
  function pointAt(shapeId, dist) {
    const pts = D.shapes[shapeId];
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; pts[m].dist <= dist ? (lo = m) : (hi = m); }
    const a = pts[lo], b = pts[hi], span = b.dist - a.dist || 1;
    const t = Math.max(0, Math.min(1, (dist - a.dist) / span));
    return [a.lat + t * (b.lat - a.lat), a.lon + t * (b.lon - a.lon)];
  }

  // ---------- Mapa ----------
  function initMap() {
    map = L.map("map", { zoomControl: true }).setView([41.675, -3.69], 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    // Una capa por línea: se dibujan sólo las shapes "base" (no las rotadas _PLZ, que se solapan).
    const byRoute = {};
    Object.values(D.trips).forEach((t) => { (byRoute[t.route_id] = byRoute[t.route_id] || new Set()).add(t.shape_id); });
    Object.entries(byRoute).forEach(([rid, ids]) => {
      const color = "#" + D.routes[rid].route_color;
      const g = L.layerGroup();
      [...ids].filter((id) => !id.endsWith("_PLZ")).sort().forEach((id, i) => {
        L.polyline(D.shapes[id].map((p) => [p.lat, p.lon]), {
          color, weight: i === 0 ? 5 : 4, opacity: i === 0 ? 0.85 : 0.6, dashArray: i === 0 ? null : "6 6",
        }).bindTooltip(`${D.routes[rid].route_short_name} · ${id}`, { sticky: true }).addTo(g);
      });
      addArrows(g, [...ids].filter((id) => !id.endsWith("_PLZ")).sort(), color);
      lineLayers[rid] = g.addTo(map);
    });
    stopLayer = L.layerGroup().addTo(map);
    busLayer = L.layerGroup().addTo(map);
    Object.values(D.stops).forEach((s) => {
      const rs = [...(D.stopRoutes[s.stop_id] || [])].sort();
      const color = rs.length === 1 ? "#" + D.routes[rs[0]].route_color : "#334";
      s.marker = L.circleMarker([s.lat, s.lon], { radius: 7, color, weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .bindPopup(() => stopPopup(s.stop_id), { maxWidth: 320 }).addTo(stopLayer);
      s.marker.bindTooltip(esc(s.stop_name));
    });
    const all = Object.values(D.shapes).flat().map((p) => [p.lat, p.lon]);
    map.fitBounds(L.latLngBounds(all).pad(0.05));
  }

  // Flechas de sentido de la marcha cada ~400 m a lo largo de la traza.
  const ARROW_STEP = 400, ARROW_MIN_GAP = 60;
  function bearingDeg(a, b) {
    const p = L.CRS.EPSG3857.project(L.latLng(a)), q = L.CRS.EPSG3857.project(L.latLng(b));
    return (Math.atan2(q.x - p.x, q.y - p.y) * 180) / Math.PI;
  }
  function addArrows(group, shapeIds, color) {
    const placed = []; // evita flechas duplicadas donde las variantes comparten trazado
    shapeIds.forEach((id) => {
      const pts = D.shapes[id], total = pts[pts.length - 1].dist;
      for (let d = ARROW_STEP / 2; d < total - 50; d += ARROW_STEP) {
        const pos = pointAt(id, d);
        if (placed.some((q) => Math.abs(q[0] - pos[0]) * 111000 < ARROW_MIN_GAP &&
            Math.abs(q[1] - pos[1]) * 83000 < ARROW_MIN_GAP)) continue;
        placed.push(pos);
        const angle = bearingDeg(pointAt(id, Math.max(0, d - 20)), pointAt(id, Math.min(total, d + 20)));
        L.marker(pos, {
          interactive: false, keyboard: false,
          icon: L.divIcon({ className: "arrow", iconSize: [18, 18], iconAnchor: [9, 9],
            html: `<svg viewBox="0 0 20 20" width="18" height="18" style="transform:rotate(${angle.toFixed(0)}deg)">` +
              `<path d="M10 1.5 L17 17.5 L10 13.5 L3 17.5 Z" fill="${color}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>` }),
        }).addTo(group);
      }
    });
  }

  function departuresAt(stopId, dateISO, fromSec) {
    const out = [];
    tripsOn(dateISO).forEach((t) => t.times.forEach((x, i) => {
      if (x.stop === stopId && i < t.times.length - 1 && x.dep >= fromSec) out.push({ t, dep: x.dep });
    }));
    return out.sort((a, b) => a.dep - b.dep);
  }

  function stopPopup(stopId) {
    const s = D.stops[stopId], now = madridNow();
    const isToday = state.date === now.date, from = isToday ? now.sec : 0;
    const dep = departuresAt(stopId, state.date, from).slice(0, 6);
    const rs = [...(D.stopRoutes[stopId] || [])].sort().map(badge).join(" ");
    const list = dep.length
      ? "<ul>" + dep.map((d) => `<li><time>${hhmm(d.dep)}</time>${badge(d.t.route_id)}<span>${esc(d.t.trip_headsign)}</span></li>`).join("") + "</ul>"
      : `<p class="muted">No hay más salidas ${isToday ? "hoy" : "ese día"}.</p>`;
    return `<div class="popup"><h3>${esc(s.stop_name)}</h3><div>${rs}</div>
      <p class="muted" style="margin-top:.4rem">${isToday ? "Próximas salidas (hoy)" : "Salidas el " + state.date}</p>${list}
      ${s.wheelchair_boarding === "1" ? '<p class="muted">♿ Accesible</p>' : ""}</div>`;
  }

  // ---------- Buses simulados según horario ----------
  function updateBuses() {
    busLayer.clearLayers();
    if (!state.showBuses) return;
    const now = madridNow();
    if (state.date !== now.date) return;
    tripsOn(now.date).forEach((t) => {
      const first = t.times[0], last = t.times[t.times.length - 1];
      if (now.sec < first.dep || now.sec > last.arr) return;
      const dists = tripStopDists(t);
      let d = dists[0];
      for (let i = 0; i < t.times.length - 1; i++) {
        const a = t.times[i], b = t.times[i + 1];
        if (now.sec >= a.arr && now.sec <= a.dep) { d = dists[i]; break; }
        if (now.sec > a.dep && now.sec < b.arr) {
          d = dists[i] + (dists[i + 1] - dists[i]) * (now.sec - a.dep) / (b.arr - a.dep);
          break;
        }
        if (i === t.times.length - 2) d = dists[i + 1];
      }
      const r = D.routes[t.route_id];
      L.marker(pointAt(t.shape_id, d), {
        icon: L.divIcon({ className: "", iconSize: [34, 24],
          html: `<div class="bus" style="background:#${r.route_color}">${esc(r.route_short_name)}</div>` }),
        zIndexOffset: 1000,
      }).bindTooltip(`${r.route_short_name} → ${esc(t.trip_headsign)} (posición estimada según horario)`).addTo(busLayer);
    });
  }

  // ---------- Pestañas ----------
  function renderLineas() {
    const el = $("tab-lineas");
    const now = madridNow();
    const html = Object.values(D.routes).sort((a, b) => a.route_short_name.localeCompare(b.route_short_name)).map((r) => {
      const trips = Object.values(D.trips).filter((t) => t.route_id === r.route_id);
      const stopIds = new Set(trips.flatMap((t) => t.times.map((x) => x.stop)));
      const services = [...new Set(trips.map((t) => SERVICE_NAMES[t.service_id] || t.service_id))];
      return `<div class="line-card" style="border-left-color:#${r.route_color}">
        <label><input type="checkbox" data-line="${r.route_id}" checked />
          <span><h3>${badge(r.route_id)} ${esc(r.route_long_name)}</h3>
          <p>${stopIds.size} paradas · ${trips.length} viajes · ${esc(services.join(", "))}</p></span></label></div>`;
    }).join("");
    el.innerHTML = `
      <div class="row"><label class="small"><input type="checkbox" id="chk-buses" checked /> Mostrar buses (posición estimada según horario, sólo hoy)</label></div>
      <div class="row"><label class="small"><input type="checkbox" id="chk-arrows" checked /> Mostrar flechas de sentido</label></div>
      <div class="row"><label class="small">Fecha <input type="date" id="date" value="${state.date}" /></label>
        <button id="today" style="font:inherit;padding:.35rem .6rem">Hoy</button></div>
      <p class="muted" id="svc-info"></p>
      ${html}
      <p class="legend-note">Operador: ${esc(D.agency.agency_name)} · <a href="${esc(D.agency.agency_url)}" target="_blank" rel="noopener">${esc(D.agency.agency_url.replace(/^https?:\/\//, ""))}</a><br/>
      Línea continua: recorrido principal · discontinua: variantes. Datos del feed GTFS publicado en este sitio.<br/>
      Hora actual en Aranda: ${hhmm(now.sec)}.</p>`;
    el.querySelectorAll("input[data-line]").forEach((c) => c.addEventListener("change", () => {
      c.checked ? lineLayers[c.dataset.line].addTo(map) : map.removeLayer(lineLayers[c.dataset.line]);
    }));
    $("chk-arrows").addEventListener("change", (e) => $("map").classList.toggle("no-arrows", !e.target.checked));
    $("chk-buses").addEventListener("change", (e) => { state.showBuses = e.target.checked; updateBuses(); });
    $("date").addEventListener("change", (e) => { if (e.target.value) setDate(e.target.value); });
    $("today").addEventListener("click", () => setDate(madridNow().date));
    updateSvcInfo();
  }
  function updateSvcInfo() {
    const on = [...activeServices(state.date)].map((s) => SERVICE_NAMES[s] || s);
    $("svc-info").textContent = on.length ? "Servicio ese día: " + on.join(" + ") : "Ese día no hay servicio.";
  }
  function setDate(d) {
    state.date = d;
    $("date").value = d;
    updateSvcInfo(); renderHorarios(); updateBuses();
  }

  function renderParadas() {
    const el = $("tab-paradas");
    el.innerHTML = `<input type="search" id="q" placeholder="Buscar parada…" /><div id="stop-list" style="margin-top:.6rem"></div>`;
    const stops = Object.values(D.stops).sort((a, b) => a.stop_name.localeCompare(b.stop_name, "es"));
    const draw = () => {
      const q = $("q").value.trim().toLowerCase();
      $("stop-list").innerHTML = stops.filter((s) => !q || s.stop_name.toLowerCase().includes(q)).map((s) =>
        `<div class="stop-item" data-id="${s.stop_id}">${[...(D.stopRoutes[s.stop_id] || [])].sort().map(badge).join("")} ${esc(s.stop_name)}</div>`).join("")
        || '<p class="muted">Sin resultados.</p>';
    };
    draw();
    $("q").addEventListener("input", draw);
    $("stop-list").addEventListener("click", (e) => {
      const it = e.target.closest(".stop-item");
      if (!it) return;
      const s = D.stops[it.dataset.id];
      map.setView([s.lat, s.lon], 17);
      s.marker.openPopup();
    });
  }

  let ttRoute = null;
  function renderHorarios() {
    const el = $("tab-horarios");
    const routes = Object.values(D.routes).sort((a, b) => a.route_short_name.localeCompare(b.route_short_name));
    if (!ttRoute) ttRoute = routes[0].route_id;
    const now = madridNow(), isToday = state.date === now.date;
    const trips = tripsOn(state.date).filter((t) => t.route_id === ttRoute);
    // agrupar por patrón de paradas
    const groups = {};
    trips.forEach((t) => {
      const key = t.times.map((x) => x.stop).join(",");
      (groups[key] = groups[key] || []).push(t);
    });
    const tables = Object.values(groups).sort((a, b) => a[0].times[0].dep - b[0].times[0].dep).map((g) => {
      g.sort((a, b) => a.times[0].dep - b.times[0].dep);
      const stops = g[0].times.map((x) => x.stop);
      const nextIdx = isToday ? g.findIndex((t) => t.times[0].dep >= now.sec) : -1;
      const head = g.map((t, i) => `<th class="${i === nextIdx ? "next" : ""}">${hhmm(t.times[0].dep)}</th>`).join("");
      const rows = stops.map((sid, r) => `<tr><td>${esc(D.stops[sid].stop_name)}</td>${
        g.map((t, i) => `<td class="${i === nextIdx ? "next" : ""}">${hhmm(t.times[r].dep)}</td>`).join("")}</tr>`).join("");
      const first = D.stops[stops[0]].stop_name, last = D.stops[stops[stops.length - 1]].stop_name;
      return `<h4 class="pattern">${esc(g[0].trip_headsign)}</h4>
        <p class="muted">Sale de: ${esc(first)} · Termina en: ${esc(last)} · ${g.length} salidas</p>
        <div class="tt-wrap"><table class="tt"><thead><tr><th>Parada</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join("");
    el.innerHTML = `<div class="row">
        <label class="small">Línea <select id="tt-route">${routes.map((r) =>
          `<option value="${r.route_id}" ${r.route_id === ttRoute ? "selected" : ""}>${esc(r.route_short_name)} · ${esc(r.route_long_name)}</option>`).join("")}</select></label>
      </div>
      <p class="muted" style="margin-bottom:.6rem">Fecha: ${state.date} (cámbiala en la pestaña Líneas).</p>
      ${tables || '<p class="muted">Esta línea no tiene servicio el día seleccionado.</p>'}`;
    $("tt-route").addEventListener("change", (e) => { ttRoute = e.target.value; renderHorarios(); });
  }

  function initTabs() {
    document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
      if (b.dataset.tab === "horarios") renderHorarios();
    }));
  }

  // ---------- Arranque ----------
  Promise.all(["agency", "routes", "stops", "trips", "stop_times", "shapes", "calendar", "calendar_dates"]
    .map((n) => load(n + ".txt")))
    .then((all) => {
      buildData(all);
      $("status").remove();
      initMap(); initTabs(); renderLineas(); renderParadas(); renderHorarios();
      updateBuses();
      setInterval(updateBuses, 10000);
    })
    .catch((e) => { $("status").textContent = "No se han podido cargar los datos: " + e.message; });
})();
