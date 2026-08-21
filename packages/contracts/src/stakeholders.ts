import { z } from 'zod';
import { peerFail, peerGetJson, peerOk, type PeerRequestOptions, type PeerResult } from './peer.js';

/**
 * The stakeholder registry feed.
 *
 * Two producers serve it, and the contract has to fit both:
 *
 * - `team.alpina.solutions/src/pages/api/stakeholders.json.ts`, a static Astro
 *   route built from `src/data/stakeholders.ts`. Live today.
 * - `alpina-hub/app/src/app/api/stakeholders.json/route.ts`, which serves
 *   `stakeholderFeed()` from `@alpina-hub/core`. Built, not deployed; it takes
 *   over the path when the team content moves to `hub.alpina-tech.org`.
 *
 * It is the fleet's answer to "who approves this and who blocks it", and the
 * reason upwork-crm was told not to grow a second contacts table. Consumers read
 * the base URL from their environment rather than hardcoding a host, so the move
 * between the two is a config change.
 *
 * They agree on every key and differ on the type of one value, `contact`; see
 * `StakeholderContactSchema`. A capture of the Astro response lives in
 * `test/fixtures/stakeholders-astro.json` and is what the tests here parse,
 * because the previous tests were written from this file's own assumptions and
 * so agreed with a schema that no live producer satisfied.
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

/**
 * A client's main contact, in either form a producer sends.
 *
 * The Astro route emits `contactFor(id)?.person ?? null`, and `person` is
 * `string | null`, so what leaves that host is a bare name: `"Dan Pipitone"`.
 * The hub emits `contactFor(client.id)`, the whole row. This schema said "row"
 * from the day it was written, which means it would have rejected the only feed
 * that was actually answering.
 *
 * Accepting both is the correct fix rather than picking a winner. The hub is
 * meant to take over the path without any consumer changing code, so for as long
 * as the swap is ahead of us there are two shapes in the fleet and a client that
 * handles one of them is a client that breaks on the day of the move.
 *
 * Read it through `contactName()` and `contactRow()`; nothing downstream should
 * be narrowing this union by hand.
 */
export const StakeholderContactSchema = z.union([z.string(), StakeholderSchema]).nullable();

export type StakeholderContact = z.infer<typeof StakeholderContactSchema>;

export const StakeholderClientSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    contact: StakeholderContactSchema,
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

/**
 * The contact's name, whichever shape the producer used. `null` when the client
 * has rows but nobody named as the contact.
 */
export function contactName(client: StakeholderClient): string | null {
  const contact = client.contact;
  if (contact === null) return null;
  return typeof contact === 'string' ? contact : contact.person;
}

/**
 * The contact's full row, or `null` when the producer only sent a name.
 *
 * A caller that needs the address or the powers has to handle that `null`: the
 * Astro producer cannot supply them, and inventing a row from a name would be a
 * lie in the shape of data. `stakeholdersFor()` has the same person in it, so
 * the honest fallback is to look them up there.
 */
export function contactRow(client: StakeholderClient): Stakeholder | null {
  const contact = client.contact;
  return contact === null || typeof contact === 'string' ? null : contact;
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
