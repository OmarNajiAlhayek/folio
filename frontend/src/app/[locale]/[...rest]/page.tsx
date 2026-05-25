import { notFound } from "next/navigation";

/**
 * Unknown paths under /:locale/* (e.g. /en/does-not-exist) hit this segment so we
 * can render app/[locale]/not-found.tsx instead of the default Next.js 404.
 * @see https://next-intl.dev/docs/environments/error-files
 */
export default function CatchAllPage() {
  notFound();
}
