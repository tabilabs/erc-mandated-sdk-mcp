import type {
  applyFundAndActionExecutionEvent,
  resolveFundAndActionExecutionTask,
  buildFundAndActionPlan,
  buildAssetTransferPlanFromAccountContext,
  buildAssetTransferPlan,
  executeAssetTransfer,
  executeAssetTransferFromAccountContext,
  checkAssetTransferAgainstFundingPolicy,
  createAssetTransferResult,
  createFundAndActionExecutionSession,
  createFollowUpActionResult,
  createAgentAccountContext,
  createAgentFundingPolicy,
  buildMandateSignRequest,
  checkMandateRevoked,
  checkNonceUsed,
  bootstrapVault,
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
  createFundAndActionExecutionSession: typeof createFundAndActionExecutionSession;
  applyFundAndActionExecutionEvent: typeof applyFundAndActionExecutionEvent;
  resolveFundAndActionExecutionTask: typeof resolveFundAndActionExecutionTask;
  createFollowUpActionResult: typeof createFollowUpActionResult;
  createAssetTransferResult: typeof createAssetTransferResult;
  checkAssetTransferAgainstFundingPolicy: typeof checkAssetTransferAgainstFundingPolicy;
  buildAssetTransferPlanFromAccountContext: typeof buildAssetTransferPlanFromAccountContext;
  executeAssetTransferFromAccountContext: typeof executeAssetTransferFromAccountContext;
  bootstrapVault: typeof bootstrapVault;
  healthCheckVault: typeof healthCheckVault;
  buildAssetTransferPlan: typeof buildAssetTransferPlan;
  executeAssetTransfer: typeof executeAssetTransfer;
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
