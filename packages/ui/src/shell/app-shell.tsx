'use client';

import * as React from 'react';

import { cn } from '../lib/cn.js';
import { Separator } from '../ui/separator.js';
import { TooltipProvider } from '../ui/tooltip.js';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '../ui/sidebar.js';
import { ModuleSwitcher } from './module-switcher.js';
import { isActive, type LinkRenderer, type NavGroup } from './nav.js';

/**
 * The shell every internal Alpina service renders inside: collapsible sidebar on
 * the left, sticky topbar, content in the middle.
 *
 * Two things it deliberately does not do.
 *
 * **It knows nothing about sessions.** No user, no role, no login state, no
 * redirect. The fleet rule is that an unauthenticated visitor sees the login form
 * and nothing else, and the only way to guarantee that is for the app to decide
 * whether to render a shell at all. So the app gates first and mounts this
 * second. A shell that could render "logged out" is a shell that will one day
 * leak a route name into an unauthenticated HTML payload.
 *
 * **It does not fetch.** The ERP module block comes from the static registry
 * compiled into `@alpina/contracts`. A dead peer cannot empty this navigation
 * because nothing asks the peer anything.
 */

export interface ShellBrand {
  /** Line one. Usually "Alpina ERP". */
  title: string;
  /** Line two, monospaced. Usually "<something> module". */
  subtitle?: string;
  /** Served by the consuming app, e.g. `/alpina-mark.svg`. */
  logoSrc?: string;
  logoAlt?: string;
  /** Where the brand links to. Omit for a non-clickable mark. */
  href?: string;
}

export interface AppShellProps {
  brand: ShellBrand;
  /**
   * This service's id in the registry, so the module switcher does not offer a
   * link back to the page you are already on.
   */
  serviceId?: string;
  /** The app's own sections. The kit supplies the chrome, never the routes. */
  groups: NavGroup[];
  /** Current path, for highlighting. Next apps pass `usePathname()`. */
  pathname?: string;
  /** How to render an internal link. Defaults to a plain anchor. */
  renderLink?: LinkRenderer;
  /** Contents of the sticky topbar, to the right of the sidebar toggle. */
  topbar?: React.ReactNode;
  /**
   * Applied to the `<header>`, so an app can offset or restyle the bar without
   * rebuilding the shell. upwork-crm needs `sticky top-6` to clear its HudBar,
   * and in v0.1.0 the only way to get it was to stop using `AppShell`.
   */
  topbarClassName?: string;
  /** Extra registry ids to keep out of the module block. */
  excludeServices?: readonly string[];
  /** Label above the module block. Defaults to "Alpina ERP". */
  moduleGroupLabel?: string;
  /** Anything the app wants pinned to the bottom of the sidebar. */
  sidebarFooter?: React.ReactNode;
  /** Applied to the `<main>` wrapper. */
  contentClassName?: string;
  children: React.ReactNode;
}

const defaultRenderLink: LinkRenderer = (href) => <a href={href} />;


function Brand({ brand, renderLink }: { brand: ShellBrand; renderLink: LinkRenderer }) {
  const inner = (
    <>
      {brand.logoSrc && (
        // A plain <img>, not next/image: the kit is a peer of Next, not an
        // importer of it, and a 28px mark gains nothing from the optimizer.
        <img
          src={brand.logoSrc}
          alt={brand.logoAlt ?? brand.title}
          width={28}
          height={28}
          className="h-7 w-7 shrink-0"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-semibold tracking-tight">{brand.title}</span>
        {brand.subtitle && (
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {brand.subtitle}
          </span>
        )}
      </span>
    </>
  );

  const className = 'flex items-center gap-2 px-2 py-1.5';
  if (!brand.href) {
    return (
      <div data-slot="shell-brand" className={className}>
        {inner}
      </div>
    );
  }
  const link = renderLink(brand.href) as React.ReactElement<Record<string, unknown>>;
  return React.cloneElement(link, { 'data-slot': 'shell-brand', className }, inner);
}

export function AppShell({
  brand,
  serviceId,
  groups,
  pathname,
  renderLink = defaultRenderLink,
  topbar,
  topbarClassName,
  excludeServices,
  moduleGroupLabel,
  sidebarFooter,
  contentClassName,
  children,
}: AppShellProps) {
  const groupNodes = groups.map((group) => (
    <SidebarGroup key={group.label}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={isActive(pathname, item.href, item.exactOnlyPrefixes ?? [])}
                  tooltip={item.label}
                  render={renderLink(item.href)}
                >
                  {Icon ? <Icon /> : null}
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] group-data-[collapsible=icon]:hidden md:inline-flex">
                      {item.shortcut}
                    </kbd>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));

  groupNodes.push(
    <ModuleSwitcher
      key="alpina-erp-modules"
      currentServiceId={serviceId}
      exclude={excludeServices}
      {...(moduleGroupLabel === undefined ? {} : { label: moduleGroupLabel })}
    />,
  );

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <Brand brand={brand} renderLink={renderLink} />
          </SidebarHeader>

          <SidebarContent>{groupNodes}</SidebarContent>

          {sidebarFooter && (
            <SidebarFooter>
              <SidebarSeparator />
              {sidebarFooter}
            </SidebarFooter>
          )}
        </Sidebar>

        <SidebarInset>
          <ShellTopbar className={topbarClassName}>{topbar}</ShellTopbar>
          <main className={cn('flex-1 px-4 py-6 md:px-8', contentClassName)}>
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

/**
 * Split out so an app that composes its own layout can still get the same bar.
 * Exported mainly because upwork-crm puts a status strip above it.
 */
export function ShellTopbar({
  className,
  children,
}: {
  // `| undefined` explicitly, because exactOptionalPropertyTypes is on and
  // AppShell forwards its own optional prop straight through.
  className?: string | undefined;
  children?: React.ReactNode;
}) {
  return (
    <header
      data-slot="shell-topbar"
      className={cn(
        'sticky top-0 z-30 flex min-h-14 flex-wrap items-center gap-2 border-b border-border/60 bg-background px-4 py-2',
        className,
      )}
    >
      <SidebarTrigger className="-ml-1 shrink-0" />
      <Separator orientation="vertical" className="mx-1 h-5 shrink-0" />
      {children}
    </header>
  );
}
