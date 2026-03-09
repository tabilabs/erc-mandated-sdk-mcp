import assert from "node:assert/strict";
import test from "node:test";

import type { Address, Hex } from "viem";

import { createAgentAccountContext } from "./accountContext.js";
import { buildFundAndActionPlan } from "./fundAndAction.js";
import {
  FundAndActionSessionError,
  applyFundAndActionExecutionEvent,
  createFundAndActionExecutionSession
} from "./fundAndActionSession.js";
import { createFollowUpActionResult } from "./followUpAction.js";

const accountContext = createAgentAccountContext({
  agentId: "predict-bot-session",
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

test("createFundAndActionExecutionSession starts from funding when funding is required", async () => {
  const plan = await buildPlan("100000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;

  assert.equal(session.status, "pendingFunding");
  assert.equal(session.currentStep, "fundTargetAccount");
  assert.equal(session.fundingStep.status, "pending");
  assert.equal(session.followUpStep.status, "pending");
});

test("createFundAndActionExecutionSession starts from follow-up when funding is skipped", async () => {
  const plan = await buildPlan("900000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;

  assert.equal(session.status, "pendingFollowUp");
  assert.equal(session.currentStep, "followUpAction");
  assert.equal(session.fundingStep.status, "skipped");
});

test("applyFundAndActionExecutionEvent advances through funding and follow-up success", async () => {
  const plan = await buildPlan("100000");
  const created = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    sessionId: "session-1",
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;

  const fundingSubmitted = applyFundAndActionExecutionEvent({
    session: created,
    event: {
      type: "fundingSubmitted",
      updatedAt: "2026-03-09T01:01:00.000Z",
      reference: {
        type: "txHash",
        value: "0xabc123"
      }
    }
  }).result.session;

  const fundingConfirmed = applyFundAndActionExecutionEvent({
    session: fundingSubmitted,
    event: {
      type: "fundingConfirmed",
      updatedAt: "2026-03-09T01:02:00.000Z"
    }
  }).result.session;

  const followUpSubmitted = applyFundAndActionExecutionEvent({
    session: fundingConfirmed,
    event: {
      type: "followUpSubmitted",
      updatedAt: "2026-03-09T01:03:00.000Z",
      reference: {
        type: "requestId",
        value: "req-1"
      }
    }
  }).result.session;

  const followUpResult = createFollowUpActionResult({
    followUpActionPlan: plan.followUpActionPlan,
    status: "succeeded",
    updatedAt: "2026-03-09T01:04:00.000Z",
    reference: {
      type: "orderId",
      value: "ord-1"
    }
  }).result.followUpActionResult;

  const completed = applyFundAndActionExecutionEvent({
    session: followUpSubmitted,
    event: {
      type: "followUpResultReceived",
      followUpActionResult: followUpResult
    }
  }).result.session;

  assert.equal(fundingSubmitted.fundingStep.status, "submitted");
  assert.equal(fundingConfirmed.status, "pendingFollowUp");
  assert.equal(followUpSubmitted.followUpStep.status, "submitted");
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.currentStep, "none");
  assert.equal(completed.followUpStep.result?.reference?.value, "ord-1");
});

test("applyFundAndActionExecutionEvent rejects follow-up submission before funding is confirmed", async () => {
  const plan = await buildPlan("100000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;

  assert.throws(
    () => {
      applyFundAndActionExecutionEvent({
        session,
        event: {
          type: "followUpSubmitted",
          updatedAt: "2026-03-09T01:01:00.000Z"
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FundAndActionSessionError);
      assert.equal(error.code, "INVALID_EVENT_TRANSITION");
      return true;
    }
  );
});

test("applyFundAndActionExecutionEvent rejects new events for terminal session", async () => {
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

  const terminal = applyFundAndActionExecutionEvent({
    session,
    event: {
      type: "followUpResultReceived",
      followUpActionResult: followUpResult
    }
  }).result.session;

  assert.throws(
    () => {
      applyFundAndActionExecutionEvent({
        session: terminal,
        event: {
          type: "followUpSubmitted",
          updatedAt: "2026-03-09T01:02:00.000Z"
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FundAndActionSessionError);
      assert.equal(error.code, "TERMINAL_SESSION");
      return true;
    }
  );
});

test("applyFundAndActionExecutionEvent rejects mismatched follow-up result", async () => {
  const plan = await buildPlan("900000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;

  const mismatchedResult = createFollowUpActionResult({
    followUpActionPlan: {
      kind: "custom.notify",
      executionMode: "custom",
      summary: "Run follow-up action: custom.notify."
    },
    status: "succeeded",
    updatedAt: "2026-03-09T01:01:00.000Z"
  }).result.followUpActionResult;

  assert.throws(
    () => {
      applyFundAndActionExecutionEvent({
        session,
        event: {
          type: "followUpResultReceived",
          followUpActionResult: mismatchedResult
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FundAndActionSessionError);
      assert.equal(error.code, "FOLLOW_UP_RESULT_MISMATCH");
      return true;
    }
  );
});

test("applyFundAndActionExecutionEvent rejects malformed resumed session state", async () => {
  const plan = await buildPlan("100000");
  const session = createFundAndActionExecutionSession({
    fundAndActionPlan: plan,
    createdAt: "2026-03-09T01:00:00.000Z"
  }).result.session;

  assert.throws(
    () => {
      applyFundAndActionExecutionEvent({
        session: {
          ...session,
          status: "pendingFollowUp",
          currentStep: "followUpAction",
          fundingStep: {
            ...session.fundingStep,
            status: "pending"
          }
        },
        event: {
          type: "followUpSubmitted",
          updatedAt: "2026-03-09T01:01:00.000Z"
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FundAndActionSessionError);
      assert.equal(error.code, "INVALID_SESSION_STATE");
      return true;
    }
  );
});
