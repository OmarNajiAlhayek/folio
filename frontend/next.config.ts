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
