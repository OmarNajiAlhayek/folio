"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Spinner } from "@/components/ui/spinner";
import {
  constructorDraftHasMeaningfulContent,
  mergeImportedConstructorContent,
} from "@/lib/constructor-import-merge";
import type {
  ConstructorContent,
  ConstructorGuidance,
} from "@/lib/constructor-content.types";
import {
  CONSTRUCTOR_IMPORT_NO_CONTENT,
  isImportWarningCode,
} from "@/lib/constructor-import-warning-codes";
import { ApiError } from "@/lib/api-response";
import { importConstructorDocx } from "@/lib/import-constructor-docx";
import {
  clearStoredImportWarnings,
  readStoredImportWarnings,
  writeStoredImportWarnings,
} from "@/lib/constructor-import-warnings-storage";
import { toast } from "@/lib/toast";
import { useToastApiError } from "@/lib/use-toast-api-error";

type ConstructorPageT = ReturnType<typeof useTranslations<"ConstructorPage">>;

export type UseConstructorDocxImportParams = {
  content: ConstructorContent;
  onContentChange: (next: ConstructorContent) => void;
  /** `pre-slug` for compose/create; submission `slug` for post-slug compose. */
  scopeKey: string;
  canImport: boolean;
  locale: string;
  t: ConstructorPageT;
  onImportSuccess?: (merged: ConstructorContent) => void;
  /** Disables import control (e.g. while downloading docx on create page). */
  actionsDisabled?: boolean;
  /** Profile guidance for mandatory back-matter slots during merge. */
  guidance?: ConstructorGuidance | null;
};

export function useConstructorDocxImport({
  content,
  onContentChange,
  scopeKey,
  canImport,
  locale,
  t,
  onImportSuccess,
  actionsDisabled = false,
  guidance = null,
}: UseConstructorDocxImportParams) {
  const importInputId = useId();
  const importInputRef = useRef<HTMLInputElement>(null);
  const pendingImportFileRef = useRef<File | null>(null);
  const [importingDocx, setImportingDocx] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const showApiError = useToastApiError();

  useEffect(() => {
    const stored = readStoredImportWarnings(scopeKey);
    if (stored.length > 0) setImportWarnings(stored);
  }, [scopeKey]);

  const resetImportInput = useCallback(() => {
    if (importInputRef.current) importInputRef.current.value = "";
  }, []);

  const dismissImportWarnings = useCallback(() => {
    setImportWarnings([]);
    clearStoredImportWarnings(scopeKey);
  }, [scopeKey]);

  const runImport = useCallback(
    async (file: File) => {
      setImportingDocx(true);
      dismissImportWarnings();
      try {
        const result = await importConstructorDocx(file);
        const merged = mergeImportedConstructorContent(
          content,
          result.content,
          guidance,
        );
        onContentChange(merged);
        onImportSuccess?.(merged);
        const codeMessages = (result.warningCodes ?? [])
          .filter(isImportWarningCode)
          .map((code) => {
            try {
              return t(`importWarning_${code}` as "importWordSuccess");
            } catch {
              return code;
            }
          });
        const warnings = [...codeMessages, ...(result.warnings ?? [])];
        setImportWarnings(warnings);
        writeStoredImportWarnings(scopeKey, warnings);
        toast.success(t("importWordSuccess"), { id: "constructor-import-docx" });
      } catch (e) {
        const fallback =
          e instanceof ApiError && e.code === CONSTRUCTOR_IMPORT_NO_CONTENT
            ? t("importWordNoContent")
            : t("importWordFailed");
        showApiError(e, fallback, { id: "constructor-import-docx" });
      } finally {
        setImportingDocx(false);
        resetImportInput();
      }
    },
    [
      content,
      dismissImportWarnings,
      onContentChange,
      onImportSuccess,
      resetImportInput,
      scopeKey,
      showApiError,
      t,
      guidance,
    ],
  );

  const handleImportFileSelected = useCallback(
    (file: File) => {
      if (!canImport) return;
      if (constructorDraftHasMeaningfulContent(content)) {
        pendingImportFileRef.current = file;
        setImportConfirmOpen(true);
        return;
      }
      void runImport(file);
    },
    [canImport, content, runImport],
  );

  const handleImportConfirm = useCallback(() => {
    const file = pendingImportFileRef.current;
    pendingImportFileRef.current = null;
    if (file) void runImport(file);
    else resetImportInput();
  }, [resetImportInput, runImport]);

  const handleImportConfirmDismiss = useCallback(() => {
    pendingImportFileRef.current = null;
    resetImportInput();
  }, [resetImportInput]);

  const importDisabled = !canImport || importingDocx || actionsDisabled;

  const importButton = (
    <>
      <input
        ref={importInputRef}
        id={importInputId}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        disabled={importDisabled}
        data-testid="constructor-import-docx-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFileSelected(file);
        }}
      />
      <label
        htmlFor={importInputId}
        data-testid="constructor-import-docx"
        aria-busy={importingDocx}
        aria-label={importingDocx ? t("importingWord") : undefined}
        className={`inline-flex min-w-[7rem] cursor-pointer items-center justify-center rounded-md border border-ink/20 bg-paper px-4 py-2 text-sm font-medium text-ink shadow-sm hover:border-accent/40 ${importDisabled ? "pointer-events-none opacity-50" : ""}`}
      >
        {importingDocx ? <Spinner size="sm" /> : t("importWord")}
      </label>
    </>
  );

  const importWarningsNotice =
    importWarnings.length > 0 ? (
      <div className="rounded-md border border-amber-300/70 bg-amber-100/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-200">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-medium">{t("importWordWarnings")}</p>
          <button
            type="button"
            onClick={dismissImportWarnings}
            className="shrink-0 text-xs font-medium text-amber-950/80 underline-offset-2 hover:underline dark:text-amber-100/90"
          >
            {t("dismissImportNotes")}
          </button>
        </div>
        <ul className="mt-1 list-inside list-disc">
          {importWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
    ) : null;

  const confirmDialog = (
    <ConfirmDialog
      open={importConfirmOpen}
      onOpenChange={(next) => {
        setImportConfirmOpen(next);
        if (!next) handleImportConfirmDismiss();
      }}
      dir={locale === "ar" ? "rtl" : "ltr"}
      title={t("importWordReplaceTitle")}
      description={t("importWordReplaceDescription")}
      cancelLabel={t("importWordReplaceCancel")}
      confirmLabel={t("importWordReplaceAction")}
      onConfirm={handleImportConfirm}
      confirmDisabled={importingDocx}
    />
  );

  return {
    importButton,
    importWarningsNotice,
    confirmDialog,
    importing: importingDocx,
  };
}
