import type {
  buildFundAndActionPlan,
  buildAssetTransferPlanFromAccountContext,
  buildAssetTransferPlan,
  checkAssetTransferAgainstFundingPolicy,
  createFollowUpActionResult,
  createAgentAccountContext,
  createAgentFundingPolicy,
  buildMandateSignRequest,
  checkMandateRevoked,
  checkNonceUsed,
  healthCheckVault,
  predictVaultAddress,
  prepareCreateVaultTx,
  prepareExecuteTx,
  prepareInvalidateNonceTx,
  prepareRevokeMandateTx,
  simulateExecuteVault
} from "@erc-mandated/sdk";

export interface SdkAdapter {
  createAgentAccountContext: typeof createAgentAccountContext;
  createAgentFundingPolicy: typeof createAgentFundingPolicy;
  buildFundAndActionPlan: typeof buildFundAndActionPlan;
  createFollowUpActionResult: typeof createFollowUpActionResult;
  checkAssetTransferAgainstFundingPolicy: typeof checkAssetTransferAgainstFundingPolicy;
  buildAssetTransferPlanFromAccountContext: typeof buildAssetTransferPlanFromAccountContext;
  healthCheckVault: typeof healthCheckVault;
  buildAssetTransferPlan: typeof buildAssetTransferPlan;
  buildMandateSignRequest: typeof buildMandateSignRequest;
  predictVaultAddress: typeof predictVaultAddress;
  prepareCreateVaultTx: typeof prepareCreateVaultTx;
  simulateExecuteVault: typeof simulateExecuteVault;
  prepareExecuteTx: typeof prepareExecuteTx;

  checkNonceUsed: typeof checkNonceUsed;
  checkMandateRevoked: typeof checkMandateRevoked;
  prepareInvalidateNonceTx: typeof prepareInvalidateNonceTx;
  prepareRevokeMandateTx: typeof prepareRevokeMandateTx;
}
