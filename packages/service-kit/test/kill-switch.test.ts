import { describe, expect, it, vi } from 'vitest';
import { killSwitch, runIfEnabled } from '../src/kill-switch.js';

describe('killSwitch', () => {
  it('is on only for the exact enabled value', () => {
    const env = { UPWORK_SYNC_ENABLED: '1' };
    expect(killSwitch('UPWORK_SYNC_ENABLED', { env }).enabled).toBe(true);
  });

  it('defaults to off when the variable is unset', () => {
    const gate = killSwitch('UPWORK_SYNC_ENABLED', { env: {} });
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toContain('unset');
  });

  it('treats a truthy-looking but wrong value as off', () => {
    // Two sync workers polling the same Upwork OAuth token kill the session for
    // both, so "true" must not accidentally enable the second one.
    expect(
      killSwitch('UPWORK_SYNC_ENABLED', { env: { UPWORK_SYNC_ENABLED: 'true' } }).enabled,
    ).toBe(false);
    expect(killSwitch('UPWORK_SYNC_ENABLED', { env: { UPWORK_SYNC_ENABLED: '0' } }).enabled).toBe(
      false,
    );
  });

  it('accepts opted-in extra values', () => {
    const gate = killSwitch('X', { env: { X: 'true' }, enabledValues: ['1', 'true'] });
    expect(gate.enabled).toBe(true);
  });

  it('logs one labelled line when it blocks', () => {
    const log = vi.fn();
    const gate = killSwitch('UPWORK_SYNC_ENABLED', { env: {}, label: 'sync' });
    expect(gate.check(log)).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain('[sync]');
  });

  it('stays quiet when it allows', () => {
    const log = vi.fn();
    const gate = killSwitch('X', { env: { X: '1' } });
    expect(gate.check(log)).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('runIfEnabled', () => {
  it('runs the body when enabled', async () => {
    const body = vi.fn().mockResolvedValue(7);
    await expect(runIfEnabled('X', body, { env: { X: '1' } })).resolves.toBe(7);
    expect(body).toHaveBeenCalledOnce();
  });

  it('skips the body and exits 0 when disabled', async () => {
    const body = vi.fn();
    await expect(runIfEnabled('X', body, { env: {} })).resolves.toBe(0);
    expect(body).not.toHaveBeenCalled();
  });
});
