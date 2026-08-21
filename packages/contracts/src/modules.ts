import { navigableServices, type Service } from './registry.js';

/**
 * What belongs in an "Alpina ERP" module menu, and what icon each entry gets.
 *
 * This is deliberately framework-agnostic. It started life in `@alpina/ui`, next
 * to the React component that renders it, and alpina-recruiting could not touch
 * it: recruiting is Docusaurus and importing `@alpina/ui` would drag in React
 * 19, `@base-ui/react` and the whole primitive library for two constants. So it
 * hand-copied both, which is the duplication this kit exists to remove. The
 * comments in its `ErpNav.tsx` said as much.
 *
 * Icons are the interesting half. A component reference cannot live here without
 * making this package depend on React and lucide, so what travels is the icon
 * NAME as a string, in lucide's own kebab-case spelling. Each consumer resolves
 * a name to whatever it draws with: `@alpina/ui` maps it to a `lucide-react`
 * component, recruiting can do the same, a plain-HTML page could map it to an
 * `<svg>` sprite id.
 */

/**
 * Services that are live and hosted but are not modules a person opens from a
 * sidebar. Today that is only the identity provider: every app already redirects
 * to it during login, and listing it as a destination invites a confused click.
 *
 * This lives beside the registry rather than in it because the registry
 * describes what exists, not what belongs in a menu. If the fleet grows a second
 * case, the right fix is a field on the registry row, not a longer constant.
 */
export const NON_MODULE_SERVICE_IDS: readonly string[] = ['sso'];

/** lucide icon names, kebab-case, per registry id. */
export const SERVICE_ICON_NAMES: Readonly<Record<string, string>> = {
  'upwork-crm': 'layout-dashboard',
  invoicing: 'file-text',
  portal: 'contact',
  'comms-hub': 'inbox',
  recruiting: 'user-plus',
  'team-registry': 'users',
  time: 'timer',
  twenty: 'table',
  sso: 'key-round',
};

/** What an id with no entry gets. A neutral mark, never a guess. */
export const FALLBACK_SERVICE_ICON_NAME = 'square';

/** The lucide icon name for a registry id, or the neutral fallback. */
export function serviceIconName(id: string): string {
  return SERVICE_ICON_NAMES[id] ?? FALLBACK_SERVICE_ICON_NAME;
}

/**
 * What to print in a menu. `shortName` when the row carries one, `name`
 * otherwise.
 *
 * Registry names describe a service in a table of services, so several carry
 * deployment metadata: "Time tracking (Kimai, vendor)" wraps to two lines in a
 * sidebar and "Twenty CRM (vendor)" reads like a bug report. Every consumer
 * calls this rather than trimming the string itself, so the fleet cannot end up
 * with three slightly different ways of dropping a suffix.
 */
export function serviceLabel(service: Pick<Service, 'name' | 'shortName'>): string {
  return service.shortName ?? service.name;
}

export interface ModuleServicesOptions {
  /** The registry id of the service doing the rendering. It links to itself otherwise. */
  currentServiceId?: string | undefined;
  /** Extra registry ids to leave out. */
  exclude?: readonly string[] | undefined;
}

/**
 * The module menu's list: navigable services from the registry, minus the ones
 * that are not modules, minus the app doing the rendering.
 *
 * Reads the static registry and never fetches, so a peer being down cannot empty
 * another service's navigation (FLEET.md rule 5, the degrade rule).
 */
export function moduleServices(options: ModuleServicesOptions = {}): Service[] {
  const dropped = new Set<string>([
    ...NON_MODULE_SERVICE_IDS,
    ...(options.exclude ?? []),
    ...(options.currentServiceId === undefined ? [] : [options.currentServiceId]),
  ]);
  return navigableServices().filter((service) => !dropped.has(service.id));
}
