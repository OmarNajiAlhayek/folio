import { apiJson } from "@/lib/api";
import type { ConstructorContent } from "@/lib/constructor-content.types";

/**
 * Build a journal-styled `.docx` from constructor JSON and store it as the
 * submission's `manuscript` file (replaces any existing manuscript).
 */
export async function attachConstructorManuscript(
  slug: string,
  content: ConstructorContent,
  options?: { preserveUploadedManuscript?: boolean },
): Promise<void> {
  const enc = encodeURIComponent(slug);
  const attachKind = options?.preserveUploadedManuscript
    ? "manuscript_constructor"
    : "manuscript";
  await apiJson(`/submissions/${enc}/generate-docx?attach=true`, {
    method: "POST",
    body: JSON.stringify({ content, attach: true, attachKind }),
  });
}

/**
 * Submit for review. Constructor submissions send optional `constructorContent`
 * in the body so the server can validate and attach the manuscript `.docx` in
 * one step (no separate generate-docx call).
 */
export async function submitSubmissionForReview(
  slug: string,
  options?: {
    constructorContent?: ConstructorContent | null;
    /** @deprecated Use presentation checkboxes */
    useUploadedManuscript?: boolean;
    presentUploadedManuscript?: boolean;
    presentConstructorManuscript?: boolean;
  },
): Promise<void> {
  const enc = encodeURIComponent(slug);
  const cc = options?.constructorContent;
  const explicitPresentation =
    options?.presentUploadedManuscript !== undefined ||
    options?.presentConstructorManuscript !== undefined;
  const body = explicitPresentation
    ? JSON.stringify({
        presentUploadedManuscript: options?.presentUploadedManuscript === true,
        presentConstructorManuscript:
          options?.presentConstructorManuscript === true,
        ...(cc && Array.isArray(cc.sections) ? { constructorContent: cc } : {}),
      })
    : options?.useUploadedManuscript === true
      ? JSON.stringify({ useUploadedManuscript: true })
      : cc && Array.isArray(cc.sections)
        ? JSON.stringify({ constructorContent: cc })
        : undefined;
  await apiJson(`/submissions/${enc}/submit`, {
    method: "POST",
    body,
  });
}
