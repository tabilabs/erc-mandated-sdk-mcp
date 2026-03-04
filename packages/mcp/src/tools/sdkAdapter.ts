import type {
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
  healthCheckVault: typeof healthCheckVault;
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
