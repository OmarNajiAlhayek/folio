import { ReminderAdminService } from './reminder-admin.service';

describe('ReminderAdminService.cancelAllPendingForAssignment', () => {
  it('returns cancelled row count from UPDATE', async () => {
    const query = jest.fn().mockResolvedValue([[], 2]);
    const service = new ReminderAdminService({
      query,
    } as unknown as ConstructorParameters<typeof ReminderAdminService>[0]);

    await expect(
      service.cancelAllPendingForAssignment('asg-1'),
    ).resolves.toEqual({ cancelledCount: 2 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`status = 'cancelled'`),
      ['asg-1'],
    );
  });

  it('returns zero when no rows matched', async () => {
    const query = jest.fn().mockResolvedValue([[], 0]);
    const service = new ReminderAdminService({
      query,
    } as unknown as ConstructorParameters<typeof ReminderAdminService>[0]);

    await expect(
      service.cancelAllPendingForAssignment('asg-missing'),
    ).resolves.toEqual({ cancelledCount: 0 });
  });
});
