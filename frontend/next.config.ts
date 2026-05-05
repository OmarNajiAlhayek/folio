import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { dirname } from "path";
import { fileURLToPath } from "url";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: projectRoot,
  },
  async redirects() {
    return [
      {
        source: "/:locale/submissions/compose/create",
        destination: "/:locale/submissions/constructor/new",
        permanent: true,
      },
      {
        source: "/:locale/submissions/:slug/compose",
        destination: "/:locale/submissions/:slug/constructor",
        permanent: true,
      },
      {
        source: "/:locale/submissions/constructor/create",
        destination: "/:locale/submissions/constructor/new",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
