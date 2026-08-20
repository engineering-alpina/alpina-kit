# alpina-kit

Shared packages for the Alpina internal fleet. pnpm workspace, Node 22,
TypeScript strict ESM, `packages/*`. Consumed as pinned git deps.

Read [README.md](README.md) for what each package holds and how a consumer
installs it. This file is the rules.

## Hard rules

1. **No business logic.** A kit package knows HTTP, crypto, cookies, zod and
   drizzle. It does not know what a lead, an invoice or a candidate is. If a
   function needs a service's tables to make sense, it belongs in that service.
2. **No per-app authorization.** `@alpina/auth` resolves an identity and stops.
   Allowlists, users tables, role-to-permission maps and "is this person an
   admin" all live in the consuming app. Fleet rule 3: authn centralized
   (Zitadel), authz local. The one time this rule was broken in the fleet,
   invoicing's `emailAllowed()` ended up inside its SSO module and could not be
   reused by upwork-crm, which decides the same question from a table.
3. **No unauthenticated fallbacks.** There is no "if no key is configured,
   assume this role" path, and none may be added. comms-hub's `COMMS_MCP_ROLE`
   was exactly that and it is one of the audit's open holes.
4. **A peer being down is a value, not an exception.** Every client in
   `@alpina/contracts` returns `PeerResult`. Nothing in this repo throws into a
   caller's render path.
5. **Kill switches default to off.** An unset variable means "do not run".
6. **No secrets in error messages.** `parseEnv` names the variable that failed
   and never prints its value; a test pins that.
7. **The kit never imports a consumer.** Dependencies point one way. If the kit
   seems to need something from a service, the abstraction is wrong.
8. **Every export has a test.** Vitest per package, colocated in `test/`.

## Package boundaries

- `@alpina/service-kit` — process primitives. Zero fleet knowledge. Only
  `drizzle-orm` and `postgres` as optional peers, and they are reachable solely
  through the `/db` subpath so an app without a database never loads them.
- `@alpina/auth` — authentication mechanics. Depends on `service-kit`. Nothing
  else in the kit may depend on it.
- `@alpina/contracts` — the shapes services exchange, plus the registry. May
  depend on `zod` and nothing else in the kit.
- `@alpina/ui` (Phase 4) — will depend on `contracts` for `services.json` and on
  nothing else.

Cross-package deps are declared `workspace:*` and rewritten to git specs by the
release script. Keep the graph shallow; a cycle cannot be released.

## Adding a contract

A client goes in `@alpina/contracts` when two or more services exchange the
data, or when one will. It needs:

1. A zod schema with `.passthrough()`, so the producer can add columns without
   breaking consumers.
2. A client built on `peerGetJson`, returning `PeerResult`.
3. An `…OptionsFromEnv` helper using the variable names the consumer already
   sets. Do not rename a deployed env var to make the kit tidier.
4. A test per failure mode with a mocked fetch: not-configured, timeout,
   unauthorized, http-error, bad-response, network-error.
5. A note naming the producing route, so the next person can find it.

## Versioning and tagging

Pinned git deps mean the tag IS the release. There is no registry to publish to
and no `latest`, so an untagged change reaches nobody and a bad tag reaches
everybody at once.

- **Semver, judged from a consumer's view.** Patch: a fix with no signature
  change. Minor: new exports, new optional parameters. Major: a changed
  signature, a removed export, a changed default, or a schema that now rejects
  input it used to accept.
- **Tightening a schema is a breaking change** even when the producer was
  already sending the stricter shape. A consumer's build starts failing.
- **One version for the whole workspace.** All packages carry the same version
  and are tagged together. A consumer pinning mixed tags is the failure mode
  this avoids.
- **Never move a tag.** A consumer's lockfile has the commit sha; moving the tag
  gives two machines different code under one version. Cut a new patch instead.
- **Never delete a tag** that any repo pins. Check with a grep across
  `~/github/alpina*` before removing one.
- **Cut a release only from a green tree.** `pnpm release` runs typecheck, test
  and build first and refuses a dirty tree.
- **Adopting is a separate commit in the consumer.** Bump the pin, delete the
  local copy, run the consumer's tests. Never bump a pin and change consumer
  behavior in the same commit: when something breaks, the bisect has to be able
  to tell those apart.

### Cutting one

```sh
pnpm release 0.2.0        # verify, bump, rewrite deps, tag, restore
git push origin main v0.2.0
```

Then in each consumer, one at a time, oldest-riskiest last:

```sh
pnpm add "@alpina/service-kit@github:engineering-alpina/alpina-kit#v0.2.0&path:/packages/service-kit"
pnpm test && pnpm typecheck && pnpm build
```

## Traps

- `pnpm install` runs each package's `prepare`, so a broken `tsc` fails the
  install rather than the build. That is deliberate: a git dep is only usable if
  `prepare` works.
- Relative imports inside `src/` must carry a `.js` extension. The build emits
  real NodeNext ESM; a missing extension resolves in vitest and fails at runtime.
- `exactOptionalPropertyTypes` is on. Spread an optional property in
  conditionally (`...(x === undefined ? {} : { x })`) rather than assigning
  `undefined`.
- `services.json` is copied to `dist/data/` by `scripts/copy-data.mjs`, not by
  tsc. Adding another data file means adding it there.
- The canonical `FLEET.md`, `DESIGN-SYSTEM.md` and `services.json` live here,
  but upwork-crm and team.alpina.solutions still read their own copies until the
  adoption task turns those into pointers. Edit here first, then mirror, until
  the pointers land.
