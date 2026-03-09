import assert from "node:assert/strict";
import test from "node:test";

import type { Address, Hex } from "viem";

import { buildAssetTransferPlan } from "./assetTransfer.js";
import { createAssetTransferResult, AssetTransferResultError } from "./assetTransferResult.js";

async function buildPlan() {
  return (
    await buildAssetTransferPlan({
      chainId: 97,
      vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
      executor: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
      tokenAddress: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
      to: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
      amountRaw: "5000000",
      nonce: "7",
      deadline: "999999",
      authorityEpoch: "3",
      allowedAdaptersRoot: ("0x" + "11".repeat(32)) as Hex,
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000",
      symbol: "USDT",
      decimals: 6
    })
  ).result;
}

test("createAssetTransferResult builds confirmed result with receipt metadata", async () => {
  const plan = await buildPlan();

  const result = createAssetTransferResult({
    assetTransferPlan: plan,
    status: "confirmed",
    updatedAt: "2026-03-09T02:00:00.000Z",
    submittedAt: "2026-03-09T01:59:00.000Z",
    chainId: 97,
    txHash: ("0x" + "12".repeat(32)) as Hex,
    receipt: {
      blockNumber: "123456",
      blockHash: ("0x" + "34".repeat(32)) as Hex,
      confirmations: 3
    }
  });

  assert.equal(result.result.assetTransferResult.status, "confirmed");
  assert.equal(result.result.assetTransferResult.completedAt, "2026-03-09T02:00:00.000Z");
  assert.equal(result.result.assetTransferResult.receipt?.blockNumber, "123456");
  assert.equal(result.result.assetTransferResult.txHash, ("0x" + "12".repeat(32)) as Hex);
  assert.ok(result.result.assetTransferResult.summary.startsWith("Confirmed:"));
});

test("createAssetTransferResult rejects submitted result without txHash", async () => {
  const plan = await buildPlan();

  assert.throws(
    () => {
      createAssetTransferResult({
        assetTransferPlan: plan,
        status: "submitted",
        updatedAt: "2026-03-09T02:00:00.000Z"
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof AssetTransferResultError);
      assert.equal(error.code, "SUBMITTED_RESULT_REQUIRES_TX_HASH");
      return true;
    }
  );
});

test("createAssetTransferResult rejects failed result without error", async () => {
  const plan = await buildPlan();

  assert.throws(
    () => {
      createAssetTransferResult({
        assetTransferPlan: plan,
        status: "failed",
        updatedAt: "2026-03-09T02:00:00.000Z",
        txHash: ("0x" + "12".repeat(32)) as Hex
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof AssetTransferResultError);
      assert.equal(error.code, "FAILED_RESULT_REQUIRES_ERROR");
      return true;
    }
  );
});

test("createAssetTransferResult rejects pending result with completedAt", async () => {
  const plan = await buildPlan();

  assert.throws(
    () => {
      createAssetTransferResult({
        assetTransferPlan: plan,
        status: "pending",
        updatedAt: "2026-03-09T02:00:00.000Z",
        completedAt: "2026-03-09T02:00:00.000Z"
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof AssetTransferResultError);
      assert.equal(error.code, "INCOMPLETE_RESULT_CANNOT_INCLUDE_COMPLETED_AT");
      return true;
    }
  );
});
