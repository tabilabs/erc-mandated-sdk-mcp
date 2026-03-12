import type { Chain } from "viem";
import { base, bsc, bscTestnet, sepolia } from "viem/chains";
import { ErcMandatedSdkError } from "./errors.js";

export interface SupportedChain {
  id: number;
  name: string;
  rpcUrlEnvVar: string;
  rpcUrlEnvCandidates?: string[];
  factoryEnvCandidates?: string[];
  viemChain?: Chain;
}

export type NetworkConfigErrorCode =
  | "UNSUPPORTED_CHAIN"
  | "RPC_URL_NOT_CONFIGURED";

export class NetworkConfigError extends ErcMandatedSdkError {
  readonly code: NetworkConfigErrorCode;
  readonly chainId: number;
  readonly rpcUrlEnvVar?: string;
  readonly rpcUrlEnvCandidates?: string[];

  constructor(
    message: string,
    params: {
      code: NetworkConfigErrorCode;
      chainId: number;
      rpcUrlEnvVar?: string;
      rpcUrlEnvCandidates?: string[];
    }
  ) {
    super(message, {
      code: params.code,
      name: "NetworkConfigError",
      details: {
        chainId: params.chainId,
        rpcUrlEnvVar: params.rpcUrlEnvVar,
        rpcUrlEnvCandidates: params.rpcUrlEnvCandidates
      }
    });
    this.code = params.code;
    this.chainId = params.chainId;
    this.rpcUrlEnvVar = params.rpcUrlEnvVar;
    this.rpcUrlEnvCandidates = params.rpcUrlEnvCandidates;
  }
}

const DEFAULT_CHAIN_ID = 97;

const DEFAULT_SUPPORTED_CHAINS: readonly Readonly<SupportedChain>[] = Object.freeze([
  Object.freeze({
    id: 97,
    name: "BSC Testnet",
    rpcUrlEnvVar: "BSC_TESTNET_RPC_URL",
    rpcUrlEnvCandidates: ["BSC_TESTNET_RPC_URL", "BSC_RPC_URL", "ERC_MANDATED_RPC_URL"],
    factoryEnvCandidates: ["BSC_TESTNET_FACTORY_ADDRESS", "BSC_TESTNET_FACTORY", "FACTORY_ADDRESS"],
    viemChain: bscTestnet
  }),
  Object.freeze({
    id: 11155111,
    name: "Sepolia",
    rpcUrlEnvVar: "SEPOLIA_RPC_URL",
    rpcUrlEnvCandidates: ["SEPOLIA_RPC_URL", "ERC_MANDATED_RPC_URL"],
    factoryEnvCandidates: ["SEPOLIA_FACTORY_ADDRESS", "SEPOLIA_FACTORY", "FACTORY_ADDRESS"],
    viemChain: sepolia
  }),
  Object.freeze({
    id: 56,
    name: "BSC Mainnet",
    rpcUrlEnvVar: "BSC_MAINNET_RPC_URL",
    rpcUrlEnvCandidates: ["BSC_MAINNET_RPC_URL", "BSC_RPC_URL", "ERC_MANDATED_RPC_URL"],
    factoryEnvCandidates: ["BSC_MAINNET_FACTORY_ADDRESS", "BSC_FACTORY_ADDRESS", "FACTORY_ADDRESS"],
    viemChain: bsc
  }),
  Object.freeze({
    id: 8453,
    name: "Base Mainnet",
    rpcUrlEnvVar: "BASE_MAINNET_RPC_URL",
    rpcUrlEnvCandidates: ["BASE_MAINNET_RPC_URL", "BASE_RPC_URL", "ERC_MANDATED_RPC_URL"],
    factoryEnvCandidates: ["BASE_MAINNET_FACTORY_ADDRESS", "BASE_FACTORY_ADDRESS", "FACTORY_ADDRESS"],
    viemChain: base
  })
]);

let supportedChainsMap = new Map<number, SupportedChain>(
  DEFAULT_SUPPORTED_CHAINS.map((chain) => [chain.id, cloneChainConfig(chain)])
);

function deepCloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneValue(item)) as T;
  }

  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepCloneValue(v);
    }
    return out as T;
  }

  return value;
}

function cloneViemChain(viemChain: Chain | undefined): Chain | undefined {
  if (!viemChain) {
    return undefined;
  }

  return deepCloneValue(viemChain);
}

function normalizeRpcUrlEnvCandidates(chain: Readonly<SupportedChain>): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const candidate of [chain.rpcUrlEnvVar, ...(chain.rpcUrlEnvCandidates ?? [])]) {
    if (candidate.length === 0 || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
}

function cloneChainConfig(chain: Readonly<SupportedChain>): SupportedChain {
  return {
    id: chain.id,
    name: chain.name,
    rpcUrlEnvVar: chain.rpcUrlEnvVar,
    rpcUrlEnvCandidates: normalizeRpcUrlEnvCandidates(chain),
    factoryEnvCandidates: chain.factoryEnvCandidates ? [...chain.factoryEnvCandidates] : undefined,
    viemChain: cloneViemChain(chain.viemChain)
  };
}

export function getSupportedChains(): SupportedChain[] {
  return Array.from(supportedChainsMap.values(), cloneChainConfig);
}

export function getChainConfig(chainId: number = DEFAULT_CHAIN_ID): SupportedChain {
  const chain = supportedChainsMap.get(chainId);

  if (!chain) {
    throw new NetworkConfigError(`Unsupported chainId: ${chainId}`, {
      code: "UNSUPPORTED_CHAIN",
      chainId
    });
  }

  return cloneChainConfig(chain);
}

export function getRpcUrl(chainId: number = DEFAULT_CHAIN_ID): string {
  const chain = getChainConfig(chainId);
  const rpcUrlEnvCandidates = chain.rpcUrlEnvCandidates ?? [chain.rpcUrlEnvVar];

  for (const envKey of rpcUrlEnvCandidates) {
    const rpcUrl = process.env[envKey];

    if (rpcUrl) {
      return rpcUrl;
    }
  }

  throw new NetworkConfigError(
    `RPC URL is not configured for chainId ${chain.id}. Set one of: ${rpcUrlEnvCandidates.join(", ")}.`,
    {
      code: "RPC_URL_NOT_CONFIGURED",
      chainId: chain.id,
      rpcUrlEnvVar: chain.rpcUrlEnvVar,
      rpcUrlEnvCandidates
    }
  );
}

export function registerSupportedChain(chain: SupportedChain): void {
  supportedChainsMap.set(chain.id, cloneChainConfig(chain));
}

export function registerSupportedChains(chains: SupportedChain[]): void {
  for (const chain of chains) {
    registerSupportedChain(chain);
  }
}

export function resetSupportedChains(): void {
  supportedChainsMap = new Map<number, SupportedChain>(
    DEFAULT_SUPPORTED_CHAINS.map((chain) => [chain.id, cloneChainConfig(chain)])
  );
}
