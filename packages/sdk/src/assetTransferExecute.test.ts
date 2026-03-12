import assert from "node:assert/strict";
import test from "node:test";

import type { Address, Hash, Hex } from "viem";

import { createAgentAccountContext } from "./accountContext.js";
import {
  AssetTransferExecuteError,
  executeAssetTransfer,
  executeAssetTransferFromAccountContext,
  type AssetTransferExecutionAdapter
} from "./assetTransferExecute.js";
import { createAgentFundingPolicy } from "./fundingPolicy.js";

function buildExecutionAdapter(result: {
  txHash?: Hash;
  receiptStatus: "success" | "reverted" | "timeout";
  blockNumber?: bigint;
  blockHash?: Hex;
  receipt?: unknown;
}): AssetTransferExecutionAdapter {
  return {
    async sendTransaction() {
      return result.txHash ?? ("0x" + "ab".repeat(32)) as Hash;
    },
    async waitForTransactionReceipt() {
      return {
        status: result.receiptStatus,
        ...(result.blockNumber !== undefined ? { blockNumber: result.blockNumber } : {}),
        ...(result.blockHash ? { blockHash: result.blockHash } : {}),
        ...(result.receipt !== undefined ? { receipt: result.receipt } : {})
      };
    }
  };
}

function buildExecuteInput() {
  return {
    chainId: 11155111,
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
    decimals: 6,
    executeContext: {
      signature: "0x1234" as Hex,
      adapterProofs: [[("0x" + "22".repeat(32)) as Hex]]
    }
  };
}

test("executeAssetTransfer returns confirmed assetTransferResult on successful receipt", async () => {
  const output = await executeAssetTransfer(buildExecuteInput(), {
    execution: buildExecutionAdapter({
      receiptStatus: "success",
      blockNumber: 123n,
      blockHash: ("0x" + "34".repeat(32)) as Hex,
      receipt: {
        blockHash: ("0x" + "34".repeat(32)) as Hex
      }
    })
  });

  assert.equal(output.result.txRequest.to, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(output.result.receiptStatus, "success");
  assert.equal(output.result.assetTransferResult.status, "confirmed");
  assert.equal(output.result.assetTransferResult.txHash?.length, 66);
  assert.equal(output.result.assetTransferResult.receipt?.blockNumber, "123");
  assert.equal(output.result.assetTransferResult.receipt?.confirmations, undefined);
});

test("executeAssetTransfer returns submitted result when receipt wait times out", async () => {
  const output = await executeAssetTransfer(buildExecuteInput(), {
    execution: buildExecutionAdapter({
      receiptStatus: "timeout"
    })
  });

  assert.equal(output.result.receiptStatus, "timeout");
  assert.equal(output.result.assetTransferResult.status, "submitted");
  assert.equal(output.result.assetTransferResult.txHash?.length, 66);
  assert.equal(output.result.assetTransferResult.completedAt, undefined);
});

test("executeAssetTransfer returns failed result when receipt is reverted", async () => {
  const output = await executeAssetTransfer(buildExecuteInput(), {
    execution: buildExecutionAdapter({
      receiptStatus: "reverted",
      blockNumber: 456n,
      receipt: {
        blockHash: ("0x" + "56".repeat(32)) as Hex
      }
    })
  });

  assert.equal(output.result.receiptStatus, "reverted");
  assert.equal(output.result.assetTransferResult.status, "failed");
  assert.equal(output.result.assetTransferResult.receipt?.blockNumber, "456");
  assert.equal(output.result.assetTransferResult.error?.code, "TRANSACTION_REVERTED");
});

test("executeAssetTransfer requires execution adapter", async () => {
  await assert.rejects(
    async () => {
      await executeAssetTransfer(buildExecuteInput());
    },
    (error: unknown) => {
      assert.ok(error instanceof AssetTransferExecuteError);
      assert.equal(error.code, "EXECUTION_ADAPTER_REQUIRED");
      return true;
    }
  );
});

test("executeAssetTransferFromAccountContext composes context defaults and returns confirmed result", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-exec",
    chainId: 56,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    defaults: {
      allowedAdaptersRoot: ("0x" + "44".repeat(32)) as Hex,
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000",
      payloadBinding: "actionsDigest",
      extensions: "0x"
    }
  }).result.accountContext;
  const fundingPolicy = createAgentFundingPolicy({
    policyId: "predict-bot-policy",
    allowedTokenAddresses: ["0xdddddddddddddddddddddddddddddddddddddddd" as Address],
    allowedRecipients: ["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address]
  }).result.fundingPolicy;

  const output = await executeAssetTransferFromAccountContext(
    {
      accountContext,
      fundingPolicy,
      tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
      to: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
      amountRaw: "42",
      nonce: "9",
      deadline: "999999",
      authorityEpoch: "3",
      executeContext: {
        signature: "0x1234" as Hex,
        adapterProofs: [[("0x" + "22".repeat(32)) as Hex]]
      }
    },
    {
      execution: buildExecutionAdapter({
        receiptStatus: "success",
        blockNumber: 789n
      })
    }
  );

  assert.equal(output.result.accountContext.agentId, "predict-bot-exec");
  assert.equal(output.result.policyCheck?.allowed, true);
  assert.equal(output.result.receiptStatus, "success");
  assert.equal(output.result.assetTransferResult.status, "confirmed");
  assert.equal(output.result.txRequest.from, "0xcccccccccccccccccccccccccccccccccccccccc");
});
