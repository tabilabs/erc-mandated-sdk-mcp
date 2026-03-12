import { isAddress, type Address, type Hash, type Hex } from "viem";

import { createAgentAccountContext, type AgentAccountContext } from "./accountContext.js";
import { createAgentFundingPolicy, type AgentFundingPolicy } from "./fundingPolicy.js";
import { prepareCreateVaultTx, type VaultFactoryReadClient } from "./factory.js";
import { createPublicViemClient, resolveChainId } from "./shared.js";
import { healthCheckVault, type VaultHealthCheckOutput, type VaultHealthReadClient } from "./vault.js";
import { ErcMandatedSdkError } from "./errors.js";

type MaybePromise<T> = Promise<T> | T;

export type VaultBootstrapMode = "plan" | "execute";
export type VaultBootstrapAuthorityMode = "single_key" | "dual_key";
export type VaultBootstrapDeploymentStatus =
  | "planned"
  | "submitted"
  | "confirmed"
  | "reverted"
  | "receipt_unknown";
export type VaultBootstrapReceiptStatus = "success" | "reverted" | "timeout";

export type VaultBootstrapErrorCode =
  | "INVALID_SIGNER_ADDRESS"
  | "INVALID_AUTHORITY_MODE"
  | "DUAL_KEY_REQUIRES_EXPLICIT_ADDRESSES"
  | "EXECUTION_ADAPTER_REQUIRED";

export class VaultBootstrapError extends ErcMandatedSdkError {
  readonly code: VaultBootstrapErrorCode;
  readonly field: "signerAddress" | "authorityMode" | "authority" | "executor" | "execution";

  constructor(
    message: string,
    params: {
      code: VaultBootstrapErrorCode;
      field: "signerAddress" | "authorityMode" | "authority" | "executor" | "execution";
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "VaultBootstrapError",
      details: {
        field: params.field,
        ...params.details
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

export interface VaultBootstrapAccountContextOptions {
  agentId?: string;
  assetRegistryRef?: string;
  fundingPolicyRef?: string;
  defaults?: AgentAccountContext["defaults"];
  createdAt?: string;
  updatedAt?: string;
}

export interface VaultBootstrapFundingPolicyOptions {
  policyId?: string;
  allowedTokenAddresses?: Address[];
  allowedRecipients?: Address[];
  maxAmountPerTx?: string;
  maxAmountPerWindow?: string;
  windowSeconds?: number;
  expiresAt?: string;
  repeatable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VaultBootstrapInput {
  chainId?: number;
  factory?: Address;
  asset: Address;
  name: string;
  symbol: string;
  salt: Hash;
  signerAddress?: Address;
  mode?: VaultBootstrapMode;
  authorityMode?: VaultBootstrapAuthorityMode;
  authority?: Address;
  executor?: Address;
  createAccountContext?: boolean;
  createFundingPolicy?: boolean;
  accountContextOptions?: VaultBootstrapAccountContextOptions;
  fundingPolicyOptions?: VaultBootstrapFundingPolicyOptions;
  healthCheckBlockTag?: string;
  confirmations?: number;
  receiptTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface VaultBootstrapReadClient {
  readContract(parameters: {
    address: Address;
    abi: unknown;
    functionName: string;
    args?: readonly unknown[];
    blockNumber?: bigint;
  }): Promise<Address | bigint>;
  getBlockNumber(): Promise<bigint>;
  getCode(parameters: { address: Address }): Promise<Hex | undefined>;
}

export interface VaultBootstrapExecutionAdapter {
  getAddress?(): MaybePromise<Address>;
  sendTransaction(parameters: {
    txRequest: {
      from: Address;
      to: Address;
      data: Hex;
      value: "0";
    };
  }): MaybePromise<Hash>;
  waitForTransactionReceipt(parameters: {
    txHash: Hash;
    confirmations?: number;
    timeoutMs?: number;
    pollIntervalMs?: number;
  }): MaybePromise<{
    status: VaultBootstrapReceiptStatus;
    blockNumber?: bigint;
    receipt?: unknown;
  }>;
}

export interface VaultBootstrapOutput {
  result: {
    chainId: number;
    mode: VaultBootstrapMode;
    factory: Address;
    asset: Address;
    signerAddress: Address;
    predictedVault: Address;
    deployedVault: Address;
    alreadyDeployed: boolean;
    deploymentStatus: VaultBootstrapDeploymentStatus;
    authorityConfig: {
      mode: VaultBootstrapAuthorityMode;
      authority: Address;
      executor: Address;
    };
    createTx?: {
      mode: VaultBootstrapMode;
      txRequest?: {
        from: Address;
        to: Address;
        data: Hex;
        value: "0";
      };
      txHash?: Hash;
      receiptStatus?: VaultBootstrapReceiptStatus;
      blockNumber?: number;
      confirmations?: number;
      receipt?: unknown;
    };
    vaultHealth?: VaultHealthCheckOutput["result"];
    accountContext?: AgentAccountContext;
    fundingPolicy?: AgentFundingPolicy;
    envBlock: string;
    configBlock: string;
  };
}

function createDefaultReadClient(chainId: number): VaultBootstrapReadClient {
  const publicClient = createPublicViemClient(chainId);

  return {
    readContract(parameters) {
      return publicClient.readContract(parameters as never) as Promise<Address | bigint>;
    },
    getBlockNumber() {
      return publicClient.getBlockNumber();
    },
    getCode(parameters) {
      return publicClient.getCode(parameters);
    }
  };
}

function buildDefaultAgentId(chainId: number, vault: Address): string {
  return `vault:${chainId}:${vault.toLowerCase()}`;
}

function buildDefaultPolicyId(chainId: number, vault: Address): string {
  return `vault-bootstrap:${chainId}:${vault.toLowerCase()}`;
}

function ensureAddress(
  value: Address | undefined,
  field: "signerAddress" | "authority" | "executor"
): Address | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (isAddress(value)) {
    return value;
  }

  throw new VaultBootstrapError(`Invalid ${field}: expected address string.`, {
    code: "INVALID_SIGNER_ADDRESS",
    field: field === "signerAddress" ? field : "signerAddress",
    details: {
      value,
      requestedField: field
    }
  });
}

function resolveAuthorityMode(mode: VaultBootstrapAuthorityMode | undefined): VaultBootstrapAuthorityMode {
  if (mode === undefined) {
    return "single_key";
  }

  if (mode === "single_key" || mode === "dual_key") {
    return mode;
  }

  throw new VaultBootstrapError("Invalid authorityMode: expected single_key or dual_key.", {
    code: "INVALID_AUTHORITY_MODE",
    field: "authorityMode",
    details: {
      authorityMode: mode
    }
  });
}

function resolveConfirmedBlockNumber(blockNumber: bigint | undefined): number | undefined {
  if (blockNumber === undefined) {
    return undefined;
  }

  if (blockNumber < 0n || blockNumber > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new VaultBootstrapError("Receipt block number is out of JavaScript safe integer range.", {
      code: "EXECUTION_ADAPTER_REQUIRED",
      field: "execution",
      details: {
        blockNumber: blockNumber.toString(10)
      }
    });
  }

  return Number(blockNumber);
}

function hasCode(code: Hex | undefined): boolean {
  return typeof code === "string" && code !== "0x";
}

function buildEnvBlock(input: {
  chainId: number;
  factory: Address;
  vault: Address;
  asset: Address;
  authority: Address;
  executor: Address;
  accountContext?: AgentAccountContext;
  fundingPolicy?: AgentFundingPolicy;
}): string {
  const lines = [
    `ERC_MANDATED_CHAIN_ID=${input.chainId}`,
    `ERC_MANDATED_FACTORY_ADDRESS=${input.factory}`,
    `ERC_MANDATED_VAULT_ADDRESS=${input.vault}`,
    `ERC_MANDATED_ASSET_ADDRESS=${input.asset}`,
    `ERC_MANDATED_AUTHORITY_ADDRESS=${input.authority}`,
    `ERC_MANDATED_EXECUTOR_ADDRESS=${input.executor}`
  ];

  if (input.accountContext) {
    lines.push(`ERC_MANDATED_AGENT_ID=${input.accountContext.agentId}`);
  }

  if (input.fundingPolicy) {
    lines.push(`ERC_MANDATED_FUNDING_POLICY_ID=${input.fundingPolicy.policyId}`);
  }

  return lines.join("\n");
}

function buildConfigBlock(input: {
  chainId: number;
  factory: Address;
  vault: Address;
  asset: Address;
  authority: Address;
  executor: Address;
  accountContext?: AgentAccountContext;
  fundingPolicy?: AgentFundingPolicy;
}): string {
  return JSON.stringify(
    {
      chainId: input.chainId,
      factory: input.factory,
      vault: input.vault,
      asset: input.asset,
      authority: input.authority,
      executor: input.executor,
      ...(input.accountContext ? { accountContext: input.accountContext } : {}),
      ...(input.fundingPolicy ? { fundingPolicy: input.fundingPolicy } : {})
    },
    null,
    2
  );
}

export async function bootstrapVault(
  input: VaultBootstrapInput,
  options?: {
    client?: VaultBootstrapReadClient;
    execution?: VaultBootstrapExecutionAdapter;
  }
): Promise<VaultBootstrapOutput> {
  const chainId = resolveChainId(input.chainId);
  const mode = input.mode ?? "plan";
  const authorityMode = resolveAuthorityMode(input.authorityMode);

  const signerAddress =
    ensureAddress(input.signerAddress, "signerAddress") ??
    (options?.execution?.getAddress ? await options.execution.getAddress() : undefined);

  if (!signerAddress || !isAddress(signerAddress)) {
    throw new VaultBootstrapError("vault bootstrap requires signerAddress or execution.getAddress().", {
      code: "INVALID_SIGNER_ADDRESS",
      field: "signerAddress"
    });
  }

  const authorityInput = ensureAddress(input.authority, "authority");
  const executorInput = ensureAddress(input.executor, "executor");

  if (authorityMode === "dual_key" && (!authorityInput || !executorInput)) {
    throw new VaultBootstrapError(
      "authorityMode=dual_key requires both authority and executor addresses to be provided.",
      {
        code: "DUAL_KEY_REQUIRES_EXPLICIT_ADDRESSES",
        field: !authorityInput ? "authority" : "executor"
      }
    );
  }

  const authority = authorityInput ?? signerAddress;
  const executor = executorInput ?? signerAddress;
  const client = options?.client ?? createDefaultReadClient(chainId);

  const prepared = await prepareCreateVaultTx(
    {
      chainId,
      factory: input.factory,
      from: signerAddress,
      asset: input.asset,
      name: input.name,
      symbol: input.symbol,
      authority,
      salt: input.salt
    },
    {
      client: client as unknown as VaultFactoryReadClient
    }
  );

  const factory = prepared.result.txRequest.to;
  const predictedVault = prepared.result.predictedVault;
  const alreadyDeployed = hasCode(await client.getCode({ address: predictedVault }));

  let deploymentStatus: VaultBootstrapDeploymentStatus = alreadyDeployed
    ? "confirmed"
    : mode === "execute"
      ? "submitted"
      : "planned";
  let createTx: VaultBootstrapOutput["result"]["createTx"] = {
    mode,
    txRequest: prepared.result.txRequest
  };
  let vaultHealth: VaultHealthCheckOutput["result"] | undefined;

  if (alreadyDeployed) {
    vaultHealth = (
      await healthCheckVault(
        {
          chainId,
          vault: predictedVault,
          blockTag: input.healthCheckBlockTag
        },
        {
          client: client as unknown as VaultHealthReadClient
        }
      )
    ).result;
  } else if (mode === "execute") {
    if (!options?.execution) {
      throw new VaultBootstrapError("vault bootstrap execute mode requires an execution adapter.", {
        code: "EXECUTION_ADAPTER_REQUIRED",
        field: "execution"
      });
    }

    const txHash = await options.execution.sendTransaction({
      txRequest: prepared.result.txRequest
    });

    const receiptResult = await options.execution.waitForTransactionReceipt({
      txHash,
      confirmations: input.confirmations,
      timeoutMs: input.receiptTimeoutMs,
      pollIntervalMs: input.pollIntervalMs
    });

    createTx = {
      mode,
      txRequest: prepared.result.txRequest,
      txHash,
      receiptStatus: receiptResult.status,
      ...(resolveConfirmedBlockNumber(receiptResult.blockNumber) !== undefined
        ? { blockNumber: resolveConfirmedBlockNumber(receiptResult.blockNumber) }
        : {}),
      ...(input.confirmations !== undefined ? { confirmations: input.confirmations } : {}),
      ...(receiptResult.receipt !== undefined ? { receipt: receiptResult.receipt } : {})
    };

    if (receiptResult.status === "success") {
      deploymentStatus = "confirmed";
      vaultHealth = (
        await healthCheckVault(
          {
            chainId,
            vault: predictedVault,
            blockTag:
              receiptResult.blockNumber !== undefined
                ? receiptResult.blockNumber.toString(10)
                : input.healthCheckBlockTag
          },
          {
            client: client as unknown as VaultHealthReadClient
          }
        )
      ).result;
    } else if (receiptResult.status === "reverted") {
      deploymentStatus = "reverted";
    } else if (receiptResult.status === "timeout") {
      deploymentStatus = "receipt_unknown";
    }
  }

  const deployedVault = predictedVault;
  const createFundingPolicy = input.createFundingPolicy ?? true;
  const createAccountContext = input.createAccountContext ?? true;

  const fundingPolicy = createFundingPolicy
    ? createAgentFundingPolicy({
        policyId:
          input.fundingPolicyOptions?.policyId ?? buildDefaultPolicyId(chainId, deployedVault),
        allowedTokenAddresses: input.fundingPolicyOptions?.allowedTokenAddresses,
        allowedRecipients: input.fundingPolicyOptions?.allowedRecipients,
        maxAmountPerTx: input.fundingPolicyOptions?.maxAmountPerTx,
        maxAmountPerWindow: input.fundingPolicyOptions?.maxAmountPerWindow,
        windowSeconds: input.fundingPolicyOptions?.windowSeconds,
        expiresAt: input.fundingPolicyOptions?.expiresAt,
        repeatable: input.fundingPolicyOptions?.repeatable,
        createdAt: input.fundingPolicyOptions?.createdAt,
        updatedAt: input.fundingPolicyOptions?.updatedAt
      }).result.fundingPolicy
    : undefined;

  const accountContext = createAccountContext
    ? createAgentAccountContext({
        agentId:
          input.accountContextOptions?.agentId ?? buildDefaultAgentId(chainId, deployedVault),
        chainId,
        vault: deployedVault,
        authority,
        executor,
        assetRegistryRef: input.accountContextOptions?.assetRegistryRef,
        fundingPolicyRef:
          input.accountContextOptions?.fundingPolicyRef ?? fundingPolicy?.policyId,
        defaults: input.accountContextOptions?.defaults,
        createdAt: input.accountContextOptions?.createdAt,
        updatedAt: input.accountContextOptions?.updatedAt
      }).result.accountContext
    : undefined;

  const envBlock = buildEnvBlock({
    chainId,
    factory,
    vault: deployedVault,
    asset: input.asset,
    authority,
    executor,
    accountContext,
    fundingPolicy
  });
  const configBlock = buildConfigBlock({
    chainId,
    factory,
    vault: deployedVault,
    asset: input.asset,
    authority,
    executor,
    accountContext,
    fundingPolicy
  });

  return {
    result: {
      chainId,
      mode,
      factory,
      asset: input.asset,
      signerAddress,
      predictedVault,
      deployedVault,
      alreadyDeployed,
      deploymentStatus,
      authorityConfig: {
        mode: authorityMode,
        authority,
        executor
      },
      ...(createTx ? { createTx } : {}),
      ...(vaultHealth ? { vaultHealth } : {}),
      ...(accountContext ? { accountContext } : {}),
      ...(fundingPolicy ? { fundingPolicy } : {}),
      envBlock,
      configBlock
    }
  };
}
