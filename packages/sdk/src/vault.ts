import { isAddress, type Address } from "viem";

import { mandatedVaultAbi } from "./abi/mandatedVault.js";
import { resolveChainId, createPublicViemClient, toSafeBlockNumber, toUintString } from "./shared.js";

export type VaultHealthCheckErrorCode =
  | "INVALID_VAULT_ADDRESS"
  | "INVALID_BLOCK_TAG"
  | "BLOCK_NUMBER_OUT_OF_RANGE"
  | "UNEXPECTED_RETURN_TYPE";

type VaultHealthCheckErrorField =
  | "vault"
  | "blockTag"
  | "blockNumber"
  | "mandateAuthority"
  | "authorityEpoch"
  | "pendingAuthority"
  | "nonceThreshold"
  | "totalAssets";

export class VaultHealthCheckError extends Error {
  readonly code: VaultHealthCheckErrorCode;
  readonly field: VaultHealthCheckErrorField;
  readonly value?: string;

  constructor(
    message: string,
    params: {
      code: VaultHealthCheckErrorCode;
      field: VaultHealthCheckErrorField;
      value?: string;
    }
  ) {
    super(message);
    this.name = "VaultHealthCheckError";
    this.code = params.code;
    this.field = params.field;
    this.value = params.value;
  }
}

export interface VaultHealthCheckInput {
  chainId?: number;
  vault: Address;
  blockTag?: string;
}

export interface VaultHealthCheckOutput {
  result: {
    blockNumber: number;
    vault: Address;
    mandateAuthority: Address;
    authorityEpoch: string;
    pendingAuthority: Address;
    nonceThreshold: string;
    totalAssets: string;
  };
}

type MandatedVaultReadFunctionName =
  | "mandateAuthority"
  | "authorityEpoch"
  | "pendingAuthority"
  | "nonceThreshold"
  | "totalAssets";

export interface VaultHealthReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof mandatedVaultAbi;
    functionName: MandatedVaultReadFunctionName;
    args?: readonly [Address];
    blockNumber?: bigint;
  }): Promise<Address | bigint>;

  getBlockNumber(): Promise<bigint>;
}

function stringifyUnexpectedValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString(10);
  }

  return String(value);
}

function parseBlockTag(blockTag: string | undefined): { blockNumber?: bigint; useLatest: boolean } {
  if (blockTag === undefined || blockTag === "latest") {
    return { useLatest: true };
  }

  if (!/^\d+$/.test(blockTag)) {
    throw new VaultHealthCheckError(
      'Invalid blockTag: expected "latest" or a decimal block number string.',
      {
        code: "INVALID_BLOCK_TAG",
        field: "blockTag",
        value: blockTag
      }
    );
  }

  const parsed = BigInt(blockTag);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new VaultHealthCheckError(
      "Block number is out of JavaScript safe integer range for output.",
      {
        code: "BLOCK_NUMBER_OUT_OF_RANGE",
        field: "blockNumber",
        value: blockTag
      }
    );
  }

  return {
    blockNumber: parsed,
    useLatest: false
  };
}

function toSafeBlockNumberForVault(value: bigint): number {
  try {
    return toSafeBlockNumber(value, "vault health check");
  } catch {
    throw new VaultHealthCheckError(
      "Block number is out of JavaScript safe integer range for output.",
      {
        code: "BLOCK_NUMBER_OUT_OF_RANGE",
        field: "blockNumber",
        value: value.toString(10)
      }
    );
  }
}

function expectAddress(value: Address | bigint, field: "mandateAuthority" | "pendingAuthority"): Address {
  if (typeof value !== "string") {
    throw new VaultHealthCheckError(`Expected ${field} to be an address string.`, {
      code: "UNEXPECTED_RETURN_TYPE",
      field,
      value: stringifyUnexpectedValue(value)
    });
  }
  return value;
}

function expectUint(value: Address | bigint, field: "authorityEpoch" | "nonceThreshold" | "totalAssets"): bigint {
  if (typeof value !== "bigint") {
    throw new VaultHealthCheckError(`Expected ${field} to be bigint.`, {
      code: "UNEXPECTED_RETURN_TYPE",
      field,
      value: stringifyUnexpectedValue(value)
    });
  }
  return value;
}

function createDefaultReadClient(chainId: number): VaultHealthReadClient {
  const publicClient = createPublicViemClient(chainId);

  return {
    readContract(parameters) {
      return publicClient.readContract(parameters);
    },
    getBlockNumber() {
      return publicClient.getBlockNumber();
    }
  };
}

export async function healthCheckVault(
  input: VaultHealthCheckInput,
  options?: {
    client?: VaultHealthReadClient;
  }
): Promise<VaultHealthCheckOutput> {
  if (!isAddress(input.vault)) {
    throw new VaultHealthCheckError("Invalid vault address provided in input.vault.", {
      code: "INVALID_VAULT_ADDRESS",
      field: "vault",
      value: input.vault
    });
  }

  const parsedBlockTag = parseBlockTag(input.blockTag);

  const chainId = resolveChainId(input.chainId);
  const client = options?.client ?? createDefaultReadClient(chainId);

  const readAtBlock = parsedBlockTag.useLatest
    ? await client.getBlockNumber()
    : (parsedBlockTag.blockNumber as bigint);

  const [mandateAuthority, authorityEpoch, pendingAuthority, totalAssets] = await Promise.all([
    client.readContract({
      address: input.vault,
      abi: mandatedVaultAbi,
      functionName: "mandateAuthority",
      blockNumber: readAtBlock
    }),
    client.readContract({
      address: input.vault,
      abi: mandatedVaultAbi,
      functionName: "authorityEpoch",
      blockNumber: readAtBlock
    }),
    client.readContract({
      address: input.vault,
      abi: mandatedVaultAbi,
      functionName: "pendingAuthority",
      blockNumber: readAtBlock
    }),
    client.readContract({
      address: input.vault,
      abi: mandatedVaultAbi,
      functionName: "totalAssets",
      blockNumber: readAtBlock
    })
  ]);

  const mandateAuthorityAddress = expectAddress(mandateAuthority, "mandateAuthority");
  const authorityEpochUint = expectUint(authorityEpoch, "authorityEpoch");
  const pendingAuthorityAddress = expectAddress(pendingAuthority, "pendingAuthority");
  const totalAssetsUint = expectUint(totalAssets, "totalAssets");

  const nonceThreshold = await client.readContract({
    address: input.vault,
    abi: mandatedVaultAbi,
    functionName: "nonceThreshold",
    args: [mandateAuthorityAddress],
    blockNumber: readAtBlock
  });

  const nonceThresholdUint = expectUint(nonceThreshold, "nonceThreshold");

  return {
    result: {
      blockNumber: toSafeBlockNumberForVault(readAtBlock),
      vault: input.vault,
      mandateAuthority: mandateAuthorityAddress,
      authorityEpoch: toUintString(authorityEpochUint),
      pendingAuthority: pendingAuthorityAddress,
      nonceThreshold: toUintString(nonceThresholdUint),
      totalAssets: toUintString(totalAssetsUint)
    }
  };
}
