import { z } from "zod";

export type ValidationTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function pathLabel(path: (string | number)[]): string | undefined {
  if (path.length === 0) return undefined;
  return path.map(String).join(".");
}

export function issueToMessage(
  t: ValidationTranslate,
  issue: z.ZodIssue,
  includePath = true,
): string {
  const pathStr = includePath ? pathLabel(issue.path) : undefined;
  const suffix = pathStr ? ` (${pathStr})` : "";

  switch (issue.code) {
    case z.ZodIssueCode.too_small: {
      if (issue.type === "string") {
        return t("minLength", { min: issue.minimum as number }) + suffix;
      }
      if (issue.type === "array") {
        return t("minItems", { min: issue.minimum as number }) + suffix;
      }
      return t("invalid") + suffix;
    }
    case z.ZodIssueCode.too_big: {
      if (issue.type === "string") {
        return t("maxLength", { max: issue.maximum as number }) + suffix;
      }
      if (issue.type === "array") {
        return t("maxItems", { max: issue.maximum as number }) + suffix;
      }
      return t("invalid") + suffix;
    }
    case z.ZodIssueCode.invalid_string: {
      if (issue.validation === "email") return t("email") + suffix;
      if (issue.validation === "uuid") return t("uuid") + suffix;
      return t("invalid") + suffix;
    }
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined") return t("required") + suffix;
      return t("invalid") + suffix;
    case z.ZodIssueCode.invalid_enum_value:
      return t("invalidEnum") + suffix;
    case z.ZodIssueCode.custom:
      if (issue.message === "reviewCommentsRequired") {
        return t("reviewCommentsRequired") + suffix;
      }
      if (issue.message === "orcidFormat") return t("orcidFormat") + suffix;
      if (issue.message === "abstractMaxWordsEn") {
        return t("abstractMaxWordsEn", { max: 300 }) + suffix;
      }
      if (issue.message === "abstractMaxWordsAr") {
        return t("abstractMaxWordsAr", { max: 300 }) + suffix;
      }
      return (issue.message && issue.message !== "custom"
        ? issue.message
        : t("invalid")) + suffix;
    default:
      return t("invalid") + suffix;
  }
}

export function formatZodIssues(
  t: ValidationTranslate,
  issues: z.ZodIssue[],
  includePath = true,
): string[] {
  return issues.map((issue) => issueToMessage(t, issue, includePath));
}

/** One human-readable message per top-level key (first path segment). */
export function firstIssueByTopLevelPath(
  t: ValidationTranslate,
  error: z.ZodError,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    const k = typeof key === "string" ? key : "_root";
    if (out[k]) continue;
    out[k] = issueToMessage(t, issue, false);
  }
  return out;
}

export function joinValidationBulletList(messages: string[]): string {
  if (messages.length === 0) return "";
  if (messages.length === 1) return messages[0];
  return messages.map((m) => `• ${m}`).join("\n");
}

export function safeParseResult<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
):
  | { ok: true; data: z.infer<T> }
  | { ok: false; error: z.ZodError } {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error };
}
