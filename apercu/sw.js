// Service worker Bamboozled — rend le jeu jouable hors ligne.
// Stratégie :
//  - page et fichiers du site : réseau d'abord (les mises à jour arrivent
//    dès qu'il y a du réseau), copie en cache utilisée hors ligne ;
//  - polices Google : cache d'abord (elles ne changent jamais) ;
//  - tout le reste (proxy IA workers.dev, api.anthropic.com) : jamais
//    intercepté, jamais mis en cache.
// Changer CACHE_VERSION force le nettoyage des anciens caches.

const CACHE_VERSION = "bamboozled-v1";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = (await cache.match(request, { ignoreSearch: true }))
      || (request.mode === "navigate" ? await cache.match("./index.html") : undefined);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
  // Autres origines (IA) : pas de respondWith → comportement réseau normal.
});
