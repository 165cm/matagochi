const CACHE_NAME = "ripigochi-v12";
const APP_VERSION = "20260923-recipes";
const CORE_ASSETS = [
  "./",
  "./index.html",
  `./styles.css?v=${APP_VERSION}`,
  `./dinner-persona.js?v=${APP_VERSION}`,
  ...["LLL","LLR","LRL","LRR","RLL","RLR","RRL","RRR"].map(code => `./assets/persona/${code}.webp`),
  `./taste.js?v=${APP_VERSION}`,
  `./taste-ui.js?v=${APP_VERSION}`,
  ...Array.from({length:8}, (_,i) => `./assets/taste/${i+1}.webp`),
  `./starter-recipes.js?v=${APP_VERSION}`,
  `./lifestyle.js?v=${APP_VERSION}`,
  `./daily-ui.js?v=${APP_VERSION}`,
  `./app.js?v=${APP_VERSION}`,
  `./image-import.js?v=${APP_VERSION}`,
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) return;

  // 共有シート経由(?url=...)を含むページ遷移はネットワーク優先、オフライン時はキャッシュのシェルを返す
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./", copy));
          return response;
        })
        .catch(() => caches.match("./").then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
