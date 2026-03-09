import assert from "node:assert/strict";
import test from "node:test";

import type { Address, Hex } from "viem";

import { AgentAccountContextError } from "./accountContext.js";
import { AssetTransferPlanError } from "./assetTransfer.js";
import { createAgentAccountContext } from "./accountContext.js";
import { createAgentFundingPolicy } from "./fundingPolicy.js";
import { FundAndActionPlanError, buildFundAndActionPlan } from "./fundAndAction.js";
import { FollowUpActionError, buildFollowUpActionPlan } from "./followUpAction.js";

const validBalanceSnapshot = {
  snapshotAt: "2026-03-09T00:10:00.000Z",
  maxStalenessSeconds: 300,
  observedAtBlock: "123456",
  source: "predict-balance-indexer"
} as const;

test("buildFundAndActionPlan builds funding plan when target balance is insufficient", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-fund",
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

  const fundingPolicy = createAgentFundingPolicy({
    policyId: "predict-topup-policy",
    allowedTokenAddresses: ["0xdddddddddddddddddddddddddddddddddddddddd" as Address],
    allowedRecipients: ["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address],
    maxAmountPerTx: "1000000",
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.fundingPolicy;

  const plan = await buildFundAndActionPlan({
    accountContext,
    fundingPolicy,
    fundingTarget: {
      label: "predict-account",
      recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
      tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
      requiredAmountRaw: "900000",
      currentBalanceRaw: "250000",
      balanceSnapshot: validBalanceSnapshot,
      symbol: "USDT",
      decimals: 6
    },
    fundingContext: {
      nonce: "9",
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
        collateralAmountRaw: "500000",
        orderSide: "buy",
        outcomeId: "up"
      }
    }
  });

  assert.equal(plan.result.fundingRequired, true);
  assert.equal(plan.result.fundingTarget.currentBalanceRaw, "250000");
  assert.deepEqual(plan.result.fundingTarget.balanceSnapshot, validBalanceSnapshot);
  assert.equal(plan.result.fundingTarget.fundingShortfallRaw, "650000");
  assert.equal(plan.result.evaluatedAt, "2026-03-09T00:12:00.000Z");
  assert.equal(plan.result.fundingPlan?.accountContext.agentId, "predict-bot-fund");
  assert.equal(plan.result.fundingPlan?.humanReadableSummary.symbol, "USDT");
  assert.equal(plan.result.fundingPlan?.humanReadableSummary.amountRaw, "650000");
  assert.equal(plan.result.followUpActionPlan.executionMode, "offchain-api");
  assert.equal(plan.result.followUpActionPlan.assetRequirement?.amountRaw, "500000");
  assert.equal(plan.result.steps[0]?.kind, "fundTargetAccount");
  assert.equal(plan.result.steps[0]?.status, "required");
  assert.equal(plan.result.steps[1]?.kind, "followUpAction");
  assert.equal(plan.result.steps[1]?.status, "pending");
});

test("buildFundAndActionPlan skips funding plan when target already has sufficient balance", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-funded",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    defaults: {
      allowedAdaptersRoot: ("0x" + "22".repeat(32)) as Hex,
      maxDrawdownBps: "1000",
      maxCumulativeDrawdownBps: "2500",
      payloadBinding: "actionsDigest",
      extensions: "0x"
    },
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  const plan = await buildFundAndActionPlan({
    accountContext,
    fundingTarget: {
      label: "predict-account",
      recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
      tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
      requiredAmountRaw: "900000",
      currentBalanceRaw: "900000",
      balanceSnapshot: validBalanceSnapshot
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
      kind: "custom.notify"
    }
  });

  assert.equal(plan.result.fundingRequired, false);
  assert.equal(plan.result.fundingTarget.fundingShortfallRaw, "0");
  assert.equal(plan.result.evaluatedAt, "2026-03-09T00:12:00.000Z");
  assert.equal(plan.result.fundingPlan, undefined);
  assert.equal(plan.result.followUpActionPlan.executionMode, "custom");
  assert.equal(plan.result.steps[0]?.status, "skipped");
  assert.equal(plan.result.steps[1]?.status, "pending");
});

test("buildFollowUpActionPlan creates typed predict order plan", () => {
  const plan = buildFollowUpActionPlan({
    kind: "predict.createOrder",
    target: "predict-order-engine",
    payload: {
      marketId: "btc-1h-up",
      collateralTokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
      collateralAmountRaw: "500000",
      orderSide: "buy",
      outcomeId: "up",
      clientOrderId: "ord-1"
    }
  });

  assert.equal(plan.executionMode, "offchain-api");
  assert.equal(plan.assetRequirement?.tokenAddress, "0xdddddddddddddddddddddddddddddddddddddddd");
  assert.equal(plan.assetRequirement?.amountRaw, "500000");
  assert.equal(plan.summary.includes("btc-1h-up"), true);
});

test("buildFundAndActionPlan requires explicit currentBalanceRaw", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-balance",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    defaults: {
      allowedAdaptersRoot: ("0x" + "11".repeat(32)) as Hex,
      maxDrawdownBps: "1000",
      maxCumulativeDrawdownBps: "2500"
    },
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  await assert.rejects(
    async () => {
      await buildFundAndActionPlan({
        accountContext,
        fundingTarget: {
          label: "predict-account",
          recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
          tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          requiredAmountRaw: "900000",
          balanceSnapshot: validBalanceSnapshot
        } as any,
        fundingContext: {
          nonce: "10",
          deadline: "999999",
          authorityEpoch: "3"
        },
        followUpAction: {
          kind: "custom.notify"
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FundAndActionPlanError);
      assert.equal(error.code, "MISSING_CURRENT_BALANCE");
      return true;
    }
  );
});

test("buildFundAndActionPlan still validates accountContext when funding is skipped", async () => {
  await assert.rejects(
    async () => {
      await buildFundAndActionPlan({
        accountContext: {
          agentId: "predict-bot-invalid-vault",
          chainId: 97,
          vault: "0xbad" as Address,
          authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
          executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
          createdAt: "2026-03-09T00:00:00.000Z",
          updatedAt: "2026-03-09T00:00:00.000Z"
        },
        fundingTarget: {
          label: "predict-account",
          recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
          tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          requiredAmountRaw: "900000",
          currentBalanceRaw: "900000",
          balanceSnapshot: validBalanceSnapshot
        },
        fundingContext: {
          nonce: "10",
          deadline: "999999",
          authorityEpoch: "3"
        },
        followUpAction: {
          kind: "predict.createOrder"
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof AgentAccountContextError);
      assert.equal(error.code, "INVALID_VAULT_ADDRESS");
      return true;
    }
  );
});

test("buildFundAndActionPlan still validates decimals when funding is skipped", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-invalid-decimals",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  await assert.rejects(
    async () => {
      await buildFundAndActionPlan({
        accountContext,
        fundingTarget: {
          label: "predict-account",
          recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
          tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          requiredAmountRaw: "900000",
          currentBalanceRaw: "900000",
          balanceSnapshot: validBalanceSnapshot,
          decimals: -1
        },
        fundingContext: {
          nonce: "10",
          deadline: "999999",
          authorityEpoch: "3"
        },
        followUpAction: {
          kind: "predict.createOrder"
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof AssetTransferPlanError);
      assert.equal(error.code, "INVALID_DECIMALS");
      return true;
    }
  );
});

test("buildFundAndActionPlan rejects follow-up asset mismatch", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-asset-mismatch",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  await assert.rejects(
    async () => {
      await buildFundAndActionPlan({
        accountContext,
        fundingTarget: {
          label: "predict-account",
          recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
          tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          requiredAmountRaw: "900000",
          currentBalanceRaw: "100000",
          balanceSnapshot: validBalanceSnapshot
        },
        fundingContext: {
          nonce: "10",
          deadline: "999999",
          authorityEpoch: "3"
        },
        followUpAction: {
          kind: "predict.createOrder",
          target: "predict-order-engine",
          payload: {
            marketId: "btc-1h-up",
            collateralTokenAddress: "0xffffffffffffffffffffffffffffffffffffffff" as Address,
            collateralAmountRaw: "500000"
          }
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FollowUpActionError);
      assert.equal(error.code, "FOLLOW_UP_ASSET_MISMATCH");
      return true;
    }
  );
});

test("buildFundAndActionPlan rejects required balance lower than follow-up collateral amount", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-balance-too-low",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  await assert.rejects(
    async () => {
      await buildFundAndActionPlan({
        accountContext,
        fundingTarget: {
          label: "predict-account",
          recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
          tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          requiredAmountRaw: "400000",
          currentBalanceRaw: "0",
          balanceSnapshot: validBalanceSnapshot
        },
        fundingContext: {
          nonce: "10",
          deadline: "999999",
          authorityEpoch: "3"
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
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FollowUpActionError);
      assert.equal(error.code, "FOLLOW_UP_REQUIRED_BALANCE_TOO_LOW");
      return true;
    }
  );
});

test("buildFundAndActionPlan requires explicit balanceSnapshot", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-snapshot",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  await assert.rejects(
    async () => {
      await buildFundAndActionPlan({
        accountContext,
        fundingTarget: {
          label: "predict-account",
          recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
          tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          requiredAmountRaw: "900000",
          currentBalanceRaw: "100000"
        } as any,
        fundingContext: {
          nonce: "10",
          deadline: "999999",
          authorityEpoch: "3"
        },
        followUpAction: {
          kind: "custom.notify"
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FundAndActionPlanError);
      assert.equal(error.code, "MISSING_BALANCE_SNAPSHOT");
      return true;
    }
  );
});

test("buildFundAndActionPlan rejects stale balance snapshot", async () => {
  const accountContext = createAgentAccountContext({
    agentId: "predict-bot-stale-balance",
    chainId: 97,
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    authority: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    executor: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    createdAt: "2026-03-09T00:00:00.000Z",
    updatedAt: "2026-03-09T00:00:00.000Z"
  }).result.accountContext;

  await assert.rejects(
    async () => {
      await buildFundAndActionPlan({
        accountContext,
        fundingTarget: {
          label: "predict-account",
          recipient: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
          tokenAddress: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          requiredAmountRaw: "900000",
          currentBalanceRaw: "100000",
          balanceSnapshot: {
            snapshotAt: "2026-03-09T00:00:00.000Z",
            maxStalenessSeconds: 60
          }
        },
        fundingContext: {
          nonce: "10",
          deadline: "999999",
          authorityEpoch: "3",
          policyEvaluation: {
            now: "2026-03-09T00:05:00.000Z"
          }
        },
        followUpAction: {
          kind: "custom.notify"
        }
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof FundAndActionPlanError);
      assert.equal(error.code, "STALE_BALANCE_SNAPSHOT");
      return true;
    }
  );
});
