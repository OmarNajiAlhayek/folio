'use client';

import { useCallback, useEffect, useState } from 'react';
import { hashConstructorContent } from '@/lib/constructor-content-hash';
import {
  computePreSubmitSubmitState,
  PRE_SUBMIT_VALIDATION_FIELD,
  type PreSubmitAnalysis,
  type PreSubmitSubmitState,
  preSubmitSubmitDisabled,
  requiresPreSubmitValidation,
} from '@/lib/pre-submit-validation';
import type { ReviewManuscriptPresentation } from '@/lib/review-manuscript-presentation';
import { toast } from '@/lib/toast';

type UsePreSubmitValidationParams = {
  serverAnalysis: PreSubmitAnalysis | null | undefined;
  serverUpdatedAt: string | undefined;
  constructorContent: unknown;
  hasConstructorDraft: boolean;
  reviewPresentation: ReviewManuscriptPresentation;
  busy: boolean;
  hasManuscript: boolean;
  t: (key: string) => string;
  onBlocked: (fieldErrors: Set<string>) => void;
};

export function usePreSubmitValidation({
  serverAnalysis,
  serverUpdatedAt,
  constructorContent,
  hasConstructorDraft,
  reviewPresentation,
  busy,
  hasManuscript,
  t,
  onBlocked,
}: UsePreSubmitValidationParams) {
  const [preSubmitAnalysis, setPreSubmitAnalysis] =
    useState<PreSubmitAnalysis | null>(null);
  const [validatingManuscript, setValidatingManuscript] = useState(false);
  const [preSubmitStale, setPreSubmitStale] = useState(false);

  // Mirror server-fetched analysis when submission refetches.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prop into editable local state
    setPreSubmitAnalysis(serverAnalysis ?? null);
  }, [serverAnalysis, serverUpdatedAt]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!preSubmitAnalysis || !constructorContent) {
        if (!cancelled) setPreSubmitStale(false);
        return;
      }
      const hash = await hashConstructorContent(constructorContent);
      if (!cancelled) {
        setPreSubmitStale(
          Boolean(hash && hash !== preSubmitAnalysis.contentHash),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preSubmitAnalysis, constructorContent]);

  const preSubmitRequired = requiresPreSubmitValidation(
    hasConstructorDraft,
    reviewPresentation.presentConstructor,
  );

  const preSubmitState = computePreSubmitSubmitState({
    required: preSubmitRequired,
    validating: validatingManuscript,
    busy,
    analysis: preSubmitAnalysis,
    isStale: preSubmitStale,
  });

  const submitDisabled = preSubmitSubmitDisabled(
    preSubmitState,
    busy,
    hasManuscript,
  );

  const submitButtonLabel = (() => {
    switch (preSubmitState) {
      case 'validating':
        return t('submitValidating');
      case 'not_run':
        return t('submitValidateFirst');
      case 'stale':
        return t('submitRerunValidation');
      case 'blocking':
        return t('submitFixIssues');
      default:
        return t('submitForReview');
    }
  })();

  const blockSubmit = useCallback(
    (state: PreSubmitSubmitState) => {
      const validationErrors = new Set<string>([PRE_SUBMIT_VALIDATION_FIELD]);
      onBlocked(validationErrors);
      if (state === 'not_run' || state === 'stale') {
        toast.error(
          t(
            state === 'not_run'
              ? 'submitValidateFirst'
              : 'submitRerunValidation',
          ),
          { id: 'submission-pre-submit-scroll' },
        );
      }
    },
    [onBlocked, t],
  );

  const handleSubmitClick = useCallback(
    (submit: () => void | Promise<void>) => {
      if (
        preSubmitRequired &&
        preSubmitState !== 'ready' &&
        preSubmitState !== 'not_required'
      ) {
        blockSubmit(preSubmitState);
        return;
      }
      void submit();
    },
    [blockSubmit, preSubmitRequired, preSubmitState],
  );

  const assertReadyBeforeSubmit = useCallback(
    async (input: {
      analysis: PreSubmitAnalysis | null | undefined;
      constructorContent: unknown;
    }): Promise<PreSubmitSubmitState | 'ready'> => {
      if (!preSubmitRequired) return 'ready';
      const contentHash = input.constructorContent
        ? await hashConstructorContent(input.constructorContent)
        : null;
      const isStale = Boolean(
        input.analysis &&
        contentHash &&
        contentHash !== input.analysis.contentHash,
      );
      const state = computePreSubmitSubmitState({
        required: true,
        validating: false,
        busy: false,
        analysis: input.analysis,
        isStale,
      });
      return state === 'ready' ? 'ready' : state;
    },
    [preSubmitRequired],
  );

  const toastForSubmitState = useCallback(
    (state: PreSubmitSubmitState) => {
      const toastKey =
        state === 'not_run'
          ? 'submitValidateFirst'
          : state === 'stale'
            ? 'submitRerunValidation'
            : 'submitFixIssues';
      toast.error(t(toastKey), { id: 'submission-pre-submit-gate' });
    },
    [t],
  );

  return {
    preSubmitAnalysis,
    setPreSubmitAnalysis,
    validatingManuscript,
    setValidatingManuscript,
    preSubmitRequired,
    preSubmitState,
    preSubmitStale,
    submitDisabled,
    submitButtonLabel,
    handleSubmitClick,
    assertReadyBeforeSubmit,
    toastForSubmitState,
    blockSubmit,
  };
}
