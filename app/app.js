// /app/: «¿A dónde quieres ir?». Datos GTFS del propio sitio + búsqueda Nominatim (OSM).
(function () {
  "use strict";
  const C = window.AppCore;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const FILES = ["agency", "routes", "stops", "trips", "stop_times", "shapes", "calendar", "calendar_dates"];
  const VIEWBOX = "-3.76,41.72,-3.62,41.62"; // izq, arriba, der, abajo — Aranda de Duero
  const CENTER = [41.6705, -3.6875];
  const PLACES = [
    { label: "🏥 Hospital", q: "Hospital Santos Reyes" },
    { label: "🚉 Estación de autobuses", q: "Estación de autobuses" },
    { label: "🏛 Plaza Mayor", q: "Plaza Mayor" },
    { label: "🎓 Institutos", q: "Instituto" },
  ];

  const CAT_ICON = { admin: "🏛", salud: "🏥", cultura: "🎭", turismo: "🏰", educacion: "🎓", deporte: "⚽", parque: "🌳",
    religion: "⛪", hotel: "🏨", compras: "🛍", seguridad: "🚓", transporte: "🚉", trabajo: "🏭" };

  const D = {};
  const S = { origin: null, originLabel: "", dest: null, destLabel: "", options: [], sel: 0, pick: null, picks: [], feedVersion: "" };
  let map, layer;

  function madridNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, sec: +p.hour * 3600 + +p.minute * 60 + +p.second };
  }

  // ---------- Datos ----------
  const load = (name) => fetch("../" + name + ".txt").then((r) => { if (!r.ok) throw new Error(name + ": " + r.status); return r.text(); });

  async function loadPlaces() {
    try { D.places = await (await fetch("places.json")).json(); } catch (_) { D.places = []; }
  }

  async function loadData() {
    const info = await load("feed_info"); // primero: el SW decide aquí si hay que renovar los datos
    S.feedVersion = C.feedVersion(info);
    const t = await Promise.all(FILES.map((f) => load(f).then(C.parseCSV)));
    const [, routes, stops, trips, stopTimes, shapes, calendar, exceptions] = t;
    D.routes = Object.fromEntries(routes.map((r) => [r.route_id, r]));
    D.stops = Object.fromEntries(stops.map((s) => [s.stop_id, { ...s, lat: +s.stop_lat, lon: +s.stop_lon }]));
    D.trips = Object.fromEntries(trips.map((x) => [x.trip_id, { ...x, times: [] }]));
    stopTimes.forEach((r) => D.trips[r.trip_id] && D.trips[r.trip_id].times.push(
      { stop: r.stop_id, seq: +r.stop_sequence, arr: C.toSec(r.arrival_time), dep: C.toSec(r.departure_time) }));
    Object.values(D.trips).forEach((x) => x.times.sort((a, b) => a.seq - b.seq));
    D.shapes = {};
    shapes.forEach((r) => (D.shapes[r.shape_id] = D.shapes[r.shape_id] || []).push({ seq: +r.shape_pt_sequence, lat: +r.shape_pt_lat, lon: +r.shape_pt_lon }));
    Object.values(D.shapes).forEach((s) => s.sort((a, b) => a.seq - b.seq));
    D.calendar = calendar;
    D.exceptions = exceptions;
  }

  const badge = (rid) => { const r = D.routes[rid]; return `<span class="badge" style="background:#${r.route_color}">${esc(r.route_short_name)}</span>`; };
  const color = (rid) => "#" + D.routes[rid].route_color;
  const fmtDist = (m) => (m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1) + " km");

  // ---------- Cálculo ----------
  function compute() {
    S.options = []; S.sel = 0; S.tomorrow = false; S.noMore = false;
    if (!S.origin || !S.dest) return;
    const now = madridNow();
    const run = (date, nowSec) => {
      const on = C.activeServices(D.calendar, D.exceptions, date);
      const trips = Object.values(D.trips).filter((t) => on.has(t.service_id));
      return C.findOptions({ trips, stops: D.stops, origin: S.origin, dest: S.dest, nowSec });
    };
    S.options = run(now.date, now.sec);
    if (!S.options.length) {
      const tom = run(C.addDays(now.date, 1), 0);
      if (tom.length) { S.options = tom; S.tomorrow = true; }
    }
  }

  // ---------- Pintado ----------
  const pin = (c, t) => L.divIcon({ className: "", html: `<div class="pin" style="--c:${c}">${t}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

  function drawMap() {
    layer.clearLayers();
    const pts = [];
    if (S.origin) { L.marker([S.origin.lat, S.origin.lon], { icon: pin("#0083c1", "●") }).addTo(layer).bindTooltip(esc(S.originLabel || "Origen"), { permanent: true, direction: "top" }); pts.push([S.origin.lat, S.origin.lon]); }
    if (S.dest) { L.marker([S.dest.lat, S.dest.lon], { icon: pin("#e53935", "★") }).addTo(layer).bindTooltip(esc(S.destLabel || "Destino"), { permanent: true, direction: "top" }); pts.push([S.dest.lat, S.dest.lon]); }
    const o = S.options[S.sel];
    if (o) {
      const A = o.boardStop, B = o.alightStop, col = color(o.routeId);
      const line = C.sliceShape(D.shapes[o.shapeId] || [], A, B);
      if (line.length) L.polyline(line, { color: col, weight: 6, opacity: .9 }).addTo(layer);
      L.polyline([[S.origin.lat, S.origin.lon], [A.lat, A.lon]], { color: "#0083c1", weight: 4, dashArray: "2 8" }).addTo(layer);
      L.polyline([[B.lat, B.lon], [S.dest.lat, S.dest.lon]], { color: "#0083c1", weight: 4, dashArray: "2 8" }).addTo(layer);
      const d0 = o.departures[0];
      L.marker([A.lat, A.lon], { icon: pin(col, "🚏") }).addTo(layer).bindTooltip(`Sube · ${C.hhmm(d0.dep)}`, { permanent: true, direction: "right" });
      L.marker([B.lat, B.lon], { icon: pin(col, "🚏") }).addTo(layer).bindTooltip("Baja", { permanent: true, direction: "left" });
      pts.push([A.lat, A.lon], [B.lat, B.lon], ...line);
    }
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(.25));
    else if (pts.length === 1) map.setView(pts[0], 16);
  }

  function renderResults() {
    const el = $("results");
    let h = "";
    if (S.picks.length) {
      h += `<ul class="picks">${S.picks.map((p, i) => `<li data-i="${i}">${esc(p.name)}<small>${esc(p.display)}</small></li>`).join("")}</ul>`;
    }
    if (S.dest) {
      h += `<div class="dest"><b>${esc(S.destLabel)}</b>${S.destSub ? `<small>${esc(S.destSub)}</small>` : ""}</div>`;
      if (S.origin) h += `<a class="gmaps" target="_blank" rel="noopener" href="${esc(C.gmapsUrl(S.origin, S.dest))}"><img src="../images/google-maps.svg" alt="" width="18" height="26" />Ver en Google Maps</a>`;
    }
    if (S.dest && !S.origin) h += `<p class="note">Falta el origen: pulsa 📍 para usar tu ubicación o 🗺️ y toca el mapa.</p>`;
    if (S.dest && S.origin) {
      if (S.options.length) {
        h += `<div class="sec">${S.tomorrow ? "Mañana · " : ""}Opciones directas · ${S.options.length}</div>`;
        if (S.tomorrow) h += `<p class="note">Hoy ya no hay más servicio hacia ese destino; estas son las primeras salidas de mañana.</p>`;
        S.options.forEach((o, i) => {
          h += `<div class="card${i === S.sel ? " sel" : ""}" data-i="${i}" style="border-left-color:${color(o.routeId)}">
            <div class="top">${badge(o.routeId)}<span class="dir">${esc(o.headsign)}</span><span class="tot">${o.totalMin} min</span></div>
            <div class="legs">
              <div class="leg"><span class="ic">🚶</span><span>${o.walkToMin} min · ${fmtDist(o.walkToM)} hasta <b>${esc(o.boardStop.stop_name)}</b></span></div>
              <div class="leg"><span class="ic">🚌</span><span>${o.stops} ${o.stops === 1 ? "parada" : "paradas"} · ${o.rideMin} min</span></div>
              <div class="leg"><span class="ic">🚶</span><span>${o.walkFromMin} min · ${fmtDist(o.walkFromM)} desde <b>${esc(o.alightStop.stop_name)}</b></span></div>
            </div>
            <div class="hint">Próximas salidas · llegada al destino ${C.hhmm(o.arrive)}</div>
            <div class="deps">${o.departures.map((d, k) => `<div class="dep${k === 0 ? " next" : ""}"><b>${C.hhmm(d.dep)}</b>${S.tomorrow ? "mañana" : depIn(d.dep)}</div>`).join("")}</div>
          </div>`;
        });
      } else {
        const near = C.nearestStops(D.stops, S.dest.lat, S.dest.lon, 3);
        h += `<p class="note">ℹ️ <b>Ninguna línea conecta esos dos puntos.</b> Estas son las paradas más cercanas a tu destino.</p>
          <div class="sec">Paradas cercanas al destino</div>
          ${near.map((n) => `<div class="dest"><b>${esc(n.stop.stop_name)}</b><small>${fmtDist(n.dist)} · ${[...new Set(Object.values(D.trips).filter((t) => t.times.some((x) => x.stop === n.stop.stop_id)).map((t) => t.route_id))].map(badge).join(" ")}</small></div>`).join("")}`;
      }
    }
    el.innerHTML = h;
  }

  function depIn(sec) {
    const m = Math.round((sec - madridNow().sec) / 60);
    return m <= 0 ? "ahora" : m < 60 ? `en ${m} min` : `en ${Math.floor(m / 60)} h ${m % 60} min`;
  }

  function setStatus(msg, err) { const s = $("status"); s.textContent = msg || ""; s.className = err ? "err" : ""; }
  function refresh() { compute(); renderResults(); drawMap(); }

  // ---------- Origen / destino ----------
  function setOrigin(lat, lon, label) {
    S.origin = { lat, lon }; S.originLabel = label; $("origin-label").value = label;
    refresh();
  }
  function setDest(lat, lon, label, sub) {
    S.dest = { lat, lon }; S.destLabel = label; S.destSub = sub || ""; S.picks = [];
    $("q").value = label === "Punto en el mapa" ? "" : label;
    refresh();
  }
  const inAranda = (lat, lon) => lat > 41.62 && lat < 41.72 && lon > -3.76 && lon < -3.62;

  function useGeolocation() {
    if (!navigator.geolocation) return setStatus("Tu navegador no permite geolocalización. Toca 🗺️ y elige el origen en el mapa.", true);
    setStatus("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition((p) => {
      const { latitude: lat, longitude: lon } = p.coords;
      if (!inAranda(lat, lon)) { setStatus("Parece que no estás en Aranda de Duero. Elige el origen en el mapa con 🗺️.", true); return; }
      setStatus(""); setOrigin(lat, lon, "Mi ubicación");
    }, () => setStatus("No he podido obtener tu ubicación. Toca 🗺️ y elige el origen en el mapa.", true),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  let lastSearch = 0;
  async function search(q) {
    q = q.trim();
    if (!q) return;
    const wait = 1100 - (Date.now() - lastSearch); // política de uso de Nominatim: máx. 1 petición/s
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSearch = Date.now();
    setStatus("Buscando «" + q + "»…");
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=es&bounded=1&accept-language=es&addressdetails=0"
      + "&viewbox=" + VIEWBOX + "&q=" + encodeURIComponent(q);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const res = await r.json();
      if (!res.length) { setStatus("No he encontrado «" + q + "» en Aranda de Duero. Prueba con otro nombre o toca el mapa.", true); S.picks = []; renderResults(); return; }
      setStatus("");
      if (res.length === 1) return pickResult(res[0]);
      S.picks = res.map((x) => ({ name: x.name || x.display_name.split(",")[0], display: x.display_name, lat: +x.lat, lon: +x.lon }));
      renderResults();
    } catch (e) {
      setStatus("No se ha podido hacer la búsqueda (¿sin conexión?). Puedes tocar el mapa para elegir destino.", true);
    }
  }
  function pickResult(x) {
    const name = x.name || x.display_name.split(",")[0];
    setStatus("");
    setDest(+x.lat, +x.lon, name, x.display_name);
  }

  // ---------- Sugerencias locales (sin red) ----------
  let sugg = [], act = -1;
  function suggestions(q) {
    const items = (D.places || []).map((p) => ({ ...p, kind: "lugar" }))
      .concat(Object.values(D.stops || {}).map((s) => ({ name: s.stop_name, lat: s.lat, lon: s.lon, kind: "parada" })));
    return C.suggest(items, q, 6);
  }
  function showSuggest() {
    const q = $("q").value;
    sugg = suggestions(q); act = -1;
    const ul = $("suggest");
    if (!q.trim() || q.trim().length < 2) { ul.hidden = true; $("q").setAttribute("aria-expanded", "false"); return; }
    ul.innerHTML = sugg.map((x, i) => `<li role="option" data-i="${i}"><span class="k">${x.kind === "parada" ? "🚏" : CAT_ICON[x.cat] || "📍"}</span><span>${esc(x.name)}</span></li>`).join("")
      + `<li role="option" class="osm" data-osm="1"><span class="k">🔎</span><span>Buscar «${esc(q.trim())}» en OpenStreetMap</span></li>`;
    ul.hidden = false; $("q").setAttribute("aria-expanded", "true");
  }
  function hideSuggest() { $("suggest").hidden = true; $("q").setAttribute("aria-expanded", "false"); act = -1; }
  function chooseSuggestion(i) {
    const x = sugg[i]; if (!x) return;
    hideSuggest(); S.picks = []; setStatus("");
    setDest(x.lat, x.lon, x.name, x.kind === "parada" ? "Parada de autobús" : "Aranda de Duero");
  }
  function highlight() {
    [...$("suggest").children].forEach((li, k) => li.classList.toggle("act", k === act));
  }

  // ---------- Init ----------
  function initMap() {
    map = L.map("map").setView(CENTER, 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on("click", (e) => {
      const { lat, lng } = e.latlng;
      if (S.pick === "origin") { S.pick = null; $("hint").textContent = ""; setOrigin(lat, lng, "Punto en el mapa"); }
      else setDest(lat, lng, "Punto en el mapa");
    });
  }

  function wire() {
    const burger = $("burger"), menu = $("menu");
    burger.addEventListener("click", () => { const o = menu.classList.toggle("open"); burger.setAttribute("aria-expanded", o); });
    document.addEventListener("click", (e) => { if (!e.target.closest("#menu, #burger")) { menu.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); } });
    $("form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (act >= 0 && act < sugg.length) return chooseSuggestion(act);
      hideSuggest(); search($("q").value);
    });
    $("q").addEventListener("input", showSuggest);
    $("q").addEventListener("focus", showSuggest);
    $("q").addEventListener("keydown", (e) => {
      const n = $("suggest").children.length;
      if (e.key === "ArrowDown" && n) { e.preventDefault(); act = (act + 1) % n; highlight(); }
      else if (e.key === "ArrowUp" && n) { e.preventDefault(); act = (act - 1 + n) % n; highlight(); }
      else if (e.key === "Escape") hideSuggest();
    });
    $("suggest").addEventListener("mousedown", (e) => e.preventDefault()); // no perder el foco antes del click
    $("suggest").addEventListener("click", (e) => {
      const li = e.target.closest("li"); if (!li) return;
      if (li.dataset.osm) { hideSuggest(); search($("q").value); } else chooseSuggestion(+li.dataset.i);
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".dest-field")) hideSuggest(); });
    $("btn-geo").addEventListener("click", useGeolocation);
    $("btn-pick-origin").addEventListener("click", () => { S.pick = "origin"; $("hint").textContent = "Toca el mapa para elegir el origen."; });
    $("chips").innerHTML = PLACES.map((p, i) => `<button type="button" class="chip" data-i="${i}">${esc(p.label)}</button>`).join("");
    $("chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      $("q").value = PLACES[+b.dataset.i].q;
      sugg = suggestions($("q").value);
      if (sugg.length === 1) chooseSuggestion(0); else { $("q").focus(); showSuggest(); }
    });
    $("results").addEventListener("click", (e) => {
      const li = e.target.closest(".picks li");
      if (li) return pickResult({ ...S.picks[+li.dataset.i], display_name: S.picks[+li.dataset.i].display, name: S.picks[+li.dataset.i].name });
      const card = e.target.closest(".card");
      if (card) { S.sel = +card.dataset.i; renderResults(); drawMap(); }
    });
  }

  async function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      // primera visita: los datos ya cargados pasan ahora por el SW para quedar cacheados
      FILES.concat("feed_info").forEach((f) => fetch("../" + f + ".txt").catch(() => {}));
    } catch (_) { /* sin SW funciona igual, sin caché propia */ }
  }

  async function init() {
    initMap(); wire();
    registerSW();
    try {
      await Promise.all([loadData(), loadPlaces()]);
      $("legend").textContent = `Datos GTFS v${S.feedVersion} · guardados en este dispositivo · Mapa © OpenStreetMap · Búsqueda Nominatim`;
      setStatus("");
      useGeolocation();
    } catch (e) {
      setStatus("No se han podido cargar los horarios. Revisa tu conexión e inténtalo de nuevo.", true);
    }
  }
  init();
})();
