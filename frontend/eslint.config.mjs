import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Alerta nativo do navegador não entra no portal: ele mostra o domínio
    // ao usuário, trava a aba e ignora o tema do produto. Use o useConfirm
    // (@/lib/confirm) para confirmar e o notify (@/lib/notify) para avisar.
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "confirm",
          message:
            "Use useConfirm() de @/lib/confirm no lugar do confirm() do navegador.",
        },
        {
          name: "alert",
          message:
            "Use notifyError/notifySuccess de @/lib/notify no lugar do alert() do navegador.",
        },
        {
          name: "prompt",
          message:
            "Use um modal do portal no lugar do prompt() do navegador.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "window",
          property: "confirm",
          message: "Use useConfirm() de @/lib/confirm.",
        },
        {
          object: "window",
          property: "alert",
          message: "Use notifyError/notifySuccess de @/lib/notify.",
        },
        {
          object: "window",
          property: "prompt",
          message: "Use um modal do portal.",
        },
      ],
    },
  },
]);

export default eslintConfig;
