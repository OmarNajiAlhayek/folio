import type { ConstructorContent } from "@/lib/constructor-content.types";
import { constructorDraftHasMeaningfulContent } from "@/lib/constructor-import-merge";

export type ReviewManuscriptPresentation = {
  presentUploaded: boolean;
  presentConstructor: boolean;
};

const STORAGE_PREFIX = "folio.review-manuscript-presentation.v1";

/** Session key for choices made on `/submissions/new` before a slug exists. */
export const PRE_SLUG_PRESENTATION_KEY = "__pre-slug__";

export function detectManuscriptSources(options: {
  files?: Array<{ kind?: string }>;
  constructorContent?: unknown | null;
}): {
  hasUploadedManuscript: boolean;
  hasConstructorDraft: boolean;
} {
  const files = options.files ?? [];
  const hasUploadedManuscript = files.some((f) => f.kind === "manuscript");
  const hasConstructorFile = files.some(
    (f) => f.kind === "manuscript_constructor",
  );
  const cc = options.constructorContent as ConstructorContent | null | undefined;
  const hasConstructorJson =
    cc != null &&
    Array.isArray(cc.sections) &&
    constructorDraftHasMeaningfulContent(cc);
  return {
    hasUploadedManuscript,
    hasConstructorDraft: hasConstructorFile || hasConstructorJson,
  };
}

export function reviewManuscriptPresentationStorageKey(slug: string): string {
  return `${STORAGE_PREFIX}:${slug}`;
}

export function readReviewManuscriptPresentation(
  slug: string,
): ReviewManuscriptPresentation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(
      reviewManuscriptPresentationStorageKey(slug),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReviewManuscriptPresentation;
    if (
      typeof parsed.presentUploaded === "boolean" &&
      typeof parsed.presentConstructor === "boolean"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeReviewManuscriptPresentation(
  slug: string,
  value: ReviewManuscriptPresentation,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      reviewManuscriptPresentationStorageKey(slug),
      JSON.stringify(value),
    );
  } catch {
    // ignore
  }
}

export function resolveDefaultReviewManuscriptPresentation(options: {
  hasUploadedManuscript: boolean;
  hasConstructorDraft: boolean;
}): ReviewManuscriptPresentation {
  const { hasUploadedManuscript, hasConstructorDraft } = options;
  if (hasConstructorDraft && !hasUploadedManuscript) {
    return { presentUploaded: false, presentConstructor: true };
  }
  if (hasUploadedManuscript && hasConstructorDraft) {
    return { presentUploaded: true, presentConstructor: true };
  }
  return {
    presentUploaded: hasUploadedManuscript,
    presentConstructor: hasConstructorDraft,
  };
}

export function presentationIsValid(
  value: ReviewManuscriptPresentation,
  options: { hasUploadedManuscript: boolean; hasConstructorDraft: boolean },
): boolean {
  if (!value.presentUploaded && !value.presentConstructor) return false;
  if (value.presentUploaded && !options.hasUploadedManuscript) return false;
  if (value.presentConstructor && !options.hasConstructorDraft) return false;
  return true;
}
