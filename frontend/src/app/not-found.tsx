import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { PAGE_SHELL_NARROW } from "@/lib/page-shell";

/** Fallback when no `[locale]` segment matches (invalid locale, etc.). */
export default async function RootNotFound() {
  const t = await getTranslations({
    locale: routing.defaultLocale,
    namespace: "NotFound",
  });

  return (
    <main className={PAGE_SHELL_NARROW}>
      <div className="rounded-2xl border border-ink/10 bg-surface/90 px-6 py-10 text-center shadow-sm sm:px-10">
        <p className="font-serif text-6xl font-semibold tracking-tight text-accent/80">
          404
        </p>
        <h1 className="mt-4 font-serif text-2xl font-semibold text-ink">
          {t("title")}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink/70">
          {t("description")}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            {t("backHome")}
          </Link>
          <Link
            href="/publications"
            className="inline-flex rounded-md border border-ink/15 bg-paper px-4 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
          >
            {t("browsePublications")}
          </Link>
        </div>
      </div>
    </main>
  );
}
