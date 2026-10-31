'use client';

import { ArrowRight, Info, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  formatDocxFormatValue,
  groupDocxViolations,
  type DocxFormatGroup,
  type DocxFormatLocale,
  type DocxFormatViolationView,
} from './docx-format-display';

function ValueChip({
  caption,
  value,
  tone,
}: {
  caption: string;
  value: string;
  tone: 'found' | 'required';
}) {
  return (
    <span
      className={`inline-flex max-w-full items-baseline gap-1.5 rounded-md px-2 py-1 ${
        tone === 'required' ? 'bg-accent/15 text-ink' : 'bg-ink/5 text-ink/75'
      }`}
    >
      <span className="text-[10px] font-medium text-ink/50">{caption}</span>
      <bdi
        dir="ltr"
        className={`text-sm whitespace-nowrap ${tone === 'required' ? 'font-semibold text-ink' : ''}`}
      >
        {value}
      </bdi>
    </span>
  );
}

function GroupBlock({
  group,
  locale,
  labels,
  groups,
  hints,
}: {
  group: DocxFormatGroup;
  locale: DocxFormatLocale;
  labels: Record<string, string>;
  groups: Record<string, string>;
  hints: Record<string, string>;
}) {
  const t = useTranslations('DocxFormat');

  return (
    <div className="rounded-lg bg-surface px-3 py-2.5">
      <p className="text-xs font-semibold text-ink/70">{groups[group.id]}</p>
      {group.presentation === 'sentence' ? (
        <ul className="mt-1.5 space-y-1.5">
          {group.items.map((item) => (
            <li key={item.code} className="text-sm leading-relaxed text-ink">
              {locale === 'ar' ? item.messageAr : item.message}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {group.items.map((item) => (
            <li
              key={item.code}
              className="grid gap-1.5 sm:grid-cols-[minmax(8rem,1fr)_auto] sm:items-center sm:gap-3"
            >
              <p className="text-sm font-medium text-ink">
                {labels[item.code] ??
                  (locale === 'ar' ? item.messageAr : item.message)}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <ValueChip
                  caption={t('inFile')}
                  value={formatDocxFormatValue(item.found, item.code, locale)}
                  tone="found"
                />
                <ArrowRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-ink/35 rtl:rotate-180"
                />
                <ValueChip
                  caption={t('required')}
                  value={formatDocxFormatValue(
                    item.expected,
                    item.code,
                    locale,
                  )}
                  tone="required"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {group.hint === 'static' && hints[group.id] ? (
        <p className="mt-2 text-xs leading-relaxed text-ink/70">
          <span className="font-semibold text-ink/80">{t('inWord')}: </span>
          {hints[group.id]}
        </p>
      ) : null}
      {group.hint === 'message'
        ? group.items.map((item) => (
            <p
              key={`${item.code}-hint`}
              className="mt-2 text-xs leading-relaxed text-ink/70"
            >
              {locale === 'ar' ? item.messageAr : item.message}
            </p>
          ))
        : null}
    </div>
  );
}

function ReportSection({
  tone,
  violations,
  locale,
}: {
  tone: 'blocking' | 'advisory';
  violations: DocxFormatViolationView[];
  locale: DocxFormatLocale;
}) {
  const t = useTranslations('DocxFormat');
  const labels = t.raw('labels') as Record<string, string>;
  const groups = t.raw('groups') as Record<string, string>;
  const hints = t.raw('hints') as Record<string, string>;
  const grouped = groupDocxViolations(violations);
  const blocking = tone === 'blocking';

  return (
    <section
      className={
        blocking
          ? 'rounded-xl border border-red-300/80 bg-red-50 px-4 py-3 dark:border-red-500/35 dark:bg-red-950/30'
          : 'rounded-xl border border-ink/10 bg-ink/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]'
      }
    >
      <div className="flex items-start gap-2">
        {blocking ? (
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-300" />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-ink/50" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`text-sm font-semibold ${
                blocking ? 'text-red-950 dark:text-red-100' : 'text-ink/80'
              }`}
            >
              {blocking ? t('blockingHeading') : t('advisoryHeading')}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                blocking
                  ? 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200'
                  : 'bg-ink/10 text-ink/70'
              }`}
            >
              {t('issueCount', { count: violations.length })}
            </span>
          </div>
          <p
            className={`mt-0.5 text-xs leading-relaxed ${
              blocking ? 'text-red-900/80 dark:text-red-100/80' : 'text-ink/60'
            }`}
          >
            {blocking ? t('blockingBody') : t('advisoryBody')}
          </p>
          <div className="mt-3 space-y-2">
            {grouped.map((group) => (
              <GroupBlock
                key={group.id}
                group={group}
                locale={locale}
                labels={labels}
                groups={groups}
                hints={hints}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function DocxFormatReport({
  violations,
}: {
  violations: DocxFormatViolationView[];
}) {
  const locale = useLocale();
  const lang: DocxFormatLocale = locale === 'ar' ? 'ar' : 'en';
  const blocking = violations.filter((v) => v.severity !== 'warning');
  const advisory = violations.filter((v) => v.severity === 'warning');

  if (blocking.length === 0 && advisory.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      {blocking.length > 0 ? (
        <ReportSection tone="blocking" violations={blocking} locale={lang} />
      ) : null}
      {advisory.length > 0 ? (
        <ReportSection tone="advisory" violations={advisory} locale={lang} />
      ) : null}
    </div>
  );
}
