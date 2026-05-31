export const NOTIFICATION_TYPE = {
  REVIEWER_INVITED: 'reviewer_invited',
  SUBMISSION_SUBMITTED: 'submission_submitted',
  SUBMISSION_DECISION: 'submission_decision',
  COPYEDIT_ASSIGNED: 'copyedit_assigned',
  COPYEDIT_QUERIES_SENT: 'copyedit_queries_sent',
  COPYEDIT_AUTHOR_READY: 'copyedit_author_ready',
  REVIEW_INVITATION_ACCEPTED: 'review_invitation_accepted',
  REVIEW_INVITATION_DECLINED: 'review_invitation_declined',
  REVIEW_SUBMITTED: 'review_submitted',
  ROLE_INVITATION_CREATED: 'role_invitation_created',
  SUBMISSION_PUBLISHED: 'submission_published',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const NOTIFICATION_I18N: Record<
  NotificationType,
  { titleKey: string; bodyKey: string }
> = {
  [NOTIFICATION_TYPE.REVIEWER_INVITED]: {
    titleKey: 'Notifications.reviewerInvited.title',
    bodyKey: 'Notifications.reviewerInvited.body',
  },
  [NOTIFICATION_TYPE.SUBMISSION_SUBMITTED]: {
    titleKey: 'Notifications.submissionSubmitted.title',
    bodyKey: 'Notifications.submissionSubmitted.body',
  },
  [NOTIFICATION_TYPE.SUBMISSION_DECISION]: {
    titleKey: 'Notifications.submissionDecision.title',
    bodyKey: 'Notifications.submissionDecision.body',
  },
  [NOTIFICATION_TYPE.COPYEDIT_ASSIGNED]: {
    titleKey: 'Notifications.copyeditAssigned.title',
    bodyKey: 'Notifications.copyeditAssigned.body',
  },
  [NOTIFICATION_TYPE.COPYEDIT_QUERIES_SENT]: {
    titleKey: 'Notifications.copyeditQueries.title',
    bodyKey: 'Notifications.copyeditQueries.body',
  },
  [NOTIFICATION_TYPE.COPYEDIT_AUTHOR_READY]: {
    titleKey: 'Notifications.copyeditAuthorReady.title',
    bodyKey: 'Notifications.copyeditAuthorReady.body',
  },
  [NOTIFICATION_TYPE.REVIEW_INVITATION_ACCEPTED]: {
    titleKey: 'Notifications.reviewAccepted.title',
    bodyKey: 'Notifications.reviewAccepted.body',
  },
  [NOTIFICATION_TYPE.REVIEW_INVITATION_DECLINED]: {
    titleKey: 'Notifications.reviewDeclined.title',
    bodyKey: 'Notifications.reviewDeclined.body',
  },
  [NOTIFICATION_TYPE.REVIEW_SUBMITTED]: {
    titleKey: 'Notifications.reviewSubmitted.title',
    bodyKey: 'Notifications.reviewSubmitted.body',
  },
  [NOTIFICATION_TYPE.ROLE_INVITATION_CREATED]: {
    titleKey: 'Notifications.roleInvitation.title',
    bodyKey: 'Notifications.roleInvitation.body',
  },
  [NOTIFICATION_TYPE.SUBMISSION_PUBLISHED]: {
    titleKey: 'Notifications.submissionPublished.title',
    bodyKey: 'Notifications.submissionPublished.body',
  },
};
