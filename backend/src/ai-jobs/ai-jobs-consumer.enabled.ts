/**
 * The in-process AI worker needs RabbitMQ. A frontend + backend deploy
 * leaves `AI_SERVICE_ENABLED` off and does not set this flag, so the
 * worker stays down instead of retrying a broker that is not running.
 * An explicit `AI_JOBS_CONSUMER_ENABLED` still wins.
 */
export function isAiJobsConsumerEnabled(options: {
  consumerFlag: string | undefined;
  aiServiceEnabled: string | undefined;
}): boolean {
  const explicit = options.consumerFlag?.trim() ?? '';
  if (explicit !== '') {
    return explicit !== 'false';
  }
  return (options.aiServiceEnabled ?? '').trim().toLowerCase() === 'true';
}
