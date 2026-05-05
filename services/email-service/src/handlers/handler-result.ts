/**
 * Internal result enum returned by the per-event handler. The bridge
 * (`ConsumersService`) translates it to the right ack/nack call so the
 * state-machine logic stays free of amqplib types.
 */
export type HandlerOutcome =
  | { kind: 'ack' }
  | { kind: 'nack-no-requeue'; reason: string };

export const ACK: HandlerOutcome = { kind: 'ack' };
