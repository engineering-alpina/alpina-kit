import { z } from 'zod';
import registryData from './data/services.json' with { type: 'json' };

/**
 * The fleet registry, moved here from upwork-crm `docs/architecture/`.
 *
 * It lived in upwork-crm only because that repo existed and alpina-kit did not,
 * and both the modularity spec and its own header said the canonical home is
 * this package. `FLEET.md` and `DESIGN-SYSTEM.md` came with it and sit in
 * `docs/`, reachable as `@alpina/contracts/FLEET.md`.
 *
 * The copies in upwork-crm and team.alpina.solutions are still the ones their
 * repos read. Turning them into pointers is the adoption task, not this one.
 *
 * Parsed with zod at import so a hand-edited registry fails loudly here rather
 * than rendering a broken module switcher.
 */

export const ServiceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /**
     * What a sidebar should call it, when `name` is too long or carries
     * deployment metadata. "Time tracking (Kimai, vendor)" wraps to two lines in
     * a module menu and "Twenty CRM (vendor)" reads oddly as a menu item; the
     * "(vendor)" part describes how the thing is run, not what to click.
     * Consumers read `serviceLabel()`, never `name` directly, so no app has to
     * trim strings of its own.
     */
    shortName: z.string().optional(),
    /** null for local tools with no host. */
    domain: z.string().nullable(),
    /** Path under `~/github/`, or a note for vendor apps. */
    repo: z.string(),
    devPort: z.number().nullable(),
    db: z.string().nullable(),
    deploy: z.string(),
    health: z.string().nullable(),
    api: z.string().nullable(),
    /** MCP tool prefixes, e.g. `crm_*`. */
    mcp: z.array(z.string()),
    status: z.string(),
    /** How a caller authenticates. Free text: the shapes vary too much to enum. */
    auth: z.string().optional(),
  })
  .passthrough();

export type Service = z.infer<typeof ServiceSchema>;

export const RegistrySchema = z
  .object({
    updated: z.string(),
    services: z.array(ServiceSchema),
  })
  .passthrough();

export type Registry = z.infer<typeof RegistrySchema>;

export const registry: Registry = RegistrySchema.parse(registryData);

export const services: readonly Service[] = registry.services;

export function serviceById(id: string): Service | undefined {
  return services.find((s) => s.id === id);
}

/** `https://<domain>`, or undefined for a service with no host. */
export function serviceBaseUrl(id: string): string | undefined {
  const domain = serviceById(id)?.domain;
  return domain ? `https://${domain}` : undefined;
}

/**
 * Services worth putting in a module switcher: they have a host and are live.
 * The switcher renders from this static list on purpose, so a dead peer cannot
 * empty another app's navigation (FLEET.md rule 5).
 */
export function navigableServices(): Service[] {
  return services.filter((s) => s.domain !== null && s.status.startsWith('live'));
}
