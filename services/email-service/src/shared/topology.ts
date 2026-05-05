/**
 * Mirror of `packages/shared/messaging/topology.ts`. See the backend
 * mirror at `backend/src/messaging/shared/topology.ts`.
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
  reminderDueQueue: string;
};

export const DEFAULT_TOPOLOGY: TopologyNames = {
  exchange: 'folio.events',
  dlx: 'folio.events.dlx',
  dlq: 'folio.events.dlq',
  reviewerInvitedQueue: 'email.reviewer_invited',
  reminderDueQueue: 'email.reminder_due',
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
}
