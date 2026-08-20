/**
 * Health-check handler factory.
 *
 * upwork-crm's `viewer/app/api/health/route.ts` is the fleet's only health
 * endpoint today, and it leaks: it returns `process.cwd()` and whether an admin
 * password is configured, on an unauthenticated route. The kit version answers
 * the only question a monitor asks (is this process able to serve?) and nothing
 * about the host.
 *
 * Returns a web-standard `Response`, so the same handler works in a Next route
 * handler, a Hono route, and a plain `node:http` server via the adapter of the
 * framework in use.
 */

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthCheckResult {
  status: HealthStatus;
  /** One short line. Never include connection strings or secrets. */
  detail?: string;
}

export type HealthCheck = () => Promise<HealthCheckResult> | HealthCheckResult;

export interface HealthHandlerOptions {
  /** Service id from the fleet registry, e.g. `upwork-crm`. */
  service: string;
  /** Build or release identifier, usually the image tag. */
  version?: string;
  /**
   * Named dependency checks. A `down` check makes the whole response 503,
   * a `degraded` check keeps 200 so a peer outage does not page anyone.
   */
  checks?: Record<string, HealthCheck>;
  /** Per-check budget. A check that overruns counts as `down`. */
  timeoutMs?: number;
}

export interface HealthBody {
  service: string;
  status: HealthStatus;
  uptimeSeconds: number;
  version?: string;
  checks?: Record<string, HealthCheckResult>;
}

const RANK: Record<HealthStatus, number> = { ok: 0, degraded: 1, down: 2 };

async function runCheck(check: HealthCheck, timeoutMs: number): Promise<HealthCheckResult> {
  try {
    const timeout = new Promise<HealthCheckResult>((resolve) =>
      setTimeout(
        () => resolve({ status: 'down', detail: `timed out after ${timeoutMs}ms` }),
        timeoutMs,
      ).unref?.(),
    );
    return await Promise.race([Promise.resolve(check()), timeout]);
  } catch (err) {
    return { status: 'down', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Builds the health body without serialising it. Useful in tests. */
export async function healthBody(options: HealthHandlerOptions): Promise<HealthBody> {
  const { service, version, checks, timeoutMs = 2000 } = options;
  const entries = Object.entries(checks ?? {});
  const results: Record<string, HealthCheckResult> = {};
  let worst: HealthStatus = 'ok';

  for (const [name, check] of entries) {
    const result = await runCheck(check, timeoutMs);
    results[name] = result;
    if (RANK[result.status] > RANK[worst]) worst = result.status;
  }

  return {
    service,
    status: worst,
    uptimeSeconds: Math.round(process.uptime()),
    ...(version === undefined ? {} : { version }),
    ...(entries.length === 0 ? {} : { checks: results }),
  };
}

/** `export const GET = createHealthHandler({ service: 'invoicing' })` */
export function createHealthHandler(options: HealthHandlerOptions): () => Promise<Response> {
  return async () => {
    const body = await healthBody(options);
    return new Response(JSON.stringify(body), {
      status: body.status === 'down' ? 503 : 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  };
}
