/* Service worker minimo — habilita "Instalar app" no Android/Chrome. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  /* Rede primeiro; sem cache offline nesta versao. */
});
