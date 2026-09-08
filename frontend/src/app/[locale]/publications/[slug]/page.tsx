import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  BookOpen,
  CalendarDays,
  Download,
  FileText,
  UserRound,
} from 'lucide-react';
import { DisciplineBadges } from '@/components/discipline-badges';
import { JsonLd } from '@/components/json-ld';
import {
  RelatedPublications,
  type RelatedPublication,
} from '@/components/related-publications';
import { buildCitationMeta, findPublicPdf } from '@/lib/citation-meta';
import { formatMediumDate } from '@/lib/format-date';
import { parseKeywordsFromStorage } from '@/lib/keywords';
import { PAGE_SHELL_NARROW } from '@/lib/page-shell';
import type { PublicationDetail } from '@/lib/publication-types';
import { buildScholarlyArticleJsonLd } from '@/lib/scholarly-jsonld';
import { serverPublicJson } from '@/lib/server-api';
import {
  absoluteLocaleUrl,
  absoluteUrl,
  localeAlternates,
} from '@/lib/site-url';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

/**
 * The public article page — a server component, unlike the rest of the app.
 *
 * Google Scholar does not execute JavaScript, so `citation_*` tags and the
 * article text have to be in the HTML this route returns. The previous version
 * was not blocked by `'use client'` as such — client components are still
 * server-rendered — but by fetching through react-query in an effect, which
 * meant the server rendered a spinner and the crawler indexed a spinner.
 *
 * The editorial workspace stays client-side; it genuinely is an application.
 * This route is read-only, unauthenticated content, which is why it is the
 * right place to start.
 *
 * Retracted and unknown slugs: the API 404s (only `published` rows are
 * returned), so `notFound()` renders the not-found UI and no article content is
 * served. Note that the *HTTP status* is 200, not 404 — Next returns 200 for
 * streamed responses and cannot change the status once streaming has begun.
 * This is app-wide behaviour, not specific to this route (the `[...rest]`
 * catch-all behaves identically). Next mitigates it by injecting
 * `<meta name="robots" content="noindex">` automatically, which is present here
 * and verified, so a retracted article is dropped from search indexes rather
 * than lingering. Recovering a true 404 status would require resolving the slug
 * in `proxy`/middleware before the response streams — an API round trip on
 * every article request, which is not worth it for a status code that no
 * crawler acts on differently from `noindex`.
 */

async function loadArticle(slug: string): Promise<PublicationDetail | null> {
  return serverPublicJson<PublicationDetail>(
    `/public/submissions/${encodeURIComponent(slug)}`,
  );
}

async function loadRelated(slug: string): Promise<RelatedPublication[]> {
  try {
    return (
      (await serverPublicJson<RelatedPublication[]>(
        `/public/submissions/${encodeURIComponent(slug)}/related`,
      )) ?? []
    );
  } catch {
    // Related articles are a convenience. A failure here must not take down an
    // article page that is otherwise complete and citable.
    return [];
  }
}

/** Public, absolute URL of a published file — used only in metadata. */
function publicFileUrl(slug: string, fileId: string): string | null {
  return absoluteUrl(
    `/api/v1/public/submissions/${encodeURIComponent(slug)}/files/${fileId}`,
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = await loadArticle(slug);
  if (!article) return {};

  const path = `/publications/${slug}`;
  const articleUrl = absoluteLocaleUrl(locale, path);
  const pdf = findPublicPdf(article);
  const pdfUrl = pdf ? publicFileUrl(slug, pdf.id) : null;

  const isAr = locale.startsWith('ar');
  const title = (isAr && article.titleAr?.trim()) || article.title;
  const description = (isAr && article.abstractAr?.trim()) || article.abstract;

  return {
    title,
    description: description.slice(0, 300),
    alternates: {
      canonical: articleUrl ?? undefined,
      languages: localeAlternates(path),
    },
    openGraph: {
      type: 'article',
      title,
      description: description.slice(0, 300),
      url: articleUrl ?? undefined,
      publishedTime: article.publishedAt ?? undefined,
    },
    // Repeated `citation_author` tags come from the array values here.
    other: buildCitationMeta({ article, articleUrl, pdfUrl }),
  };
}

export default async function PublicationDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const article = await loadArticle(slug);
  if (!article) notFound();

  const [t, tWf, related] = await Promise.all([
    getTranslations({ locale, namespace: 'PublicationDetail' }),
    getTranslations({ locale, namespace: 'SubmissionWorkflow' }),
    loadRelated(slug),
  ]);

  const isAr = locale.startsWith('ar');
  const articleUrl = absoluteLocaleUrl(locale, `/publications/${slug}`);
  const pdf = findPublicPdf(article);
  const jsonLd = buildScholarlyArticleJsonLd(
    article,
    articleUrl,
    pdf ? publicFileUrl(slug, pdf.id) : null,
  );

  const journal = article.journal ?? null;
  const issue = article.issue ?? null;
  const journalTitle = journal
    ? isAr
      ? journal.titleAr
      : journal.titleEn
    : null;
  const issueCitation = issue
    ? isAr
      ? issue.citationAr
      : issue.citationEn
    : null;

  return (
    <main className={PAGE_SHELL_NARROW}>
      <JsonLd data={jsonLd} />

      <Link
        href="/publications"
        className="group inline-flex items-center gap-1 text-sm text-accent hover:underline decoration-offset-2 select-none"
      >
        <span className="transform transition-transform duration-200 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5">
          ←
        </span>
        {t('back')}
      </Link>

      <div className="flex flex-wrap gap-2 items-center mt-6">
        {(article.disciplines?.length ?? 0) > 0 ? (
          <DisciplineBadges labels={article.disciplines ?? []} />
        ) : null}
        {article.articleType ? (
          <span className="inline-flex items-center rounded-full bg-indigo-500/8 dark:bg-indigo-500/18 border border-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
            {tWf(`articleType_${article.articleType}`)}
          </span>
        ) : null}
      </div>

      <h1 className="mt-3 font-serif text-3xl font-bold leading-tight text-ink sm:text-4xl">
        {article.title}
      </h1>
      {article.titleAr?.trim() ? (
        <p
          dir="rtl"
          className="mt-3.5 font-serif text-2xl font-bold leading-snug text-ink/90"
        >
          {article.titleAr}
        </p>
      ) : null}

      {journal && journalTitle ? (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/70">
          <BookOpen
            className="size-4 text-accent opacity-75"
            strokeWidth={2}
            aria-hidden
          />
          <Link
            href={`/journals/${journal.slug}`}
            className="font-medium text-accent hover:underline"
          >
            {journalTitle}
          </Link>
          {issue && issueCitation ? (
            <>
              <span aria-hidden className="text-ink/30">
                ·
              </span>
              <Link
                href={`/journals/${journal.slug}/issues/${issue.year}/${issue.number}`}
                className="hover:underline"
              >
                {issueCitation}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold uppercase tracking-wider text-ink/50 pb-5 border-b border-ink/[0.08] dark:border-white/[0.08]">
        {article.author?.displayName ? (
          <div className="flex items-center gap-1.5">
            <UserRound
              className="size-4 text-accent-2 opacity-75"
              strokeWidth={2}
              aria-hidden
            />
            <span>{article.author.displayName}</span>
          </div>
        ) : null}
        {article.publishedAt ? (
          <div className="flex items-center gap-1.5">
            <CalendarDays
              className="size-4 text-accent opacity-75"
              strokeWidth={2}
              aria-hidden
            />
            <span>{formatMediumDate(article.publishedAt, locale)}</span>
          </div>
        ) : null}
      </div>

      <section className="mt-8 space-y-8 text-sm text-ink/85">
        {article.abstract ? (
          <div className="rounded-2xl border border-ink/[0.08] dark:border-white/[0.08] bg-surface/50 p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink/40">
              {tWf('abstractLabelEn')}
            </h2>
            <p
              dir="ltr"
              className="mt-3.5 leading-relaxed text-ink/80 whitespace-pre-wrap text-sm"
            >
              {article.abstract}
            </p>
            <KeywordRow raw={article.keywords} label={t('keywordsLabel')} />
          </div>
        ) : null}

        {article.abstractAr?.trim() ? (
          <div className="rounded-2xl border border-ink/[0.08] dark:border-white/[0.08] bg-surface/50 p-5 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink/40">
              {tWf('abstractLabelAr')}
            </h2>
            <p
              dir="rtl"
              className="mt-3.5 leading-relaxed text-ink/80 whitespace-pre-wrap font-serif text-base"
            >
              {article.abstractAr}
            </p>
            <KeywordRow raw={article.keywordsAr} label={t('keywordsLabel')} />
          </div>
        ) : null}
      </section>

      {article.files?.length > 0 ? (
        <section className="mt-10 pt-6 border-t border-ink/[0.08] dark:border-white/[0.08]">
          <h2 className="font-serif text-lg font-bold text-ink flex items-center gap-2 mb-3.5">
            <span className="text-accent">📂</span>
            {t('files')}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {article.files.map((f) => (
              <li key={f.id}>
                <a
                  className="group/file flex items-center justify-between gap-4 rounded-xl border border-ink/10 dark:border-white/10 bg-surface/50 px-4 py-3.5 hover:border-accent/25 hover:shadow-xs transition-all duration-300"
                  href={`/api/v1/public/submissions/${encodeURIComponent(article.slug ?? slug)}/files/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/8 text-accent group-hover/file:scale-105 transition-transform duration-200">
                      <FileText
                        className="size-4.5"
                        strokeWidth={2}
                        aria-hidden
                      />
                    </div>
                    <span
                      className="font-semibold text-xs text-ink/80 truncate group-hover/file:text-accent transition-colors duration-200"
                      title={f.originalName}
                    >
                      {f.originalName}
                    </span>
                  </div>
                  <Download
                    className="size-4 shrink-0 text-ink/35 transition group-hover/file:text-accent"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RelatedPublications items={related} />
    </main>
  );
}

function KeywordRow({
  raw,
  label,
}: {
  raw: string | null | undefined;
  label: string;
}) {
  // The canonical split rule, shared with the backend and the OAI feed, so the
  // keywords a reader sees are the keywords a harvester receives.
  const list = parseKeywordsFromStorage(raw);
  if (list.length === 0) return null;
  return (
    <div dir="ltr" className="mt-4 flex flex-wrap gap-1.5 items-center">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ink/40 me-1.5">
        {label}
      </span>
      {list.map((k) => (
        <span
          key={k}
          className="inline-flex items-center rounded-lg bg-surface border border-ink/10 dark:border-white/10 px-2.5 py-0.5 text-xs text-ink/80"
        >
          {k}
        </span>
      ))}
    </div>
  );
}
