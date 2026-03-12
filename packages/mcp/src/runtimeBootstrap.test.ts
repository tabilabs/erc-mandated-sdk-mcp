import assert from "node:assert/strict";
import test from "node:test";

import type { Address, Hash } from "viem";

import {
  bootstrapVaultWithRuntime,
  BOOTSTRAP_PRIVATE_KEY_ENV,
  ENABLE_BROADCAST_ENV,
  RuntimeBootstrapError
} from "./runtimeBootstrap.js";

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

const RUNTIME_ENV_KEYS = [BOOTSTRAP_PRIVATE_KEY_ENV, ENABLE_BROADCAST_ENV] as const;

test("bootstrapVaultWithRuntime rejects execute mode when broadcast is disabled", async () => {
  const snapshot = snapshotEnv(RUNTIME_ENV_KEYS);
  delete process.env[BOOTSTRAP_PRIVATE_KEY_ENV];
  delete process.env[ENABLE_BROADCAST_ENV];

  try {
    await assert.rejects(
      async () => {
        await bootstrapVaultWithRuntime({
          chainId: 56,
          asset: "0x2222222222222222222222222222222222222222" as Address,
          name: "Bootstrap Vault",
          symbol: "BOOT",
          salt: (`0x${"11".repeat(32)}` as Hash),
          mode: "execute",
          signerAddress: "0x3333333333333333333333333333333333333333" as Address
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof RuntimeBootstrapError);
        assert.equal(error.code, "BOOTSTRAP_BROADCAST_DISABLED");
        return true;
      }
    );
  } finally {
    restoreEnv(snapshot);
  }
});

test("bootstrapVaultWithRuntime rejects execute mode when private key is missing", async () => {
  const snapshot = snapshotEnv(RUNTIME_ENV_KEYS);
  delete process.env[BOOTSTRAP_PRIVATE_KEY_ENV];
  process.env[ENABLE_BROADCAST_ENV] = "1";

  try {
    await assert.rejects(
      async () => {
        await bootstrapVaultWithRuntime({
          chainId: 56,
          asset: "0x2222222222222222222222222222222222222222" as Address,
          name: "Bootstrap Vault",
          symbol: "BOOT",
          salt: (`0x${"22".repeat(32)}` as Hash),
          mode: "execute",
          signerAddress: "0x3333333333333333333333333333333333333333" as Address
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof RuntimeBootstrapError);
        assert.equal(error.code, "BOOTSTRAP_PRIVATE_KEY_NOT_CONFIGURED");
        return true;
      }
    );
  } finally {
    restoreEnv(snapshot);
  }
});
