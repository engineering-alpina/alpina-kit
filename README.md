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

| Package               | What it holds                                                                                              | Status                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- |
| `@alpina/service-kit` | `createDb`, lazy `getDb`, `safeEqual`, cookie helpers, zod env parsing, health handler, kill switch        | built                       |
| `@alpina/auth`        | Zitadel OIDC code+PKCE client, session cookies (stateless and DB-backed), hashed bearer-key role verifier  | built                       |
| `@alpina/contracts`   | zod schemas + degrade-safe clients for cross-service reads, the fleet registry, FLEET.md, DESIGN-SYSTEM.md | built                       |
| `@alpina/ui`          | AppShell, sidebar with the module switcher, flat design-system tokens, shadcn-style primitives             | **not built yet** (Phase 4) |

`@alpina/ui` is deliberately absent. It comes out of upwork-crm's viewer in
Phase 4, built on the flat canon in `DESIGN-SYSTEM.md`, not on the portal's
Lumen tokens.

## Consuming a package

Pin a tag, and pin the same tag across every kit package in one repo:

```jsonc
{
  "dependencies": {
    "@alpina/service-kit": "github:engineering-alpina/alpina-kit#v0.1.0&path:/packages/service-kit",
    "@alpina/auth": "github:engineering-alpina/alpina-kit#v0.1.0&path:/packages/auth",
    "@alpina/contracts": "github:engineering-alpina/alpina-kit#v0.1.0&path:/packages/contracts",
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
```

**2. Pin every kit package you use, at one tag.** `@alpina/auth` declares
`@alpina/service-kit` as a peer dependency, so pinning `auth` alone leaves pnpm
hunting for it on the public registry, where it does not exist.

**3. Bring your own drizzle for `@alpina/service-kit/db`.** `drizzle-orm` and
`postgres` are optional peers and only that subpath needs them, so an app with
no database can use the rest of the package without installing either.

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
  `@alpina/contracts/DESIGN-SYSTEM.md`.

One known-stale row travelled with the registry: `sso` carries
`"status": "live-unused-by-apps"`, which has been wrong since SSO went live on
2026-08-18. Fixing it is Phase 0 docs work in upwork-crm, so the row is copied
as-is rather than silently corrected here.

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
