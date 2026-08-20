import { z } from 'zod';
import {
  peerFail,
  peerGetJson,
  peerOk,
  unwrapList,
  type PeerRequestOptions,
  type PeerResult,
} from './peer.js';

/**
 * upwork-crm `/api/v1` read contracts.
 *
 * Producer: `viewer/app/api/v1/contracts/route.ts` calls `listContracts`, which
 * returns rows of the `contracts` table straight from drizzle. Consumer today:
 * invoicing `packages/core/src/upwork-crm.ts`, which prefills an invoice from a
 * contract.
 *
 * The schema lives here rather than in either repo so a consumer never needs
 * the producer checked out, and so a drift breaks the consumer's build (its
 * test parses a fixture with this schema) rather than a production render.
 *
 * `passthrough` is deliberate: upwork-crm adds columns often, and a consumer
 * that only wants a rate must not break when a `deliveryModel` appears.
 */

/** Money arrives as a numeric string from postgres, not a number. */
const decimalString = z.string().nullish();

export const UpworkContractSchema = z
  .object({
    id: z.string(),
    upworkContractId: z.string().nullish(),
    title: z.string().nullish(),
    status: z.string().nullish(),
    kind: z.string().nullish(),
    deliveryModel: z.string().nullish(),
    clientOrgId: z.string().nullish(),
    clientOrgName: z.string().nullish(),
    freelancerName: z.string().nullish(),
    jobId: z.string().nullish(),
    hourlyRate: decimalString,
    fixedAmount: decimalString,
    currency: z.string().nullish(),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
  })
  .passthrough();

export type UpworkContract = z.infer<typeof UpworkContractSchema>;

export const UpworkContractListSchema = z.array(UpworkContractSchema);

export interface UpworkCrmClientOptions extends PeerRequestOptions {
  /** Bearer token from upwork-crm's api_tokens table. Required. */
  token?: string | undefined;
}

/**
 * Reads every contract. Returns `{ ok: false }` on any failure, so the invoice
 * form renders with an "upwork-crm unavailable" notice and a manual entry path
 * instead of a 500.
 */
export async function fetchContracts(
  options: UpworkCrmClientOptions,
): Promise<PeerResult<UpworkContract[]>> {
  const body = await peerGetJson('/api/v1/contracts', { ...options, requireToken: true });
  if (!body.ok) return body;

  const list = unwrapList(body.data);
  if (!list) return peerFail('bad-response', 'expected an array or { data: [] }');

  const parsed = UpworkContractListSchema.safeParse(list);
  if (!parsed.success) {
    return peerFail('bad-response', `contract shape drifted: ${parsed.error.issues[0]?.message}`);
  }
  return peerOk(parsed.data);
}

/** Reads the client's env the way invoicing already names the variables. */
export function upworkCrmOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): UpworkCrmClientOptions {
  return {
    baseUrl: env['UPWORK_CRM_API_URL'],
    token: env['UPWORK_CRM_API_TOKEN'],
  };
}

/** Everything an invoice prefill needs from a contract, in one flat shape. */
export interface ContractPrefill {
  contractId: string;
  upworkContractId: string | null;
  title: string | null;
  clientName: string | null;
  currency: string;
  /** Set for hourly contracts. */
  hourlyRate: number | null;
  /** Set for fixed-price contracts. */
  fixedAmount: number | null;
}

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toPrefill(contract: UpworkContract): ContractPrefill {
  return {
    contractId: contract.id,
    upworkContractId: contract.upworkContractId ?? null,
    title: contract.title ?? null,
    clientName: contract.clientOrgName ?? null,
    currency: contract.currency ?? 'USD',
    hourlyRate: toNumber(contract.hourlyRate),
    fixedAmount: toNumber(contract.fixedAmount),
  };
}
