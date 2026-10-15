// Caché de /app/: assets versionados + datos GTFS versionados por feed_version.
// Sube APP_VERSION al cambiar cualquier fichero de app/.
const APP_VERSION = "2026.10.15-7";
const STATIC = "aranda-app-static-" + APP_VERSION;
const DATA = "aranda-app-data";
importScripts("core.js");

const ASSETS = ["./", "index.html", "app.css", "app.js", "core.js", "places.json", "../images/ayuntamiento.png", "../images/google-maps.svg",
  "../fonts/outfit.css", "../fonts/outfit-latin.woff2",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"];
const DATA_FILES = /\/(agency|routes|stops|trips|stop_times|shapes|calendar|calendar_dates|feed_info)\.txt$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith("aranda-app-static-") && k !== STATIC).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function feedInfo(req) {
  const data = await caches.open(DATA);
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const text = await res.clone().text();
    const old = await data.match(req);
    const oldVersion = old ? self.AppCore.feedVersion(await old.text()) : null;
    if (self.AppCore.needsDataRefresh(oldVersion, self.AppCore.feedVersion(text))) {
      // datos nuevos: se vacía la caché de datos para que se vuelvan a pedir
      await Promise.all((await data.keys()).map((k) => data.delete(k)));
    }
    await data.put(req, res.clone());
    return res;
  } catch (_) {
    return (await data.match(req)) || Response.error(); // sin red: lo que haya cacheado
  }
}

async function dataFile(req) {
  const data = await caches.open(DATA);
  const hit = await data.match(req);
  if (hit) return hit;
  const res = await fetch(req, { cache: "reload" });
  if (res.ok) await data.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "tile.openstreetmap.org" || url.hostname.endsWith(".tile.openstreetmap.org") || url.hostname === "nominatim.openstreetmap.org") return;
  if (url.origin === location.origin && DATA_FILES.test(url.pathname)) {
    e.respondWith(/feed_info\.txt$/.test(url.pathname) ? feedInfo(req) : dataFile(req));
    return;
  }
  // assets: cache-first en la caché de la versión actual
  e.respondWith(caches.open(STATIC).then(async (c) => {
    const hit = await c.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") c.put(req, res.clone());
    return res;
  }));
});
