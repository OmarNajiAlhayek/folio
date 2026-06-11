'use client';

import { useCallback, useState } from 'react';
import type { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  constructorDraftHasMeaningfulContent,
  mergeImportedConstructorContent,
} from '@/lib/constructor-import-merge';
import type {
  ConstructorContent,
  ConstructorGuidance,
} from '@/lib/constructor-content.types';
import {
  CONSTRUCTOR_IMPORT_NO_CONTENT,
  isImportWarningCode,
} from '@/lib/constructor-import-warning-codes';
import { ApiError } from '@/lib/api-response';
import { reimportAttachedConstructorDocx } from '@/lib/reimport-attached-constructor-docx';
import { toast } from '@/lib/toast';
import { useToastApiError } from '@/lib/use-toast-api-error';

type ConstructorPageT = ReturnType<typeof useTranslations<'ConstructorPage'>>;

export type UseConstructorAttachedReimportParams = {
  slug: string;
  content: ConstructorContent;
  onContentChange: (next: ConstructorContent) => void;
  canReimport: boolean;
  hasAttachedConstructorDocx: boolean;
  t: ConstructorPageT;
  guidance?: ConstructorGuidance | null;
  actionsDisabled?: boolean;
};

export function useConstructorAttachedReimport({
  slug,
  content,
  onContentChange,
  canReimport,
  hasAttachedConstructorDocx,
  t,
  guidance = null,
  actionsDisabled = false,
}: UseConstructorAttachedReimportParams) {
  const [reimporting, setReimporting] = useState(false);
  const [reimportWarnings, setReimportWarnings] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const showApiError = useToastApiError();

  const dismissReimportWarnings = useCallback(() => {
    setReimportWarnings([]);
  }, []);

  const runReimport = useCallback(async () => {
    setReimporting(true);
    dismissReimportWarnings();
    try {
      const result = await reimportAttachedConstructorDocx(slug);
      const merged = mergeImportedConstructorContent(
        content,
        result.content,
        guidance,
      );
      onContentChange(merged);
      const codeMessages = (result.warningCodes ?? [])
        .filter(isImportWarningCode)
        .map((code) => {
          try {
            return t(`importWarning_${code}` as 'importWordSuccess');
          } catch {
            return code;
          }
        });
      const warnings = [...codeMessages, ...(result.warnings ?? [])];
      setReimportWarnings(warnings);
      toast.success(t('reimportAttachedSuccess'), {
        id: 'constructor-reimport-attached',
      });
    } catch (e) {
      const fallback =
        e instanceof ApiError && e.code === CONSTRUCTOR_IMPORT_NO_CONTENT
          ? t('importWordNoContent')
          : e instanceof ApiError && e.code === 'VALIDATION_ERROR'
            ? t('reimportAttachedMissing')
            : t('reimportAttachedFailed');
      showApiError(e, fallback, { id: 'constructor-reimport-attached' });
    } finally {
      setReimporting(false);
    }
  }, [
    content,
    dismissReimportWarnings,
    guidance,
    onContentChange,
    showApiError,
    slug,
    t,
  ]);

  const handleReimportClick = useCallback(() => {
    if (!canReimport || !hasAttachedConstructorDocx) return;
    if (constructorDraftHasMeaningfulContent(content)) {
      setConfirmOpen(true);
      return;
    }
    void runReimport();
  }, [canReimport, content, hasAttachedConstructorDocx, runReimport]);

  const disabled =
    !canReimport ||
    !hasAttachedConstructorDocx ||
    reimporting ||
    actionsDisabled;

  const reimportButton = hasAttachedConstructorDocx ? (
    <Button
      variant="secondary"
      size="sm"
      type="button"
      disabled={disabled}
      loading={reimporting}
      onClick={handleReimportClick}
      data-testid="constructor-reimport-attached-docx"
      aria-label={reimporting ? t('reimportingAttached') : undefined}
    >
      {t('reimportAttached')}
    </Button>
  ) : null;

  const reimportWarningsNotice =
    reimportWarnings.length > 0 ? (
      <div className="rounded-md border border-amber-300/70 bg-amber-100/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-200">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-medium">{t('reimportAttachedWarnings')}</p>
          <button
            type="button"
            onClick={dismissReimportWarnings}
            className="shrink-0 text-xs font-medium text-amber-950/80 underline-offset-2 hover:underline dark:text-amber-100/90"
          >
            {t('dismissImportNotes')}
          </button>
        </div>
        <ul className="mt-1 list-inside list-disc">
          {reimportWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    ) : null;

  const confirmDialog = (
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title={t('reimportAttachedTitle')}
      description={t('reimportAttachedDescription')}
      cancelLabel={t('importWordReplaceCancel')}
      confirmLabel={t('reimportAttachedAction')}
      onConfirm={() => void runReimport()}
      confirmDisabled={reimporting}
    />
  );

  return {
    reimportButton,
    reimportWarningsNotice,
    confirmDialog,
    reimporting,
  };
}
