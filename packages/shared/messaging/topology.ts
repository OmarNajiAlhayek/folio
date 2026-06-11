/**
 * RabbitMQ topology declaration. Both backend and email-service call
 * `assertTopology(channel)` on bootstrap so the exchange / DLX / queues /
 * bindings are guaranteed to match the spec in plan §6a — without this
 * helper, two repos could silently disagree.
 *
 * Idempotent: amqplib's assertExchange / assertQueue / bindQueue are
 * safe to re-run with identical arguments.
 *
 * Typed against amqplib's Channel via a structural duck-typed interface
 * so this file does not import amqplib directly (keeps `packages/shared`
 * runtime-dep-free; each app brings its own amqplib).
 */

export type AssertableChannel = {
  assertExchange(
    exchange: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  assertQueue(
    queue: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  bindQueue(
    queue: string,
    source: string,
    pattern: string,
    args?: Record<string, unknown>,
  ): Promise<unknown>;
};

export type TopologyNames = {
  exchange: string;
  dlx: string;
  dlq: string;
  reviewerInvitedQueue: string;
  reviewerRespondedQueue: string;
  reminderDueQueue: string;
  copyeditAssignedQueue: string;
  copyeditQueriesSentQueue: string;
  copyeditAuthorReadyQueue: string;
  submissionSubmittedQueue: string;
  submissionDecisionQueue: string;
  submissionUnderReviewQueue: string;
  submissionPublishedQueue: string;
  reviewSubmittedQueue: string;
  reviewInvitationAcceptedQueue: string;
  reviewInvitationDeclinedQueue: string;
  roleInvitationQueue: string;
  authVerificationOtpQueue: string;
  authPasswordResetQueue: string;
  authRegistrationWelcomeQueue: string;
  aiSimilarityIndexQueue: string;
  aiCorpusSimilarityQueue: string;
};

export const DEFAULT_TOPOLOGY: TopologyNames = {
  exchange: 'folio.events',
  dlx: 'folio.events.dlx',
  dlq: 'folio.events.dlq',
  reviewerInvitedQueue: 'email.reviewer_invited',
  reviewerRespondedQueue: 'email.reviewer_responded',
  reminderDueQueue: 'email.reminder_due',
  copyeditAssignedQueue: 'email.copyedit_assigned',
  copyeditQueriesSentQueue: 'email.copyedit_queries_sent',
  copyeditAuthorReadyQueue: 'email.copyedit_author_ready',
  submissionSubmittedQueue: 'email.submission_submitted',
  submissionDecisionQueue: 'email.submission_decision',
  submissionUnderReviewQueue: 'email.submission_under_review',
  submissionPublishedQueue: 'email.submission_published',
  reviewSubmittedQueue: 'email.review_submitted',
  reviewInvitationAcceptedQueue: 'email.review_invitation_accepted',
  reviewInvitationDeclinedQueue: 'email.review_invitation_declined',
  roleInvitationQueue: 'email.role_invitation',
  authVerificationOtpQueue: 'email.auth_verification_otp',
  authPasswordResetQueue: 'email.auth_password_reset',
  authRegistrationWelcomeQueue: 'email.auth_registration_welcome',
  aiSimilarityIndexQueue: 'ai.similarity_index',
  aiCorpusSimilarityQueue: 'ai.corpus_similarity',
};

export async function assertTopology(
  channel: AssertableChannel,
  names: TopologyNames = DEFAULT_TOPOLOGY,
): Promise<void> {
  await channel.assertExchange(names.exchange, 'topic', { durable: true });
  await channel.assertExchange(names.dlx, 'topic', { durable: true });

  await channel.assertQueue(names.dlq, { durable: true });
  await channel.bindQueue(names.dlq, names.dlx, '#');

  await channel.assertQueue(names.reviewerInvitedQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'reviewer.invited.dead',
    },
  });
  await channel.bindQueue(
    names.reviewerInvitedQueue,
    names.exchange,
    'reviewer.invited',
  );

  await channel.assertQueue(names.reviewerRespondedQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'reviewer.responded.dead',
    },
  });
  await channel.bindQueue(
    names.reviewerRespondedQueue,
    names.exchange,
    'reviewer.responded',
  );

  await channel.assertQueue(names.reminderDueQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'reminder.due.dead',
    },
  });
  await channel.bindQueue(
    names.reminderDueQueue,
    names.exchange,
    'reminder.due',
  );

  await channel.assertQueue(names.copyeditAssignedQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'copyedit.assigned.dead',
    },
  });
  await channel.bindQueue(
    names.copyeditAssignedQueue,
    names.exchange,
    'copyedit.assigned',
  );

  await channel.assertQueue(names.copyeditQueriesSentQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'copyedit.queries_sent.dead',
    },
  });
  await channel.bindQueue(
    names.copyeditQueriesSentQueue,
    names.exchange,
    'copyedit.queries_sent',
  );

  await channel.assertQueue(names.copyeditAuthorReadyQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'copyedit.author_ready.dead',
    },
  });
  await channel.bindQueue(
    names.copyeditAuthorReadyQueue,
    names.exchange,
    'copyedit.author_ready',
  );

  await channel.assertQueue(names.submissionSubmittedQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'submission.submitted.dead',
    },
  });
  await channel.bindQueue(
    names.submissionSubmittedQueue,
    names.exchange,
    'submission.submitted',
  );

  await channel.assertQueue(names.submissionDecisionQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'submission.decision.dead',
    },
  });
  await channel.bindQueue(
    names.submissionDecisionQueue,
    names.exchange,
    'submission.decision',
  );

  await channel.assertQueue(names.submissionUnderReviewQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'submission.under_review.dead',
    },
  });
  await channel.bindQueue(
    names.submissionUnderReviewQueue,
    names.exchange,
    'submission.under_review',
  );

  await channel.assertQueue(names.submissionPublishedQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'submission.published.dead',
    },
  });
  await channel.bindQueue(
    names.submissionPublishedQueue,
    names.exchange,
    'submission.published',
  );

  await channel.assertQueue(names.reviewSubmittedQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'review.submitted.dead',
    },
  });
  await channel.bindQueue(
    names.reviewSubmittedQueue,
    names.exchange,
    'review.submitted',
  );

  await channel.assertQueue(names.reviewInvitationAcceptedQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'review.invitation_accepted.dead',
    },
  });
  await channel.bindQueue(
    names.reviewInvitationAcceptedQueue,
    names.exchange,
    'review.invitation_accepted',
  );

  await channel.assertQueue(names.reviewInvitationDeclinedQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'review.invitation_declined.dead',
    },
  });
  await channel.bindQueue(
    names.reviewInvitationDeclinedQueue,
    names.exchange,
    'review.invitation_declined',
  );

  await channel.assertQueue(names.roleInvitationQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'role.invitation.dead',
    },
  });
  await channel.bindQueue(
    names.roleInvitationQueue,
    names.exchange,
    'role.invitation',
  );

  await channel.assertQueue(names.authVerificationOtpQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'auth.verification_otp.dead',
    },
  });
  await channel.bindQueue(
    names.authVerificationOtpQueue,
    names.exchange,
    'auth.verification_otp',
  );

  await channel.assertQueue(names.authPasswordResetQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'auth.password_reset.dead',
    },
  });
  await channel.bindQueue(
    names.authPasswordResetQueue,
    names.exchange,
    'auth.password_reset',
  );

  await channel.assertQueue(names.authRegistrationWelcomeQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'auth.registration_welcome.dead',
    },
  });
  await channel.bindQueue(
    names.authRegistrationWelcomeQueue,
    names.exchange,
    'auth.registration_welcome',
  );

  await channel.assertQueue(names.aiSimilarityIndexQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'ai.similarity_index.dead',
    },
  });
  await channel.bindQueue(
    names.aiSimilarityIndexQueue,
    names.exchange,
    'ai.similarity_index.requested',
  );

  await channel.assertQueue(names.aiCorpusSimilarityQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': names.dlx,
      'x-dead-letter-routing-key': 'ai.corpus_similarity.dead',
    },
  });
  await channel.bindQueue(
    names.aiCorpusSimilarityQueue,
    names.exchange,
    'ai.corpus_similarity.requested',
  );
}
