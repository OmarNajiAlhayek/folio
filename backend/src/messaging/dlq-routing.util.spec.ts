import type { GetMessage } from 'amqplib';
import { routingKeyFromDlqMessage } from './dlq-routing.util';

function dlqMsg(
  partial: Partial<GetMessage> & {
    body?: Record<string, unknown>;
    routingKey?: string;
    xDeathRoutingKeys?: string[];
  },
): GetMessage {
  const routingKey = partial.routingKey ?? 'reviewer.invited.dead';
  return {
    content: Buffer.from(
      JSON.stringify(partial.body ?? { type: 'ReviewerInvited' }),
    ),
    fields: {
      deliveryTag: 1,
      redelivered: false,
      exchange: 'folio.events.dlx',
      routingKey,
      messageCount: 0,
    },
    properties: {
      headers: partial.xDeathRoutingKeys
        ? {
            'x-death': [
              { 'routing-keys': partial.xDeathRoutingKeys, reason: 'rejected' },
            ],
          }
        : {},
    },
  } as GetMessage;
}

describe('routingKeyFromDlqMessage', () => {
  it('reads routing key from x-death headers', () => {
    expect(
      routingKeyFromDlqMessage(
        dlqMsg({ xDeathRoutingKeys: ['copyedit.assigned'] }),
      ),
    ).toBe('copyedit.assigned');
  });

  it('maps event type from JSON body when headers are missing', () => {
    expect(
      routingKeyFromDlqMessage(
        dlqMsg({
          routingKey: 'folio.events.dlq',
          body: { type: 'SubmissionDecision' },
        }),
      ),
    ).toBe('submission.decision');
  });
});
