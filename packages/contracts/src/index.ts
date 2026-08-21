/**
 * `@alpina/contracts` — how one Alpina service reads another, and the registry
 * of what exists.
 *
 * Two rules shape everything here.
 *
 * 1. **Contracts live with the consumer's tooling, not the producer's repo.**
 *    A service that needs upwork-crm's contracts should not need upwork-crm
 *    checked out. A drift in the producer breaks the consumer's test, which is
 *    where someone can act on it.
 * 2. **Degrade, never depend.** No client here throws. A peer that is down,
 *    slow, unauthorised or has changed shape returns `{ ok: false, reason }`.
 */

export {
  peerOk,
  peerFail,
  peerGetJson,
  peerFailureLabel,
  unwrapList,
  type PeerResult,
  type PeerFailure,
  type PeerRequestOptions,
  type FetchLike,
} from './peer.js';

export {
  fetchContracts,
  upworkCrmOptionsFromEnv,
  toPrefill,
  UpworkContractSchema,
  UpworkContractListSchema,
  type UpworkContract,
  type UpworkCrmClientOptions,
  type ContractPrefill,
} from './upwork-crm.js';

export {
  STAKEHOLDERS_PATH,
  fetchStakeholders,
  stakeholderOptionsFromEnv,
  stakeholdersFor,
  approvers,
  blockers,
  openSeats,
  SideSchema,
  PowerSchema,
  StakeholderSchema,
  StakeholderClientSchema,
  StakeholderFeedSchema,
  type Side,
  type Power,
  type Stakeholder,
  type StakeholderClient,
  type StakeholderFeed,
} from './stakeholders.js';

export {
  registry,
  services,
  serviceById,
  serviceBaseUrl,
  navigableServices,
  RegistrySchema,
  ServiceSchema,
  type Registry,
  type Service,
} from './registry.js';

export {
  NON_MODULE_SERVICE_IDS,
  SERVICE_ICON_NAMES,
  FALLBACK_SERVICE_ICON_NAME,
  serviceIconName,
  serviceLabel,
  moduleServices,
  type ModuleServicesOptions,
} from './modules.js';
