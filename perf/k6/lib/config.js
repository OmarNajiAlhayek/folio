/**
 * Shared perf config loader for k6 scripts.
 * PERF_CONFIG defaults to ../.env.json relative to this file.
 */
export function loadConfig() {
  const path = __ENV.PERF_CONFIG || '../.env.json';
  const raw = open(path);
  const config = JSON.parse(raw);
  if (!config.baseUrl) {
    throw new Error(`perf config missing baseUrl (${path})`);
  }
  return config;
}

export function pickSlug(slugs, vu, iter) {
  if (!slugs?.length) return null;
  return slugs[(vu + iter) % slugs.length];
}

/**
 * Builds a ramping-vus scenario config from a suite config block.
 * Uses rampUpSeconds / sustainSeconds / rampDownSeconds; falls back to
 * durationSeconds for the sustain phase so old configs still work.
 */
export function rampingStages(cfg) {
  const vus = cfg.vus ?? 10;
  const rampUp = cfg.rampUpSeconds ?? 20;
  const sustain = cfg.sustainSeconds ?? cfg.durationSeconds ?? 90;
  const rampDown = cfg.rampDownSeconds ?? 10;
  return {
    executor: 'ramping-vus',
    stages: [
      { duration: `${rampUp}s`, target: vus },
      { duration: `${sustain}s`, target: vus },
      { duration: `${rampDown}s`, target: 0 },
    ],
    gracefulRampDown: `${rampDown}s`,
  };
}
