export interface SupportedChain {
  id: number;
  name: string;
  rpcUrlEnvVar: string;
}

export type NetworkConfigErrorCode =
  | "UNSUPPORTED_CHAIN"
  | "RPC_URL_NOT_CONFIGURED";

export class NetworkConfigError extends Error {
  readonly code: NetworkConfigErrorCode;
  readonly chainId: number;
  readonly rpcUrlEnvVar?: string;

  constructor(
    message: string,
    params: {
      code: NetworkConfigErrorCode;
      chainId: number;
      rpcUrlEnvVar?: string;
    }
  ) {
    super(message);
    this.name = "NetworkConfigError";
    this.code = params.code;
    this.chainId = params.chainId;
    this.rpcUrlEnvVar = params.rpcUrlEnvVar;
  }
}

const DEFAULT_CHAIN_ID = 97;

const SUPPORTED_CHAINS: readonly Readonly<SupportedChain>[] = Object.freeze([
  Object.freeze({
    id: 97,
    name: "BSC Testnet",
    rpcUrlEnvVar: "BSC_TESTNET_RPC_URL"
  }),
  Object.freeze({
    id: 11155111,
    name: "Sepolia",
    rpcUrlEnvVar: "SEPOLIA_RPC_URL"
  })
]);

function cloneChainConfig(chain: Readonly<SupportedChain>): SupportedChain {
  return {
    id: chain.id,
    name: chain.name,
    rpcUrlEnvVar: chain.rpcUrlEnvVar
  };
}

export function getSupportedChains(): SupportedChain[] {
  return SUPPORTED_CHAINS.map(cloneChainConfig);
}

export function getChainConfig(chainId: number = DEFAULT_CHAIN_ID): SupportedChain {
  const chain = SUPPORTED_CHAINS.find((item) => item.id === chainId);

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
  const rpcUrl = process.env[chain.rpcUrlEnvVar];

  if (!rpcUrl) {
    throw new NetworkConfigError(
      `RPC URL is not configured for chainId ${chain.id}. Set ${chain.rpcUrlEnvVar}.`,
      {
        code: "RPC_URL_NOT_CONFIGURED",
        chainId: chain.id,
        rpcUrlEnvVar: chain.rpcUrlEnvVar
      }
    );
  }

  return rpcUrl;
}
