import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { dirname } from "path";
import { fileURLToPath } from "url";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const projectRoot = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    const target =
      process.env.API_PROXY_TARGET ?? "http://127.0.0.1:5243";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${target}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";
    const csp = [
      "default-src 'self'",
      scriptSrc,
      "connect-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Legacy "new" path → current create flow.
      {
        source: "/:locale/submissions/constructor/new",
        destination: "/:locale/submissions/compose/create",
        permanent: true,
      },
      // Legacy "constructor/create" → renamed segment.
      {
        source: "/:locale/submissions/constructor/create",
        destination: "/:locale/submissions/compose/create",
        permanent: true,
      },
      // Legacy per-slug path.
      {
        source: "/:locale/submissions/:slug/constructor",
        destination: "/:locale/submissions/:slug/compose",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
