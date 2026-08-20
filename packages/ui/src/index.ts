/**
 * `@alpina/ui` — the flat Alpina look, once.
 *
 * Three things ship here and nothing else does.
 *
 * 1. **Tokens.** `@alpina/ui/tokens.css` is the canon in
 *    `@alpina/contracts/DESIGN-SYSTEM.md` expressed as CSS: oklch neutrals,
 *    `#3c49ec`, 2px everywhere, no shadows, Geist. It is not imported from here;
 *    a consumer's stylesheet imports it directly.
 * 2. **The shell.** Sidebar plus topbar, with the ERP module block rendered from
 *    the registry rather than from a list somebody has to remember to update.
 * 3. **Primitives.** The shadcn-style components on `@base-ui/react` that
 *    upwork-crm had vendored, minus the ones that only made sense there.
 *
 * The rules from CLAUDE.md that bite hardest in a UI package: no business logic
 * (the shell takes an app's sections as props and never names a route itself),
 * and no session behaviour (the app decides whether a shell renders at all).
 */

export { cn } from './lib/cn.js';
export { useIsMobile, MOBILE_BREAKPOINT } from './lib/use-mobile.js';
