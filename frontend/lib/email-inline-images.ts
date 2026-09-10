/**
 * Reescrita das imagens de HTML de e-mail antes de renderizar no iframe.
 *
 * Descrição de chamado que veio do TiFlux traz `<img>` apontando para
 * `uploads-tiflux.s3.*.amazonaws.com/.../ticket_files/...`. Esse bucket não
 * serve URL pública — o TiFlux entrega por link assinado, que expira — então a
 * imagem sempre aparece quebrada, mesmo o arquivo já estando importado no
 * portal como anexo do chamado. Aqui a URL é trocada pelo anexo local.
 *
 * O que não é anexo do chamado (avatar de helpdesk, pixel de rastreamento de
 * pesquisa de satisfação) é removido de propósito: o iframe é sandbox e não
 * deve buscar recurso de terceiro, tanto por privacidade quanto para não
 * exibir um ícone quebrado no lugar de algo que nunca foi conteúdo útil.
 */

export type InlineImageAttachment = {
  fileId: string;
  originalName: string;
  mimeType: string;
  previewDataUrl?: string | null;
};

/** Hosts de anexo do TiFlux — imagem que existe como anexo do chamado. */
const TIFLUX_UPLOAD_HOST = /uploads-tiflux\.s3\.[a-z0-9-]+\.amazonaws\.com/i;

/**
 * `src` aceita aspas duplas, simples ou nenhuma — o HTML que chega do TiFlux
 * usa as três formas, então a captura precisa cobrir todas.
 */
const IMG_SRC = /(<img\b[^>]*?\bsrc\s*=\s*)("([^"]*)"|'([^']*)'|([^\s">]+))/gi;

function nomeDoArquivoNaUrl(url: string): string | null {
  try {
    const semQuery = url.split(/[?#]/)[0];
    const ultimo = semQuery.split("/").pop();
    if (!ultimo) return null;
    return decodeURIComponent(ultimo).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase();
}

export type ReescritaImagens = {
  html: string;
  /** Imagens que não puderam ser resolvidas para um anexo local. */
  naoResolvidas: number;
  /** Imagens de terceiro removidas (rastreadores, avatares). */
  removidas: number;
};

export function reescreverImagensDeEmail(
  html: string,
  attachments: InlineImageAttachment[],
): ReescritaImagens {
  const imagens = attachments.filter(
    (a) => a.mimeType.startsWith("image/") && a.previewDataUrl,
  );

  // Índice por nome. Nome repetido vira ambíguo e sai do índice: o TiFlux
  // costuma chamar vários arquivos de "archive.png", e casar pelo nome nesse
  // caso mostraria a imagem errada — pior do que não mostrar.
  const porNome = new Map<string, InlineImageAttachment>();
  const ambiguos = new Set<string>();
  for (const a of imagens) {
    const chave = normalizarNome(a.originalName);
    if (porNome.has(chave)) ambiguos.add(chave);
    porNome.set(chave, a);
  }
  for (const chave of ambiguos) porNome.delete(chave);

  const usados = new Set<string>();
  let naoResolvidas = 0;
  let removidas = 0;

  // Primeira passada: resolve o que casa por nome, para não gastar um anexo
  // do rodízio posicional com uma imagem que tem dono certo.
  const ocorrencias: Array<{ url: string; resolvido?: InlineImageAttachment }> = [];
  html.replace(IMG_SRC, (_todo, _antes, _bruto, aspasDuplas, aspasSimples, semAspas) => {
    const url = (aspasDuplas ?? aspasSimples ?? semAspas ?? "").trim();
    if (TIFLUX_UPLOAD_HOST.test(url)) {
      const nome = nomeDoArquivoNaUrl(url);
      const achado = nome ? porNome.get(nome) : undefined;
      if (achado) usados.add(achado.fileId);
      ocorrencias.push({ url, resolvido: achado });
    } else {
      ocorrencias.push({ url });
    }
    return "";
  });

  // Sobras entram na ordem em que aparecem, para o caso de nomes repetidos.
  const sobras = imagens.filter((a) => !usados.has(a.fileId));
  let proximaSobra = 0;
  let indice = -1;

  const resultado = html.replace(
    IMG_SRC,
    (todo, antes, _bruto, aspasDuplas, aspasSimples, semAspas) => {
      indice += 1;
      const url = (aspasDuplas ?? aspasSimples ?? semAspas ?? "").trim();

      // Data URL e caminho do próprio portal já funcionam — não mexer.
      if (/^data:/i.test(url) || url.startsWith("/")) return todo;

      if (TIFLUX_UPLOAD_HOST.test(url)) {
        const escolhido =
          ocorrencias[indice]?.resolvido ?? sobras[proximaSobra++];
        if (escolhido?.previewDataUrl) {
          return `${antes}"${escolhido.previewDataUrl}"`;
        }
        naoResolvidas += 1;
        return todo;
      }

      if (/^https?:/i.test(url)) {
        removidas += 1;
        return `${antes}""`;
      }

      return todo;
    },
  );

  return { html: resultado, naoResolvidas, removidas };
}

/** Remove `<img src="">` que sobrou da limpeza de imagem de terceiro. */
export function removerImagensVazias(html: string): string {
  return html.replace(/<img\b[^>]*\bsrc\s*=\s*(""|'')[^>]*>/gi, "");
}
