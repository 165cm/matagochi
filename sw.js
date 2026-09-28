const CACHE_NAME = "ripigochi-v100";
const APP_VERSION = "20260928-serv";
const CORE_ASSETS = [
  "./",
  "./index.html",
  `./styles.css?v=${APP_VERSION}`,
  `./dinner-persona.js?v=${APP_VERSION}`,
  ...["LLL","LLR","LRL","LRR","RLL","RLR","RRL","RRR"].map(code => `./assets/persona/${code}.webp`),
  ...["RKQ","RKS","RAQ","RAS","CKQ","CKS","CAQ","CAS"].map(code => `./assets/types/${code}.webp`),
  `./taste.js?v=${APP_VERSION}`,
  `./taste-ui.js?v=${APP_VERSION}`,
  ...Array.from({length:8}, (_,i) => `./assets/taste/${i+1}.webp`),
  ...["teriyaki","tomato-pasta","porkkimchi","kinoko-udon","tofu-egg","tomato-cheese"].map(n => `./assets/dishes/${n}.webp`),
  ...["03","04","07","08","09","10","11","12","14","15","16","17","18","19","20","21","22","23","24","25","26","27","29","30","31","32","33","34","35","36","37","38"].map(n => `./assets/dishes/starter-${n}.webp`),
  ...["rice","noodle","bread","okazu"].map(n => `./assets/dishes/fallback-${n}.webp`),
  `./starter-recipes.js?v=${APP_VERSION}`,
  `./skills.js?v=${APP_VERSION}`,
  `./aisles.js?v=${APP_VERSION}`,
  `./lifestyle.js?v=${APP_VERSION}`,
  `./daily-ui.js?v=${APP_VERSION}`,
  `./playlist-import.js?v=${APP_VERSION}`,
  `./household.js?v=${APP_VERSION}`,
  `./skill-quiz.js?v=${APP_VERSION}`,
  `./cook-level.js?v=${APP_VERSION}`,
  `./weekly.js?v=${APP_VERSION}`,
  `./cook-type.js?v=${APP_VERSION}`,
  `./plan-moves.js?v=${APP_VERSION}`,
  `./plus.js?v=${APP_VERSION}`,
  `./folders.js?v=${APP_VERSION}`,
  `./install.js?v=${APP_VERSION}`,
  `./push.js?v=${APP_VERSION}`,
  `./tickets.js?v=${APP_VERSION}`,
  `./account.js?v=${APP_VERSION}`,
  `./discover.js?v=${APP_VERSION}`,
  `./app.js?v=${APP_VERSION}`,
  `./image-import.js?v=${APP_VERSION}`,
  "./manifest.webmanifest?v=20260928-serv",
  "./icons/favicon-32.png?v=20260928-serv",
  "./icons/icon-192.png?v=20260928-serv",
  "./icons/icon-512.png?v=20260928-serv",
  "./icons/icon-maskable-512.png?v=20260928-serv",
  "./icons/apple-touch-icon.png?v=20260928-serv"
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
  // 動画は部分取得（Range）で読むので、ブラウザにまかせてキャッシュしない。
  if (request.destination === "video" || request.headers.has("range")) return;

  // アプリ以外のページ（LP・規約など）は、ブラウザにまかせる（アプリのシェルとして覚えない）。
  const base = new URL("./", self.location).pathname;
  if (request.mode === "navigate" && url.pathname !== base && url.pathname !== `${base}index.html`) return;
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

// 通知：届いたら表示し、押したらアプリの該当の画面を開く。
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "リピごち", body: event.data?.text() || "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "リピごち", {
    body: data.body || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/favicon-32.png",
    tag: data.tag || "ripigochi",
    data: { url: data.url || "" }
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(`./${event.notification.data?.url || ""}`, self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) return open.navigate(target).then((c) => (c || open).focus()).catch(() => open.focus());
    return self.clients.openWindow(target);
  }));
});
