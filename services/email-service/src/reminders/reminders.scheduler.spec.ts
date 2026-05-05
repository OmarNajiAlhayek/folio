import { RemindersScheduler } from './reminders.scheduler';
import { Reminder } from './reminder.entity';
import { ROUTING_KEY } from '../contracts/email-events';
import { reminderDueKey } from '../shared/idempotency';

describe('RemindersScheduler', () => {
  it('tick does not publish when no due reminders', async () => {
    const remindersRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const publish = jest.fn();
    const rabbit = { publish };

    const scheduler = new RemindersScheduler(
      remindersRepo as unknown as import('typeorm').Repository<Reminder>,
      rabbit as unknown as import('../amqp/rabbitmq.connection').RabbitMqConnection,
    );

    await scheduler.tick();

    expect(remindersRepo.find).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('tick publishes reminder.due for due pending rows', async () => {
    const reminder = {
      id: 'r1',
      assignmentSlug: 'asg',
      reviewerId: 'u1',
      reviewerEmail: 'e@test.dev',
      reviewerDisplayName: 'Rev',
      kind: 'review_due_soon' as const,
      sendAt: new Date('2020-01-01'),
      status: 'pending' as const,
    };

    const find = jest.fn().mockResolvedValue([reminder]);
    const remindersRepo = {
      find,
    };

    const publish = jest.fn().mockResolvedValue(undefined);
    const rabbit = { publish };

    const scheduler = new RemindersScheduler(
      remindersRepo as unknown as import('typeorm').Repository<Reminder>,
      rabbit as unknown as import('../amqp/rabbitmq.connection').RabbitMqConnection,
    );

    await scheduler.tick();

    expect(find).toHaveBeenCalled();
    const call = find.mock.calls[0]?.[0] as { take?: number; order?: object };
    expect(call?.take).toBe(50);
    expect(call?.order).toEqual({ sendAt: 'ASC' });
    expect(publish).toHaveBeenCalledWith(
      ROUTING_KEY.reminderDue,
      expect.objectContaining({
        type: 'ReminderDue',
        reminderId: 'r1',
        idempotencyKey: reminderDueKey('r1'),
      }),
    );
  });

  it('tick swallows publish errors', async () => {
    const reminder = {
      id: 'r2',
      assignmentSlug: 'asg',
      reviewerId: 'u1',
      reviewerEmail: 'e@test.dev',
      reviewerDisplayName: 'Rev',
      kind: 'review_overdue' as const,
      sendAt: new Date('2020-01-01'),
      status: 'pending' as const,
    };

    const remindersRepo = {
      find: jest.fn().mockResolvedValue([reminder]),
    };

    const rabbit = {
      publish: jest.fn().mockRejectedValue(new Error('broker down')),
    };

    const scheduler = new RemindersScheduler(
      remindersRepo as unknown as import('typeorm').Repository<Reminder>,
      rabbit as unknown as import('../amqp/rabbitmq.connection').RabbitMqConnection,
    );

    await expect(scheduler.tick()).resolves.toBeUndefined();
  });
});
