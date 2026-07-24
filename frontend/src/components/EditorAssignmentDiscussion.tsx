'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiJson } from '@/lib/api';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { Spinner } from '@/components/ui/spinner';

type DiscussionMessage = {
  id: string;
  body: string;
  createdAt: string;
  author?: { id: string; displayName: string } | null;
};

type DiscussionRow = {
  id: string;
  subject: string;
  createdAt: string;
  messages: DiscussionMessage[];
};

/**
 * Read-only-by-default discussion thread for a single review assignment,
 * shown in the editor's Command Center sidebar. Reuses the same
 * `/assignments/:slug/discussions` endpoints the reviewer UI already talks
 * to — editors can read every message and reply, they just don't get the
 * "start a new thread" affordance reviewers get (one thread per assignment
 * is enough for editor commentary).
 */
export function EditorAssignmentDiscussion({
  assignmentSlug,
}: {
  assignmentSlug: string;
}) {
  const t = useTranslations('SubmissionDetail');
  const locale = useLocale();
  const showApiError = useToastApiError();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [discussions, setDiscussions] = useState<DiscussionRow[] | null>(null);
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && discussions === null) {
      setLoading(true);
      setLoadFailed(false);
      try {
        const rows = await apiJson<DiscussionRow[]>(
          `/assignments/${encodeURIComponent(assignmentSlug)}/discussions`,
        );
        setDiscussions(rows);
      } catch {
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    }
  }

  async function send() {
    const body = messageBody.trim();
    if (!body) return;
    setSending(true);
    try {
      const existing = discussions?.[0];
      if (existing) {
        const msg = await apiJson<DiscussionMessage>(
          `/assignments/${encodeURIComponent(assignmentSlug)}/discussions/${existing.id}/messages`,
          { method: 'POST', body: JSON.stringify({ body }) },
        );
        setDiscussions((prev) =>
          prev
            ? prev.map((d) =>
                d.id === existing.id
                  ? { ...d, messages: [...d.messages, msg] }
                  : d,
              )
            : prev,
        );
      } else {
        const disc = await apiJson<DiscussionRow>(
          `/assignments/${encodeURIComponent(assignmentSlug)}/discussions`,
          {
            method: 'POST',
            body: JSON.stringify({ subject: '', body }),
          },
        );
        setDiscussions((prev) => [...(prev ?? []), disc]);
      }
      setMessageBody('');
    } catch (err) {
      showApiError(err, t('discussionSendFailed'), {
        id: 'editor-discussion-send',
      });
    } finally {
      setSending(false);
    }
  }

  const messages = (discussions ?? []).flatMap((d) => d.messages);

  return (
    <div className="space-y-2 border-t border-ink/10 dark:border-white/10 pt-3">
      <button
        type="button"
        onClick={() => void toggle()}
        className="text-[11px] font-semibold text-accent hover:underline"
      >
        {expanded ? t('discussionToggleHide') : t('discussionToggleShow')}
      </button>
      {expanded && (
        <div className="space-y-2">
          {loading && <Spinner className="size-4" />}
          {!loading && loadFailed && (
            <p className="text-[11px] text-red-700 dark:text-red-400">
              {t('discussionLoadFailed')}
            </p>
          )}
          {!loading && !loadFailed && messages.length === 0 && (
            <p className="text-[11px] text-ink/50">{t('discussionNone')}</p>
          )}
          {!loading && !loadFailed && messages.length > 0 && (
            <ul className="space-y-2">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg bg-ink/5 dark:bg-white/5 p-2 text-[11px]"
                >
                  <div className="flex items-center justify-between gap-2 text-ink/50">
                    <span className="font-medium">
                      {m.author?.displayName ?? ''}
                    </span>
                    <time dateTime={m.createdAt}>
                      {new Date(m.createdAt).toLocaleString(locale, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-ink/80">
                    {m.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {!loading && !loadFailed && (
            <div className="flex items-start gap-2">
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={t('discussionMessagePlaceholder')}
                disabled={sending}
                rows={2}
                maxLength={50000}
                className="w-full rounded-lg border border-ink/15 dark:border-white/15 bg-paper px-2 py-1.5 text-[11px] text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
              />
              <button
                type="button"
                disabled={sending || !messageBody.trim()}
                onClick={() => void send()}
                className="shrink-0 rounded-lg bg-ink text-paper dark:bg-white dark:text-paper px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
              >
                {t('discussionSend')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
