export const queryKeys = {
  me: ["auth", "me"] as const,
  notificationsUnread: ["notifications", "unread-count"] as const,
  notifications: (filter: string, cursor?: string) =>
    cursor
      ? (["notifications", "list", filter, cursor] as const)
      : (["notifications", "list", filter] as const),
  submissions: (status?: string) =>
    status ? (["submissions", status] as const) : (["submissions"] as const),
  submission: (slug: string) => ["submission", slug] as const,
  submissionDetail: (slug: string) => ["submissionDetail", slug] as const,
};
