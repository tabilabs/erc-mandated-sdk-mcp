import { createPublicClient, http, type Chain } from "viem";
import { getChainConfig, getRpcUrl } from "./networks.js";
import { ErcMandatedSdkError } from "./errors.js";

export function resolveChainId(chainId?: number): number {
  return chainId ?? getChainConfig().id;
}

export function getViemChain(chainId: number): Chain | undefined {
  return getChainConfig(chainId).viemChain;
}

export function createPublicViemClient(chainId: number) {
  return createPublicClient({
    chain: getViemChain(chainId),
    transport: http(getRpcUrl(chainId))
  });
}

export function toSafeBlockNumber(value: bigint, context: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ErcMandatedSdkError(`${context}: block number out of safe integer range`, {
      code: "BLOCK_NUMBER_OUT_OF_RANGE",
      details: {
        context,
        value: value.toString(10)
      }
    });
  }
  return Number(value);
}

export function toBigint(value: string, field: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new ErcMandatedSdkError(`Invalid ${field}: expected decimal string`, {
      code: "INVALID_DECIMAL_STRING",
      details: {
        field,
        value
      }
    });
  }
  return BigInt(value);
}

export function toUintString(value: bigint): string {
  return value.toString(10);
}
