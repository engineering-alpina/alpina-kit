import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../src/peer.js';
import {
  fetchContracts,
  toPrefill,
  upworkCrmOptionsFromEnv,
  UpworkContractSchema,
} from '../src/upwork-crm.js';

// One row as upwork-crm's /api/v1/contracts actually returns it: numerics come
// back as strings from postgres, most columns are nullable.
const row = {
  id: '6f1c9b8a-0000-4000-8000-000000000001',
  upworkContractId: '1234567890',
  title: 'Payload CMS build',
  status: 'active',
  kind: 'hourly',
  deliveryModel: null,
  clientOrgId: '99',
  clientOrgName: 'Acme Inc',
  freelancerName: 'Dmytro Antonyuk',
  jobId: null,
  hourlyRate: '65.00',
  fixedAmount: null,
  currency: 'USD',
  startDate: '2026-03-01',
  endDate: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const configured = { baseUrl: 'https://upwork-crm.alpina-tech.org', token: 'tok' };

describe('fetchContracts', () => {
  it('parses a bare array', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse([row]));
    const result = await fetchContracts({ ...configured, fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.title).toBe('Payload CMS build');

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://upwork-crm.alpina-tech.org/api/v1/contracts');
    expect((init?.headers as Record<string, string>)['authorization']).toBe('Bearer tok');
  });

  it('parses a { data: [] } envelope too', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ data: [row] }));
    const result = await fetchContracts({ ...configured, fetchImpl });
    expect(result.ok).toBe(true);
  });

  it('trims a trailing slash off the base url', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse([]));
    await fetchContracts({ ...configured, baseUrl: 'https://x/', fetchImpl });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://x/api/v1/contracts');
  });

  it('tolerates new columns, because upwork-crm adds them often', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse([{ ...row, somethingNew: 42 }]));
    const result = await fetchContracts({ ...configured, fetchImpl });
    expect(result.ok).toBe(true);
  });
});

describe('degrade, never depend', () => {
  it('reports not-configured instead of calling anything', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    await expect(fetchContracts({ token: 'tok', fetchImpl })).resolves.toMatchObject({
      ok: false,
      reason: 'not-configured',
    });
    await expect(fetchContracts({ baseUrl: 'https://x', fetchImpl })).resolves.toMatchObject({
      ok: false,
      reason: 'not-configured',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports unauthorized on 401 and 403', async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('', { status }));
      await expect(fetchContracts({ ...configured, fetchImpl })).resolves.toMatchObject({
        ok: false,
        reason: 'unauthorized',
      });
    }
  });

  it('reports http-error on a 500', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(fetchContracts({ ...configured, fetchImpl })).resolves.toMatchObject({
      ok: false,
      reason: 'http-error',
      message: 'HTTP 500',
    });
  });

  it('reports timeout when the peer never answers', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted due to timeout');
            err.name = 'TimeoutError';
            reject(err);
          });
        }),
    );
    const result = await fetchContracts({ ...configured, timeoutMs: 20, fetchImpl });
    expect(result).toMatchObject({ ok: false, reason: 'timeout' });
  });

  it('reports network-error when the socket dies', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchContracts({ ...configured, fetchImpl })).resolves.toMatchObject({
      ok: false,
      reason: 'network-error',
      message: 'ECONNREFUSED',
    });
  });

  it('reports bad-response for a non-json body', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(new Response('<html>nope</html>'));
    await expect(fetchContracts({ ...configured, fetchImpl })).resolves.toMatchObject({
      ok: false,
      reason: 'bad-response',
    });
  });

  it('reports bad-response for an unexpected top-level shape', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ contracts: [] }));
    await expect(fetchContracts({ ...configured, fetchImpl })).resolves.toMatchObject({
      ok: false,
      reason: 'bad-response',
    });
  });

  it('reports bad-response when the row shape drifts', async () => {
    const { id: _dropped, ...withoutId } = row;
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse([withoutId]));
    const result = await fetchContracts({ ...configured, fetchImpl });
    expect(result).toMatchObject({ ok: false, reason: 'bad-response' });
    if (!result.ok) expect(result.message).toContain('drifted');
  });

  it('never throws, whatever the peer does', async () => {
    const nasty: FetchLike = () => {
      throw new Error('synchronous explosion');
    };
    await expect(fetchContracts({ ...configured, fetchImpl: nasty })).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe('toPrefill', () => {
  it('flattens an hourly contract for the invoice form', () => {
    expect(toPrefill(UpworkContractSchema.parse(row))).toEqual({
      contractId: row.id,
      upworkContractId: '1234567890',
      title: 'Payload CMS build',
      clientName: 'Acme Inc',
      currency: 'USD',
      hourlyRate: 65,
      fixedAmount: null,
    });
  });

  it('handles a fixed-price contract and a missing currency', () => {
    const fixed = UpworkContractSchema.parse({
      ...row,
      hourlyRate: null,
      fixedAmount: '4200.00',
      currency: null,
    });
    expect(toPrefill(fixed)).toMatchObject({
      hourlyRate: null,
      fixedAmount: 4200,
      currency: 'USD',
    });
  });
});

describe('upworkCrmOptionsFromEnv', () => {
  it('uses the variable names invoicing already sets', () => {
    expect(
      upworkCrmOptionsFromEnv({
        UPWORK_CRM_API_URL: 'https://x',
        UPWORK_CRM_API_TOKEN: 'y',
      }),
    ).toEqual({ baseUrl: 'https://x', token: 'y' });
  });
});
