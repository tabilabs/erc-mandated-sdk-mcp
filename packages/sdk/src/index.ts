export interface SdkInfo {
  name: string;
  version: string;
}

export function getSdkInfo(): SdkInfo {
  return {
    name: "@erc-mandated/sdk",
    version: "0.1.0"
  };
}

export {
  FactoryConfigError,
  type FactoryConfigErrorCode,
  predictVaultAddress,
  prepareCreateVaultTx,
  type FactoryPredictVaultAddressInput,
  type FactoryCreateVaultPrepareInput,
  type FactoryPredictVaultAddressOutput,
  type FactoryCreateVaultPrepareOutput,
  type VaultFactoryReadClient
} from "./factory.js";

export {
  VaultHealthCheckError,
  type VaultHealthCheckErrorCode,
  healthCheckVault,
  type VaultHealthCheckInput,
  type VaultHealthCheckOutput,
  type VaultHealthReadClient
} from "./vault.js";

export {
  buildMandateSignRequest,
  type MandateBuildSignRequestInput,
  type MandateBuildSignRequestOutput,
  type MandatePayloadBinding
} from "./mandate.js";

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
