import assert from "node:assert/strict";
import test from "node:test";

import type { Address, Hex } from "viem";

import {
  AgentAccountContextError,
  buildAssetTransferPlanFromAccountContext,
  createAgentAccountContext
} from "./accountContext.js";
import { FundingPolicyViolationError, createAgentFundingPolicy } from "./fundingPolicy.js";

test("createAgentAccountContext normalizes core agent account fields", () => {
  const output = createAgentAccountContext({
    agentId: "predict-bot-1",
    chainId: 11155111,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    assetRegistryRef: "memory://assets/sepolia",
    fundingPolicyRef: "memory://policy/predict-bot-1",
    defaults: {
      allowedAdaptersRoot: ("0x" + "11".repeat(32)) as Hex,
      maxDrawdownBps: "2500",
      maxCumulativeDrawdownBps: "5000",
      payloadBinding: "actionsDigest",
      extensions: "0x"
    },
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  });

  assert.equal(output.result.accountContext.agentId, "predict-bot-1");
  assert.equal(output.result.accountContext.chainId, 11155111);
  assert.equal(output.result.accountContext.assetRegistryRef, "memory://assets/sepolia");
  assert.equal(output.result.accountContext.fundingPolicyRef, "memory://policy/predict-bot-1");
  assert.equal(output.result.accountContext.defaults?.maxDrawdownBps, "2500");
});

test("createAgentAccountContext rejects empty agentId", () => {
  assert.throws(
    () =>
      createAgentAccountContext({
        agentId: "",
        vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
        authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address
      }),
    (error: unknown) => {
      assert.ok(error instanceof AgentAccountContextError);
      assert.equal(error.code, "INVALID_AGENT_ID");
      return true;
    }
  );
});

test("buildAssetTransferPlanFromAccountContext uses context defaults for mandate parameters", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-2",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    defaults: {
      allowedAdaptersRoot: ("0x" + "22".repeat(32)) as Hex,
      maxDrawdownBps: "1000",
      maxCumulativeDrawdownBps: "3000",
      payloadBinding: "actionsDigest",
      extensions: "0x"
    },
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  const plan = await buildAssetTransferPlanFromAccountContext({
    accountContext,
    tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
    to: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
    amountRaw: "777",
    nonce: "9",
    deadline: "999999",
    authorityEpoch: "3",
    symbol: "USDC",
    decimals: 6
  });

  assert.equal(plan.result.accountContext.agentId, "predict-bot-2");
  assert.equal(plan.result.signRequest.mandate.vault, accountContext.vault);
  assert.equal(plan.result.signRequest.mandate.executor, accountContext.executor);
  assert.equal(plan.result.signRequest.mandate.allowedAdaptersRoot, "0x" + "22".repeat(32));
  assert.equal(plan.result.signRequest.mandate.maxDrawdownBps, "1000");
  assert.equal(plan.result.signRequest.mandate.maxCumulativeDrawdownBps, "3000");
  assert.equal(plan.result.humanReadableSummary.symbol, "USDC");
});

test("buildAssetTransferPlanFromAccountContext rejects missing required defaults", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-3",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  await assert.rejects(
    async () => {
      await buildAssetTransferPlanFromAccountContext({
        accountContext,
        tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
        to: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
        amountRaw: "777",
        nonce: "9",
        deadline: "999999",
        authorityEpoch: "3"
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof AgentAccountContextError);
      assert.equal(error.code, "MISSING_CONTEXT_DEFAULT");
      assert.equal(error.field, "allowedAdaptersRoot");
      return true;
    }
  );
});

test("buildAssetTransferPlanFromAccountContext rejects transfer that violates funding policy", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-4",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    defaults: {
      allowedAdaptersRoot: ("0x" + "22".repeat(32)) as Hex,
      maxDrawdownBps: "1000",
      maxCumulativeDrawdownBps: "3000",
      payloadBinding: "actionsDigest",
      extensions: "0x"
    },
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  const fundingPolicy = createAgentFundingPolicy({
    policyId: "predict-funding",
    allowedRecipients: ["0xdddddddddddddddddddddddddddddddddddddddd" as Address],
    maxAmountPerTx: "100"
  }).result.fundingPolicy;

  await assert.rejects(
    async () => {
      await buildAssetTransferPlanFromAccountContext({
        accountContext,
        fundingPolicy,
        tokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
        to: "0xffffffffffffffffffffffffffffffffffffffff" as Address,
        amountRaw: "777",
        nonce: "9",
        deadline: "999999",
        authorityEpoch: "3"
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FundingPolicyViolationError);
      assert.equal(error.code, "FUNDING_POLICY_VIOLATION");
      return true;
    }
  );
});
