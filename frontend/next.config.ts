import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";
import { fileURLToPath } from "url";

const isProd = process.env.NODE_ENV === "production";

/** Evita Turbopack usar a raiz do monorepo (package-lock da raiz) e falhar ao resolver tailwindcss. */
const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

/** Alinhar com deploy/nginx-alleone-csp-html.snippet.conf */
const htmlContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=15552000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: htmlContentSecurityPolicy },
];

const apiRewriteBase =
  process.env.API_INTERNAL_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:3002";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    qualities: [75, 100],
  },
  // Monorepo: há package-lock na raiz (husky) e em frontend/ — força o root do app.
  turbopack: {
    root: frontendRoot,
  },
  async rewrites() {
    /** Rotas de UI em app/tickets/* — não reescrever para a API (evita tela branca com JSON). */
    const ticketNumberApiRewrites = [
      {
        source: "/tickets/:ticketNumber(\\d+)/catalogs/:path*",
        destination: `${apiRewriteBase}/tickets/:ticketNumber/catalogs/:path*`,
      },
      {
        source: "/tickets/:ticketNumber(\\d+)/warnings/:path*",
        destination: `${apiRewriteBase}/tickets/:ticketNumber/warnings/:path*`,
      },
      {
        source: "/tickets/:ticketNumber(\\d+)/stages",
        destination: `${apiRewriteBase}/tickets/:ticketNumber/stages`,
      },
      {
        source: "/tickets/:ticketNumber(\\d+)/stage",
        destination: `${apiRewriteBase}/tickets/:ticketNumber/stage`,
      },
      {
        source: "/tickets/:ticketNumber(\\d+)/history",
        destination: `${apiRewriteBase}/tickets/:ticketNumber/history`,
      },
      {
        source: "/tickets/:ticketNumber(\\d+)/gmud",
        destination: `${apiRewriteBase}/tickets/:ticketNumber/gmud`,
      },
      {
        source: "/tickets/:ticketNumber(\\d+)/group",
        destination: `${apiRewriteBase}/tickets/:ticketNumber/group`,
      },
      {
        source: "/tickets/:ticketNumber(\\d+)/appointments/:path*",
        destination: `${apiRewriteBase}/tickets/:ticketNumber/appointments/:path*`,
      },
    ];

    const projetosApiRewrites = [
      {
        source: "/projetos/companies/:path*",
        destination: `${apiRewriteBase}/projetos/companies/:path*`,
      },
      {
        source: "/projetos/projects/:path*",
        destination: `${apiRewriteBase}/projetos/projects/:path*`,
      },
      {
        source: "/projetos/activities/:path*",
        destination: `${apiRewriteBase}/projetos/activities/:path*`,
      },
      {
        source: "/projetos/appointments/:path*",
        destination: `${apiRewriteBase}/projetos/appointments/:path*`,
      },
      {
        source: "/projetos/users/:path*",
        destination: `${apiRewriteBase}/projetos/users/:path*`,
      },
      {
        source: "/projetos/import-template",
        destination: `${apiRewriteBase}/projetos/import-template`,
      },
    ];

    const apiPrefixes = [
      "admin",
      "users",
      "permissions",
      "financial",
      "contracts",
      "reports",
      "gmuds",
      "zabbix",
      "tiflux",
      "rendimento",
      "inventario",
      "dashboard",
      "console",
      "companies",
      "mailbox",
      "usage-alerts",
      "health",
      "email-inbound",
      "pre-tickets",
    ];
    const ticketApiRewrites = [
      {
        source: "/tickets/catalogs/:path*",
        destination: `${apiRewriteBase}/tickets/catalogs/:path*`,
      },
      {
        source: "/tickets/list-presets/:path*",
        destination: `${apiRewriteBase}/tickets/list-presets/:path*`,
      },
      {
        source: "/tickets/attachments/:path*",
        destination: `${apiRewriteBase}/tickets/attachments/:path*`,
      },
      ...ticketNumberApiRewrites,
    ];
    return [
      ...ticketApiRewrites,
      ...projetosApiRewrites,
      ...apiPrefixes.flatMap((prefix) => [
        {
          source: `/${prefix}/:path*`,
          destination: `${apiRewriteBase}/${prefix}/:path*`,
        },
        {
          source: `/${prefix}`,
          destination: `${apiRewriteBase}/${prefix}`,
        },
      ]),
      // /auth/* é tratado por app/auth/[...path]/route.ts (preserva multi Set-Cookie).
      {
        source: "/auth/:path*",
        destination: `${apiRewriteBase}/auth/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/rendimento",
        destination: "/apontamentos",
        permanent: true,
      },
      // /rendimento/:uuid → /apontamentos/:uuid (só UUID; ver middleware.ts — não redireciona /rendimento/companies)
      {
        source: "/apontamentos/empresa/:companyId",
        destination: "/financeiro",
        permanent: true,
      },
    ];
  },
  async headers() {
    if (!isProd) {
      return [];
    }
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const sentryEnabled = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
    process.env.SENTRY_DSN?.trim(),
);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig;
