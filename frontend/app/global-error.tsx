"use client";

/**
 * Última linha de defesa: erro no próprio layout raiz.
 *
 * Aqui o layout da aplicação não montou, então este arquivo precisa trazer o
 * próprio <html>/<body> e não pode depender de nada do portal — nem dos
 * componentes de UI, nem do CSS global. Por isso os estilos vão inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1220",
          color: "#e5ecea",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element --
              next/image depende do runtime da aplicação, que é justamente o
              que falhou para esta tela aparecer. */}
          <img
            src="/logo-alle-branca.png"
            alt="Alle Tecnologia"
            width={150}
            style={{ height: "auto", marginBottom: 28 }}
          />
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            O portal não conseguiu carregar
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "#97a6a3",
              margin: "0 0 24px",
            }}
          >
            Tente novamente. Se continuar assim, avise a equipe de TI informando
            o código abaixo.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              appearance: "none",
              border: 0,
              borderRadius: 6,
              background: "#12b5d9",
              color: "#07222b",
              fontSize: 14,
              fontWeight: 600,
              padding: "10px 20px",
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
          {error.digest ? (
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                fontSize: 11,
                color: "#6b7a78",
                marginTop: 24,
              }}
            >
              Código: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
