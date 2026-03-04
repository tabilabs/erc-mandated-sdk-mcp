import { parseAbi } from "viem";

export const mandatedVaultAbi = parseAbi([
  "function mandateAuthority() view returns (address)",
  "function authorityEpoch() view returns (uint64)",
  "function pendingAuthority() view returns (address)",
  "function nonceThreshold(address authority) view returns (uint256)",
  "function totalAssets() view returns (uint256)",

  "function isNonceUsed(address authority,uint256 nonce) view returns (bool)",
  "function isMandateRevoked(bytes32 mandateHash) view returns (bool)",
  "function invalidateNonce(uint256 nonce)",
  "function revokeMandate(bytes32 mandateHash)",

  "function execute((address executor,uint256 nonce,uint48 deadline,uint64 authorityEpoch,uint16 maxDrawdownBps,uint16 maxCumulativeDrawdownBps,bytes32 allowedAdaptersRoot,bytes32 payloadDigest,bytes32 extensionsHash) mandate,(address adapter,uint256 value,bytes data)[] actions,bytes signature,bytes32[][] adapterProofs,bytes extensions) returns (uint256 preAssets,uint256 postAssets)"
]);
