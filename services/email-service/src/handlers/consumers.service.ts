import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';
import { RabbitMqConnection } from '../amqp/rabbitmq.connection';
import {
  FolioEvent,
  ReminderDueEvent,
  ReviewerInvitedEvent,
  ReviewerRespondedEvent,
  CopyeditAssignedEvent,
  CopyeditQueriesSentEvent,
  CopyeditAuthorReadyEvent,
  SubmissionSubmittedEvent,
  SubmissionDecisionEvent,
  SubmissionUnderReviewEvent,
  ReviewSubmittedEvent,
  ReviewInvitationAcceptedEvent,
  ReviewInvitationDeclinedEvent,
  SubmissionPublishedEvent,
  RoleInvitationCreatedEvent,
  AuthVerificationOtpEvent,
  AuthPasswordResetEvent,
  AuthRegistrationWelcomeEvent,
  ROUTING_KEY,
} from '@folio/shared/contracts/email-events';
import { redactEventPayload } from '@folio/shared/messaging/redactor';
import { ReviewerInvitedHandler } from './reviewer-invited.handler';
import { ReviewerRespondedHandler } from './reviewer-responded.handler';
import { ReminderDueHandler } from './reminder-due.handler';
import { CopyeditAssignedHandler } from './copyedit-assigned.handler';
import { CopyeditQueriesSentHandler } from './copyedit-queries-sent.handler';
import { CopyeditAuthorReadyHandler } from './copyedit-author-ready.handler';
import { SubmissionSubmittedHandler } from './submission-submitted.handler';
import { SubmissionDecisionHandler } from './submission-decision.handler';
import { SubmissionUnderReviewHandler } from './submission-under-review.handler';
import { Phase3WorkflowHandlers } from './phase3-workflow.handlers';
import { AuthEmailHandler } from './auth-email.handler';
import { HandlerOutcome } from './handler-result';

@Injectable()
export class ConsumersService implements OnModuleInit {
  private readonly logger = new Logger(ConsumersService.name);

  constructor(
    private readonly rabbit: RabbitMqConnection,
    private readonly reviewerInvited: ReviewerInvitedHandler,
    private readonly reviewerResponded: ReviewerRespondedHandler,
    private readonly reminderDue: ReminderDueHandler,
    private readonly copyeditAssigned: CopyeditAssignedHandler,
    private readonly copyeditQueriesSent: CopyeditQueriesSentHandler,
    private readonly copyeditAuthorReady: CopyeditAuthorReadyHandler,
    private readonly submissionSubmitted: SubmissionSubmittedHandler,
    private readonly submissionDecision: SubmissionDecisionHandler,
    private readonly submissionUnderReview: SubmissionUnderReviewHandler,
    private readonly phase3: Phase3WorkflowHandlers,
    private readonly authEmail: AuthEmailHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    const topology = this.rabbit.getTopology();

    await this.rabbit.consume(topology.reviewerInvitedQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.reviewerInvited),
    );
    await this.rabbit.consume(topology.reviewerRespondedQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.reviewerResponded),
    );
    await this.rabbit.consume(topology.reminderDueQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.reminderDue),
    );
    await this.rabbit.consume(topology.copyeditAssignedQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.copyeditAssigned),
    );
    await this.rabbit.consume(topology.copyeditQueriesSentQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.copyeditQueriesSent),
    );
    await this.rabbit.consume(topology.copyeditAuthorReadyQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.copyeditAuthorReady),
    );
    await this.rabbit.consume(topology.submissionSubmittedQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.submissionSubmitted),
    );
    await this.rabbit.consume(topology.submissionDecisionQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.submissionDecision),
    );
    await this.rabbit.consume(topology.submissionUnderReviewQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.submissionUnderReview),
    );
    await this.rabbit.consume(topology.submissionPublishedQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.submissionPublished),
    );
    await this.rabbit.consume(topology.reviewSubmittedQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.reviewSubmitted),
    );
    await this.rabbit.consume(topology.reviewInvitationAcceptedQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.reviewInvitationAccepted),
    );
    await this.rabbit.consume(topology.reviewInvitationDeclinedQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.reviewInvitationDeclined),
    );
    await this.rabbit.consume(topology.roleInvitationQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.roleInvitation),
    );
    await this.rabbit.consume(topology.authVerificationOtpQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.authVerificationOtp),
    );
    await this.rabbit.consume(topology.authPasswordResetQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.authPasswordReset),
    );
    await this.rabbit.consume(topology.authRegistrationWelcomeQueue, (msg) =>
      this.dispatch(msg, ROUTING_KEY.authRegistrationWelcome),
    );
  }

  private async dispatch(
    msg: ConsumeMessage,
    routingKey: string,
  ): Promise<void> {
    let event: FolioEvent;
    try {
      event = JSON.parse(msg.content.toString('utf8')) as FolioEvent;
    } catch (err) {
      this.logger.warn(
        `unparseable message routingKey=${routingKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.rabbit.nack(msg, false);
      return;
    }
    this.logger.debug(
      `received routingKey=${routingKey} ${JSON.stringify(redactEventPayload(event))}`,
    );

    let outcome: HandlerOutcome;
    try {
      if (
        routingKey === ROUTING_KEY.reviewerInvited &&
        event.type === 'ReviewerInvited'
      ) {
        outcome = await this.reviewerInvited.handle(
          event as ReviewerInvitedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.reviewerResponded &&
        event.type === 'ReviewerResponded'
      ) {
        outcome = await this.reviewerResponded.handle(
          event as ReviewerRespondedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.reminderDue &&
        event.type === 'ReminderDue'
      ) {
        outcome = await this.reminderDue.handle(event as ReminderDueEvent);
      } else if (
        routingKey === ROUTING_KEY.copyeditAssigned &&
        event.type === 'CopyeditAssigned'
      ) {
        outcome = await this.copyeditAssigned.handle(
          event as CopyeditAssignedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.copyeditQueriesSent &&
        event.type === 'CopyeditQueriesSent'
      ) {
        outcome = await this.copyeditQueriesSent.handle(
          event as CopyeditQueriesSentEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.copyeditAuthorReady &&
        event.type === 'CopyeditAuthorReady'
      ) {
        outcome = await this.copyeditAuthorReady.handle(
          event as CopyeditAuthorReadyEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.submissionSubmitted &&
        event.type === 'SubmissionSubmitted'
      ) {
        outcome = await this.submissionSubmitted.handle(
          event as SubmissionSubmittedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.submissionDecision &&
        event.type === 'SubmissionDecision'
      ) {
        outcome = await this.submissionDecision.handle(
          event as SubmissionDecisionEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.submissionUnderReview &&
        event.type === 'SubmissionUnderReview'
      ) {
        outcome = await this.submissionUnderReview.handle(
          event as SubmissionUnderReviewEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.submissionPublished &&
        event.type === 'SubmissionPublished'
      ) {
        outcome = await this.phase3.handleSubmissionPublished(
          event as SubmissionPublishedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.reviewSubmitted &&
        event.type === 'ReviewSubmitted'
      ) {
        outcome = await this.phase3.handleReviewSubmitted(
          event as ReviewSubmittedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.reviewInvitationAccepted &&
        event.type === 'ReviewInvitationAccepted'
      ) {
        outcome = await this.phase3.handleReviewInvitationAccepted(
          event as ReviewInvitationAcceptedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.reviewInvitationDeclined &&
        event.type === 'ReviewInvitationDeclined'
      ) {
        outcome = await this.phase3.handleReviewInvitationDeclined(
          event as ReviewInvitationDeclinedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.roleInvitation &&
        event.type === 'RoleInvitationCreated'
      ) {
        outcome = await this.phase3.handleRoleInvitation(
          event as RoleInvitationCreatedEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.authVerificationOtp &&
        event.type === 'AuthVerificationOtp'
      ) {
        outcome = await this.authEmail.handleVerificationOtp(
          event as AuthVerificationOtpEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.authPasswordReset &&
        event.type === 'AuthPasswordReset'
      ) {
        outcome = await this.authEmail.handlePasswordReset(
          event as AuthPasswordResetEvent,
        );
      } else if (
        routingKey === ROUTING_KEY.authRegistrationWelcome &&
        event.type === 'AuthRegistrationWelcome'
      ) {
        outcome = await this.authEmail.handleRegistrationWelcome(
          event as AuthRegistrationWelcomeEvent,
        );
      } else {
        outcome = {
          kind: 'nack-no-requeue',
          reason: `routing key / event type mismatch ${routingKey}/${event.type}`,
        };
      }
    } catch (err) {
      this.logger.error(
        `handler crashed routingKey=${routingKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.rabbit.nack(msg, false);
      return;
    }

    if (outcome.kind === 'ack') {
      this.rabbit.ack(msg);
    } else {
      this.logger.warn(
        `dead-letter routingKey=${routingKey} reason=${outcome.reason}`,
      );
      this.rabbit.nack(msg, false);
    }
  }
}
