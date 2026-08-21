import { describe, expect, it } from 'vitest';
import {
  FALLBACK_SERVICE_ICON_NAME,
  moduleServices,
  NON_MODULE_SERVICE_IDS,
  SERVICE_ICON_NAMES,
  serviceIconName,
} from '../src/modules.js';
import { navigableServices } from '../src/registry.js';

/**
 * These moved out of `@alpina/ui` because alpina-recruiting could not import
 * them: it is Docusaurus, and pulling in the React package for two constants is
 * not a trade anyone would make, so it hand-copied both. The point of the move
 * is that a consumer with no React can read the same list, so nothing here may
 * grow a dependency on a rendering library.
 */

describe('module list', () => {
  it('drops the identity provider, which is a redirect target and not a module', () => {
    expect(NON_MODULE_SERVICE_IDS).toContain('sso');
    expect(navigableServices().some((s) => s.id === 'sso')).toBe(true);
    expect(moduleServices().some((s) => s.id === 'sso')).toBe(false);
  });

  it('does not offer the caller a link back to itself', () => {
    const withSelf = moduleServices();
    const withoutSelf = moduleServices({ currentServiceId: 'upwork-crm' });
    expect(withSelf.some((s) => s.id === 'upwork-crm')).toBe(true);
    expect(withoutSelf.some((s) => s.id === 'upwork-crm')).toBe(false);
    expect(withoutSelf.length).toBe(withSelf.length - 1);
  });

  it('drops extra ids the caller names', () => {
    const ids = moduleServices({ exclude: ['invoicing', 'portal'] }).map((s) => s.id);
    expect(ids).not.toContain('invoicing');
    expect(ids).not.toContain('portal');
  });

  it('lists only live hosted services', () => {
    for (const service of moduleServices()) {
      expect(service.domain).not.toBeNull();
      expect(service.status.startsWith('live')).toBe(true);
    }
    expect(moduleServices().length).toBeGreaterThan(3);
  });
});

describe('icon names', () => {
  it('is strings, so a consumer resolves them with its own icon set', () => {
    for (const name of Object.values(SERVICE_ICON_NAMES)) {
      expect(typeof name).toBe('string');
      // lucide's own spelling, so any lucide package can look it up.
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('names an icon for every service that can appear in a menu', () => {
    for (const service of moduleServices()) {
      expect(SERVICE_ICON_NAMES[service.id], service.id).toBeDefined();
    }
  });

  it('falls back to a neutral mark rather than guessing', () => {
    expect(serviceIconName('upwork-crm')).toBe('layout-dashboard');
    expect(serviceIconName('not-a-service')).toBe(FALLBACK_SERVICE_ICON_NAME);
  });
});
