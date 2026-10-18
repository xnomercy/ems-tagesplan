// Hält die App-Dateien offline bereit. Daten kommen immer frisch von Supabase.
const CACHE = "tagesplan-v33";
const SHELL = ["./", "index.html", "style.css", "app.js", "parser.js", "parser-tr.js", "i18n.js", "intents.js", "training.js", "figures.js", "analyse.js", "einkauf.js", "offline.js", "daylog.js", "halal-scan.js", "glaube.js", "wellness.js", "fristen.js", "rueckblick.js", "dokument.js", "zikir.js", "koran.js", "version.json", "manifest.webmanifest", "icon-192.png", "ems-logo.png", "ems-mark.png"];

// Koran-Text und Schriften ändern sich nie (neue Fassung = neuer Dateiname): einmal laden, über Versionen hinweg behalten
const KORAN = ["koran/quran-1.json", "fonts/amiri-quran.woff2", "fonts/scheherazade-new.woff2"];
const KORAN_CACHE = "tagesplan-koran-ext";
const koranCache = () => caches.open(KORAN_CACHE).then((c) => Promise.all(KORAN.map((u) => c.match(u).then((hit) => hit ?? c.add(u))))).catch(() => {});

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(koranCache).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.endsWith("-ext")).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Bibliotheken und Schrift von außen: feste Versionen, einmal geladen reicht (auch offline)
  if (/^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) {
    e.respondWith(caches.open("tagesplan-ext").then((c) => c.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => { if (res.ok || res.type === "opaque") c.put(e.request, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  if (KORAN.some((k) => url.pathname.endsWith("/" + k))) {
    e.respondWith(caches.open(KORAN_CACHE).then((c) => c.match(e.request, { ignoreSearch: true }).then((hit) => hit ?? fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
    return;
  }
  // Erst Netz, bei Funkloch der Cache
  // no-cache: immer beim Server nachfragen, ob es eine neuere Datei gibt
  // Nur gute Antworten speichern (kein 404 während eines Deploys) und keine Adressen mit ?t=… (sonst wächst der Cache endlos)
  e.respondWith(fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then((res) => {
    if (res.ok && !url.search) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// Push-Mitteilungen vom Server
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: "Tagesplan", body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Tagesplan", {
    body: d.body || "",
    tag: d.tag,
    renotify: true,
    requireInteraction: !!d.high,
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow(e.notification.data?.url || "./");
  }));
});
