import { apiJson, apiPostJsonOrBlob } from "@/lib/api";
import type { ConstructorContent } from "@/lib/constructor-content.types";

/**
 * Build a journal-styled `.docx` from constructor JSON and store it as the
 * submission's `manuscript` file (replaces any existing manuscript).
 */
export async function attachConstructorManuscript(
  slug: string,
  content: ConstructorContent,
): Promise<void> {
  const enc = encodeURIComponent(slug);
  await apiPostJsonOrBlob(
    `/submissions/${enc}/generate-docx?attach=true`,
    { content, attach: true },
  );
}

/**
 * Submit for review. When constructor content is present, attaches a fresh
 * manuscript `.docx` first so server file validation succeeds.
 */
export async function submitSubmissionForReview(
  slug: string,
  options?: { constructorContent?: ConstructorContent | null },
): Promise<void> {
  if (options?.constructorContent) {
    await attachConstructorManuscript(slug, options.constructorContent);
  }
  await apiJson(`/submissions/${encodeURIComponent(slug)}/submit`, {
    method: "POST",
  });
}
