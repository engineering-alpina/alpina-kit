'use client';

import * as React from 'react';
import { navigableServices, type Service } from '@alpina/contracts';
import {
  ContactIcon,
  ExternalLinkIcon,
  FileTextIcon,
  InboxIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  SquareIcon,
  TableIcon,
  TimerIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '../ui/sidebar.js';

/**
 * The Alpina ERP module block.
 *
 * This replaces two hand-maintained arrays of links, one in upwork-crm's
 * `app-sidebar.tsx` and one in alpina-recruiting's `ErpNav.tsx`, which had
 * already drifted: the CRM pointed "Recruiting" at recruiting.alpina.solutions
 * while recruiting pointed "ATS" at recruitment.alpina.solutions, and neither
 * list agreed on what belonged in it. The registry in `@alpina/contracts` is
 * now the only list.
 *
 * It reads the registry, which is a JSON file compiled into the bundle. Nothing
 * here fetches, so a peer being down cannot empty another service's navigation
 * (FLEET.md rule 5, the degrade rule).
 */

/**
 * Services that are live and hosted but are not modules a person opens from a
 * sidebar. Today that is only the identity provider: every app already redirects
 * to it during login, and listing it as a destination invites a confused click.
 *
 * This lives here rather than in the registry because the registry describes
 * what exists, not what belongs in a menu. If the fleet grows a second case,
 * the right fix is a field on the registry row, not a longer constant.
 */
export const NON_MODULE_SERVICE_IDS: readonly string[] = ['sso'];

/** A registry id that has no entry falls back to a neutral mark. */
const SERVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'upwork-crm': LayoutDashboardIcon,
  invoicing: FileTextIcon,
  portal: ContactIcon,
  'comms-hub': InboxIcon,
  recruiting: UserPlusIcon,
  'team-registry': UsersIcon,
  time: TimerIcon,
  twenty: TableIcon,
  sso: KeyRoundIcon,
};

export interface ModuleServicesOptions {
  /** The registry id of the service doing the rendering. It links to itself otherwise. */
  currentServiceId?: string | undefined;
  /** Extra registry ids to leave out. */
  exclude?: readonly string[] | undefined;
}

/**
 * The switcher's list: navigable services from the registry, minus the ones that
 * are not modules, minus the app doing the rendering.
 */
export function moduleServices(options: ModuleServicesOptions = {}): Service[] {
  const dropped = new Set<string>([
    ...NON_MODULE_SERVICE_IDS,
    ...(options.exclude ?? []),
    ...(options.currentServiceId === undefined ? [] : [options.currentServiceId]),
  ]);
  return navigableServices().filter((service) => !dropped.has(service.id));
}

export function serviceIcon(id: string): React.ComponentType<{ className?: string }> {
  return SERVICE_ICONS[id] ?? SquareIcon;
}

export interface ModuleSwitcherProps extends ModuleServicesOptions {
  /** Defaults to "Alpina ERP". */
  label?: string;
}

export function ModuleSwitcher({
  label = 'Alpina ERP',
  currentServiceId,
  exclude,
}: ModuleSwitcherProps) {
  const modules = moduleServices({ currentServiceId, exclude });
  if (modules.length === 0) return null;

  return (
    <SidebarGroup data-slot="module-switcher">
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {modules.map((service) => {
            const Icon = serviceIcon(service.id);
            return (
              <SidebarMenuItem key={service.id}>
                <SidebarMenuButton
                  tooltip={service.name}
                  data-service-id={service.id}
                  render={
                    <a
                      href={`https://${service.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <Icon />
                  <span>{service.name}</span>
                  <ExternalLinkIcon className="ml-auto h-3 w-3 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
