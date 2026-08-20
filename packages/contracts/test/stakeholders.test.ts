import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../src/peer.js';
import {
  approvers,
  blockers,
  fetchStakeholders,
  openSeats,
  stakeholdersFor,
  stakeholderOptionsFromEnv,
  StakeholderFeedSchema,
} from '../src/stakeholders.js';

// Shaped exactly like team.alpina.solutions/api/stakeholders.json: the route
// wraps each client with its contact, open-seat count and rows.
const feed = {
  generatedAt: '2026-08-20T09:00:00.000Z',
  source: 'team.alpina.solutions/src/data/stakeholders.ts',
  counts: { clients: 1, rows: 3, openSeats: 1 },
  clients: [
    {
      id: 'shark-bridge',
      name: 'Shark Bridge',
      openSeats: 1,
      contact: {
        id: 'shark-bridge-ceo',
        clientId: 'shark-bridge',
        side: 'client',
        role: 'CEO',
        person: 'A. Person',
        email: 'ceo@example.com',
        cares: 'Ships on time',
        powers: ['approves'],
        scope: 'Everything',
        cadence: 'Weekly email',
        source: 'Kickoff call 2026-02-11',
      },
      stakeholders: [
        {
          id: 'shark-bridge-ceo',
          clientId: 'shark-bridge',
          side: 'client',
          role: 'CEO',
          person: 'A. Person',
          email: 'ceo@example.com',
          cares: 'Ships on time',
          powers: ['approves'],
          scope: 'Everything',
          cadence: 'Weekly email',
          source: 'Kickoff call 2026-02-11',
        },
        {
          id: 'shark-bridge-devops',
          clientId: 'shark-bridge',
          side: 'client',
          role: 'DevOps team',
          person: null,
          email: null,
          cares: 'Nothing breaks in prod',
          powers: ['blocks'],
          scope: 'Deploys',
          cadence: 'Ad hoc',
          source: 'Inferred from repo access',
          openAction: 'Ask the CEO who owns deploys',
          reportsTo: 'shark-bridge-ceo',
          reportsToAssumed: true,
        },
        {
          id: 'shark-bridge-alpina-pm',
          clientId: 'shark-bridge',
          side: 'alpina',
          role: 'PM',
          person: 'Dmytro Antonyuk',
          email: 'engineering@alpina-tech.com',
          cares: 'Scope stays sane',
          powers: ['consulted', 'informed'],
          scope: 'Delivery',
          cadence: 'Weekly',
          source: 'Internal',
        },
      ],
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const configured = { baseUrl: 'https://team.alpina.solutions' };

describe('fetchStakeholders', () => {
  it('parses the live feed shape', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(feed));
    const result = await fetchStakeholders({ ...configured, fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.counts.rows).toBe(3);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://team.alpina.solutions/api/stakeholders.json',
    );
  });

  it('does not require a token: the feed is not behind a bearer', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(feed));
    const result = await fetchStakeholders({ baseUrl: 'https://team.alpina.solutions', fetchImpl });
    expect(result.ok).toBe(true);
    expect((fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>)['authorization']).toBe(
      undefined,
    );
  });

  it('degrades instead of throwing when the host is unreachable', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new Error('EAI_AGAIN'));
    await expect(fetchStakeholders({ ...configured, fetchImpl })).resolves.toMatchObject({
      ok: false,
      reason: 'network-error',
    });
  });

  it('degrades when the oauth2-proxy answers with a login page', async () => {
    // team.alpina.solutions sits behind oauth2-proxy on CT 213; an unauthenticated
    // machine gets HTML, not JSON. That must not throw into a render.
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response('<html>sign in</html>', { status: 200 }));
    await expect(fetchStakeholders({ ...configured, fetchImpl })).resolves.toMatchObject({
      ok: false,
      reason: 'bad-response',
    });
  });

  it('degrades when the feed shape drifts', async () => {
    const broken = { ...feed, clients: [{ id: 'x' }] };
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(broken));
    const result = await fetchStakeholders({ ...configured, fetchImpl });
    expect(result).toMatchObject({ ok: false, reason: 'bad-response' });
    if (!result.ok) expect(result.message).toContain('drifted');
  });

  it('reports not-configured with no base url', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    await expect(fetchStakeholders({ fetchImpl })).resolves.toMatchObject({
      ok: false,
      reason: 'not-configured',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('reading the registry', () => {
  const parsed = StakeholderFeedSchema.parse(feed);

  it('lists everyone on a client, both sides', () => {
    expect(stakeholdersFor(parsed, 'shark-bridge')).toHaveLength(3);
    expect(stakeholdersFor(parsed, 'nobody')).toEqual([]);
  });

  it('separates who approves from who blocks', () => {
    expect(approvers(parsed, 'shark-bridge').map((s) => s.role)).toEqual(['CEO']);
    expect(blockers(parsed, 'shark-bridge').map((s) => s.role)).toEqual(['DevOps team']);
  });

  it('surfaces the empty seats, which is half the point of the registry', () => {
    const seats = openSeats(parsed);
    expect(seats).toHaveLength(1);
    expect(seats[0]?.openAction).toContain('Ask the CEO');
  });
});

describe('stakeholderOptionsFromEnv', () => {
  it('accepts either variable name', () => {
    expect(stakeholderOptionsFromEnv({ STAKEHOLDERS_API_URL: 'https://a' }).baseUrl).toBe(
      'https://a',
    );
    expect(stakeholderOptionsFromEnv({ TEAM_REGISTRY_URL: 'https://b' }).baseUrl).toBe('https://b');
  });
});
