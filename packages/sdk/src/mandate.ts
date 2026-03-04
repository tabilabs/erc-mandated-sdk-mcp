import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  type Address,
  type Hash,
  type Hex
} from "viem";

import { resolveChainId, toBigint } from "./shared.js";

const ZERO_BYTES32 = ("0x" + "0".repeat(64)) as Hash;

export type MandatePayloadBinding = "actionsDigest" | "none";

export interface MandateBuildSignRequestInput {
  chainId?: number;
  vault: Address;
  executor: Address;
  nonce: string;
  deadline: string;
  authorityEpoch: string;
  allowedAdaptersRoot: Hex;
  maxDrawdownBps: string;
  maxCumulativeDrawdownBps: string;
  payloadBinding?: MandatePayloadBinding;
  actions: Array<{
    adapter: Address;
    value: string;
    data: Hex;
  }>;
  extensions: Hex;
}

export interface MandateBuildSignRequestOutput {
  result: {
    typedData: {
      domain: {
        name: "MandatedExecution";
        version: "1";
        chainId: bigint;
        verifyingContract: Address;
      };
      types: {
        EIP712Domain: Array<{ name: string; type: string }>;
        Mandate: Array<{ name: string; type: string }>;
      };
      primaryType: "Mandate";
      message: {
        executor: Address;
        nonce: string;
        deadline: string;
        authorityEpoch: string;
        maxDrawdownBps: string;
        maxCumulativeDrawdownBps: string;
        allowedAdaptersRoot: Hex;
        payloadDigest: Hash;
        extensionsHash: Hash;
      };
    };
    mandate: {
      vault: Address;
      executor: Address;
      nonce: string;
      deadline: string;
      authorityEpoch: string;
      allowedAdaptersRoot: Hex;
      maxDrawdownBps: string;
      maxCumulativeDrawdownBps: string;
      payloadDigest: Hash;
      extensionsHash: Hash;
    };
    mandateHash: Hash;
    actionsDigest: Hash;
    extensionsHash: Hash;
  };
}

function computeActionsDigest(actions: Array<{ adapter: Address; value: bigint; data: Hex }>): Hash {
  // Important: this must match Solidity `keccak256(abi.encode(actions))`.
  // i.e., ABI-encode the tuple[] and then keccak.
  const encoded = encodeAbiParameters(
    [
      {
        type: "tuple[]",
        name: "actions",
        components: [
          { type: "address", name: "adapter" },
          { type: "uint256", name: "value" },
          { type: "bytes", name: "data" }
        ]
      }
    ] as const,
    [actions] as const
  );

  return keccak256(encoded);
}

function toUintStringNumber(value: string, field: string): number {
  const asBigint = toBigint(value, field);
  if (asBigint > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Invalid ${field}: out of safe integer range for uint16/uint48 in typed data.`);
  }
  return Number(asBigint);
}

export async function buildMandateSignRequest(
  input: MandateBuildSignRequestInput
): Promise<MandateBuildSignRequestOutput> {
  const chainId = resolveChainId(input.chainId);
  const payloadBinding: MandatePayloadBinding = input.payloadBinding ?? "actionsDigest";

  const actionsDigest = computeActionsDigest(
    input.actions.map((a) => ({
      adapter: a.adapter,
      value: toBigint(a.value, "actions[i].value"),
      data: a.data
    }))
  );

  const extensionsHash = keccak256(input.extensions);

  const payloadDigest = payloadBinding === "actionsDigest" ? actionsDigest : ZERO_BYTES32;

  // Keep these aligned with reference/src/MandatedVault.sol:_MANDATE_TYPEHASH and EIP712("MandatedExecution","1")
  const typedData = {
    domain: {
      name: "MandatedExecution" as const,
      version: "1" as const,
      chainId: BigInt(chainId),
      verifyingContract: input.vault
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" }
      ],
      Mandate: [
        { name: "executor", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
        { name: "authorityEpoch", type: "uint64" },
        { name: "maxDrawdownBps", type: "uint16" },
        { name: "maxCumulativeDrawdownBps", type: "uint16" },
        { name: "allowedAdaptersRoot", type: "bytes32" },
        { name: "payloadDigest", type: "bytes32" },
        { name: "extensionsHash", type: "bytes32" }
      ]
    },
    primaryType: "Mandate" as const,
    message: {
      executor: input.executor,
      nonce: input.nonce,
      deadline: input.deadline,
      authorityEpoch: input.authorityEpoch,
      maxDrawdownBps: input.maxDrawdownBps,
      maxCumulativeDrawdownBps: input.maxCumulativeDrawdownBps,
      allowedAdaptersRoot: input.allowedAdaptersRoot,
      payloadDigest,
      extensionsHash
    }
  };

  const mandateHash = hashTypedData({
    domain: typedData.domain,
    types: typedData.types as any,
    primaryType: "Mandate",
    message: {
      executor: input.executor,
      nonce: toBigint(input.nonce, "nonce"),
      deadline: toUintStringNumber(input.deadline, "deadline"),
      authorityEpoch: toBigint(input.authorityEpoch, "authorityEpoch"),
      maxDrawdownBps: toUintStringNumber(input.maxDrawdownBps, "maxDrawdownBps"),
      maxCumulativeDrawdownBps: toUintStringNumber(input.maxCumulativeDrawdownBps, "maxCumulativeDrawdownBps"),
      allowedAdaptersRoot: input.allowedAdaptersRoot,
      payloadDigest,
      extensionsHash
    } as any
  });

  return {
    result: {
      typedData,
      mandate: {
        vault: input.vault,
        executor: input.executor,
        nonce: input.nonce,
        deadline: input.deadline,
        authorityEpoch: input.authorityEpoch,
        allowedAdaptersRoot: input.allowedAdaptersRoot,
        maxDrawdownBps: input.maxDrawdownBps,
        maxCumulativeDrawdownBps: input.maxCumulativeDrawdownBps,
        payloadDigest,
        extensionsHash
      },
      mandateHash,
      actionsDigest,
      extensionsHash
    }
  };
}
