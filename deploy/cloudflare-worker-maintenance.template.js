/**
 * Worker de indisponibilidade do Portal Alle One.
 *
 * POR QUE EXISTE
 * Quando o portal cai, quem responde ao usuário é o Cloudflare, com a página
 * "Bad gateway / Error code 502" dele. Custom Error Pages resolveria isso, mas
 * exige plano Pro — o domínio está no Free. Um Worker faz o mesmo e está
 * incluído no Free.
 *
 * COMO SE COMPORTA
 * Todo request passa direto para a origem. Só quando a origem devolve 502/503/
 * 504, ou quando nem responde, é que a página de manutenção aparece.
 *
 * À PROVA DE FALHA
 * Este Worker fica na frente de TODO o tráfego do portal. Se qualquer coisa
 * aqui der errado, o catch externo devolve a resposta da origem assim mesmo —
 * o pior caso é o usuário voltar a ver a página do Cloudflare, nunca o site
 * sair do ar por culpa do Worker.
 *
 * O logo vai embutido em base64 de propósito: quando esta página aparece, não
 * há servidor de onde buscar imagem.
 *
 * NÃO EDITE ESTE ARQUIVO PARA COLAR NO CLOUDFLARE — ele é o template.
 * Use `cloudflare-worker-maintenance.js`, gerado com o logo já embutido.
 */

const LOGO_DATA_URI = "data:image/png;base64,__LOGO_BASE64__";

function maintenanceHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Portal Alle One — indisponível no momento</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
background:#0b1220;background-image:radial-gradient(ellipse 100% 60% at 50% -15%,rgba(18,181,217,.11),transparent 50%);
color:#e5ecea;font-family:'Nunito',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6}
.card{width:100%;max-width:460px;text-align:center}
.logo{width:150px;height:auto;margin-bottom:32px}
h1{margin:0 0 10px;font-size:21px;font-weight:600;letter-spacing:-.01em}
p{margin:0 0 8px;font-size:14.5px;color:#97a6a3}
.bar{margin:28px auto 0;width:180px;height:3px;border-radius:999px;background:rgba(229,236,234,.12);overflow:hidden}
.bar span{display:block;width:33%;height:100%;border-radius:999px;background:#12b5d9;animation:sweep 1.2s ease-in-out infinite}
@keyframes sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
@media (prefers-reduced-motion:reduce){.bar span{animation:none;width:100%;opacity:.5}}
.hint{margin-top:28px;font-size:12.5px;color:rgba(151,166,163,.75)}
</style>
</head>
<body>
<main class="card">
<img class="logo" src="${LOGO_DATA_URI}" alt="Alle Tecnologia">
<h1>O portal está fora do ar no momento</h1>
<p>Estamos trabalhando para restabelecer o acesso. Esta página se atualiza sozinha a cada 30 segundos.</p>
<div class="bar" role="status" aria-label="Aguardando o portal voltar"><span></span></div>
<p class="hint">Se for urgente, acione a equipe de TI pelos canais de sempre.</p>
</main>
<script>setTimeout(function(){location.reload()},30000)</script>
</body>
</html>`;
}

function maintenanceResponse() {
  return new Response(maintenanceHtml(), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Nunca cachear: precisa sumir assim que o portal voltar.
      "cache-control": "no-store, no-cache, must-revalidate",
      // Diz a buscadores e clientes que é temporário.
      "retry-after": "30",
    },
  });
}

const ORIGIN_DOWN = new Set([502, 503, 504]);

export default {
  async fetch(request) {
    try {
      const response = await fetch(request);

      if (!ORIGIN_DOWN.has(response.status)) {
        return response;
      }

      // Chamadas de API devem continuar recebendo o erro real: quem trata é o
      // frontend, e devolver HTML aqui quebraria o parse do JSON.
      const path = new URL(request.url).pathname;
      if (path.startsWith("/api/") || path.startsWith("/auth/")) {
        return response;
      }

      return maintenanceResponse();
    } catch (err) {
      // A origem não respondeu (conexão recusada, timeout).
      try {
        const path = new URL(request.url).pathname;
        if (path.startsWith("/api/") || path.startsWith("/auth/")) {
          throw err;
        }
        return maintenanceResponse();
      } catch {
        // Último recurso: deixa o Cloudflare tratar como antes do Worker.
        throw err;
      }
    }
  },
};
