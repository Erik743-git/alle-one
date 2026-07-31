import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

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
];

const apiRewriteBase =
  process.env.API_INTERNAL_URL?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:3002";

const nextConfig: NextConfig = {
  async rewrites() {
    // /auth/* é tratado por app/auth/[...path]/route.ts (preserva multi Set-Cookie).
    // Mantém rewrite só como fallback se a rota não existir em builds antigos.
    return [
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
