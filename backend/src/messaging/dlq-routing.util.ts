import type { GetMessage } from 'amqplib';
import { ROUTING_KEY } from './contracts/email-events';

const EVENT_TYPE_TO_ROUTING: Record<string, string> = {
  ReviewerInvited: ROUTING_KEY.reviewerInvited,
  ReminderDue: ROUTING_KEY.reminderDue,
  CopyeditAssigned: ROUTING_KEY.copyeditAssigned,
  CopyeditQueriesSent: ROUTING_KEY.copyeditQueriesSent,
  CopyeditAuthorReady: ROUTING_KEY.copyeditAuthorReady,
  SubmissionSubmitted: ROUTING_KEY.submissionSubmitted,
  SubmissionDecision: ROUTING_KEY.submissionDecision,
};

type XDeathEntry = {
  queue?: string;
  reason?: string;
  'routing-keys'?: string[];
  exchange?: string;
};

/**
 * Resolve the original topic routing key for a DLQ message so it can be
 * republished to `folio.events`.
 */
export function routingKeyFromDlqMessage(msg: GetMessage): string | null {
  const headers = msg.properties.headers ?? {};
  const deaths = headers['x-death'] as XDeathEntry[] | undefined;
  if (Array.isArray(deaths)) {
    for (const death of deaths) {
      const keys = death['routing-keys'];
      if (keys?.length) {
        const key = keys[0];
        if (key && !key.endsWith('.dead')) {
          return key;
        }
      }
    }
  }

  try {
    const body = JSON.parse(msg.content.toString('utf8')) as { type?: string };
    if (body.type && EVENT_TYPE_TO_ROUTING[body.type]) {
      return EVENT_TYPE_TO_ROUTING[body.type];
    }
  } catch {
    /* ignore parse errors */
  }

  const rk = msg.fields.routingKey;
  if (rk && !rk.endsWith('.dead') && rk !== '#' && !rk.includes('.dlq')) {
    return rk;
  }

  return null;
}
