import { z } from 'zod';
import { peerFail, peerGetJson, peerOk, type PeerRequestOptions, type PeerResult } from './peer.js';

/**
 * The stakeholder registry feed.
 *
 * Producer: `team.alpina.solutions/src/pages/api/stakeholders.json.ts`, a static
 * Astro route built from `src/data/stakeholders.ts`. It is the fleet's answer to
 * "who approves this and who blocks it", and the reason upwork-crm was told not
 * to grow a second contacts table.
 *
 * The feed moves host when the team content lands in the hub
 * (`hub.alpina-tech.org`), and the hub spec commits to keeping this contract
 * unchanged across that move. Consumers should read the base URL from the
 * registry rather than hardcoding a host.
 */

export const SideSchema = z.enum(['client', 'alpina']);
export type Side = z.infer<typeof SideSchema>;

/** What this person can do to our work. */
export const PowerSchema = z.enum(['approves', 'blocks', 'consulted', 'informed']);
export type Power = z.infer<typeof PowerSchema>;

export const StakeholderSchema = z
  .object({
    id: z.string(),
    clientId: z.string(),
    side: SideSchema,
    role: z.string(),
    /** null when the seat exists but nobody fills it. Half the registry's value. */
    person: z.string().nullable(),
    email: z.string().nullable(),
    cares: z.string(),
    powers: z.array(PowerSchema),
    scope: z.string(),
    cadence: z.string(),
    market: z.string().optional(),
    reportsTo: z.string().optional(),
    /** true when the reporting line is our inference, not something we were told. */
    reportsToAssumed: z.boolean().optional(),
    source: z.string(),
    openAction: z.string().optional(),
    note: z.string().optional(),
  })
  .passthrough();

export type Stakeholder = z.infer<typeof StakeholderSchema>;

export const StakeholderClientSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    contact: StakeholderSchema.nullable(),
    openSeats: z.number(),
    stakeholders: z.array(StakeholderSchema),
  })
  .passthrough();

export type StakeholderClient = z.infer<typeof StakeholderClientSchema>;

export const StakeholderFeedSchema = z
  .object({
    generatedAt: z.string(),
    source: z.string(),
    counts: z.object({
      clients: z.number(),
      rows: z.number(),
      openSeats: z.number(),
    }),
    clients: z.array(StakeholderClientSchema),
  })
  .passthrough();

export type StakeholderFeed = z.infer<typeof StakeholderFeedSchema>;

/** Default path on the producing host. */
export const STAKEHOLDERS_PATH = '/api/stakeholders.json';

export async function fetchStakeholders(
  options: PeerRequestOptions,
): Promise<PeerResult<StakeholderFeed>> {
  const body = await peerGetJson(STAKEHOLDERS_PATH, options);
  if (!body.ok) return body;

  const parsed = StakeholderFeedSchema.safeParse(body.data);
  if (!parsed.success) {
    return peerFail(
      'bad-response',
      `stakeholder feed shape drifted: ${parsed.error.issues[0]?.message}`,
    );
  }
  return peerOk(parsed.data);
}

export function stakeholderOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): PeerRequestOptions {
  return {
    baseUrl: env['STAKEHOLDERS_API_URL'] ?? env['TEAM_REGISTRY_URL'],
    token: env['STAKEHOLDERS_API_TOKEN'],
  };
}

/** Everyone on a client, both sides, flattened. */
export function stakeholdersFor(feed: StakeholderFeed, clientId: string): Stakeholder[] {
  return feed.clients.find((c) => c.id === clientId)?.stakeholders ?? [];
}

/** Who can say yes. The question a proposal or a change request actually asks. */
export function approvers(feed: StakeholderFeed, clientId: string): Stakeholder[] {
  return stakeholdersFor(feed, clientId).filter((s) => s.powers.includes('approves'));
}

/** Who can say no. */
export function blockers(feed: StakeholderFeed, clientId: string): Stakeholder[] {
  return stakeholdersFor(feed, clientId).filter((s) => s.powers.includes('blocks'));
}

/** Named roles with nobody in them, across every client. Releases stall on these. */
export function openSeats(feed: StakeholderFeed): Stakeholder[] {
  return feed.clients.flatMap((c) => c.stakeholders.filter((s) => s.person === null));
}
