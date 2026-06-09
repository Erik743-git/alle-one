import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/rendimento",
        destination: "/apontamentos",
        permanent: true,
      },
      // Só páginas de colaborador (UUID). Não redirecionar /rendimento/companies/* (API).
      {
        source:
          "/rendimento/:userId(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}))",
        destination: "/apontamentos/:userId",
        permanent: true,
      },
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

export default nextConfig;
