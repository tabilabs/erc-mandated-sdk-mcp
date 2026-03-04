import { createPublicClient, http, type Chain } from "viem";
import { bscTestnet, sepolia } from "viem/chains";
import { getChainConfig, getRpcUrl } from "./networks.js";

export function resolveChainId(chainId?: number): number {
  return chainId ?? getChainConfig().id;
}

export function getViemChain(chainId: number): Chain | undefined {
  if (chainId === 97) return bscTestnet;
  if (chainId === 11155111) return sepolia;
  return undefined;
}

export function createPublicViemClient(chainId: number) {
  return createPublicClient({
    chain: getViemChain(chainId),
    transport: http(getRpcUrl(chainId))
  });
}

export function toSafeBlockNumber(value: bigint, context: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${context}: block number out of safe integer range`);
  }
  return Number(value);
}

export function toBigint(value: string, field: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`Invalid ${field}: expected decimal string`);
  }
  return BigInt(value);
}

export function toUintString(value: bigint): string {
  return value.toString(10);
}
