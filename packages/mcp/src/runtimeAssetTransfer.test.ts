import assert from "node:assert/strict";
import test from "node:test";

import type { Address, Hex } from "viem";

import {
  executeAssetTransferFromAccountContextWithRuntime,
  executeAssetTransferWithRuntime,
  EXECUTOR_PRIVATE_KEY_ENV,
  RuntimeAssetTransferError
} from "./runtimeAssetTransfer.js";
import { BOOTSTRAP_PRIVATE_KEY_ENV, ENABLE_BROADCAST_ENV } from "./runtimeBootstrap.js";

function snapshotEnv(keys: readonly string[]): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};

  for (const key of keys) {
    snapshot[key] = process.env[key];
  }

  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const RUNTIME_ENV_KEYS = [
  EXECUTOR_PRIVATE_KEY_ENV,
  BOOTSTRAP_PRIVATE_KEY_ENV,
  ENABLE_BROADCAST_ENV
] as const;

function buildExecuteInput() {
  return {
    chainId: 56,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    executor: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    tokenAddress: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    to: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
    amountRaw: "1",
    nonce: "1",
    deadline: "999999",
    authorityEpoch: "1",
    allowedAdaptersRoot: ("0x" + "11".repeat(32)) as Hex,
    maxDrawdownBps: "10000",
    maxCumulativeDrawdownBps: "10000",
    executeContext: {
      signature: "0x1234" as Hex,
      adapterProofs: [[("0x" + "22".repeat(32)) as Hex]]
    }
  };
}

test("executeAssetTransferWithRuntime rejects execute mode when broadcast is disabled", async () => {
  const snapshot = snapshotEnv(RUNTIME_ENV_KEYS);
  delete process.env[EXECUTOR_PRIVATE_KEY_ENV];
  delete process.env[BOOTSTRAP_PRIVATE_KEY_ENV];
  delete process.env[ENABLE_BROADCAST_ENV];

  try {
    await assert.rejects(
      async () => {
        await executeAssetTransferWithRuntime(buildExecuteInput());
      },
      (error: unknown) => {
        assert.ok(error instanceof RuntimeAssetTransferError);
        assert.equal(error.code, "EXECUTION_BROADCAST_DISABLED");
        return true;
      }
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("executeAssetTransferWithRuntime rejects execute mode when no private key is configured", async () => {
  const snapshot = snapshotEnv(RUNTIME_ENV_KEYS);
  delete process.env[EXECUTOR_PRIVATE_KEY_ENV];
  delete process.env[BOOTSTRAP_PRIVATE_KEY_ENV];
  process.env[ENABLE_BROADCAST_ENV] = "1";

  try {
    await assert.rejects(
      async () => {
        await executeAssetTransferWithRuntime(buildExecuteInput());
      },
      (error: unknown) => {
        assert.ok(error instanceof RuntimeAssetTransferError);
        assert.equal(error.code, "EXECUTOR_PRIVATE_KEY_NOT_CONFIGURED");
        return true;
      }
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("executeAssetTransferWithRuntime rejects mismatched runtime signer and executor", async () => {
  const snapshot = snapshotEnv(RUNTIME_ENV_KEYS);
  process.env[EXECUTOR_PRIVATE_KEY_ENV] =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  process.env[ENABLE_BROADCAST_ENV] = "1";

  try {
    await assert.rejects(
      async () => {
        await executeAssetTransferWithRuntime(buildExecuteInput());
      },
      (error: unknown) => {
        assert.ok(error instanceof RuntimeAssetTransferError);
        assert.equal(error.code, "EXECUTION_FROM_ADDRESS_MISMATCH");
        return true;
      }
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("executeAssetTransferFromAccountContextWithRuntime rejects mismatched runtime signer and accountContext.executor", async () => {
  const snapshot = snapshotEnv(RUNTIME_ENV_KEYS);
  process.env[EXECUTOR_PRIVATE_KEY_ENV] =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  process.env[ENABLE_BROADCAST_ENV] = "1";

  try {
    await assert.rejects(
      async () => {
        await executeAssetTransferFromAccountContextWithRuntime({
          accountContext: {
            agentId: "predict-bot",
            chainId: 56,
            vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            executor: "0xcccccccccccccccccccccccccccccccccccccccc",
            defaults: {
              allowedAdaptersRoot: ("0x" + "11".repeat(32)) as Hex,
              maxDrawdownBps: "10000",
              maxCumulativeDrawdownBps: "10000",
              payloadBinding: "actionsDigest",
              extensions: "0x"
            },
            createdAt: "2026-03-12T00:00:00.000Z",
            updatedAt: "2026-03-12T00:00:00.000Z"
          },
          fundingPolicy: {
            policyId: "predict-bot-policy",
            allowedTokenAddresses: ["0xdddddddddddddddddddddddddddddddddddddddd"],
            allowedRecipients: ["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
            createdAt: "2026-03-12T00:00:00.000Z",
            updatedAt: "2026-03-12T00:00:00.000Z"
          },
          tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          to: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
          amountRaw: "1",
          nonce: "1",
          deadline: "999999",
          authorityEpoch: "1",
          executeContext: {
            signature: "0x1234" as Hex,
            adapterProofs: [[("0x" + "22".repeat(32)) as Hex]]
          }
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof RuntimeAssetTransferError);
        assert.equal(error.code, "EXECUTION_FROM_ADDRESS_MISMATCH");
        return true;
      }
    );
  } finally {
    restoreEnv(snapshot);
  }
});
