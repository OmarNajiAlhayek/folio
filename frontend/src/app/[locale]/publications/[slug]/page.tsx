"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { publicJson } from "@/lib/public-api";
import { getApiBase } from "@/lib/api";
import { PAGE_SHELL_NARROW } from "@/lib/page-shell";

type Detail = {
  id: string;
  slug: string | null;
  title: string;
  titleAr?: string | null;
  abstract: string;
  abstractAr?: string | null;
  publishedAt: string | null;
  author?: { displayName: string; email: string };
  files: { id: string; originalName: string; mimeType: string }[];
};

function formatDate(iso: string | null, locale: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

export default function PublicationDetailPage() {
  const t = useTranslations("PublicationDetail");
  const tWf = useTranslations("SubmissionWorkflow");
  const locale = useLocale();
  const params = useParams();
  const routeSlug = params.slug as string;
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicJson<Detail>(`/public/submissions/${encodeURIComponent(routeSlug)}`)
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : t("notFound")),
      );
  }, [routeSlug, t]);

  if (error || !data) {
    return (
      <main className={PAGE_SHELL_NARROW}>
        <Link href="/publications" className="text-sm text-accent hover:underline">
          {t("back")}
        </Link>
        <p className="mt-8 text-ink/70">{error ?? t("loading")}</p>
      </main>
    );
  }

  return (
    <main className={PAGE_SHELL_NARROW}>
      <Link href="/publications" className="text-sm text-accent hover:underline">
        {t("back")}
      </Link>
      <h1 className="mt-6 font-serif text-3xl font-semibold text-ink">
        {data.title}
      </h1>
      {data.titleAr?.trim() ? (
        <p
          dir="rtl"
          className="mt-3 font-serif text-2xl font-semibold leading-snug text-ink/90"
        >
          {data.titleAr}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-ink/70">
        {data.author?.displayName}
        {data.publishedAt && ` · ${formatDate(data.publishedAt, locale)}`}
      </p>
      <section className="mt-8 space-y-8 text-sm text-ink/85">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {tWf("abstractLabelEn")}
          </h2>
          <p dir="ltr" className="mt-3 whitespace-pre-wrap">
            {data.abstract}
          </p>
        </div>
        {data.abstractAr?.trim() ? (
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {tWf("abstractLabelAr")}
            </h2>
            <p dir="rtl" className="mt-3 whitespace-pre-wrap">
              {data.abstractAr}
            </p>
          </div>
        ) : null}
      </section>
      {data.files?.length > 0 && (
        <section className="mt-10">
          <h2 className="font-medium text-ink">{t("files")}</h2>
          <ul className="mt-2 text-sm">
            {data.files.map((f) => (
              <li key={f.id}>
                <a
                  className="text-accent hover:underline"
                  href={`${getApiBase()}/api/v1/public/submissions/${encodeURIComponent(data.slug ?? routeSlug)}/files/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {f.originalName}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
