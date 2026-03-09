import assert from "node:assert/strict";
import test from "node:test";

import type { Address, Hex } from "viem";

import { createAgentAccountContext } from "./accountContext.js";
import { createAssetTransferResult } from "./assetTransferResult.js";
import {
  executeFundAndActionExecutionTask,
  FundAndActionDriverError,
  resolveFundAndActionExecutionTask
} from "./fundAndActionDriver.js";
import { buildFundAndActionPlan } from "./fundAndAction.js";
import {
  applyFundAndActionExecutionEvent,
  createFundAndActionExecutionSession
} from "./fundAndActionSession.js";
import { createFollowUpActionResult } from "./followUpAction.js";

const accountContext = createAgentAccountContext({
  agentId: "predict-bot-driver",
  chainId: 97,
  vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
  authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
  executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
  defaults: {
    allowedAdaptersRoot: ("0x" + "11".repeat(32)) as Hex,
    maxDrawdownBps: "1000",
    maxCumulativeDrawdownBps: "2500",
    payloadBinding: "actionsDigest",
    extensions: "0x"
  },
  createdAt: "2026-03-09T00:00:00.000Z",
  updatedAt: "2026-03-09T00:00:00.000Z"
}).result.accountContext;

async function buildPlan(currentBalanceRaw: string) {
  return (
    await buildFundAndActionPlan({
      accountContext,
      fundingTarget: {
        label: "predict-account",
        recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
        tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
        requiredAmountRaw: "900000",
        currentBalanceRaw,
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:10:00.000Z",
          maxStalenessSeconds: 300
        }
      },
      fundingContext: {
        nonce: "10",
        deadline: "999999",
        authorityEpoch: "3",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        }
      },
      followUpAction: {
        kind: "predict.createOrder",
        target: "predict-order-engine",
        payload: {
          marketId: "btc-1h-up",
          collateralTokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          collateralAmountRaw: "500000"
        }
      }
    })
  ).result;
}

async function createFundingSubmittedSession() {
  const plan = await buildPlan("100000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;

  const fundingSubmittedResult = createAssetTransferResult({
    assetTransferPlan: plan.fundingPlan!,
    status: "submitted",
    updatedAt: "2026-03-09T01:01:00.000Z",
    submittedAt: "2026-03-09T01:01:00.000Z",
    chainId: 97,
    txHash: ("0x" + "ab".repeat(32)) as Hex
  }).result.assetTransferResult;

  return {
    plan,
    fundingSubmittedResult,
    session: applyFundAndActionExecutionEvent({
      session,
      event: {
        type: "fundingSubmitted",
        assetTransferResult: fundingSubmittedResult
      }
    }).result.session
  };
}

async function createPendingFollowUpSession() {
  const plan = await buildPlan("100000");
  const created = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;

  const fundingConfirmedResult = createAssetTransferResult({
    assetTransferPlan: plan.fundingPlan!,
    status: "confirmed",
    updatedAt: "2026-03-09T01:02:00.000Z",
    submittedAt: "2026-03-09T01:01:00.000Z",
    chainId: 97,
    txHash: ("0x" + "ab".repeat(32)) as Hex,
    receipt: {
      blockNumber: "123456",
      blockHash: ("0x" + "cd".repeat(32)) as Hex,
      confirmations: 2
    }
  }).result.assetTransferResult;

  return {
    plan,
    fundingConfirmedResult,
    session: applyFundAndActionExecutionEvent({
      session: created,
      event: {
        type: "fundingConfirmed",
        assetTransferResult: fundingConfirmedResult
      }
    }).result.session
  };
}

test("resolveFundAndActionExecutionTask resolves submitFunding for fresh pending funding session", async () => {
  const plan = await buildPlan("100000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;

  const resolved = resolveFundAndActionExecutionTask({ session }).result;

  assert.equal(resolved.task.kind, "submitFunding");
  assert.equal(resolved.task.fundingPlan.humanReadableSummary.amountRaw, "800000");
});

test("resolveFundAndActionExecutionTask resolves pollFundingResult for submitted funding session", async () => {
  const { session } = await createFundingSubmittedSession();

  const resolved = resolveFundAndActionExecutionTask({ session }).result;

  assert.equal(resolved.task.kind, "pollFundingResult");
  assert.equal(resolved.task.assetTransferResult.status, "submitted");
});

test("resolveFundAndActionExecutionTask resolves submitFollowUp after funding completes", async () => {
  const { session } = await createPendingFollowUpSession();

  const resolved = resolveFundAndActionExecutionTask({ session }).result;

  assert.equal(resolved.task.kind, "submitFollowUp");
  assert.equal(resolved.task.followUpActionPlan.kind, "predict.createOrder");
});

test("resolveFundAndActionExecutionTask resolves pollFollowUpResult for submitted follow-up session", async () => {
  const { session } = await createPendingFollowUpSession();
  const followUpSubmitted = applyFundAndActionExecutionEvent({
    session,
    event: {
      type: "followUpSubmitted",
      updatedAt: "2026-03-09T01:03:00.000Z",
      reference: {
        type: "requestId",
        value: "req-1"
      }
    }
  }).result.session;

  const resolved = resolveFundAndActionExecutionTask({
    session: followUpSubmitted
  }).result;

  assert.equal(resolved.task.kind, "pollFollowUpResult");
  assert.equal(resolved.task.reference?.value, "req-1");
});

test("resolveFundAndActionExecutionTask resolves completed for terminal session", async () => {
  const plan = await buildPlan("900000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;
  const followUpResult = createFollowUpActionResult({
    followUpActionPlan: plan.followUpActionPlan,
    status: "succeeded",
    updatedAt: "2026-03-09T01:01:00.000Z"
  }).result.followUpActionResult;
  const completed = applyFundAndActionExecutionEvent({
    session,
    event: {
      type: "followUpResultReceived",
      followUpActionResult: followUpResult
    }
  }).result.session;

  const resolved = resolveFundAndActionExecutionTask({
    session: completed
  }).result;

  assert.equal(resolved.task.kind, "completed");
  assert.equal(resolved.task.status, "succeeded");
  assert.equal(resolved.task.result?.status, "succeeded");
});

test("resolveFundAndActionExecutionTask keeps funding failure context on completed task", async () => {
  const plan = await buildPlan("100000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;
  const failedResult = createAssetTransferResult({
    assetTransferPlan: plan.fundingPlan!,
    status: "failed",
    updatedAt: "2026-03-09T01:01:00.000Z",
    submittedAt: "2026-03-09T01:00:30.000Z",
    completedAt: "2026-03-09T01:01:00.000Z",
    chainId: 97,
    txHash: ("0x" + "fa".repeat(32)) as Hex,
    error: {
      code: "TRANSFER_REVERTED",
      message: "funding reverted"
    }
  }).result.assetTransferResult;
  const failed = applyFundAndActionExecutionEvent({
    session,
    event: {
      type: "fundingFailed",
      assetTransferResult: failedResult
    }
  }).result.session;

  const resolved = resolveFundAndActionExecutionTask({
    session: failed
  }).result;

  assert.equal(resolved.task.kind, "completed");
  assert.equal(resolved.task.status, "failed");
  assert.equal(resolved.task.summary, failed.fundingStep.summary);
  assert.equal(resolved.task.assetTransferResult?.status, "failed");
  assert.equal(resolved.task.result, undefined);
});

test("executeFundAndActionExecutionTask applies adapter event for submitFunding", async () => {
  const plan = await buildPlan("100000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;
  const submittedResult = createAssetTransferResult({
    assetTransferPlan: plan.fundingPlan!,
    status: "submitted",
    updatedAt: "2026-03-09T01:01:00.000Z",
    submittedAt: "2026-03-09T01:01:00.000Z",
    chainId: 97,
    txHash: ("0x" + "ef".repeat(32)) as Hex
  }).result.assetTransferResult;

  const executed = await executeFundAndActionExecutionTask({
    session,
    adapters: {
      funding: {
        submitFunding: async () => ({
          type: "fundingSubmitted",
          assetTransferResult: submittedResult
        }),
        pollFundingResult: async () => undefined
      }
    }
  });

  assert.equal(executed.result.task.kind, "submitFunding");
  assert.equal(executed.result.event?.type, "fundingSubmitted");
  assert.equal(executed.result.session.fundingStep.status, "submitted");
  assert.equal(executed.result.session.fundingStep.result?.txHash, ("0x" + "ef".repeat(32)) as Hex);
});

test("executeFundAndActionExecutionTask allows poll task to keep session unchanged when no new event exists", async () => {
  const { session } = await createFundingSubmittedSession();

  const executed = await executeFundAndActionExecutionTask({
    session,
    adapters: {
      funding: {
        submitFunding: async () => {
          throw new Error("submitFunding should not be called");
        },
        pollFundingResult: async () => undefined
      }
    }
  });

  assert.equal(executed.result.task.kind, "pollFundingResult");
  assert.equal(executed.result.event, undefined);
  assert.deepEqual(executed.result.session, session);
});

test("executeFundAndActionExecutionTask rejects adapter events that do not match resolved task", async () => {
  const plan = await buildPlan("100000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;
  const followUpResult = createFollowUpActionResult({
    followUpActionPlan: plan.followUpActionPlan,
    status: "succeeded",
    updatedAt: "2026-03-09T01:05:00.000Z"
  }).result.followUpActionResult;

  await assert.rejects(
    async () => {
      await executeFundAndActionExecutionTask({
        session,
        adapters: {
          funding: {
            submitFunding: async () => ({
              type: "followUpResultReceived",
              followUpActionResult: followUpResult
            }),
            pollFundingResult: async () => undefined
          }
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FundAndActionDriverError);
      assert.equal(error.code, "INVALID_TASK_EVENT");
      return true;
    }
  );
});
