import * as http from 'node:http';

export type HealthProbe = () => Promise<{
  ok: boolean;
  checks: Record<string, boolean>;
}>;

/**
 * Minimal HTTP liveness/readiness for orchestrators (no full Nest HTTP app).
 */
export function startHealthServer(
  port: number,
  probe: HealthProbe,
): http.Server {
  const server = http.createServer((req, res) => {
    const path = req.url?.split('?')[0];
    if (path !== '/health' && path !== '/ready') {
      res.statusCode = 404;
      res.end();
      return;
    }
    void probe()
      .then(({ ok, checks }) => {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = ok ? 200 : 503;
        res.end(
          JSON.stringify({
            status: ok ? 'ok' : 'degraded',
            checks,
          }),
        );
      })
      .catch(() => {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'error' }));
      });
  });
  server.listen(port);
  return server;
}
