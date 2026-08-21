'use client';

import * as React from 'react';
import {
  FALLBACK_SERVICE_ICON_NAME,
  moduleServices,
  serviceIconName,
  type ModuleServicesOptions,
} from '@alpina/contracts';
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
 *
 * **The list itself is not defined here.** `moduleServices`, the icon names and
 * the "not a module" ids live in `@alpina/contracts`, because recruiting is
 * Docusaurus and cannot import a React package for two constants. v0.1.0 kept
 * them here and recruiting copied them by hand, which was the duplication the
 * kit exists to remove. What is left in this file is React: turning an icon name
 * into a component, and drawing a sidebar group.
 */

/** lucide icon name to component, so `@alpina/contracts` needs no lucide. */
const ICONS_BY_NAME: Record<string, React.ComponentType<{ className?: string }>> = {
  'layout-dashboard': LayoutDashboardIcon,
  'file-text': FileTextIcon,
  contact: ContactIcon,
  inbox: InboxIcon,
  'user-plus': UserPlusIcon,
  users: UsersIcon,
  timer: TimerIcon,
  table: TableIcon,
  'key-round': KeyRoundIcon,
  [FALLBACK_SERVICE_ICON_NAME]: SquareIcon,
};

/** The icon component for a registry id, or a neutral mark. */
export function serviceIcon(id: string): React.ComponentType<{ className?: string }> {
  return ICONS_BY_NAME[serviceIconName(id)] ?? SquareIcon;
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
            const title = service.name;
            return (
              <SidebarMenuItem key={service.id}>
                <SidebarMenuButton
                  tooltip={title}
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
                  <span>{title}</span>
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
