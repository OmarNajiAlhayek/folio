export const SUBMISSION_FILE_KINDS = [
  'manuscript',
  /** Generated from Word Constructor; coexists with uploaded `manuscript`. */
  'manuscript_constructor',
  'cover_letter',
  'title_page',
  'figure',
  'table',
  'supplementary',
] as const;

export type SubmissionFileKind = (typeof SUBMISSION_FILE_KINDS)[number];

export function normalizeSubmissionFileKind(
  raw: string | undefined,
): SubmissionFileKind {
  const k = (raw ?? 'manuscript').trim().toLowerCase();
  if ((SUBMISSION_FILE_KINDS as readonly string[]).includes(k)) {
    return k as SubmissionFileKind;
  }
  return 'manuscript';
}
