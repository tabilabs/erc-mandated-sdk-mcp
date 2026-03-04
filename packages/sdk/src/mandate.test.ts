import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  type Address,
  type Hash,
  type Hex
} from "viem";

import { buildMandateSignRequest } from "./mandate.js";

const ZERO_BYTES32 = ("0x" + "0".repeat(64)) as Hash;

function computeActionsDigest(actions: Array<{ adapter: Address; value: bigint; data: Hex }>): Hash {
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

test("buildMandateSignRequest computes typedData + mandateHash + actionsDigest + extensionsHash", async () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;

  const input = {
    chainId: 11155111,
    vault,
    executor: "0x2222222222222222222222222222222222222222" as Address,
    nonce: "1",
    deadline: "0",
    authorityEpoch: "1",
    allowedAdaptersRoot: ("0x" + "a".repeat(64)) as Hex,
    maxDrawdownBps: "10000",
    maxCumulativeDrawdownBps: "10000",
    payloadBinding: "actionsDigest" as const,
    actions: [
      {
        adapter: "0x3333333333333333333333333333333333333333" as Address,
        value: "0",
        data: "0x095ea7b3" as Hex
      },
      {
        adapter: "0x4444444444444444444444444444444444444444" as Address,
        value: "0",
        data: "0x617ba037" as Hex
      }
    ],
    extensions: "0x" as Hex
  };

  const expectedActionsDigest = computeActionsDigest([
    { adapter: input.actions[0].adapter, value: 0n, data: input.actions[0].data },
    { adapter: input.actions[1].adapter, value: 0n, data: input.actions[1].data }
  ]);

  const expectedExtensionsHash = keccak256(input.extensions);

  const expectedDomain = {
    name: "MandatedExecution",
    version: "1",
    chainId: BigInt(input.chainId),
    verifyingContract: vault
  } as const;

  const expectedTypes = {
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
  } as const;

  const expectedMessageForHash = {
    executor: input.executor,
    nonce: 1n,
    deadline: 0,
    authorityEpoch: 1n,
    maxDrawdownBps: 10000,
    maxCumulativeDrawdownBps: 10000,
    allowedAdaptersRoot: input.allowedAdaptersRoot,
    payloadDigest: expectedActionsDigest,
    extensionsHash: expectedExtensionsHash
  } as const;

  const expectedMandateHash = hashTypedData({
    domain: expectedDomain,
    types: expectedTypes,
    primaryType: "Mandate",
    message: expectedMessageForHash
  });

  const output = await buildMandateSignRequest(input);

  assert.deepEqual(output, {
    result: {
      typedData: {
        domain: expectedDomain,
        types: expectedTypes,
        primaryType: "Mandate",
        message: {
          executor: input.executor,
          nonce: input.nonce,
          deadline: input.deadline,
          authorityEpoch: input.authorityEpoch,
          maxDrawdownBps: input.maxDrawdownBps,
          maxCumulativeDrawdownBps: input.maxCumulativeDrawdownBps,
          allowedAdaptersRoot: input.allowedAdaptersRoot,
          payloadDigest: expectedActionsDigest,
          extensionsHash: expectedExtensionsHash
        }
      },
      mandate: {
        vault: input.vault,
        executor: input.executor,
        nonce: input.nonce,
        deadline: input.deadline,
        authorityEpoch: input.authorityEpoch,
        allowedAdaptersRoot: input.allowedAdaptersRoot,
        maxDrawdownBps: input.maxDrawdownBps,
        maxCumulativeDrawdownBps: input.maxCumulativeDrawdownBps,
        payloadDigest: expectedActionsDigest,
        extensionsHash: expectedExtensionsHash
      },
      mandateHash: expectedMandateHash,
      actionsDigest: expectedActionsDigest,
      extensionsHash: expectedExtensionsHash
    }
  });
});

test("buildMandateSignRequest supports payloadBinding=none", async () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;

  const input = {
    chainId: 11155111,
    vault,
    executor: "0x2222222222222222222222222222222222222222" as Address,
    nonce: "1",
    deadline: "0",
    authorityEpoch: "1",
    allowedAdaptersRoot: ("0x" + "a".repeat(64)) as Hex,
    maxDrawdownBps: "10000",
    maxCumulativeDrawdownBps: "10000",
    payloadBinding: "none" as const,
    actions: [
      {
        adapter: "0x3333333333333333333333333333333333333333" as Address,
        value: "0",
        data: "0x095ea7b3" as Hex
      }
    ],
    extensions: "0x" as Hex
  };

  const expectedActionsDigest = computeActionsDigest([
    { adapter: input.actions[0].adapter, value: 0n, data: input.actions[0].data }
  ]);

  const expectedExtensionsHash = keccak256(input.extensions);

  const expectedMandateHash = hashTypedData({
    domain: {
      name: "MandatedExecution",
      version: "1",
      chainId: BigInt(input.chainId),
      verifyingContract: vault
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
    primaryType: "Mandate",
    message: {
      executor: input.executor,
      nonce: 1n,
      deadline: 0,
      authorityEpoch: 1n,
      maxDrawdownBps: 10000,
      maxCumulativeDrawdownBps: 10000,
      allowedAdaptersRoot: input.allowedAdaptersRoot,
      payloadDigest: ZERO_BYTES32,
      extensionsHash: expectedExtensionsHash
    }
  });

  const output = await buildMandateSignRequest(input);

  assert.equal(output.result.actionsDigest, expectedActionsDigest);
  assert.equal(output.result.extensionsHash, expectedExtensionsHash);
  assert.equal(output.result.mandate.payloadDigest, ZERO_BYTES32);
  assert.equal(output.result.mandateHash, expectedMandateHash);
});
