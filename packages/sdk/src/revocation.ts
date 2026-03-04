import { encodeFunctionData, isAddress, type Address, type Hex } from "viem";

import { mandatedVaultAbi } from "./abi/mandatedVault.js";
import { resolveChainId, createPublicViemClient, toBigint } from "./shared.js";

export type VaultCheckNonceErrorCode = "INVALID_VAULT_ADDRESS" | "INVALID_AUTHORITY_ADDRESS";

export class VaultCheckNonceError extends Error {
  readonly code: VaultCheckNonceErrorCode;
  readonly field: "vault" | "authority";

  constructor(message: string, params: { code: VaultCheckNonceErrorCode; field: "vault" | "authority" }) {
    super(message);
    this.name = "VaultCheckNonceError";
    this.code = params.code;
    this.field = params.field;
  }
}

export type MandateCheckRevokedErrorCode = "INVALID_VAULT_ADDRESS" | "INVALID_MANDATE_HASH";

export class MandateCheckRevokedError extends Error {
  readonly code: MandateCheckRevokedErrorCode;
  readonly field: "vault" | "mandateHash";

  constructor(
    message: string,
    params: { code: MandateCheckRevokedErrorCode; field: "vault" | "mandateHash" }
  ) {
    super(message);
    this.name = "MandateCheckRevokedError";
    this.code = params.code;
    this.field = params.field;
  }
}

export interface VaultCheckNonceUsedInput {
  chainId?: number;
  vault: Address;
  authority: Address;
  nonce: string;
}

export interface VaultCheckNonceUsedOutput {
  result: {
    used: boolean;
  };
}

export interface MandateCheckRevokedInput {
  chainId?: number;
  vault: Address;
  mandateHash: Hex;
}

export interface MandateCheckRevokedOutput {
  result: {
    revoked: boolean;
  };
}

export interface VaultInvalidateNoncePrepareInput {
  chainId?: number;
  vault: Address;
  from: Address;
  nonce: string;
}

export interface VaultRevokeMandatePrepareInput {
  chainId?: number;
  vault: Address;
  from: Address;
  mandateHash: Hex;
}

export interface VaultRevokeOrInvalidatePrepareOutput {
  result: {
    txRequest: {
      from: Address;
      to: Address;
      data: Hex;
      value: "0";
    };
  };
}

export interface RevocationReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof mandatedVaultAbi;
    functionName: "isNonceUsed" | "isMandateRevoked";
    args: readonly [Address, bigint] | readonly [Hex];
  }): Promise<boolean>;
}

function createDefaultReadClient(chainId: number): RevocationReadClient {
  const publicClient = createPublicViemClient(chainId);

  return {
    readContract(parameters) {
      return publicClient.readContract(parameters) as Promise<boolean>;
    }
  };
}

export async function checkNonceUsed(
  input: VaultCheckNonceUsedInput,
  options?: {
    client?: RevocationReadClient;
  }
): Promise<VaultCheckNonceUsedOutput> {
  if (!isAddress(input.vault)) {
    throw new VaultCheckNonceError("Invalid vault address provided in input.vault.", {
      code: "INVALID_VAULT_ADDRESS",
      field: "vault"
    });
  }

  if (!isAddress(input.authority)) {
    throw new VaultCheckNonceError("Invalid authority address provided in input.authority.", {
      code: "INVALID_AUTHORITY_ADDRESS",
      field: "authority"
    });
  }

  const chainId = resolveChainId(input.chainId);
  const client = options?.client ?? createDefaultReadClient(chainId);

  const used = await client.readContract({
    address: input.vault,
    abi: mandatedVaultAbi,
    functionName: "isNonceUsed",
    args: [input.authority, toBigint(input.nonce, "nonce")]
  });

  return {
    result: {
      used
    }
  };
}

export async function checkMandateRevoked(
  input: MandateCheckRevokedInput,
  options?: {
    client?: RevocationReadClient;
  }
): Promise<MandateCheckRevokedOutput> {
  if (!isAddress(input.vault)) {
    throw new MandateCheckRevokedError("Invalid vault address provided in input.vault.", {
      code: "INVALID_VAULT_ADDRESS",
      field: "vault"
    });
  }

  if (typeof input.mandateHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(input.mandateHash)) {
    throw new MandateCheckRevokedError("Invalid mandateHash provided in input.mandateHash.", {
      code: "INVALID_MANDATE_HASH",
      field: "mandateHash"
    });
  }

  const chainId = resolveChainId(input.chainId);
  const client = options?.client ?? createDefaultReadClient(chainId);

  const revoked = await client.readContract({
    address: input.vault,
    abi: mandatedVaultAbi,
    functionName: "isMandateRevoked",
    args: [input.mandateHash]
  });

  return {
    result: {
      revoked
    }
  };
}

export function prepareInvalidateNonceTx(
  input: VaultInvalidateNoncePrepareInput
): VaultRevokeOrInvalidatePrepareOutput {
  const calldata = encodeFunctionData({
    abi: mandatedVaultAbi,
    functionName: "invalidateNonce",
    args: [toBigint(input.nonce, "nonce")]
  });

  return {
    result: {
      txRequest: {
        from: input.from,
        to: input.vault,
        data: calldata,
        value: "0"
      }
    }
  };
}

export function prepareRevokeMandateTx(
  input: VaultRevokeMandatePrepareInput
): VaultRevokeOrInvalidatePrepareOutput {
  const calldata = encodeFunctionData({
    abi: mandatedVaultAbi,
    functionName: "revokeMandate",
    args: [input.mandateHash]
  });

  return {
    result: {
      txRequest: {
        from: input.from,
        to: input.vault,
        data: calldata,
        value: "0"
      }
    }
  };
}
