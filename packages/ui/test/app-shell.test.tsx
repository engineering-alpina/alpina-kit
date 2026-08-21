import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { AppShell } from '../src/shell/app-shell.js';
import { isActive, type NavGroup } from '../src/shell/nav.js';
import { moduleServices, serviceLabel } from '@alpina/contracts';

const groups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', href: '/' },
      { label: 'Leads', href: '/leads', exactOnlyPrefixes: ['/leads/import'] },
      { label: 'Lead import', href: '/leads/import' },
    ],
  },
  {
    label: 'Analytics',
    items: [{ label: 'Overview', href: '/analytics', shortcut: '⌘K' }],
  },
];

function renderShell(props: Partial<React.ComponentProps<typeof AppShell>> = {}) {
  return render(
    <AppShell brand={{ title: 'Alpina ERP', subtitle: 'Test module' }} groups={groups} {...props}>
      <p>page body</p>
    </AppShell>,
  );
}

describe('<AppShell>', () => {
  it('renders its children', () => {
    renderShell();
    expect(screen.getByText('page body')).toBeDefined();
  });

  it('renders the brand the app gave it', () => {
    const { container } = renderShell();
    const brand = container.querySelector('[data-slot="shell-brand"]');
    expect(brand?.textContent).toBe('Alpina ERPTest module');
  });

  it("renders the app's own groups and nothing it invented itself", () => {
    renderShell();
    expect(screen.getByText('Workspace')).toBeDefined();
    expect(screen.getByText('Analytics')).toBeDefined();
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Overview')).toBeDefined();
  });

  it('renders the ERP module block from the registry alongside them', () => {
    const { container } = renderShell({ serviceId: 'upwork-crm' });
    const block = container.querySelector('[data-slot="module-switcher"]');
    expect(block).not.toBeNull();

    const modules = moduleServices({ currentServiceId: 'upwork-crm' });
    expect(modules.length).toBeGreaterThan(0);
    for (const service of modules) {
      expect(within(block as HTMLElement).getByText(serviceLabel(service))).toBeDefined();
    }
  });

  /**
   * Both of these came back from upwork-crm as "I had to stop using AppShell".
   * The topbar had no way to take a className, so the viewer lost the
   * `sticky top-6` that cleared its HudBar; the module block was always
   * appended, so it could not sit above the Docs group where it used to be.
   */
  it('lets the app style the topbar', () => {
    const { container } = renderShell({ topbarClassName: 'sticky top-6' });
    const bar = container.querySelector('[data-slot="shell-topbar"]');

    expect(bar?.className).toContain('sticky');
    expect(bar?.className).toContain('top-6');
    // The shell's own bar classes survive the addition.
    expect(bar?.className).toContain('border-b');
  });

  function groupOrder(container: HTMLElement): string[] {
    return [...container.querySelectorAll('[data-sidebar="group"]')].map((group) =>
      group.querySelector('[data-slot="module-switcher"]') || group.matches('[data-slot="module-switcher"]')
        ? 'modules'
        : (group.querySelector('[data-sidebar="group-label"]')?.textContent ?? ''),
    );
  }

  it('appends the module block by default', () => {
    const { container } = renderShell();
    expect(groupOrder(container)).toEqual(['Workspace', 'Analytics', 'modules']);
  });

  it('puts the module block first when asked', () => {
    const { container } = renderShell({ modulePosition: 'start' });
    expect(groupOrder(container)).toEqual(['modules', 'Workspace', 'Analytics']);
  });

  it('inserts the module block before a numbered group', () => {
    const { container } = renderShell({ modulePosition: 1 });
    expect(groupOrder(container)).toEqual(['Workspace', 'modules', 'Analytics']);
  });

  it('reads a negative position as an offset from the end', () => {
    // What upwork-crm wants: above the last group, without the app having to
    // compute groups.length - 1 every time a section is added.
    const { container } = renderShell({ modulePosition: -1 });
    expect(groupOrder(container)).toEqual(['Workspace', 'modules', 'Analytics']);
  });

  it('clamps a position past either end rather than dropping the block', () => {
    expect(groupOrder(renderShell({ modulePosition: 99 }).container)).toEqual([
      'Workspace',
      'Analytics',
      'modules',
    ]);
    expect(groupOrder(renderShell({ modulePosition: -99 }).container)).toEqual([
      'modules',
      'Workspace',
      'Analytics',
    ]);
  });

  it('leaves the module block out entirely on "none"', () => {
    const { container } = renderShell({ modulePosition: 'none' });
    expect(container.querySelector('[data-slot="module-switcher"]')).toBeNull();
    expect(groupOrder(container)).toEqual(['Workspace', 'Analytics']);
  });

  it('has no session-dependent behaviour of its own', () => {
    // The fleet rule is that an app decides whether a shell renders at all, so
    // the shell must not consult anything that could carry a session. It gets no
    // user prop, and it reads no storage: two identical renders, same output.
    const getItem = vi.spyOn(Storage.prototype, 'getItem');

    const first = renderShell().container.textContent;
    const second = renderShell().container.textContent;

    expect(first).toBe(second);
    expect(first).toContain('page body');
    expect(getItem).not.toHaveBeenCalled();
    getItem.mockRestore();
  });

  it('never fetches, so a dead peer cannot empty the navigation', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderShell({ serviceId: 'invoicing' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('renders internal links as plain anchors when no renderer is given', () => {
    renderShell();
    const leads = screen.getByRole('link', { name: 'Leads' });
    expect(leads.tagName).toBe('A');
    expect(leads.getAttribute('href')).toBe('/leads');
  });

  it('uses the caller-supplied link renderer for internal links', () => {
    renderShell({
      renderLink: (href) => <a href={href} data-router="test" />,
    });
    expect(screen.getByRole('link', { name: 'Leads' }).getAttribute('data-router')).toBe('test');
  });

  it('marks the current section active from the pathname it is handed', () => {
    renderShell({ pathname: '/analytics' });
    // base-ui writes the flag as a bare `data-active` attribute, not `="true"`.
    expect(screen.getByRole('link', { name: /Overview/ }).hasAttribute('data-active')).toBe(true);
    expect(screen.getByRole('link', { name: 'Dashboard' }).hasAttribute('data-active')).toBe(false);
  });

  it('renders a shortcut hint when an item declares one', () => {
    renderShell();
    expect(screen.getByText('⌘K')).toBeDefined();
  });

  it('omits the sidebar footer unless the app supplies one', () => {
    const { container } = renderShell();
    expect(container.querySelector('[data-slot="sidebar-footer"]')).toBeNull();

    const withFooter = renderShell({ sidebarFooter: <span>fresh 12:00</span> });
    expect(withFooter.container.querySelector('[data-slot="sidebar-footer"]')).not.toBeNull();
    expect(screen.getByText('fresh 12:00')).toBeDefined();
  });

  it('puts the app topbar next to the sidebar toggle', () => {
    renderShell({ topbar: <span>4 rooms</span> });
    expect(screen.getByText('4 rooms')).toBeDefined();
    expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeDefined();
  });

  it('links the brand only when given a destination', () => {
    const { container } = renderShell();
    expect(container.querySelector('a[data-slot="shell-brand"]')).toBeNull();

    const linked = renderShell({ brand: { title: 'Alpina ERP', href: '/' } });
    expect(linked.container.querySelector('a[data-slot="shell-brand"]')).not.toBeNull();
  });
});

describe('isActive', () => {
  it('matches the root only exactly', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/leads', '/')).toBe(false);
  });

  it('matches a section and everything under it', () => {
    expect(isActive('/leads', '/leads')).toBe(true);
    expect(isActive('/leads/42', '/leads')).toBe(true);
    expect(isActive('/leadsx', '/leads')).toBe(false);
  });

  it('lets a more specific sibling entry own its sub-tree', () => {
    expect(isActive('/leads/import', '/leads', ['/leads/import'])).toBe(false);
    expect(isActive('/leads/import/step-2', '/leads', ['/leads/import'])).toBe(false);
    expect(isActive('/leads/42', '/leads', ['/leads/import'])).toBe(true);
  });

  it('is inert without a pathname, so a server render highlights nothing', () => {
    expect(isActive(undefined, '/leads')).toBe(false);
  });
});
