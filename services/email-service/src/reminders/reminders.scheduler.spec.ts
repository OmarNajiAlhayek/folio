import { RemindersScheduler } from './reminders.scheduler';
import { ROUTING_KEY } from '../contracts/email-events';
import { reminderDueKey } from '../shared/idempotency';

describe('RemindersScheduler', () => {
  it('tick does not publish when no due reminders', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const publish = jest.fn();
    const scheduler = new RemindersScheduler(
      { query } as never,
      { publish } as never,
    );

    await scheduler.tick();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      expect.any(Array),
    );
    expect(publish).not.toHaveBeenCalled();
  });

  it('unwraps TypeORM Postgres UPDATE result tuple [rows, rowCount]', async () => {
    const reminder = {
      id: 'r1',
      assignment_slug: 'asg',
      submission_title: 'My paper',
      email_locale: 'en',
      reviewer_id: 'u1',
      reviewer_email: 'e@test.dev',
      reviewer_display_name: 'Rev',
      kind: 'review_due_soon',
      send_at: new Date('2020-01-01'),
      status: 'pending',
    };
    const query = jest.fn().mockResolvedValue([[reminder], 1]);
    const publish = jest.fn().mockResolvedValue(undefined);

    const scheduler = new RemindersScheduler(
      { query } as never,
      { publish } as never,
    );

    await scheduler.tick();

    expect(publish).toHaveBeenCalledWith(
      ROUTING_KEY.reminderDue,
      expect.objectContaining({ reminderId: 'r1' }),
    );
  });

  it('tick publishes reminder.due for claimed rows', async () => {
    const reminder = {
      id: 'r1',
      assignment_slug: 'asg',
      submission_title: 'My paper',
      email_locale: 'en',
      reviewer_id: 'u1',
      reviewer_email: 'e@test.dev',
      reviewer_display_name: 'Rev',
      kind: 'review_due_soon',
      send_at: new Date('2020-01-01'),
      status: 'pending',
    };
    const query = jest.fn().mockResolvedValue([reminder]);
    const publish = jest.fn().mockResolvedValue(undefined);

    const scheduler = new RemindersScheduler(
      { query } as never,
      { publish } as never,
    );

    await scheduler.tick();

    expect(publish).toHaveBeenCalledWith(
      ROUTING_KEY.reminderDue,
      expect.objectContaining({
        type: 'ReminderDue',
        reminderId: 'r1',
        submissionTitle: 'My paper',
        idempotencyKey: reminderDueKey('r1'),
      }),
    );
  });

  it('tick clears picked_at when publish fails', async () => {
    const reminder = {
      id: 'r2',
      assignment_slug: 'asg',
      submission_title: '',
      email_locale: 'en',
      reviewer_id: 'u1',
      reviewer_email: 'e@test.dev',
      reviewer_display_name: 'Rev',
      kind: 'review_overdue',
      send_at: new Date('2020-01-01'),
      status: 'pending',
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([reminder])
      .mockResolvedValueOnce(undefined);
    const publish = jest.fn().mockRejectedValue(new Error('broker down'));

    const scheduler = new RemindersScheduler(
      { query } as never,
      { publish } as never,
    );

    await scheduler.tick();

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toContain('picked_at" = NULL');
  });
});
