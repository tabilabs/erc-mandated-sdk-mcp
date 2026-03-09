import assert from "node:assert/strict";
import test from "node:test";

import type { Address } from "viem";

import {
  checkAssetTransferAgainstFundingPolicy,
  createAgentFundingPolicy,
  FundingPolicyError
} from "./fundingPolicy.js";

test("createAgentFundingPolicy normalizes policy fields", () => {
  const output = createAgentFundingPolicy({
    policyId: "predict-funding",
    allowedTokenAddresses: ["0x1111111111111111111111111111111111111111" as Address],
    allowedRecipients: ["0x2222222222222222222222222222222222222222" as Address],
    maxAmountPerTx: "1000",
    maxAmountPerWindow: "5000",
    windowSeconds: 86400,
    expiresAt: "2026-12-31T00:00:00.000Z",
    repeatable: true,
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  });

  assert.equal(output.result.fundingPolicy.policyId, "predict-funding");
  assert.equal(output.result.fundingPolicy.windowSeconds, 86400);
  assert.equal(output.result.fundingPolicy.maxAmountPerWindow, "5000");
});

test("createAgentFundingPolicy rejects invalid token list", () => {
  assert.throws(
    () =>
      createAgentFundingPolicy({
        policyId: "predict-funding",
        allowedTokenAddresses: ["0x123" as Address]
      }),
    (error: unknown) => {
      assert.ok(error instanceof FundingPolicyError);
      assert.equal(error.code, "INVALID_TOKEN_ADDRESS");
      return true;
    }
  );
});

test("checkAssetTransferAgainstFundingPolicy allows compliant transfer", () => {
  const fundingPolicy = createAgentFundingPolicy({
    policyId: "predict-funding",
    allowedTokenAddresses: ["0x1111111111111111111111111111111111111111" as Address],
    allowedRecipients: ["0x2222222222222222222222222222222222222222" as Address],
    maxAmountPerTx: "1000",
    maxAmountPerWindow: "5000",
    expiresAt: "2026-12-31T00:00:00.000Z"
  }).result.fundingPolicy;

  const check = checkAssetTransferAgainstFundingPolicy({
    fundingPolicy,
    tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
    to: "0x2222222222222222222222222222222222222222" as Address,
    amountRaw: "900",
    currentSpentInWindow: "100",
    now: "2026-03-09T00:00:00.000Z"
  });

  assert.equal(check.result.allowed, true);
  assert.deepEqual(check.result.violations, []);
});

test("checkAssetTransferAgainstFundingPolicy reports violations for recipient, amount, and expiry", () => {
  const fundingPolicy = createAgentFundingPolicy({
    policyId: "predict-funding",
    allowedTokenAddresses: ["0x1111111111111111111111111111111111111111" as Address],
    allowedRecipients: ["0x2222222222222222222222222222222222222222" as Address],
    maxAmountPerTx: "1000",
    maxAmountPerWindow: "1500",
    expiresAt: "2026-01-01T00:00:00.000Z"
  }).result.fundingPolicy;

  const check = checkAssetTransferAgainstFundingPolicy({
    fundingPolicy,
    tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
    to: "0x3333333333333333333333333333333333333333" as Address,
    amountRaw: "1200",
    currentSpentInWindow: "400",
    now: "2026-03-09T00:00:00.000Z"
  });

  assert.equal(check.result.allowed, false);
  assert.deepEqual(
    check.result.violations.map((violation) => violation.code).sort(),
    ["AMOUNT_EXCEEDS_PER_TX", "AMOUNT_EXCEEDS_WINDOW", "POLICY_EXPIRED", "RECIPIENT_NOT_ALLOWED"].sort()
  );
});
