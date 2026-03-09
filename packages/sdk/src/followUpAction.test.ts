import assert from "node:assert/strict";
import test from "node:test";

import type { Address } from "viem";

import {
  FollowUpActionError,
  buildFollowUpActionPlan,
  createFollowUpActionResult
} from "./followUpAction.js";

test("createFollowUpActionResult builds succeeded result for predict order plan", () => {
  const followUpActionPlan = buildFollowUpActionPlan({
    kind: "predict.createOrder",
    target: "predict-order-engine",
    payload: {
      marketId: "btc-1h-up",
      collateralTokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
      collateralAmountRaw: "500000",
      orderSide: "buy"
    }
  });

  const result = createFollowUpActionResult({
    followUpActionPlan,
    status: "succeeded",
    updatedAt: "2026-03-09T01:00:00.000Z",
    startedAt: "2026-03-09T00:59:00.000Z",
    reference: {
      type: "orderId",
      value: "pred-ord-1"
    },
    output: {
      accepted: true
    }
  });

  assert.equal(result.result.followUpActionResult.status, "succeeded");
  assert.equal(result.result.followUpActionResult.completedAt, "2026-03-09T01:00:00.000Z");
  assert.equal(result.result.followUpActionResult.reference?.value, "pred-ord-1");
  assert.equal(result.result.followUpActionResult.plan.executionMode, "offchain-api");
  assert.equal(result.result.followUpActionResult.summary.startsWith("Succeeded:"), true);
});

test("createFollowUpActionResult rejects failed result without error", () => {
  const followUpActionPlan = buildFollowUpActionPlan({
    kind: "custom.notify"
  });

  assert.throws(
    () => {
      createFollowUpActionResult({
        followUpActionPlan,
        status: "failed",
        updatedAt: "2026-03-09T01:00:00.000Z"
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FollowUpActionError);
      assert.equal(error.code, "FAILED_RESULT_REQUIRES_ERROR");
      return true;
    }
  );
});

test("createFollowUpActionResult rejects non-failed result with error", () => {
  const followUpActionPlan = buildFollowUpActionPlan({
    kind: "custom.notify"
  });

  assert.throws(
    () => {
      createFollowUpActionResult({
        followUpActionPlan,
        status: "submitted",
        updatedAt: "2026-03-09T01:00:00.000Z",
        error: {
          code: "UNEXPECTED",
          message: "should not be here"
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FollowUpActionError);
      assert.equal(error.code, "NON_FAILED_RESULT_CANNOT_INCLUDE_ERROR");
      return true;
    }
  );
});

test("createFollowUpActionResult rejects completedAt for non-terminal status", () => {
  const followUpActionPlan = buildFollowUpActionPlan({
    kind: "custom.notify"
  });

  assert.throws(
    () => {
      createFollowUpActionResult({
        followUpActionPlan,
        status: "pending",
        updatedAt: "2026-03-09T01:00:00.000Z",
        completedAt: "2026-03-09T01:00:00.000Z"
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FollowUpActionError);
      assert.equal(error.code, "INCOMPLETE_RESULT_CANNOT_INCLUDE_COMPLETED_AT");
      return true;
    }
  );
});

test("createFollowUpActionResult rejects invalid reference value", () => {
  const followUpActionPlan = buildFollowUpActionPlan({
    kind: "custom.notify"
  });

  assert.throws(
    () => {
      createFollowUpActionResult({
        followUpActionPlan,
        status: "submitted",
        updatedAt: "2026-03-09T01:00:00.000Z",
        reference: {
          type: "requestId",
          value: ""
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FollowUpActionError);
      assert.equal(error.code, "INVALID_RESULT_REFERENCE");
      return true;
    }
  );
});
