'use client';

import { useCallback, useMemo } from 'react';
import { Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BOARD_GROUP_KEY,
  EDITORIAL_BOARD_ROLES,
  boardMemberAffiliation,
  boardMemberName,
  type PublicEditorialBoardMember,
} from '@/lib/editorial-board';
import { EMPTY_STATE_CLS, PAGE_LIST_GAP } from '@/lib/page-shell';
import { useClientList } from '@/lib/use-client-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Highlight } from '@/components/ui/highlight';
import { ResultCount } from '@/components/ui/result-count';
import { SearchInput } from '@/components/ui/search-input';

type Props = {
  basePath: string;
  board: PublicEditorialBoardMember[];
};

/**
 * The editorial board, searchable by name or affiliation.
 *
 * Filtering runs across the whole board, then the survivors are regrouped by
 * role — so a search never leaves an empty "Advisory members" heading behind,
 * and the role ordering DOAJ expects is preserved.
 */
export function EditorialBoardList({ basePath, board }: Props) {
  const t = useTranslations('Journals');
  const tList = useTranslations('List');
  const locale = useLocale();
  const isAr = locale.startsWith('ar');

  const toSearchText = useCallback(
    (m: PublicEditorialBoardMember) =>
      [
        boardMemberName(m, false),
        boardMemberName(m, true),
        boardMemberAffiliation(m, false),
        boardMemberAffiliation(m, true),
        m.orcid,
      ]
        .filter(Boolean)
        .join(' '),
    [],
  );

  const {
    draftQuery,
    setDraftQuery,
    query,
    matched,
    isActive,
    clear,
  } = useClientList({ items: board, toSearchText, basePath });

  const groups = useMemo(
    () =>
      EDITORIAL_BOARD_ROLES.map((role) => ({
        role,
        members: matched.filter((m) => m.role === role),
      })).filter((g) => g.members.length > 0),
    [matched],
  );

  if (board.length === 0) {
    return (
      <div className={`${EMPTY_STATE_CLS} ${PAGE_LIST_GAP}`}>
        <Users className="h-6 w-6 text-ink/40" aria-hidden />
        <p className="text-sm text-ink/60">{t('editorialBoardEmpty')}</p>
      </div>
    );
  }

  return (
    <div className={PAGE_LIST_GAP}>
      {/* A board of a handful of people is read at a glance. */}
      {board.length > 8 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            id="board-q"
            value={draftQuery}
            onChange={setDraftQuery}
            onClear={clear}
            placeholder={t('boardSearchPlaceholder')}
            label={tList('searchLabel')}
            clearLabel={tList('clearSearch')}
            controls="board-results"
          />
          {isActive ? (
            <ResultCount label={tList('resultCount', { count: matched.length })} />
          ) : null}
        </div>
      ) : null}

      <div id="board-results">
        {groups.length === 0 ? (
          <EmptyState
            title={t('noBoardResults')}
            hint={t('noBoardResultsHint')}
            action={{ label: tList('clear'), onClick: clear }}
          />
        ) : (
          groups.map((group) => (
            <section
              key={group.role}
              className={PAGE_LIST_GAP}
              aria-labelledby={`board-${group.role}`}
            >
              <h2
                id={`board-${group.role}`}
                className="font-serif text-xl font-semibold text-ink"
              >
                {t(BOARD_GROUP_KEY[group.role])}
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {group.members.map((m, index) => {
                  const name = boardMemberName(m, isAr);
                  const affiliation = boardMemberAffiliation(m, isAr);
                  return (
                    <li
                      key={m.orcid ?? `${name}-${index}`}
                      className="rounded-xl border border-ink/10 bg-surface px-5 py-4 shadow-sm dark:border-white/10"
                    >
                      <p className="font-serif text-base font-semibold text-ink">
                        <Highlight text={name} query={query} />
                      </p>
                      {affiliation ? (
                        <p className="mt-0.5 text-sm text-ink/65">
                          <Highlight text={affiliation} query={query} />
                        </p>
                      ) : null}
                      {m.orcid ? (
                        <a
                          href={`https://orcid.org/${m.orcid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          dir="ltr"
                          aria-label={t('orcidProfile', { name })}
                          className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-ink/60 transition hover:text-accent"
                        >
                          <span
                            aria-hidden
                            className="inline-flex size-4 items-center justify-center rounded-full bg-[#A6CE39] font-sans text-[8px] font-bold text-white"
                          >
                            iD
                          </span>
                          {m.orcid}
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
