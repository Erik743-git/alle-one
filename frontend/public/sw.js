/*
 * PWA do Alle One.
 *
 * O portal continua exigindo rede — nada de dado do sistema é cacheado, para
 * ninguém trabalhar em cima de informação velha de chamado ou apontamento.
 *
 * A única exceção é a tela de "sem conexão": ela fica guardada na instalação
 * para poder aparecer justamente quando não há rede. Sem isso, o usuário do
 * app instalado via a tela de erro do navegador, que parece o portal quebrado.
 */

const CACHE = "alleone-offline-v1";
const OFFLINE_PAGE = "/offline.html";
// O logo entra junto: a página de offline não teria como buscá-lo depois.
const PRECACHE = [OFFLINE_PAGE, "/logo-alle-branca.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Falha ao pré-cachear não pode impedir a instalação: o pior caso é
      // voltar ao comportamento antigo (tela do navegador).
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // Só navegação cai na tela de offline. Requisição de API ou de arquivo
  // precisa falhar de verdade, para o portal tratar o erro como já trata.
  const ehNavegacao =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (!ehNavegacao) {
    // O logo é servido do cache quando a rede falhar (a tela de offline
    // depende dele).
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(
    fetch(request).catch(() =>
      caches
        .match(OFFLINE_PAGE)
        .then(
          (resposta) =>
            resposta ||
            new Response("Sem conexão.", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            }),
        ),
    ),
  );
});
