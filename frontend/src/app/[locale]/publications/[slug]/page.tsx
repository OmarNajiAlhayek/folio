"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { ApiErrorState } from "@/components/api-error-state";
import { getApiErrorKind } from "@/lib/api-error-message";
import { getApiBase } from "@/lib/api";
import { publicJson } from "@/lib/public-api";
import { PAGE_SHELL_NARROW } from "@/lib/page-shell";
import { useApiErrorMessages } from "@/lib/use-api-error-messages";

type Detail = {
  id: string;
  slug: string | null;
  title: string;
  titleAr?: string | null;
  abstract: string;
  abstractAr?: string | null;
  publishedAt: string | null;
  author?: { displayName: string };
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
  const tApi = useTranslations("ApiErrors");
  const locale = useLocale();
  const { resolve: resolveApiError } = useApiErrorMessages();
  const params = useParams();
  const routeSlug = params.slug as string;
  const [data, setData] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorCause, setLoadErrorCause] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const loadDetail = useCallback(() => {
    setLoadError(null);
    setLoadErrorCause(null);
    setData(null);
    setLoading(true);
    publicJson<Detail>(`/public/submissions/${encodeURIComponent(routeSlug)}`)
      .then(setData)
      .catch((err) => {
        setLoadErrorCause(err);
        setLoadError(resolveApiError(err, t("notFound")));
      })
      .finally(() => setLoading(false));
  }, [routeSlug, t, resolveApiError]);

  useEffect(() => {
    void Promise.resolve().then(() => loadDetail());
  }, [loadDetail]);

  if (loading && !loadError) {
    return (
      <main className={PAGE_SHELL_NARROW}>
        <Link href="/publications" className="text-sm text-accent hover:underline">
          {t("back")}
        </Link>
        <p className="mt-8 text-ink/70">{t("loading")}</p>
      </main>
    );
  }

  if (loadError || !data) {
    const kind = loadErrorCause ? getApiErrorKind(loadErrorCause) : "generic";
    return (
      <ApiErrorState
        message={loadError ?? t("notFound")}
        error={loadErrorCause ?? undefined}
        title={kind === "notFound" ? t("notFound") : undefined}
        hint={kind === "rateLimit" ? tApi("rateLimitHint") : undefined}
        onRetry={() => void loadDetail()}
        retryLabel={tApi("retry")}
        backHref="/publications"
        backLabel={t("back")}
      />
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
