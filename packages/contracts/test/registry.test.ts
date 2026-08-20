import { describe, expect, it } from 'vitest';
import {
  navigableServices,
  registry,
  RegistrySchema,
  serviceBaseUrl,
  serviceById,
  services,
} from '../src/registry.js';

describe('registry', () => {
  it('parses the shipped services.json', () => {
    expect(() => RegistrySchema.parse(registry)).not.toThrow();
    expect(services.length).toBeGreaterThan(5);
  });

  it('has unique service ids', () => {
    const ids = services.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every hosted service a bare hostname, not a url', () => {
    for (const service of services) {
      if (service.domain !== null) expect(service.domain).not.toMatch(/^https?:\/\//);
    }
  });

  it('finds a service and builds its base url', () => {
    expect(serviceById('upwork-crm')?.name).toBe('Upwork CRM');
    expect(serviceBaseUrl('upwork-crm')).toBe(`https://${serviceById('upwork-crm')?.domain}`);
    expect(serviceById('nope')).toBeUndefined();
  });

  it('returns no base url for a service with no host', () => {
    expect(serviceById('proposal-generator')?.domain).toBeNull();
    expect(serviceBaseUrl('proposal-generator')).toBeUndefined();
  });

  it('offers only live hosted services for navigation', () => {
    const nav = navigableServices();
    expect(nav.every((s) => s.domain !== null)).toBe(true);
    expect(nav.map((s) => s.id)).toContain('invoicing');
    expect(nav.map((s) => s.id)).not.toContain('proposal-generator');
  });

  it('rejects a registry row missing a required field', () => {
    expect(() =>
      RegistrySchema.parse({ updated: '2026-08-20', services: [{ id: 'x', name: 'X' }] }),
    ).toThrow();
  });
});
