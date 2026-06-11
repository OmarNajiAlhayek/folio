'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiJson } from '@/lib/api';
import { sessionDeviceLabel } from '@/lib/session-device-label';
import { useToastApiError } from '@/lib/use-toast-api-error';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export type ActiveSessionRow = {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

export function ActiveSessionsCard() {
  const t = useTranslations('Dashboard.sessions');
  const showApiError = useToastApiError();
  const [sessions, setSessions] = useState<ActiveSessionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokeOthersBusy, setRevokeOthersBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const rows = await apiJson<ActiveSessionRow[]>('/auth/sessions');
      setSessions(rows);
    } catch (err) {
      showApiError(err, t('loadFailed'), { id: 'sessions-load' });
      setSessions([]);
    } finally {
      setLoaded(true);
    }
  }, [showApiError, t]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function revokeSession(id: string) {
    setBusyId(id);
    try {
      await apiJson(`/auth/sessions/${id}`, { method: 'DELETE' });
      toast.success(t('revoked'));
      await loadSessions();
    } catch (err) {
      showApiError(err, t('revokeFailed'), { id: `sessions-revoke-${id}` });
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    setRevokeOthersBusy(true);
    try {
      const res = await apiJson<{ revoked: number }>(
        '/auth/sessions/revoke-others',
        { method: 'POST' },
      );
      toast.success(t('revokedOthers', { count: res.revoked }));
      await loadSessions();
    } catch (err) {
      showApiError(err, t('revokeOthersFailed'), {
        id: 'sessions-revoke-others',
      });
    } finally {
      setRevokeOthersBusy(false);
    }
  }

  const hasOthers = sessions.some((s) => !s.isCurrent);

  return (
    <section
      className="rounded-2xl border border-ink/10 bg-surface p-6 shadow-sm transition-all duration-300 hover:shadow-[0_4px_16px_rgba(15,23,42,0.02)] dark:border-white/10"
      aria-labelledby="sessions-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="sessions-heading"
            className="font-sans text-sm font-semibold text-ink"
          >
            {t('title')}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-ink/65">
            {t('hint')}
          </p>
        </div>
        {hasOthers ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={revokeOthersBusy}
            onClick={() => void revokeOthers()}
          >
            {t('revokeOthers')}
          </Button>
        ) : null}
      </div>

      {!loaded ? (
        <div className="mt-6 flex justify-center py-4">
          <Spinner />
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-6 text-xs text-ink/60">{t('empty')}</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/[0.06] bg-surface-muted/40 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {sessionDeviceLabel(session.userAgent)}
                  {session.isCurrent ? (
                    <span className="ms-2 rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      {t('thisDevice')}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-ink/60">
                  {t('lastActive', {
                    date: new Date(session.lastUsedAt).toLocaleString(),
                  })}
                </p>
              </div>
              {!session.isCurrent ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={busyId === session.id}
                  onClick={() => void revokeSession(session.id)}
                >
                  {t('logoutDevice')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
