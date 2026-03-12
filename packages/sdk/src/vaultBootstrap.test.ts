import assert from "node:assert/strict";
import test from "node:test";

import { type Address, type Hash, type Hex } from "viem";

import {
  VaultBootstrapError,
  bootstrapVault,
  type VaultBootstrapExecutionAdapter,
  type VaultBootstrapReadClient
} from "./vaultBootstrap.js";

function buildMockBootstrapClient(config?: {
  predictedVault?: Address;
  factory?: Address;
  deployedCode?: Hex;
  blockNumber?: bigint;
  authorityEpoch?: bigint;
  nonceThreshold?: bigint;
  totalAssets?: bigint;
}) {
  const readCalls: Array<{ functionName: string; address: Address; blockNumber?: bigint }> = [];
  const predictedVault =
    config?.predictedVault ?? ("0x5555555555555555555555555555555555555555" as Address);
  const factory = config?.factory ?? ("0x1111111111111111111111111111111111111111" as Address);
  const blockNumber = config?.blockNumber ?? 123n;
  const mandateAuthority = "0x2222222222222222222222222222222222222222" as Address;
  const pendingAuthority = "0x0000000000000000000000000000000000000000" as Address;
  const authorityEpoch = config?.authorityEpoch ?? 7n;
  const nonceThreshold = config?.nonceThreshold ?? 0n;
  const totalAssets = config?.totalAssets ?? 999n;

  const client: VaultBootstrapReadClient = {
    async readContract(parameters) {
      readCalls.push({
        functionName: parameters.functionName,
        address: parameters.address,
        blockNumber: parameters.blockNumber
      });

      switch (parameters.functionName) {
        case "predictVaultAddress":
          return predictedVault;
        case "mandateAuthority":
          return mandateAuthority;
        case "authorityEpoch":
          return authorityEpoch;
        case "pendingAuthority":
          return pendingAuthority;
        case "nonceThreshold":
          return nonceThreshold;
        case "totalAssets":
          return totalAssets;
        default:
          throw new Error(`Unexpected functionName: ${String(parameters.functionName)}`);
      }
    },
    async getBlockNumber() {
      return blockNumber;
    },
    async getCode() {
      return config?.deployedCode;
    }
  };

  return {
    client,
    readCalls,
    predictedVault,
    factory,
    blockNumber,
    mandateAuthority,
    pendingAuthority,
    authorityEpoch,
    nonceThreshold,
    totalAssets
  };
}

test("bootstrapVault plan mode returns prepare artifacts and normalized config blocks", async () => {
  const signerAddress = "0x3333333333333333333333333333333333333333" as Address;
  const { client, predictedVault, factory } = buildMockBootstrapClient({
    factory: "0x1111111111111111111111111111111111111111" as Address
  });

  const output = await bootstrapVault(
    {
      chainId: 56,
      factory,
      asset: "0x4444444444444444444444444444444444444444" as Address,
      name: "Bootstrap Vault",
      symbol: "BOOT",
      salt: (`0x${"11".repeat(32)}` as Hash),
      signerAddress,
      mode: "plan"
    },
    { client }
  );

  assert.equal(output.result.mode, "plan");
  assert.equal(output.result.predictedVault, predictedVault);
  assert.equal(output.result.deployedVault, predictedVault);
  assert.equal(output.result.alreadyDeployed, false);
  assert.equal(output.result.deploymentStatus, "planned");
  assert.equal(output.result.authorityConfig.authority, signerAddress);
  assert.equal(output.result.authorityConfig.executor, signerAddress);
  assert.equal(output.result.createTx?.txRequest?.from, signerAddress);
  assert.equal(output.result.createTx?.txRequest?.to, factory);
  assert.equal(output.result.vaultHealth, undefined);
  assert.match(output.result.envBlock, /ERC_MANDATED_CHAIN_ID=56/);
  assert.match(output.result.envBlock, new RegExp(`ERC_MANDATED_VAULT_ADDRESS=${predictedVault}`));

  const parsedConfig = JSON.parse(output.result.configBlock) as {
    chainId: number;
    vault: string;
    accountContext?: { chainId?: number };
    fundingPolicy?: { policyId?: string };
  };

  assert.equal(parsedConfig.chainId, 56);
  assert.equal(parsedConfig.vault, predictedVault);
  assert.equal(parsedConfig.accountContext?.chainId, 56);
  assert.equal(
    output.result.fundingPolicy?.policyId,
    `vault-bootstrap:56:${predictedVault.toLowerCase()}`
  );
});

test("bootstrapVault plan mode reuses existing deployed vault and appends health snapshot", async () => {
  const signerAddress = "0x3333333333333333333333333333333333333333" as Address;
  const {
    client,
    predictedVault,
    factory,
    mandateAuthority,
    authorityEpoch,
    nonceThreshold,
    totalAssets
  } =
    buildMockBootstrapClient({
      deployedCode: "0x60006000" as Hex,
      authorityEpoch: 9n,
      nonceThreshold: 5n,
      totalAssets: 1001n
    });

  const output = await bootstrapVault(
    {
      chainId: 8453,
      factory,
      asset: "0x4444444444444444444444444444444444444444" as Address,
      name: "Bootstrap Vault",
      symbol: "BOOT",
      salt: (`0x${"22".repeat(32)}` as Hash),
      signerAddress,
      mode: "plan"
    },
    { client }
  );

  assert.equal(output.result.alreadyDeployed, true);
  assert.equal(output.result.deploymentStatus, "confirmed");
  assert.equal(output.result.vaultHealth?.vault, predictedVault);
  assert.equal(output.result.vaultHealth?.mandateAuthority, mandateAuthority);
  assert.equal(output.result.vaultHealth?.authorityEpoch, authorityEpoch.toString(10));
  assert.equal(output.result.vaultHealth?.nonceThreshold, nonceThreshold.toString(10));
  assert.equal(output.result.vaultHealth?.totalAssets, totalAssets.toString(10));
});

test("bootstrapVault execute mode broadcasts, waits for receipt, and health checks at confirmed block", async () => {
  const signerAddress = "0x3333333333333333333333333333333333333333" as Address;
  const txHash = `0x${"ab".repeat(32)}` as Hash;
  const { client, factory, blockNumber } = buildMockBootstrapClient({
    blockNumber: 777n,
    deployedCode: undefined
  });

  let sentTxRequest:
    | {
        from: Address;
        to: Address;
        data: Hex;
        value: "0";
      }
    | undefined;
  let waitedHash: Hash | undefined;

  const execution: VaultBootstrapExecutionAdapter = {
    async sendTransaction(parameters) {
      sentTxRequest = parameters.txRequest;
      return txHash;
    },
    async waitForTransactionReceipt(parameters) {
      waitedHash = parameters.txHash;
      assert.equal(parameters.confirmations, 2);
      assert.equal(parameters.timeoutMs, 15000);
      assert.equal(parameters.pollIntervalMs, 500);
      return {
        status: "success",
        blockNumber,
        receipt: {
          transactionHash: txHash,
          status: "success"
        }
      };
    }
  };

  const output = await bootstrapVault(
    {
      chainId: 56,
      factory,
      asset: "0x4444444444444444444444444444444444444444" as Address,
      name: "Bootstrap Vault",
      symbol: "BOOT",
      salt: (`0x${"33".repeat(32)}` as Hash),
      signerAddress,
      mode: "execute",
      confirmations: 2,
      receiptTimeoutMs: 15000,
      pollIntervalMs: 500
    },
    { client, execution }
  );

  assert.equal(sentTxRequest?.from, signerAddress);
  assert.equal(waitedHash, txHash);
  assert.equal(output.result.deploymentStatus, "confirmed");
  assert.equal(output.result.createTx?.txHash, txHash);
  assert.equal(output.result.createTx?.receiptStatus, "success");
  assert.equal(output.result.createTx?.blockNumber, 777);
  assert.equal(output.result.vaultHealth?.blockNumber, 777);
});

test("bootstrapVault execute mode returns receipt_unknown on receipt timeout", async () => {
  const signerAddress = "0x3333333333333333333333333333333333333333" as Address;
  const txHash = `0x${"cd".repeat(32)}` as Hash;
  const { client, factory } = buildMockBootstrapClient();

  const execution: VaultBootstrapExecutionAdapter = {
    async sendTransaction() {
      return txHash;
    },
    async waitForTransactionReceipt() {
      return {
        status: "timeout"
      };
    }
  };

  const output = await bootstrapVault(
    {
      chainId: 56,
      factory,
      asset: "0x4444444444444444444444444444444444444444" as Address,
      name: "Bootstrap Vault",
      symbol: "BOOT",
      salt: (`0x${"55".repeat(32)}` as Hash),
      signerAddress,
      mode: "execute"
    },
    { client, execution }
  );

  assert.equal(output.result.deploymentStatus, "receipt_unknown");
  assert.equal(output.result.createTx?.txHash, txHash);
  assert.equal(output.result.createTx?.receiptStatus, "timeout");
  assert.equal(output.result.vaultHealth, undefined);
});

test("bootstrapVault execute mode returns reverted on reverted receipt", async () => {
  const signerAddress = "0x3333333333333333333333333333333333333333" as Address;
  const txHash = `0x${"ef".repeat(32)}` as Hash;
  const { client, factory, blockNumber } = buildMockBootstrapClient({
    blockNumber: 888n
  });

  const execution: VaultBootstrapExecutionAdapter = {
    async sendTransaction() {
      return txHash;
    },
    async waitForTransactionReceipt() {
      return {
        status: "reverted",
        blockNumber,
        receipt: {
          transactionHash: txHash,
          status: "reverted"
        }
      };
    }
  };

  const output = await bootstrapVault(
    {
      chainId: 56,
      factory,
      asset: "0x4444444444444444444444444444444444444444" as Address,
      name: "Bootstrap Vault",
      symbol: "BOOT",
      salt: (`0x${"66".repeat(32)}` as Hash),
      signerAddress,
      mode: "execute"
    },
    { client, execution }
  );

  assert.equal(output.result.deploymentStatus, "reverted");
  assert.equal(output.result.createTx?.txHash, txHash);
  assert.equal(output.result.createTx?.receiptStatus, "reverted");
  assert.equal(output.result.createTx?.blockNumber, 888);
  assert.equal(output.result.vaultHealth, undefined);
});

test("bootstrapVault rejects dual_key mode when authority or executor is missing", async () => {
  const { client, factory } = buildMockBootstrapClient({
    factory: "0x1111111111111111111111111111111111111111" as Address
  });

  await assert.rejects(
    async () => {
      await bootstrapVault(
        {
          chainId: 56,
          factory,
          asset: "0x4444444444444444444444444444444444444444" as Address,
          name: "Bootstrap Vault",
          symbol: "BOOT",
          salt: (`0x${"44".repeat(32)}` as Hash),
          signerAddress: "0x3333333333333333333333333333333333333333" as Address,
          authorityMode: "dual_key",
          authority: "0x5555555555555555555555555555555555555555" as Address
        },
        { client }
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof VaultBootstrapError);
      assert.equal(error.code, "DUAL_KEY_REQUIRES_EXPLICIT_ADDRESSES");
      assert.equal(error.field, "executor");
      return true;
    }
  );
});
