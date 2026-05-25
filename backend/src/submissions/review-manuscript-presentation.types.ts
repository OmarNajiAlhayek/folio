/** Author choice for which main manuscript sources are visible in the review package. */
export type ReviewManuscriptPresentation = {
  presentUploaded: boolean;
  presentConstructor: boolean;
};

export function isValidReviewManuscriptPresentation(
  value: unknown,
): value is ReviewManuscriptPresentation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.presentUploaded === 'boolean' &&
    typeof v.presentConstructor === 'boolean' &&
    (v.presentUploaded || v.presentConstructor)
  );
}

export function resolveSubmitPresentation(options: {
  presentUploadedManuscript?: boolean;
  presentConstructorManuscript?: boolean;
  useUploadedManuscript?: boolean;
  hasUploadedManuscript: boolean;
  hasConstructorDraft: boolean;
}): ReviewManuscriptPresentation {
  const explicit =
    options.presentUploadedManuscript !== undefined ||
    options.presentConstructorManuscript !== undefined;
  if (explicit) {
    return {
      presentUploaded: options.presentUploadedManuscript === true,
      presentConstructor: options.presentConstructorManuscript === true,
    };
  }
  if (options.useUploadedManuscript === true) {
    return { presentUploaded: true, presentConstructor: false };
  }
  if (options.hasConstructorDraft && !options.hasUploadedManuscript) {
    return { presentUploaded: false, presentConstructor: true };
  }
  if (options.hasConstructorDraft && options.hasUploadedManuscript) {
    return { presentUploaded: true, presentConstructor: true };
  }
  return { presentUploaded: true, presentConstructor: false };
}
