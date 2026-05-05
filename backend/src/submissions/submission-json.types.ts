/** Stored in `submissions.contributors` (JSONB). */
export type SubmissionContributorJson = {
  fullName: string;
  email?: string;
  affiliation: string;
  sortOrder: number;
  isCorresponding: boolean;
};
