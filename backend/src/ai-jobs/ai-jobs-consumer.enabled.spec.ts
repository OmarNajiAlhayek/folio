import { isAiJobsConsumerEnabled } from './ai-jobs-consumer.enabled';

describe('isAiJobsConsumerEnabled', () => {
  it('stays off when AI is off and the flag is unset', () => {
    expect(
      isAiJobsConsumerEnabled({
        consumerFlag: undefined,
        aiServiceEnabled: 'false',
      }),
    ).toBe(false);
  });

  it('turns on with the AI service when the flag is unset', () => {
    expect(
      isAiJobsConsumerEnabled({
        consumerFlag: undefined,
        aiServiceEnabled: 'true',
      }),
    ).toBe(true);
  });

  it('honors an explicit flag', () => {
    expect(
      isAiJobsConsumerEnabled({
        consumerFlag: 'true',
        aiServiceEnabled: 'false',
      }),
    ).toBe(true);
    expect(
      isAiJobsConsumerEnabled({
        consumerFlag: 'false',
        aiServiceEnabled: 'true',
      }),
    ).toBe(false);
  });
});
