import { parseAbi } from "viem";

export const vaultFactoryAbi = parseAbi([
  "function createVault(address asset, string name, string symbol, address authority, bytes32 salt) returns (address vault)",
  "function predictVaultAddress(address asset, string name, string symbol, address authority, bytes32 salt) view returns (address vault)",
  "function predictVaultAddress(address creator, address asset, string name, string symbol, address authority, bytes32 salt) view returns (address vault)"
]);
