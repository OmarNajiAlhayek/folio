import { DlqReplayService } from './dlq-replay.service';
import type { GetMessage } from 'amqplib';

describe('DlqReplayService', () => {
  it('returns empty when DLQ has no messages', async () => {
    const rabbit = {
      getFromDlq: jest.fn().mockResolvedValue(false),
    };
    const svc = new DlqReplayService(rabbit as never);
    const res = await svc.replayBatch(1);
    expect(res.empty).toBe(true);
    expect(res.replayed).toBe(0);
  });

  it('republishes and acks a valid DLQ message', async () => {
    const msg = {
      content: Buffer.from(JSON.stringify({ type: 'ReviewerInvited' })),
      fields: { routingKey: 'reviewer.invited.dead' },
      properties: {
        headers: { 'x-death': [{ 'routing-keys': ['reviewer.invited'] }] },
      },
    } as GetMessage;
    const publish = jest.fn().mockResolvedValue(undefined);
    const ackGetMessage = jest.fn();
    const rabbit = {
      getFromDlq: jest.fn().mockResolvedValueOnce(msg).mockResolvedValue(false),
      publish,
      ackGetMessage,
      nackGetMessage: jest.fn(),
    };
    const svc = new DlqReplayService(rabbit as never);
    const res = await svc.replayBatch(1);
    expect(res.replayed).toBe(1);
    expect(publish).toHaveBeenCalledWith(
      'reviewer.invited',
      expect.objectContaining({ type: 'ReviewerInvited' }),
    );
    expect(ackGetMessage).toHaveBeenCalledWith(msg);
  });
});
