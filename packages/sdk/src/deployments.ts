import type { Address } from "viem";

export interface DeploymentRegistryEntry {
  contractVersion: string;
  chainId: number;
  factory: Address;
}

export const ACTIVE_DEPLOYMENT_REGISTRY_VERSION = "v0.3.1-agent-contract";
const DEPLOYMENT_REGISTRY_VERSION_ENV_KEY = "ERC_MANDATED_CONTRACT_VERSION";

const DEPLOYMENT_REGISTRY: Readonly<Record<string, Readonly<Record<number, DeploymentRegistryEntry>>>> =
  Object.freeze({
    "v0.3.1-agent-contract": Object.freeze({
      97: Object.freeze({
        contractVersion: "v0.3.1-agent-contract",
        chainId: 97,
        factory: "0xbC71DD7c14aD11384143A40166EAeCD6cc9bAb95" as Address
      }),
      56: Object.freeze({
        contractVersion: "v0.3.1-agent-contract",
        chainId: 56,
        factory: "0x6eFC613Ece5D95e4a7b69B4EddD332CeeCbb61c6" as Address
      })
    })
  });

function cloneEntry(entry: DeploymentRegistryEntry | undefined): DeploymentRegistryEntry | undefined {
  return entry ? { ...entry } : undefined;
}

function resolveDeploymentRegistryVersion(explicitContractVersion?: string): string {
  if (typeof explicitContractVersion === "string" && explicitContractVersion.length > 0) {
    return explicitContractVersion;
  }

  const envContractVersion = process.env[DEPLOYMENT_REGISTRY_VERSION_ENV_KEY];
  if (typeof envContractVersion === "string" && envContractVersion.length > 0) {
    return envContractVersion;
  }

  return ACTIVE_DEPLOYMENT_REGISTRY_VERSION;
}

export function getDefaultDeployment(
  chainId: number,
  options?: {
    contractVersion?: string;
  }
): DeploymentRegistryEntry | undefined {
  const contractVersion = resolveDeploymentRegistryVersion(options?.contractVersion);
  return cloneEntry(DEPLOYMENT_REGISTRY[contractVersion]?.[chainId]);
}
