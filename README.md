# alpina-kit

Shared packages for the Alpina internal fleet. One pnpm workspace, consumed by
every service as pinned git dependencies.

It exists because the same code was living in six places. The 2026-08-20 service
audit counted `createDb()` twice, the lazy `getDb()` singleton three times,
`safeEqual()` three times, `readCookie()` twice, a hand-written Zitadel OIDC
client twice, and the SHA-256-key-to-role scheme three times with a fourth
planned. Every copy had drifted at least a little, and one of the `safeEqual`
copies leaked the length of the secret it compared.

Design: [fleet modularity spec](../../PRESALE/upwork-crm/docs/superpowers/specs/2026-08-13-fleet-modularity-architecture-design.md)
§3.2 and [fleet consolidation spec](../../PRESALE/upwork-crm/docs/superpowers/specs/2026-08-20-fleet-consolidation-design.md)
Phase 3.

## Packages

| Package               | What it holds                                                                                                                  | Status |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `@alpina/service-kit` | `createDb`, lazy `getDb`, `safeEqual`, cookie helpers, zod env parsing, health handler, kill switch                            | built  |
| `@alpina/auth`        | Zitadel OIDC code+PKCE client, session cookies (stateless and DB-backed), hashed bearer-key role verifier                      | built  |
| `@alpina/contracts`   | zod schemas + degrade-safe clients for cross-service reads, the fleet registry and its module list, FLEET.md, DESIGN-SYSTEM.md | built  |
| `@alpina/ui`          | flat design tokens, AppShell whose module switcher reads the registry, shadcn-style primitives                                 | built  |

## Consuming a package

Pin a tag, and pin the same tag across every kit package in one repo:

```jsonc
{
  "dependencies": {
    "@alpina/service-kit": "github:engineering-alpina/alpina-kit#v0.1.0&path:/packages/service-kit",
    "@alpina/auth": "github:engineering-alpina/alpina-kit#v0.1.0&path:/packages/auth",
    "@alpina/contracts": "github:engineering-alpina/alpina-kit#v0.1.0&path:/packages/contracts",
    "@alpina/ui": "github:engineering-alpina/alpina-kit#v0.1.0&path:/packages/ui",
  },
}
```

No registry server. This follows the `fleet-config` precedent already used for
prettier and eslint across the fleet. Packages build to `dist` on install via
their `prepare` script, so a consumer gets compiled JS and `.d.ts` files.

Three things a consumer has to get right. All three were established by
installing the kit into a scratch project, not by reading docs:

**1. Allow the build.** pnpm 11 refuses to run a git dependency's `prepare`
unless the package is allowlisted, and the install fails outright with
`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`. In the consumer's
`pnpm-workspace.yaml`:

```yaml
allowBuilds:
  '@alpina/service-kit': true
  '@alpina/auth': true
  '@alpina/contracts': true
  '@alpina/ui': true
```

**2. Pin every kit package you use, at one tag.** `@alpina/auth` declares
`@alpina/service-kit` as a peer dependency, so pinning `auth` alone leaves pnpm
hunting for it on the public registry, where it does not exist.

**3. Bring your own drizzle for `@alpina/service-kit/db`.** `drizzle-orm` and
`postgres` are optional peers and only that subpath needs them, so an app with
no database can use the rest of the package without installing either.

**4. `@alpina/ui` needs React 19, `@base-ui/react` and `lucide-react`** in the
consumer, and `@alpina/contracts` pinned at the same tag. Next and Tailwind are
optional peers: the shell takes `pathname` and a link renderer as props rather
than importing `next`, so it renders under vitest with no router.

**5. An app with no React can still use the kit.** The registry, the module
list, the icon names and the design tokens are all reachable without it. That is
the point of the split: `@alpina/contracts` depends on zod and nothing else, and
`@alpina/ui/tokens.css` is plain CSS that a Tailwind build improves rather than
requires. See "Adopting without Tailwind" and "Adopting without React" below.

### Examples

```ts
// service-kit: one lazy db per process, health, env, kill switch
import { createLazyDb } from '@alpina/service-kit/db';
import { createHealthHandler, parseEnv, killSwitch } from '@alpina/service-kit';
import * as schema from './schema/index.js';

const { getDb } = createLazyDb({ schema, errorPrefix: 'invoicing' });
export const GET = createHealthHandler({ service: 'invoicing' });
if (!killSwitch('INVOICING_SYNC_ENABLED', { label: 'sync' }).check()) process.exit(0);
```

```ts
// auth: identity from Zitadel, authorization stays here
import { completeLogin, ssoConfigFromEnv } from '@alpina/auth';

const result = await completeLogin(ssoConfigFromEnv(), { req });
if (!result.ok) return redirect(`/login?error=${result.error}`);
const user = await findUserByEmail(result.email); // ← your table, your rules
if (!user) return redirect('/login?error=no-account');
```

```ts
// contracts: a peer being down is a render state, not an exception
import { fetchContracts, peerFailureLabel, upworkCrmOptionsFromEnv } from '@alpina/contracts';

const result = await fetchContracts(upworkCrmOptionsFromEnv());
if (!result.ok) return <Unavailable service="upwork-crm" why={peerFailureLabel(result.reason)} />;
```

## Adopting `@alpina/ui`

Two steps. Neither one touches a page.

**Tokens.** One import in the app's stylesheet, after Tailwind:

```css
@import 'tailwindcss';
@import '@alpina/ui/tokens.css';
```

That is the whole design system: oklch neutrals, `--primary: #3c49ec`, 2px on
every step of the radius scale, a zeroed shadow scale, Geist wired through
`--font-geist-sans` and `--font-geist-mono`. There is no Tailwind preset to
install; Tailwind v4 configures itself from CSS, and the file carries its own
`@source "../dist"` so the kit's class names are scanned without the consumer
listing a node_modules path.

It also defines the base-ui state variants the primitives use (`data-open`,
`data-closed`, `data-active`, `data-horizontal`, `data-vertical`). v0.1.0 did
not, and since those live in `shadcn/tailwind.css`, a consumer that imported
only `tokens.css` got dialogs and tooltips with no open or closed styling and
nothing to explain it, because Tailwind drops an unknown variant in silence.
upwork-crm was unaffected only because it already imported shadcn.

One thing is still not self-contained. The dialog, sheet and tooltip carry
`animate-in`, `fade-in-0`, `zoom-in-95` and `slide-in-from-*` from
`tw-animate-css`. Without it they open and close with no transition, which is a
cosmetic loss rather than a broken component, so the kit does not vendor an
animation library for it. Add `@import 'tw-animate-css';` if you want the
motion.

Fonts resolve through `--font-geist-sans` / `--font-geist-mono`, so wire
next/font under those names:

```ts
const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
```

Naming the next/font variable `--font-sans` instead puts it on `:root` next to
Tailwind's own theme variable of that name, and which one wins comes down to
stylesheet order.

Dark is defined and never activates: it is keyed on `data-theme="dark"` on
`<html>`, which internal services do not set, and there is no
`prefers-color-scheme` rule in the file.

**Shell.** The app supplies its own sections and its own router. The kit
supplies the chrome and the ERP module block.

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppShell } from '@alpina/ui';

<AppShell
  brand={{ title: 'Alpina ERP', subtitle: 'Upwork CRM module', logoSrc: '/alpina-mark.svg' }}
  serviceId="upwork-crm" // registry id, so the switcher does not link to itself
  groups={[{ label: 'Workspace', items: [{ label: 'Leads', href: '/leads', icon: UsersIcon }] }]}
  pathname={usePathname()}
  renderLink={(href) => <Link href={href} />}
  topbar={<TenantSwitcher />}
  topbarClassName="sticky top-6" // clears an app's own status strip
  modulePosition={-1} // ERP block above the last group, not appended
>
  {children}
</AppShell>;
```

`topbarClassName` and `modulePosition` both exist because upwork-crm hit their
absence and stopped using `AppShell` over it. `modulePosition` takes `'start'`,
`'end'` (the default), `'none'`, or an index to insert before; a negative index
counts from the end. `'none'` is for an app that wants to place the exported
`<ModuleSwitcher />` itself.

Menu labels come from `serviceLabel()`, which prefers a row's `shortName` over
its `name`. Registry names describe a service in a table of services, so several
carry deployment metadata: "Time tracking (Kimai, vendor)" wraps to two lines in
a sidebar. No consumer should be trimming those strings itself.

**What adopting deletes.** The Alpina ERP block renders from
`navigableServices()` in `@alpina/contracts`, so the two hand-maintained module
lists go: the `erpModules` array in upwork-crm's
`viewer/components/app-sidebar.tsx` and the one in alpina-recruiting's
`docs/src/components/ErpNav.tsx`. They had already drifted. upwork-crm pointed
"Recruiting" at `recruiting.alpina.solutions`, recruiting pointed "ATS" at
`recruitment.alpina.solutions`, and only one of the two listed the CRM at all.

Recruiting deletes more than its link list. Its hand-copied
`NON_MODULE_SERVICE_IDS` and `SERVICE_ICONS` go too, now that both are in
`@alpina/contracts` where a Docusaurus site can import them.

The switcher reads the static registry and never fetches, so a peer being down
cannot empty another service's navigation.

**What the shell will not do.** It has no user prop, no session, no redirect and
no login state. The fleet rule is that an unauthenticated visitor sees the login
form and nothing else, and the only way to hold that line is for the app to
resolve its session first and decide whether a shell renders at all. A shell
that can render "logged out" is a shell that will one day put a route name in an
unauthenticated HTML payload.

## Adopting without Tailwind

Import the token file and nothing else:

```css
@import '@alpina/ui/tokens.css';
```

Every token is declared in plain `:root`, so a browser with no build step gets
all of them: `--sans` / `--mono` / `--heading` (also spelled `--font-sans`,
`--font-mono`, `--font-heading`), `--radius` and its whole scale, `--shadow` and
`--shadow-*`, and every colour. The `@theme` block does nothing but alias those
names into Tailwind's namespaces.

v0.1.0 got this wrong and alpina-portal, which has no Tailwind at all, paid for
it. A browser does not ignore the `@theme` keyword and keep what is inside: it
discards the whole at-rule, so every property declared in there is undefined.
Measured on v0.1.0 in a plain HTML page, `--font-sans` came back as the empty
string and the body rendered in Times. Measured on this version, the same page
reports the Geist stack, `--radius-md: 2px` and `--shadow-md: 0 0 #0000`. Two
tests hold the line: nothing a consumer reads may live inside `@theme`, and no
`@theme` entry may carry a literal value.

What plain CSS still does not get is the `@apply` rules at the bottom of the
file (`html { @apply font-sans }` and friends), because `@apply` is a Tailwind
directive. Set `font-family: var(--sans)` on `body` yourself, which is what the
portal does.

## Adopting without React

`@alpina/contracts` has no rendering dependency, so a Docusaurus site or a
static page can read the same fleet data the shell reads:

```ts
import { moduleServices, serviceIconName, serviceLabel } from '@alpina/contracts';

for (const service of moduleServices({ currentServiceId: 'recruiting' })) {
  // serviceIconName returns a lucide name as a string, e.g. 'layout-dashboard'.
  // Resolve it with whatever you draw with; contracts never imports an icon set.
  render(iconFor(serviceIconName(service.id)), serviceLabel(service), service.domain);
}
```

`NON_MODULE_SERVICE_IDS`, `SERVICE_ICON_NAMES` and `moduleServices` lived in
`@alpina/ui` in v0.1.0, which put them out of reach for alpina-recruiting:
importing the React package for two constants would have pulled in React 19,
`@base-ui/react` and the whole primitive library. So it copied them, which is
exactly the duplication this repo exists to remove. They are data, and data
belongs in `@alpina/contracts`.

## What moved here

`services.json`, `FLEET.md` and `DESIGN-SYSTEM.md` are now canonical in
`packages/contracts` (`src/data/` and `docs/`). Both earlier specs said this is
where they belong; they lived in upwork-crm and team.alpina.solutions only
because this repo did not exist.

**The originals are still in place and still the ones their repos read.**
Turning them into pointers is part of the adoption task:

- `upwork-crm/docs/architecture/services.json` and `FLEET.md` → replace with a
  pointer at `@alpina/contracts`, and have the viewer's sidebar read
  `navigableServices()` instead of a hardcoded link list.
- `team.alpina.solutions/DESIGN-SYSTEM.md` → pointer at
  `@alpina/contracts/DESIGN-SYSTEM.md`. The two files are byte-identical as of
  2026-08-20, so the pointer is safe to land whenever somebody gets to it.
  `@alpina/ui/tokens.css` is that document expressed as CSS, and its test fails
  on any radius above 2px or any shadow that draws.

The registry here is current. The `sso` row reads
`"status": "live (fleet login since 2026-08-18)"`, so the note that used to
stand here about a stale row travelling with the copy no longer applies.

## Working in this repo

```sh
pnpm install      # also builds every package (prepare)
pnpm build        # tsc per package, topological order
pnpm test         # vitest per package
pnpm typecheck
pnpm lint         # fleet-config eslint flat base
pnpm format       # fleet-config prettier
```

Node 22, TypeScript strict ESM, `packages/*`. Conventions match upwork-crm so a
session in either repo needs no new toolchain.

## Releasing

Pinned git deps make the tag the unit of distribution, so tagging discipline is
the whole release process.

```sh
pnpm release 0.2.0
git push origin main v0.2.0
```

The script verifies (typecheck, test, build), checks that no package lists
another kit package in `dependencies`, bumps every version to the same number,
commits and tags. See CLAUDE.md for the versioning rules, the intra-kit
dependency rule and the rest of the checklist.

Nothing is published anywhere. An untagged change reaches nobody, and a tag,
once pushed, is never moved.
