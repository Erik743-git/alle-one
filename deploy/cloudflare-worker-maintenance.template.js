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

/**
 * Contato mostrado quando o portal está fora.
 *
 * O E164 é só dígitos (país + DDD + número), que é o formato que o wa.me exige.
 * ATENÇÃO ao alterar: número errado aqui manda o usuário para a conversa de um
 * desconhecido, numa página que aparece justamente quando ninguém consegue
 * confirmar nada pelo portal.
 */
const ALINA_WHATSAPP_E164 = "554784091204";
const ALINA_WHATSAPP_LABEL = "+55 47 8409-1204";

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
/* max-width segura a logo em celular estreito: o cartao tem 460px, mas a
   tela pode ter menos que os 300px da logo. */
.logo{width:300px;max-width:100%;height:auto;margin-bottom:32px}
h1{margin:0 0 10px;font-size:21px;font-weight:600;letter-spacing:-.01em}
p{margin:0 0 8px;font-size:14.5px;color:#97a6a3}
.bar{margin:28px auto 0;width:180px;height:3px;border-radius:999px;background:rgba(229,236,234,.12);overflow:hidden}
.bar span{display:block;width:33%;height:100%;border-radius:999px;background:#12b5d9;animation:sweep 1.2s ease-in-out infinite}
@keyframes sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
@media (prefers-reduced-motion:reduce){.bar span{animation:none;width:100%;opacity:.5}}
.hint{margin-top:28px;margin-bottom:12px;font-size:12.5px;color:rgba(151,166,163,.75)}
.hint strong{color:#e5ecea;font-weight:600}
.zap{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;
border:1px solid rgba(37,211,102,.45);background:rgba(37,211,102,.1);color:#25d366;
font-size:13.5px;font-weight:600;text-decoration:none}
.zap:hover{background:rgba(37,211,102,.18);border-color:rgba(37,211,102,.7)}
.zap:focus-visible{outline:2px solid #25d366;outline-offset:2px}
</style>
</head>
<body>
<main class="card">
<img class="logo" src="${LOGO_DATA_URI}" alt="Alle Tecnologia">
<h1>O portal está fora do ar no momento</h1>
<p>Estamos trabalhando para restabelecer o acesso. Esta página se atualiza sozinha a cada 30 segundos.</p>
<div class="bar" role="status" aria-label="Aguardando o portal voltar"><span></span></div>
<p class="hint">Caso necessário, entre em contato com <strong>Alina</strong>:</p>
<a class="zap" href="https://wa.me/${ALINA_WHATSAPP_E164}" target="_blank" rel="noopener noreferrer">
<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.470 1.5 1.07 2.95 1.22 3.15.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35Z"/><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.24 8.22Z"/></svg>
<span>${ALINA_WHATSAPP_LABEL}</span>
</a>
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

/**
 * 502/503/504 vêm do Nginx quando a aplicação caiu mas o servidor responde.
 * A faixa 52x é gerada pelo próprio Cloudflare quando nem o servidor responde
 * — 521 (web server is down), 522 (timeout na conexão), 523 (origem
 * inalcançável), 525/526 (handshake TLS). Sem elas, uma queda da VM inteira
 * ou do Nginx voltaria a mostrar a página do Cloudflare.
 */
const ORIGIN_DOWN = new Set([502, 503, 504, 521, 522, 523, 525, 526]);

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
