import {
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
  type Hex
} from "viem";

import { mandatedVaultAbi } from "./abi/mandatedVault.js";
import { NetworkConfigError } from "./networks.js";
import { resolveChainId, createPublicViemClient, toSafeBlockNumber, toBigint } from "./shared.js";
import { ErcMandatedSdkError } from "./errors.js";

export interface ExecuteAction {
  adapter: Address;
  value: string;
  data: Hex;
}

export interface ExecuteMandate {
  vault: Address;
  executor: Address;
  nonce: string;
  deadline: string;
  authorityEpoch: string;
  allowedAdaptersRoot: Hex;
  maxDrawdownBps: string;
  maxCumulativeDrawdownBps: string;
  payloadDigest: Hex;
  extensionsHash: Hex;
}

export interface VaultExecuteBaseInput {
  chainId?: number;
  vault: Address;
  from: Address;
  mandate: ExecuteMandate;
  signature: Hex;
  actions: ExecuteAction[];
  adapterProofs: Hex[][];
  extensions: Hex;
}

export interface VaultSimulateExecuteOutput {
  result: {
    ok: boolean;
    blockNumber: number;
    preAssets?: string;
    postAssets?: string;
    revertDecoded?: {
      message: string;
      name?: string;
      shortMessage?: string;
      rawData?: string;
    };
  };
}

export interface VaultExecutePrepareOutput {
  result: {
    txRequest: {
      from: Address;
      to: Address;
      data: Hex;
      value: "0";
    };
    audit?: {
      mandateHash?: Hex;
      actionsDigest?: Hex;
    };
  };
}

export interface ExecuteSimulateClient {
  call(parameters: { to: Address; data: Hex; from?: Address }): Promise<{ data?: Hex }>;
  getBlockNumber(): Promise<bigint>;
}

function createDefaultSimulateClient(chainId: number): ExecuteSimulateClient {
  const publicClient = createPublicViemClient(chainId);

  return {
    call(parameters) {
      return publicClient.call(parameters);
    },
    getBlockNumber() {
      return publicClient.getBlockNumber();
    }
  };
}

const MAX_UINT48 = (1n << 48n) - 1n;
const MAX_UINT16 = 65535n;
const MAX_BPS = 10000n;

function toSafeNumberForUint48(value: bigint, field: string): number {
  if (value < 0n || value > MAX_UINT48) {
    throw new ErcMandatedSdkError(`Invalid ${field}: expected uint48`, {
      code: "INVALID_UINT48",
      details: {
        field,
        value: value.toString(10)
      }
    });
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ErcMandatedSdkError(`Invalid ${field}: exceeds JS safe integer range`, {
      code: "INVALID_SAFE_INTEGER_RANGE",
      details: {
        field,
        value: value.toString(10)
      }
    });
  }
  return Number(value);
}

function toSafeBpsUint16(value: bigint, field: string): number {
  if (value < 0n || value > MAX_UINT16) {
    throw new ErcMandatedSdkError(`Invalid ${field}: expected uint16`, {
      code: "INVALID_UINT16",
      details: {
        field,
        value: value.toString(10)
      }
    });
  }
  if (value > MAX_BPS) {
    throw new ErcMandatedSdkError(`Invalid ${field}: bps must be <= 10000`, {
      code: "INVALID_BPS",
      details: {
        field,
        value: value.toString(10)
      }
    });
  }
  return Number(value);
}

function buildExecuteCalldata(input: VaultExecuteBaseInput): Hex {
  const deadline = toBigint(input.mandate.deadline, "mandate.deadline");
  const maxDrawdownBps = toBigint(input.mandate.maxDrawdownBps, "mandate.maxDrawdownBps");
  const maxCumulativeDrawdownBps = toBigint(
    input.mandate.maxCumulativeDrawdownBps,
    "mandate.maxCumulativeDrawdownBps"
  );

  return encodeFunctionData({
    abi: mandatedVaultAbi,
    functionName: "execute",
    args: [
      {
        executor: input.mandate.executor,
        nonce: toBigint(input.mandate.nonce, "mandate.nonce"),
        deadline: toSafeNumberForUint48(deadline, "mandate.deadline"),
        authorityEpoch: toBigint(input.mandate.authorityEpoch, "mandate.authorityEpoch"),
        maxDrawdownBps: toSafeBpsUint16(maxDrawdownBps, "mandate.maxDrawdownBps"),
        maxCumulativeDrawdownBps: toSafeBpsUint16(
          maxCumulativeDrawdownBps,
          "mandate.maxCumulativeDrawdownBps"
        ),
        allowedAdaptersRoot: input.mandate.allowedAdaptersRoot,
        payloadDigest: input.mandate.payloadDigest,
        extensionsHash: input.mandate.extensionsHash
      },
      input.actions.map((a) => ({
        adapter: a.adapter,
        value: toBigint(a.value, "actions[i].value"),
        data: a.data
      })),
      input.signature,
      input.adapterProofs,
      input.extensions
    ]
  });
}

export function prepareExecuteTx(input: VaultExecuteBaseInput): VaultExecutePrepareOutput {
  const calldata = buildExecuteCalldata(input);

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

export async function simulateExecuteVault(
  input: VaultExecuteBaseInput,
  options?: {
    client?: ExecuteSimulateClient;
  }
): Promise<VaultSimulateExecuteOutput> {
  const chainId = resolveChainId(input.chainId);
  const client = options?.client ?? createDefaultSimulateClient(chainId);

  const calldata = buildExecuteCalldata(input);

  const blockNumber = await client.getBlockNumber();

  try {
    const out = await client.call({
      to: input.vault,
      from: input.from,
      data: calldata
    });

    // If eth_call succeeds, output ok=true.
    // We optionally attempt to decode pre/post assets if return data matches.
    let preAssets: string | undefined;
    let postAssets: string | undefined;

    if (out.data) {
      try {
        const decoded = decodeFunctionResult({
          abi: mandatedVaultAbi,
          functionName: "execute",
          data: out.data
        });

        if (Array.isArray(decoded) && decoded.length === 2) {
          preAssets = (decoded[0] as bigint).toString(10);
          postAssets = (decoded[1] as bigint).toString(10);
        }
      } catch {
        // ignore decode failures; still a successful simulation
      }
    }

    return {
      result: {
        ok: true,
        blockNumber: toSafeBlockNumber(blockNumber, "execute simulation"),
        ...(preAssets ? { preAssets } : {}),
        ...(postAssets ? { postAssets } : {})
      }
    };
  } catch (error: unknown) {
    if (error instanceof NetworkConfigError) {
      throw error;
    }

    const errorObject = error as
      | (Error & {
          shortMessage?: string;
          data?: string;
        })
      | undefined;

    return {
      result: {
        ok: false,
        blockNumber: toSafeBlockNumber(blockNumber, "execute simulation"),
        revertDecoded: {
          message: errorObject instanceof Error ? errorObject.message : String(error),
          ...(errorObject?.name ? { name: errorObject.name } : {}),
          ...(typeof errorObject?.shortMessage === "string"
            ? { shortMessage: errorObject.shortMessage }
            : {}),
          ...(typeof errorObject?.data === "string" ? { rawData: errorObject.data } : {})
        }
      }
    };
  }
}
