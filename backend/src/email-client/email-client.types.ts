export type ReminderPolicyView = {
  id: number;
  reviewDueInDays: number;
  updatedAt: string;
};

export type EmailTemplateView = {
  templateKey: string;
  locale: string;
  subjectTemplate: string;
  htmlBody: string;
  textBody: string;
  updatedAt: string;
};

export type RenderedTemplateView = {
  subject: string;
  html: string;
  text: string;
};

export type ReminderAdminDto = {
  id: string;
  assignmentSlug: string;
  reviewerId: string;
  reviewerEmail: string;
  reviewerDisplayName: string;
  kind: string;
  sendAt: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
};

export type EmailLogStatusCount = {
  pending: number;
  sent: number;
  failed: number;
};

export type FailedEmailSample = {
  id: string;
  idempotencyKey: string;
  template: string;
  createdAt: string;
  errorRedacted: string | null;
};

export type ReminderStatusCount = {
  pending: number;
  sent: number;
  cancelled: number;
};

export type EmailPipelineSlice = {
  emailLog: {
    counts: EmailLogStatusCount;
    failedSample: FailedEmailSample[];
  };
  reminders: {
    counts: ReminderStatusCount;
    stuckPendingPastDue: number;
  };
};
