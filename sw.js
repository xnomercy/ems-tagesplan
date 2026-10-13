// Hält die App-Dateien offline bereit. Daten kommen immer frisch von Supabase.
const CACHE = "tagesplan-v25";
const SHELL = ["./", "index.html", "style.css", "app.js", "parser.js", "parser-tr.js", "i18n.js", "intents.js", "training.js", "figures.js", "analyse.js", "einkauf.js", "version.json", "manifest.webmanifest", "icon-192.png", "ems-logo.png", "ems-mark.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Erst Netz, bei Funkloch der Cache
  // no-cache: immer beim Server nachfragen, ob es eine neuere Datei gibt
  e.respondWith(fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request)));
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
