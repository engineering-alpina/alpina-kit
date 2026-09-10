import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { moduleServices, serviceIconName, serviceLabel, services } from '@alpina/contracts';

import { ModuleSwitcher, serviceIcon } from '../src/shell/module-switcher.js';
import { SidebarProvider } from '../src/ui/sidebar.js';
import { TooltipProvider } from '../src/ui/tooltip.js';

/**
 * Which services belong in the menu is `@alpina/contracts`' problem now, and
 * `test/modules.test.ts` over there covers it. What is left here is rendering:
 * the icon name becomes a component, the label comes out short, and the group
 * draws one external link per module.
 */

function renderSwitcher(props: React.ComponentProps<typeof ModuleSwitcher> = {}) {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <ModuleSwitcher {...props} />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

describe('serviceIcon', () => {
  it('resolves a contracts icon name to a component', () => {
    expect(serviceIconName('invoicing')).toBe('file-text');
    expect(serviceIcon('invoicing')).toBeDefined();
  });

  it('has a component for every name the registry can hand it', () => {
    const fallback = serviceIcon('a-service-invented-tomorrow');
    for (const service of services) {
      if (serviceIconName(service.id) === 'square') continue;
      expect(serviceIcon(service.id), service.id).not.toBe(fallback);
    }
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
      const link = screen.getByText(serviceLabel(service)).closest('a');
      expect(link, `no link rendered for ${service.id}`).not.toBeNull();
      expect(link!.getAttribute('href')).toBe(`https://${service.domain}`);
      expect(link!.getAttribute('target')).toBe('_blank');
      expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(screen.getAllByRole('link')).toHaveLength(expected.length);
  });

  it('prints the short name, not the registry name with its deployment suffix', () => {
    renderSwitcher();

    // "Time tracking (Kimai, vendor)" is how FLEET.md describes the row. A
    // sidebar entry wraps to two lines on it, so the switcher reads shortName.
    expect(screen.getByText('Time tracking')).toBeDefined();
    expect(screen.queryByText('Time tracking (Kimai, vendor)')).toBeNull();
    expect(screen.queryByText('Twenty CRM (vendor)')).toBeNull();

    for (const link of screen.getAllByRole('link')) {
      expect(link.textContent ?? '').not.toContain('(vendor)');
    }
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

    expect(hrefs).not.toContain('https://invoicing.alpina-tech.org');
    expect(hrefs).toContain('https://upwork-crm.alpina-tech.org');
  });

  it('honours an explicit exclusion', () => {
    renderSwitcher({ exclude: ['twenty'] });
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));

    expect(hrefs.some((h) => h?.includes('twenty'))).toBe(false);
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
