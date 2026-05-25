import type { ConstructorContent } from "@/lib/constructor-content.types";

export function sanitizeConstructorFileNamePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Display name for a constructor-generated main manuscript `.docx`. */
export function resolveConstructorDocxFileName(
  content: ConstructorContent | null | undefined,
): string {
  const sections = content?.sections ?? [];
  const arabicTitle = sections.find(
    (s) =>
      s.kind === "title" &&
      typeof (s as { lang?: string }).lang === "string" &&
      (s as { lang?: string }).lang === "ar" &&
      typeof (s as { text?: string }).text === "string" &&
      (s as { text?: string }).text?.trim(),
  ) as { text?: string } | undefined;
  const fallbackArabicName = "مقال-منشئ-وورد";
  const base = sanitizeConstructorFileNamePart(
    arabicTitle?.text ?? fallbackArabicName,
  );
  return `${base || fallbackArabicName}.docx`;
}

export function constructorDraftHasSections(
  content: ConstructorContent | null | undefined,
): boolean {
  return Array.isArray(content?.sections) && content.sections.length > 0;
}
