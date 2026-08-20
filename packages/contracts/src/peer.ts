/**
 * The degrade rule, as a type.
 *
 * FLEET.md rule 5: "an app must render fully when every peer is down." A client
 * in this package therefore never throws. Every failure, a timeout, a 500, a
 * schema that drifted, an unconfigured base URL, collapses into the same
 * `{ ok: false }` shape so the caller renders an explicit unavailable state
 * instead of a stack trace in a Server Component.
 *
 * The shape follows invoicing's `fetchUpworkContracts`, which already got this
 * right by hand.
 */

export type PeerFailure =
  'not-configured' | 'timeout' | 'unauthorized' | 'http-error' | 'bad-response' | 'network-error';

export type PeerResult<T> =
  { ok: true; data: T } | { ok: false; reason: PeerFailure; message: string };

export function peerOk<T>(data: T): PeerResult<T> {
  return { ok: true, data };
}

export function peerFail<T>(reason: PeerFailure, message: string): PeerResult<T> {
  return { ok: false, reason, message };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PeerRequestOptions {
  /** Peer base URL. A trailing slash is fine. */
  baseUrl?: string | undefined;
  /** Bearer token, when the peer requires one. */
  token?: string | undefined;
  /** Defaults to 5000ms. Short on purpose: a peer read is never worth a hung render. */
  timeoutMs?: number | undefined;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: FetchLike | undefined;
  /** Extra headers, merged after the Authorization header. */
  headers?: Record<string, string> | undefined;
}

/** Human-readable label for an unavailable panel. */
export function peerFailureLabel(reason: PeerFailure): string {
  switch (reason) {
    case 'not-configured':
      return 'not configured';
    case 'timeout':
      return 'timed out';
    case 'unauthorized':
      return 'not authorised';
    case 'http-error':
      return 'returned an error';
    case 'bad-response':
      return 'returned an unexpected shape';
    case 'network-error':
      return 'unreachable';
  }
}

/**
 * One GET, JSON in, `PeerResult` out. Never throws, including on an aborted
 * request, a non-JSON body, or a peer that is not configured at all.
 */
export async function peerGetJson(
  path: string,
  options: PeerRequestOptions & { requireToken?: boolean },
): Promise<PeerResult<unknown>> {
  const base = options.baseUrl?.replace(/\/$/, '');
  if (!base) return peerFail('not-configured', 'base url is not set');
  if (options.requireToken && !options.token) {
    return peerFail('not-configured', 'api token is not set');
  }

  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 5000;

  try {
    const res = await doFetch(`${base}${path}`, {
      headers: {
        accept: 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401 || res.status === 403) {
      return peerFail('unauthorized', `HTTP ${res.status}`);
    }
    if (!res.ok) return peerFail('http-error', `HTTP ${res.status}`);
    try {
      return peerOk(await res.json());
    } catch {
      return peerFail('bad-response', 'body was not json');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError' || /abort|timeout/i.test(message)) {
      return peerFail('timeout', `no answer within ${timeoutMs}ms`);
    }
    return peerFail('network-error', message);
  }
}

/**
 * Some producers answer with a bare array, some with `{ data: [...] }`.
 * upwork-crm's `/api/v1/contracts` does the first today; the invoicing client
 * already tolerates both, so the kit keeps that tolerance.
 */
export function unwrapList(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (typeof body === 'object' && body !== null) {
    const data = (body as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
  }
  return null;
}
