# Alpina fleet — service map and modularity rules

> For Claude sessions: read this before any cross-service work. Machine-readable
> twin: [services.json](services.json). Design rationale:
> [the fleet modularity spec](../superpowers/specs/2026-08-13-fleet-modularity-architecture-design.md).
> Plan of record for the URL map, hosting and the authorization fixes:
> [the fleet consolidation spec](../superpowers/specs/2026-08-20-fleet-consolidation-design.md),
> which supersedes the modularity spec's subdomain-per-service section.
> Canonical home moves to the `alpina-kit` repo when it exists (Phase 1).

## Architecture in one paragraph

Each service is an independently built and deployed app on its own
`*.alpina.solutions` subdomain (CF tunnel → Traefik CT 210 / Caddy CT 213),
with its own repo and its own Postgres database on CT 211. Composition happens
at the edge, not at runtime: no module federation, no shared runtime state.
Unification comes from shared kit packages (`@alpina/{ui,auth,service-kit,contracts}`
from the `alpina-kit` repo, consumed as pinned pnpm git deps), fleet SSO via
the existing Zitadel IdP at `auth.alpina-tech.org` (Hetzner LXC 112; OIDC
code flow per app, single login through the IdP session), and this registry.
SSO is live since 2026-08-18: upwork-crm and invoicing run their own OIDC
code flow (Zitadel project `alpina-apps`), recruiting and team sit behind
oauth2-proxy + Caddy `forward_auth` on CT 213. One Zitadel login covers all
four; each app still decides authorization locally. The upwork-crm sidebar
carries the "Alpina ERP" module switcher (plain links, edge composition).

## Services

| id                 | domain                      | repo                                                  | dev port       | DB                       | deploy                     | status            |
| ------------------ | --------------------------- | ----------------------------------------------------- | -------------- | ------------------------ | -------------------------- | ----------------- |
| upwork-crm         | upwork-crm.alpina.solutions | `PRESALE/upwork-crm`                                  | 4417           | `upwork_crm` @ CT 211    | Coolify CT 210             | live              |
| comms-hub          | comms.alpina.solutions      | `PRESALE/alpina-comms-hub`                            | — (libs + MCP) | `alpina_comms` @ CT 211  | compose CT 210             | live (read API)   |
| portal             | clients.alpina.solutions    | `PRESALE/alpina-portal`                               | 4728           | `alpina_portal` @ CT 211 | compose CT 210             | live              |
| team-registry      | team.alpina.solutions       | not in local tree; find via `gh` (engineering-alpina) | —              | in-repo data             | proxy CT 213 → CT 229:4991 | live              |
| recruiting         | recruiting.alpina.solutions | see alpina-brain log 2026-08-11                       | —              | —                        | Caddy CT 213               | live              |
| time (Kimai)       | time.alpina.solutions       | vendor (Kimai)                                        | —              | own                      | CT 229:4997                | live              |
| sso (Zitadel)      | auth.alpina-tech.org        | vendor (Zitadel), Hetzner LXC 112                     | —              | own                      | Hetzner                    | live, fleet login |
| proposal-generator | —                           | `PRESALE/proposal-generator`                          | —              | —                        | local CLI                  | local tool        |
| invoicing          | invoicing.alpina.solutions  | `PRESALE/invoicing`                                   | 4418           | `invoicing` @ CT 211     | compose CT 210             | live              |
| twenty (vendor)    | twenty.alpina-tech.org      | vendor, Hetzner                                       | —              | own                      | Hetzner                    | live              |
| hub                | hub.alpina-tech.org         | `PRODUCT/alpina-hub`                                  | 4421           | `hub` schema, Hetzner    | Coolify Hetzner VM 101     | planned           |
| case-builder       | cases.alpina-tech.org       | `PRESALE/alpina-tech-case-study`                      | 4422           | `case_builder`, Hetzner  | Coolify Hetzner VM 101     | planned           |

Repo paths are relative to `~/github/alpina/ALPINA-TECH/`.

## Hard rules

1. **One service, one repo, one database.** No cross-database queries, no shared
   tables. A service owns its master data.
2. **Read someone else's data through their API or MCP, never by copying
   tables.** Precedent: stakeholders live in team-registry
   (`/api/stakeholders.json`); upwork-crm reads them, it does not mirror them.
3. **Authn centralized, authz local** (once apps adopt SSO): Zitadel
   (`auth.alpina-tech.org`) says who you are via OIDC; each app's own role
   table says what you may do. `engineering@alpina-tech.com` is admin in every
   app and in Zitadel.
4. **Login screens show nothing but the login.** Gate at the layout; fetch no
   data on the unauthenticated path.
5. **Degrade, never depend.** An app must render fully when every peer is down.
   Cross-service panels show an explicit "service unavailable" state; the nav
   renders from this static registry.
6. **Background sync** follows the worker pattern: checkpoints, dedup,
   idempotency, kill-switch env var, heartbeat.
7. **No runtime composition.** No module federation, no shared React state
   across apps. Cross-app navigation is a normal page load.

## Adding a service (checklist)

1. Repo shaped like upwork-crm: `packages/{db,core,mcp}` + `app/` (Next 15) +
   optional `worker/`; pnpm, Node 22, TS strict, flat ESLint.
2. Unique dev port — claim it in `~/github/wiki/fleet/PORTS.md`.
3. Own Postgres database on CT 211, named after the service.
4. Kit deps once alpina-kit exists: `@alpina/ui` (AppShell), `@alpina/auth`
   (session guard), `@alpina/service-kit` (health, env, logging).
5. Public read API under `/api/v1` with zod schemas contributed to
   `@alpina/contracts`; MCP server if agents need the data.
6. Deploy: Coolify CT 210, subdomain via tunnel ingress (`homelab-ops:cf-tunnel-ingress`).
7. Docs: `CLAUDE.md`, `DEPLOY.md`, row in `services.json` + this table.

## Current gaps (as of 2026-08-18)

- SSO rollout is partial by design: upwork-crm + invoicing (OIDC in-app),
  recruiting + team (oauth2-proxy on CT 213) share the one Zitadel login.
  Still on their own auth: time (Kimai, vendor login), twenty (vendor;
  SSO is enterprise-only there), portal (client-facing Payload auth — layer 2,
  deliberately never the team SSO), comms-hub (API tokens only, no UI login),
  personal invoicing instance (password by design). Password login remains a
  fallback on upwork-crm and invoicing.
- Zitadel LXC 112 is outside restic backups (open item from 2026-08-10).
- `alpina-kit` does not exist yet (Phase 1); this registry is temporarily hosted
  in upwork-crm.
- portal, comms-hub and invoicing went live 2026-08-17 (compose on CT 210,
  per-hostname CF Access bypass apps, pg-backup cron on CT 211, portal media
  in the nightly restic staging). Contract prefill is live end-to-end
  (dedicated `invoicing-prefill` token, `/api/v1/contracts` deployed).
  Still open: comms-hub ingest waits on Gmail OAuth; Uptime Kuma (CT 203) has
  no admin account yet, so the new services have no monitors.
- A service answering on `/` is not a working service. The portal's `/admin`
  returned 500 from its first deploy until 2026-08-18 while `/` answered 307,
  so it read as live. Smoke-test the route that actually does the work.
