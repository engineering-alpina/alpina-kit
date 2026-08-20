import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { navigableServices, services } from '@alpina/contracts';

import {
  ModuleSwitcher,
  NON_MODULE_SERVICE_IDS,
  moduleServices,
  serviceIcon,
} from '../src/shell/module-switcher.js';
import { SidebarProvider } from '../src/ui/sidebar.js';
import { TooltipProvider } from '../src/ui/tooltip.js';

function renderSwitcher(props: React.ComponentProps<typeof ModuleSwitcher> = {}) {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <ModuleSwitcher {...props} />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

describe('moduleServices', () => {
  it('lists every navigable service the registry has', () => {
    const ids = moduleServices().map((s) => s.id);
    const expected = navigableServices()
      .map((s) => s.id)
      .filter((id) => !NON_MODULE_SERVICE_IDS.includes(id));

    expect(ids).toEqual(expected);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('leaves out services the registry marks as not navigable', () => {
    const ids = moduleServices().map((s) => s.id);
    const notNavigable = services.filter((s) => s.domain === null || !s.status.startsWith('live'));

    expect(notNavigable.length).toBeGreaterThan(0);
    for (const service of notNavigable) {
      expect(ids).not.toContain(service.id);
    }
  });

  it('leaves out the identity provider, which is not a module anyone opens', () => {
    expect(navigableServices().map((s) => s.id)).toContain('sso');
    expect(moduleServices().map((s) => s.id)).not.toContain('sso');
  });

  it('does not link a service back to itself', () => {
    expect(moduleServices({ currentServiceId: 'upwork-crm' }).map((s) => s.id)).not.toContain(
      'upwork-crm',
    );
    expect(moduleServices().map((s) => s.id)).toContain('upwork-crm');
  });

  it('honours an explicit exclusion', () => {
    expect(moduleServices({ exclude: ['twenty'] }).map((s) => s.id)).not.toContain('twenty');
  });

  it('gives an unknown registry id a fallback icon rather than crashing', () => {
    // A row added to the registry tomorrow still renders; it just gets a neutral mark.
    expect(serviceIcon('a-service-invented-tomorrow')).toBeDefined();
    expect(serviceIcon('invoicing')).not.toBe(serviceIcon('a-service-invented-tomorrow'));
  });
});

describe('<ModuleSwitcher>', () => {
  it('renders one external link per navigable service', () => {
    renderSwitcher();

    const expected = moduleServices();
    for (const service of expected) {
      // Service names carry brackets and commas, so match the text and walk up
      // rather than building a regex out of registry data.
      const link = screen.getByText(service.name).closest('a');
      expect(link, `no link rendered for ${service.id}`).not.toBeNull();
      expect(link!.getAttribute('href')).toBe(`https://${service.domain}`);
      expect(link!.getAttribute('target')).toBe('_blank');
      expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(screen.getAllByRole('link')).toHaveLength(expected.length);
  });

  it('never renders a service the registry does not call navigable', () => {
    renderSwitcher();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));

    expect(hrefs.some((h) => h?.includes('auth.alpina-tech.org'))).toBe(false);
    expect(hrefs.every((h) => h?.startsWith('https://'))).toBe(true);
  });

  it('drops the current service and keeps the rest', () => {
    renderSwitcher({ currentServiceId: 'invoicing' });
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));

    expect(hrefs).not.toContain('https://invoicing.alpina.solutions');
    expect(hrefs).toContain('https://upwork-crm.alpina.solutions');
  });

  it('takes its label from the caller', () => {
    renderSwitcher({ label: 'Модулі' });
    expect(screen.getByText('Модулі')).toBeDefined();
  });

  it('renders from the compiled registry and never fetches', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderSwitcher();

    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
