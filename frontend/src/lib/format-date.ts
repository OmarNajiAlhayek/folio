/** Locale-aware medium date for catalog and workflow UI. */
export function formatMediumDate(
  iso: string | null | undefined,
  locale: string,
): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    dateStyle: "medium",
  }).format(new Date(iso));
}
