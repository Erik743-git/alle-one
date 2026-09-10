import { describe, expect, it } from "vitest";

import {
  removerImagensVazias,
  reescreverImagensDeEmail,
  type InlineImageAttachment,
} from "@/lib/email-inline-images";

const anexo = (
  fileId: string,
  originalName: string,
  dados = "AAAA",
): InlineImageAttachment => ({
  fileId,
  originalName,
  mimeType: "image/png",
  previewDataUrl: `data:image/png;base64,${dados}`,
});

const S3 =
  "https://uploads-tiflux.s3.sa-east-1.amazonaws.com/production/service_desk/ticket_files";

describe("reescreverImagensDeEmail", () => {
  it("troca imagem do TiFlux pelo anexo local casando pelo nome", () => {
    const html = `<p>oi</p><img src="${S3}/archive.png" alt="archive">`;
    const { html: saida, naoResolvidas } = reescreverImagensDeEmail(html, [
      anexo("f1", "outra.png", "XXXX"),
      anexo("f2", "archive.png", "YYYY"),
    ]);
    expect(saida).toContain("data:image/png;base64,YYYY");
    expect(saida).not.toContain("amazonaws.com");
    expect(naoResolvidas).toBe(0);
  });

  it("aceita src sem aspas e com aspas simples", () => {
    const semAspas = `<img src=${S3}/archive.png >`;
    const simples = `<img src='${S3}/archive.png'>`;
    for (const html of [semAspas, simples]) {
      const { html: saida } = reescreverImagensDeEmail(html, [
        anexo("f1", "archive.png", "ZZZZ"),
      ]);
      expect(saida).toContain("data:image/png;base64,ZZZZ");
      expect(saida).not.toContain("amazonaws.com");
    }
  });

  it("usa ordem de aparicao quando o nome se repete", () => {
    // O TiFlux chama varios anexos de "archive.png"; casar pelo nome ai
    // mostraria a imagem errada, entao vale a ordem.
    const html = `<img src="${S3}/archive.png"><img src="${S3}/archive.png">`;
    const { html: saida } = reescreverImagensDeEmail(html, [
      anexo("f1", "archive.png", "PRIMEIRA"),
      anexo("f2", "archive.png", "SEGUNDA"),
    ]);
    const posPrimeira = saida.indexOf("PRIMEIRA");
    const posSegunda = saida.indexOf("SEGUNDA");
    expect(posPrimeira).toBeGreaterThanOrEqual(0);
    expect(posSegunda).toBeGreaterThan(posPrimeira);
  });

  it("remove rastreador e avatar de terceiro", () => {
    const html =
      '<img src="https://voctotvs.qualtrics.com/CP/Graphic.php?IM=IM_4I5"><img src="https://totvssuporte.zendesk.com/images/2016/default-avatar-80.png">';
    const { html: saida, removidas } = reescreverImagensDeEmail(html, []);
    expect(removidas).toBe(2);
    expect(saida).not.toContain("qualtrics.com");
    expect(saida).not.toContain("zendesk.com");
    expect(removerImagensVazias(saida)).not.toContain("<img");
  });

  it("nao mexe em data URL nem em caminho do proprio portal", () => {
    const html =
      '<img src="data:image/png;base64,JA"><img src="/uploads/x.png">';
    const { html: saida, removidas } = reescreverImagensDeEmail(html, []);
    expect(saida).toBe(html);
    expect(removidas).toBe(0);
  });

  it("conta como nao resolvida a imagem do TiFlux sem anexo correspondente", () => {
    const html = `<img src="${S3}/archive.png">`;
    const { html: saida, naoResolvidas } = reescreverImagensDeEmail(html, []);
    expect(naoResolvidas).toBe(1);
    // Sem anexo para colocar no lugar, a URL original fica — some-la deixaria
    // o corpo do e-mail sem nenhum sinal de que havia uma imagem ali.
    expect(saida).toContain("amazonaws.com");
  });

  it("ignora anexo que nao e imagem", () => {
    const html = `<img src="${S3}/archive.png">`;
    const { html: saida, naoResolvidas } = reescreverImagensDeEmail(html, [
      {
        fileId: "f1",
        originalName: "archive.png",
        mimeType: "application/pdf",
        previewDataUrl: "data:application/pdf;base64,PDF",
      },
    ]);
    expect(saida).not.toContain("base64,PDF");
    expect(naoResolvidas).toBe(1);
  });
});
