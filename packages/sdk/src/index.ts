export interface SdkInfo {
  name: string;
  version: string;
}

export function getSdkInfo(): SdkInfo {
  return {
    name: "@erc-mandated/sdk",
    version: "0.3.1"
  };
}

export { ErcMandatedSdkError } from "./errors.js";

export {
  AgentAccountContextError,
  type AgentAccountContextErrorCode,
  createAgentAccountContext,
  buildAssetTransferPlanFromAccountContext,
  type AgentAccountContext,
  type CreateAgentAccountContextInput,
  type CreateAgentAccountContextOutput,
  type AssetTransferPlanFromContextInput,
  type AssetTransferPlanFromContextOutput
} from "./accountContext.js";

export {
  FundingPolicyError,
  FundingPolicyViolationError,
  type FundingPolicyErrorCode,
  createAgentFundingPolicy,
  checkAssetTransferAgainstFundingPolicy,
  type AgentFundingPolicy,
  type CreateAgentFundingPolicyInput,
  type CreateAgentFundingPolicyOutput,
  type CheckAssetTransferAgainstFundingPolicyInput,
  type CheckAssetTransferAgainstFundingPolicyOutput
} from "./fundingPolicy.js";

export {
  FundAndActionPlanError,
  type FundAndActionPlanErrorCode,
  buildFundAndActionPlan,
  type FundAndActionBalanceSnapshot,
  type FundAndActionTarget,
  type FundAndActionPlanInput,
  type FundAndActionPlanOutput
} from "./fundAndAction.js";

export {
  FundAndActionSessionError,
  createFundAndActionExecutionSession,
  normalizeFundAndActionExecutionSession,
  applyFundAndActionExecutionEvent,
  type FundAndActionSessionErrorCode,
  type FundAndActionExecutionSessionStatus,
  type FundAndActionExecutionCurrentStep,
  type FundAndActionFundingStepStatus,
  type FundAndActionFollowUpStepStatus,
  type FundAndActionFundingStepExecution,
  type FundAndActionFollowUpStepExecution,
  type FundAndActionExecutionSession,
  type CreateFundAndActionExecutionSessionInput,
  type CreateFundAndActionExecutionSessionOutput,
  type NormalizeFundAndActionExecutionSessionInput,
  type NormalizeFundAndActionExecutionSessionOutput,
  type FundAndActionExecutionEvent,
  type ApplyFundAndActionExecutionEventInput,
  type ApplyFundAndActionExecutionEventOutput
} from "./fundAndActionSession.js";

export {
  FundAndActionDriverError,
  resolveFundAndActionExecutionTask,
  executeFundAndActionExecutionTask,
  type FundAndActionDriverErrorCode,
  type FundAndActionExecutionTask,
  type ResolveFundAndActionExecutionTaskInput,
  type ResolveFundAndActionExecutionTaskOutput,
  type ExecuteFundAndActionExecutionTaskContext,
  type FundAndActionFundingExecutorAdapter,
  type FundAndActionFollowUpExecutorAdapter,
  type ExecuteFundAndActionExecutionTaskInput,
  type ExecuteFundAndActionExecutionTaskOutput
} from "./fundAndActionDriver.js";

export {
  FollowUpActionError,
  buildFollowUpActionPlan,
  createFollowUpActionResult,
  type GenericFollowUpActionIntent,
  type PredictCreateOrderPayload,
  type PredictCreateOrderActionIntent,
  type FollowUpActionIntent,
  type FollowUpActionPlan,
  type FollowUpActionErrorCode,
  type FollowUpActionExecutionStatus,
  type FollowUpActionExecutionReference,
  type FollowUpActionExecutionError,
  type CreateFollowUpActionResultInput,
  type CreateFollowUpActionResultOutput,
  type FollowUpActionResult
} from "./followUpAction.js";

export {
  NetworkConfigError,
  type NetworkConfigErrorCode,
  getSupportedChains,
  getChainConfig,
  getRpcUrl,
  registerSupportedChain,
  registerSupportedChains,
  resetSupportedChains,
  type SupportedChain
} from "./networks.js";

export {
  FactoryConfigError,
  type FactoryConfigErrorCode,
  type FactoryAddressSource,
  predictVaultAddress,
  prepareCreateVaultTx,
  type FactoryPredictVaultAddressInput,
  type FactoryCreateVaultPrepareInput,
  type FactoryPredictVaultAddressOutput,
  type FactoryCreateVaultPrepareOutput,
  type VaultFactoryReadClient
} from "./factory.js";

export {
  ACTIVE_DEPLOYMENT_REGISTRY_VERSION,
  getDefaultDeployment,
  type DeploymentRegistryEntry
} from "./deployments.js";

export {
  VaultHealthCheckError,
  type VaultHealthCheckErrorCode,
  healthCheckVault,
  type VaultHealthCheckInput,
  type VaultHealthCheckOutput,
  type VaultHealthReadClient
} from "./vault.js";

export {
  VaultBootstrapError,
  bootstrapVault,
  type VaultBootstrapErrorCode,
  type VaultBootstrapMode,
  type VaultBootstrapAuthorityMode,
  type VaultBootstrapDeploymentStatus,
  type VaultBootstrapReceiptStatus,
  type VaultBootstrapInput,
  type VaultBootstrapOutput,
  type VaultBootstrapReadClient,
  type VaultBootstrapExecutionAdapter,
  type VaultBootstrapAccountContextOptions,
  type VaultBootstrapFundingPolicyOptions
} from "./vaultBootstrap.js";

export {
  buildMandateSignRequest,
  type MandateBuildSignRequestInput,
  type MandateBuildSignRequestOutput,
  type MandatePayloadBinding
} from "./mandate.js";

export {
  AssetTransferPlanError,
  type AssetTransferPlanErrorCode,
  buildAssetTransferPlan,
  buildErc20TransferAction,
  type Erc20TransferActionInput,
  type Erc20TransferActionOutput,
  type AssetTransferPlanInput,
  type AssetTransferPlanOutput
} from "./assetTransfer.js";

export {
  AssetTransferExecuteError,
  executeAssetTransfer,
  executeAssetTransferFromAccountContext,
  type AssetTransferExecuteErrorCode,
  type AssetTransferExecuteReceiptStatus,
  type AssetTransferExecutionAdapter,
  type AssetTransferExecuteControls,
  type AssetTransferExecuteInput,
  type AssetTransferExecuteFromContextInput,
  type AssetTransferExecuteOutput,
  type AssetTransferExecuteWithContextOutput
} from "./assetTransferExecute.js";

export {
  AssetTransferResultError,
  createAssetTransferResult,
  type AssetTransferPlanResultLike,
  type AssetTransferExecutionStatus,
  type AssetTransferExecutionError,
  type AssetTransferReceipt,
  type CreateAssetTransferResultInput,
  type CreateAssetTransferResultOutput,
  type AssetTransferResult,
  type AssetTransferResultErrorCode
} from "./assetTransferResult.js";

export {
  prepareExecuteTx,
  simulateExecuteVault,
  type VaultExecuteBaseInput,
  type VaultSimulateExecuteOutput,
  type VaultExecutePrepareOutput,
  type ExecuteSimulateClient
} from "./execute.js";

export {
  VaultCheckNonceError,
  type VaultCheckNonceErrorCode,
  MandateCheckRevokedError,
  type MandateCheckRevokedErrorCode,
  checkNonceUsed,
  checkMandateRevoked,
  prepareInvalidateNonceTx,
  prepareRevokeMandateTx,
  type VaultCheckNonceUsedInput,
  type VaultCheckNonceUsedOutput,
  type MandateCheckRevokedInput,
  type MandateCheckRevokedOutput,
  type VaultInvalidateNoncePrepareInput,
  type VaultRevokeMandatePrepareInput,
  type VaultRevokeOrInvalidatePrepareOutput,
  type RevocationReadClient
} from "./revocation.js";
