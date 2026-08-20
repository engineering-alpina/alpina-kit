import type * as React from 'react';

/**
 * The shape a service hands the shell for its own navigation.
 *
 * The kit owns the chrome and the ERP module block. It does not own any app's
 * sections: those are the app's own routes and the kit has no business knowing
 * that a lead or a candidate exists (CLAUDE.md rule 1).
 */
export interface NavItem {
  label: string;
  href: string;
  /** Any lucide icon, or anything else that takes a className. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Renders a `⌘K`-style hint on the right. */
  shortcut?: string;
  /**
   * Sub-paths that a more specific sibling entry owns, so this entry does not
   * light up when one of them is open. `/leads` with `['/leads/import']`.
   */
  exactOnlyPrefixes?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * How the shell turns an href into a link element. Passed to base-ui's `render`
 * prop, so it must be an element and not a rendered tree.
 *
 * Next apps pass `(href) => <Link href={href} />`. Defaulting to a plain anchor
 * is what keeps `next` out of this package's import graph: the shell is a peer
 * of Next, never an importer of it, so it renders under vitest with no router.
 */
export type LinkRenderer = (href: string) => React.ReactElement;

/**
 * Whether a nav entry should show as current.
 *
 * `/` matches only itself. Everything else matches its own path and anything
 * under it, unless a listed sub-path has its own entry in the sidebar, in which
 * case the parent stays quiet and the child highlights alone.
 */
export function isActive(
  pathname: string | undefined,
  href: string,
  exactOnlyPrefixes: readonly string[] = [],
): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  return !exactOnlyPrefixes.some((ex) => pathname === ex || pathname.startsWith(`${ex}/`));
}
