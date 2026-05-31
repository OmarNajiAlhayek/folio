export const ADMIN_EMAIL_TEMPLATE_KEYS = [
  'reviewer-invited',
  'reminder-due',
  'copyedit-assigned',
  'copyedit-queries-sent',
  'copyedit-author-ready',
  'submission-submitted',
  'submission-decision',
  'review-submitted',
  'review-invitation-accepted',
  'review-invitation-declined',
  'submission-published',
  'role-invitation',
] as const;

export type AdminEmailTemplateKey =
  (typeof ADMIN_EMAIL_TEMPLATE_KEYS)[number];

export function isAdminEmailTemplateKey(
  key: string,
): key is AdminEmailTemplateKey {
  return (ADMIN_EMAIL_TEMPLATE_KEYS as readonly string[]).includes(key);
}
