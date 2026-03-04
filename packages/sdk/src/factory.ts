import {
  encodeFunctionData,
  isAddress,
  type Address,
  type Hash,
  type Hex
} from "viem";

import { vaultFactoryAbi } from "./abi/vaultFactory.js";
import { resolveChainId, createPublicViemClient } from "./shared.js";

export type FactoryConfigErrorCode =
  | "FACTORY_ADDRESS_NOT_CONFIGURED"
  | "INVALID_FACTORY_ADDRESS"
  | "INVALID_SALT";

export class FactoryConfigError extends Error {
  readonly code: FactoryConfigErrorCode;
  readonly chainId: number;
  readonly field: "factory" | "salt";
  readonly envKey?: string;
  readonly envKeys?: string[];
  readonly value?: string;

  constructor(
    message: string,
    params: {
      code: FactoryConfigErrorCode;
      chainId: number;
      field: "factory" | "salt";
      envKey?: string;
      envKeys?: string[];
      value?: string;
    }
  ) {
    super(message);
    this.name = "FactoryConfigError";
    this.code = params.code;
    this.chainId = params.chainId;
    this.field = params.field;
    this.envKey = params.envKey;
    this.envKeys = params.envKeys;
    this.value = params.value;
  }
}

export interface FactoryBaseInput {
  chainId?: number;
  factory?: Address;
  asset: Address;
  name: string;
  symbol: string;
  authority: Address;
  salt: Hash;
}

export interface FactoryPredictVaultAddressInput extends FactoryBaseInput {}

export interface FactoryCreateVaultPrepareInput extends FactoryBaseInput {
  from: Address;
}

export interface FactoryPredictVaultAddressOutput {
  result: {
    predictedVault: Address;
  };
}

export interface FactoryCreateVaultPrepareOutput {
  result: {
    predictedVault: Address;
    txRequest: {
      from: Address;
      to: Address;
      data: Hex;
      value: "0";
    };
  };
}

type PredictArgsWithoutCreator = readonly [Address, string, string, Address, Hash];
type PredictArgsWithCreator = readonly [Address, Address, string, string, Address, Hash];

export interface VaultFactoryReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof vaultFactoryAbi;
    functionName: "predictVaultAddress";
    args: PredictArgsWithoutCreator | PredictArgsWithCreator;
  }): Promise<Address>;
}

const BYTES32_PATTERN = /^0x[a-fA-F0-9]{64}$/;

function getFactoryEnvCandidates(chainId: number): string[] {
  return chainId === 97
    ? ["BSC_TESTNET_FACTORY_ADDRESS", "BSC_TESTNET_FACTORY", "FACTORY_ADDRESS"]
    : chainId === 11155111
      ? ["SEPOLIA_FACTORY_ADDRESS", "SEPOLIA_FACTORY", "FACTORY_ADDRESS"]
      : ["FACTORY_ADDRESS"];
}

function validateSaltBytes32(salt: string, chainId: number): asserts salt is Hash {
  if (!BYTES32_PATTERN.test(salt)) {
    throw new FactoryConfigError(
      "Invalid salt: expected bytes32 hex string (0x + 64 hex chars).",
      {
        code: "INVALID_SALT",
        chainId,
        field: "salt",
        value: salt
      }
    );
  }
}

function resolveFactoryAddress(factory: Address | undefined, chainId: number): Address {
  if (factory !== undefined) {
    if (!isAddress(factory)) {
      throw new FactoryConfigError("Invalid factory address provided in input.factory.", {
        code: "INVALID_FACTORY_ADDRESS",
        chainId,
        field: "factory",
        value: factory
      });
    }

    return factory;
  }

  const envCandidates = getFactoryEnvCandidates(chainId);

  for (const key of envCandidates) {
    const value = process.env[key];
    if (!value) {
      continue;
    }

    if (!isAddress(value)) {
      throw new FactoryConfigError(`Invalid factory address in env ${key}.`, {
        code: "INVALID_FACTORY_ADDRESS",
        chainId,
        field: "factory",
        envKey: key,
        value
      });
    }

    return value;
  }

  throw new FactoryConfigError(
    `Factory address is not configured for chainId ${chainId}. Set one of: ${envCandidates.join(", ")}.`,
    {
      code: "FACTORY_ADDRESS_NOT_CONFIGURED",
      chainId,
      field: "factory",
      envKeys: envCandidates
    }
  );
}

function createDefaultReadClient(chainId: number): VaultFactoryReadClient {
  return createPublicViemClient(chainId);
}

async function predictVaultAddressInternal(
  input: FactoryPredictVaultAddressInput,
  options?: {
    client?: VaultFactoryReadClient;
    creator?: Address;
  }
): Promise<FactoryPredictVaultAddressOutput> {
  const chainId = resolveChainId(input.chainId);
  const factory = resolveFactoryAddress(input.factory, chainId);
  validateSaltBytes32(input.salt, chainId);

  const client = options?.client ?? createDefaultReadClient(chainId);

  const baseArgs = [input.asset, input.name, input.symbol, input.authority, input.salt] as const;
  const args = options?.creator ? ([options.creator, ...baseArgs] as const) : baseArgs;

  const predictedVault = await client.readContract({
    address: factory,
    abi: vaultFactoryAbi,
    functionName: "predictVaultAddress",
    args
  });

  return {
    result: {
      predictedVault
    }
  };
}

export async function predictVaultAddress(
  input: FactoryPredictVaultAddressInput,
  options?: {
    client?: VaultFactoryReadClient;
  }
): Promise<FactoryPredictVaultAddressOutput> {
  return predictVaultAddressInternal(input, options);
}

export async function prepareCreateVaultTx(
  input: FactoryCreateVaultPrepareInput,
  options?: {
    client?: VaultFactoryReadClient;
  }
): Promise<FactoryCreateVaultPrepareOutput> {
  const chainId = resolveChainId(input.chainId);
  const factory = resolveFactoryAddress(input.factory, chainId);
  validateSaltBytes32(input.salt, chainId);

  const data = encodeFunctionData({
    abi: vaultFactoryAbi,
    functionName: "createVault",
    args: [input.asset, input.name, input.symbol, input.authority, input.salt]
  });

  const prediction = await predictVaultAddressInternal(
    {
      chainId,
      factory,
      asset: input.asset,
      name: input.name,
      symbol: input.symbol,
      authority: input.authority,
      salt: input.salt
    },
    {
      client: options?.client,
      creator: input.from
    }
  );

  return {
    result: {
      predictedVault: prediction.result.predictedVault,
      txRequest: {
        from: input.from,
        to: factory,
        data,
        value: "0"
      }
    }
  };
}
