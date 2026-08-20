import { describe, expect, it } from 'vitest';
import { createHealthHandler, healthBody } from '../src/health.js';

describe('healthBody', () => {
  it('reports ok with no checks', async () => {
    const body = await healthBody({ service: 'invoicing', version: 'sha-abc' });
    expect(body).toMatchObject({ service: 'invoicing', status: 'ok', version: 'sha-abc' });
    expect(body.checks).toBeUndefined();
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('leaks nothing about the host', async () => {
    const body = await healthBody({ service: 'invoicing' });
    const keys = Object.keys(body);
    expect(keys).not.toContain('cwd');
    expect(keys).not.toContain('env');
    expect(keys).not.toContain('node');
  });

  it('takes the worst status across checks', async () => {
    const body = await healthBody({
      service: 'comms-hub',
      checks: {
        db: () => ({ status: 'ok' }),
        gmail: () => ({ status: 'degraded', detail: 'oauth pending' }),
      },
    });
    expect(body.status).toBe('degraded');
    expect(body.checks?.['gmail']?.detail).toBe('oauth pending');
  });

  it('turns a thrown check into down without crashing', async () => {
    const body = await healthBody({
      service: 'upwork-crm',
      checks: {
        db: () => {
          throw new Error('connection refused');
        },
      },
    });
    expect(body.status).toBe('down');
    expect(body.checks?.['db']?.detail).toBe('connection refused');
  });

  it('counts an overrunning check as down', async () => {
    const body = await healthBody({
      service: 'upwork-crm',
      timeoutMs: 10,
      checks: { db: () => new Promise(() => {}) },
    });
    expect(body.status).toBe('down');
    expect(body.checks?.['db']?.detail).toContain('timed out');
  });
});

describe('createHealthHandler', () => {
  it('answers 200 when healthy', async () => {
    const res = await createHealthHandler({ service: 'invoicing' })();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('answers 503 when a dependency is down', async () => {
    const res = await createHealthHandler({
      service: 'invoicing',
      checks: { db: () => ({ status: 'down' as const }) },
    })();
    expect(res.status).toBe(503);
  });

  it('keeps 200 when a dependency is only degraded', async () => {
    const res = await createHealthHandler({
      service: 'invoicing',
      checks: { peer: () => ({ status: 'degraded' as const }) },
    })();
    expect(res.status).toBe(200);
  });
});
