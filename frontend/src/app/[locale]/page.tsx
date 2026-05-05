"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PAGE_SHELL } from "@/lib/page-shell";

export default function HomePage() {
  const t = useTranslations("Home");

  const features = [
    {
      title: t("featureSubmitTitle"),
      body: t("featureSubmitBody"),
    },
    {
      title: t("featureReviewTitle"),
      body: t("featureReviewBody"),
    },
    {
      title: t("featurePublicTitle"),
      body: t("featurePublicBody"),
    },
  ];

  return (
    <main className={`relative ${PAGE_SHELL}`}>
      <div
        className="pointer-events-none absolute inset-x-0 -top-8 h-48 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(196,92,62,0.14),transparent_65%)] sm:h-56"
        aria-hidden
      />

      <div className="relative grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-center md:gap-8">
        <div>
          <p className="font-serif text-xs font-semibold uppercase tracking-[0.2em] text-accent sm:text-sm">
            {t("badge")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl md:text-[3.25rem]">
            {t("title")}
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-ink/80 sm:text-lg">
            {t("intro")}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
            >
              {t("createAccount")}
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-accent-2/35 bg-surface/80 px-5 py-2.5 text-sm font-semibold text-accent-2 shadow-sm backdrop-blur-sm transition hover:bg-accent-2/10"
            >
              {t("logIn")}
            </Link>
            <Link
              href="/publications"
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              {t("browsePublications")}
            </Link>
          </div>
        </div>

        <aside className="group relative overflow-hidden rounded-2xl border border-accent-2/25 border-s-4 border-s-accent bg-linear-to-br from-surface/95 via-surface-muted/85 to-accent-2/[0.12] p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.08),0_28px_64px_-32px_rgba(15,23,42,0.28)] ring-1 ring-ink/[0.06] backdrop-blur-[10px] transition-[box-shadow,transform] duration-500 hover:shadow-[0_8px_32px_-8px_rgba(15,23,42,0.12),0_32px_72px_-36px_rgba(15,23,42,0.32)] dark:shadow-[0_4px_24px_-6px_rgba(0,0,0,0.35),0_28px_64px_-32px_rgba(0,0,0,0.55)] dark:ring-white/[0.06] dark:hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45),0_36px_80px_-40px_rgba(0,0,0,0.6)] sm:p-10">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55] mix-blend-soft-light dark:opacity-40"
            aria-hidden
          >
            <div className="absolute -start-1/4 -top-1/2 h-[120%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(196,92,62,0.22),transparent_72%)] dark:bg-[radial-gradient(closest-side,rgba(212,120,92,0.18),transparent_72%)]" />
            <div className="absolute -bottom-1/3 -end-1/4 h-[85%] w-[60%] rounded-full bg-[radial-gradient(closest-side,rgba(61,90,74,0.18),transparent_70%)] dark:bg-[radial-gradient(closest-side,rgba(106,155,130,0.14),transparent_70%)]" />
          </div>
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(255,252,247,0.45)_48%,transparent_56%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100 dark:bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.04)_48%,transparent_56%)]"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.55)_0%,transparent_42%)] dark:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04)_0%,transparent_38%)]" aria-hidden />
          <div className="absolute -end-8 -top-8 size-40 rounded-full bg-accent/18 blur-2xl transition-all duration-700 group-hover:bg-accent/22" />
          <div className="absolute -bottom-12 -start-12 size-44 rounded-full bg-accent-2/22 blur-2xl transition-all duration-700 group-hover:bg-accent-2/28" />
          <div className="relative space-y-6 font-serif text-ink/90">
            <div className="flex items-center gap-3" aria-hidden>
              <span className="size-2 shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_rgba(196,92,62,0.18)] dark:shadow-[0_0_0_4px_rgba(212,120,92,0.22)]" />
              <span className="size-2 shrink-0 rounded-full bg-accent-2 shadow-[0_0_0_4px_rgba(61,90,74,0.14)] dark:shadow-[0_0_0_4px_rgba(106,155,130,0.18)]" />
              <span className="h-px min-w-[2.5rem] flex-1 max-w-20 bg-linear-to-r from-accent-2/35 via-accent/30 to-transparent" />
            </div>
            <p className="text-2xl font-semibold leading-snug tracking-tight text-ink sm:text-[1.65rem] sm:leading-[1.35]">
              {t("heroAsideTitle")}
            </p>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[4.5rem] bg-linear-to-r from-accent via-accent-2/50 to-transparent" />
              <div className="size-1.5 shrink-0 rounded-full bg-accent-2/70 ring-2 ring-accent-2/25" />
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-ink/12 to-transparent dark:via-white/10" />
            </div>
            <p className="max-w-prose text-sm leading-relaxed text-ink/65">{t("heroAsideBody")}</p>
          </div>
        </aside>
      </div>

      <section
        className="relative mt-8 grid gap-3 sm:grid-cols-3"
        aria-label={t("badge")}
      >
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-ink/10 bg-surface/90 p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-[2px] transition hover:border-accent-2/25 hover:shadow-md sm:p-5"
          >
            <h2 className="font-serif text-lg font-semibold text-ink">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/70">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
