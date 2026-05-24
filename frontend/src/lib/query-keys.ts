export const queryKeys = {
  me: ["auth", "me"] as const,
  submissions: (status?: string) =>
    status ? (["submissions", status] as const) : (["submissions"] as const),
  submission: (slug: string) => ["submission", slug] as const,
  submissionDetail: (slug: string) => ["submissionDetail", slug] as const,
};
