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
