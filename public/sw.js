const CACHE = "applypilot-v52";
const ASSETS = ["./", "./index.html", "./styles.css?v=52", "./app.js?v=52", "./manifest.webmanifest", "./icon.svg", "./resume.cls", "./vendor/jspdf.umd.min.js?v=1", "./fonts/cmu-serif-500-roman.woff2", "./fonts/cmu-serif-700-roman.woff2", "./fonts/cmu-serif-500-italic.woff2", "./fonts/cmu-serif-700-italic.woff2", "./fonts/cmu-serif-500-roman.ttf", "./fonts/cmu-serif-700-roman.ttf", "./fonts/cmu-serif-500-italic.ttf", "./fonts/cmu-serif-700-italic.ttf"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put("./index.html", copy)); return response; }).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; })));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => windows[0] ? windows[0].focus() : clients.openWindow("./")));
});
