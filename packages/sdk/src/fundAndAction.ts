import type { Address, Hex } from "viem";

import type { AgentAccountContext, AssetTransferPlanFromContextOutput } from "./accountContext.js";
import { createAgentAccountContext, buildAssetTransferPlanFromAccountContext } from "./accountContext.js";
import { AssetTransferPlanError, buildErc20TransferAction } from "./assetTransfer.js";
import type { AgentFundingPolicy } from "./fundingPolicy.js";
import { createAgentFundingPolicy } from "./fundingPolicy.js";
import { ErcMandatedSdkError } from "./errors.js";
import {
  FollowUpActionError,
  type FollowUpActionIntent,
  type FollowUpActionPlan,
  buildFollowUpActionPlan
} from "./followUpAction.js";
import { toBigint } from "./shared.js";
import type { MandatePayloadBinding } from "./mandate.js";

export interface FundAndActionBalanceSnapshot {
  snapshotAt: string;
  maxStalenessSeconds: number;
  observedAtBlock?: string;
  source?: string;
}

export interface FundAndActionTarget {
  label: string;
  recipient: Address;
  tokenAddress: Address;
  requiredAmountRaw: string;
  currentBalanceRaw: string;
  balanceSnapshot: FundAndActionBalanceSnapshot;
  symbol?: string;
  decimals?: number;
}

export interface FundAndActionPlanInput {
  accountContext: AgentAccountContext;
  fundingPolicy?: AgentFundingPolicy;
  fundingTarget: FundAndActionTarget;
  fundingContext: {
    nonce: string;
    deadline: string;
    authorityEpoch: string;
    allowedAdaptersRoot?: Hex;
    maxDrawdownBps?: string;
    maxCumulativeDrawdownBps?: string;
    payloadBinding?: MandatePayloadBinding;
    extensions?: Hex;
    policyEvaluation?: {
      now?: string;
      currentSpentInWindow?: string;
    };
    executeContext?: {
      from?: Address;
      signature: Hex;
      adapterProofs: Hex[][];
    };
  };
  followUpAction: FollowUpActionIntent;
}

export interface FundAndActionPlanOutput {
  result: {
    accountContext: AgentAccountContext;
    fundingPolicy?: AgentFundingPolicy;
    fundingTarget: FundAndActionTarget & {
      currentBalanceRaw: string;
      fundingShortfallRaw: string;
    };
    evaluatedAt: string;
    fundingRequired: boolean;
    fundingPlan?: AssetTransferPlanFromContextOutput["result"];
    followUpAction: FollowUpActionIntent;
    followUpActionPlan: FollowUpActionPlan;
    steps: Array<{
      kind: "fundTargetAccount" | "followUpAction";
      status: "required" | "skipped" | "pending";
      summary: string;
    }>;
  };
}

export type FundAndActionPlanErrorCode =
  | "MISSING_CURRENT_BALANCE"
  | "INVALID_TARGET_LABEL"
  | "MISSING_BALANCE_SNAPSHOT"
  | "INVALID_BALANCE_SNAPSHOT_AT"
  | "INVALID_BALANCE_SNAPSHOT_MAX_STALENESS"
  | "INVALID_BALANCE_SNAPSHOT_OBSERVED_BLOCK"
  | "INVALID_EVALUATION_TIME"
  | "STALE_BALANCE_SNAPSHOT";

export class FundAndActionPlanError extends ErcMandatedSdkError {
  readonly code: FundAndActionPlanErrorCode;
  readonly field:
    | "fundingTarget.currentBalanceRaw"
    | "fundingTarget.label"
    | "fundingTarget.balanceSnapshot"
    | "fundingTarget.balanceSnapshot.snapshotAt"
    | "fundingTarget.balanceSnapshot.maxStalenessSeconds"
    | "fundingTarget.balanceSnapshot.observedAtBlock"
    | "fundingContext.policyEvaluation.now";

  constructor(
    message: string,
    params: {
      code: FundAndActionPlanErrorCode;
      field:
        | "fundingTarget.currentBalanceRaw"
        | "fundingTarget.label"
        | "fundingTarget.balanceSnapshot"
        | "fundingTarget.balanceSnapshot.snapshotAt"
        | "fundingTarget.balanceSnapshot.maxStalenessSeconds"
        | "fundingTarget.balanceSnapshot.observedAtBlock"
        | "fundingContext.policyEvaluation.now";
      value?: unknown;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "FundAndActionPlanError",
      details: {
        field: params.field,
        value: params.value,
        ...params.details
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

function validateLabel(label: string): void {
  if (typeof label === "string" && label.trim().length > 0) {
    return;
  }

  throw new FundAndActionPlanError("Invalid fundingTarget.label: expected non-empty string.", {
    code: "INVALID_TARGET_LABEL",
    field: "fundingTarget.label",
    value: label
  });
}

function requireCurrentBalanceRaw(currentBalanceRaw: string | undefined): string {
  if (typeof currentBalanceRaw === "string") {
    return currentBalanceRaw;
  }

  throw new FundAndActionPlanError(
    "Missing fundingTarget.currentBalanceRaw: explicit target balance snapshot is required.",
    {
      code: "MISSING_CURRENT_BALANCE",
      field: "fundingTarget.currentBalanceRaw",
      value: currentBalanceRaw
    }
  );
}

function parseIsoTimestamp(
  value: string,
  params: {
    code: "INVALID_BALANCE_SNAPSHOT_AT" | "INVALID_EVALUATION_TIME";
    field: "fundingTarget.balanceSnapshot.snapshotAt" | "fundingContext.policyEvaluation.now";
  }
): number {
  const timestampMs = Date.parse(value);

  if (!Number.isNaN(timestampMs)) {
    return timestampMs;
  }

  throw new FundAndActionPlanError("Invalid ISO datetime string provided.", {
    code: params.code,
    field: params.field,
    value,
    details: {
      isoValue: value
    }
  });
}

function normalizeBalanceSnapshot(
  balanceSnapshot: FundAndActionBalanceSnapshot | undefined
): FundAndActionBalanceSnapshot {
  if (!balanceSnapshot) {
    throw new FundAndActionPlanError(
      "Missing fundingTarget.balanceSnapshot: explicit balance snapshot metadata is required.",
      {
        code: "MISSING_BALANCE_SNAPSHOT",
        field: "fundingTarget.balanceSnapshot",
        value: balanceSnapshot
      }
    );
  }

  parseIsoTimestamp(balanceSnapshot.snapshotAt, {
    code: "INVALID_BALANCE_SNAPSHOT_AT",
    field: "fundingTarget.balanceSnapshot.snapshotAt"
  });

  if (!Number.isInteger(balanceSnapshot.maxStalenessSeconds) || balanceSnapshot.maxStalenessSeconds <= 0) {
    throw new FundAndActionPlanError(
      "Invalid fundingTarget.balanceSnapshot.maxStalenessSeconds: expected positive integer.",
      {
        code: "INVALID_BALANCE_SNAPSHOT_MAX_STALENESS",
        field: "fundingTarget.balanceSnapshot.maxStalenessSeconds",
        value: balanceSnapshot.maxStalenessSeconds
      }
    );
  }

  if (balanceSnapshot.observedAtBlock !== undefined) {
    try {
      toBigint(balanceSnapshot.observedAtBlock, "fundingTarget.balanceSnapshot.observedAtBlock");
    } catch {
      throw new FundAndActionPlanError(
        "Invalid fundingTarget.balanceSnapshot.observedAtBlock: expected decimal string.",
        {
          code: "INVALID_BALANCE_SNAPSHOT_OBSERVED_BLOCK",
          field: "fundingTarget.balanceSnapshot.observedAtBlock",
          value: balanceSnapshot.observedAtBlock
        }
      );
    }
  }

  return {
    snapshotAt: balanceSnapshot.snapshotAt,
    maxStalenessSeconds: balanceSnapshot.maxStalenessSeconds,
    ...(balanceSnapshot.observedAtBlock !== undefined
      ? { observedAtBlock: balanceSnapshot.observedAtBlock }
      : {}),
    ...(balanceSnapshot.source ? { source: balanceSnapshot.source } : {})
  };
}

function resolveEvaluationTimestamp(now: string | undefined): string {
  const evaluatedAt = now ?? new Date().toISOString();
  parseIsoTimestamp(evaluatedAt, {
    code: "INVALID_EVALUATION_TIME",
    field: "fundingContext.policyEvaluation.now"
  });
  return evaluatedAt;
}

function validateBalanceSnapshotFreshness(
  balanceSnapshot: FundAndActionBalanceSnapshot,
  evaluatedAt: string
): void {
  const snapshotAtMs = parseIsoTimestamp(balanceSnapshot.snapshotAt, {
    code: "INVALID_BALANCE_SNAPSHOT_AT",
    field: "fundingTarget.balanceSnapshot.snapshotAt"
  });
  const evaluatedAtMs = parseIsoTimestamp(evaluatedAt, {
    code: "INVALID_EVALUATION_TIME",
    field: "fundingContext.policyEvaluation.now"
  });
  const ageMs = Math.max(0, evaluatedAtMs - snapshotAtMs);
  const maxAgeMs = balanceSnapshot.maxStalenessSeconds * 1000;

  if (ageMs <= maxAgeMs) {
    return;
  }

  throw new FundAndActionPlanError("fundingTarget.balanceSnapshot is stale for fund-and-action evaluation.", {
    code: "STALE_BALANCE_SNAPSHOT",
    field: "fundingTarget.balanceSnapshot.snapshotAt",
    value: balanceSnapshot.snapshotAt,
    details: {
      snapshotAt: balanceSnapshot.snapshotAt,
      evaluatedAt,
      ageSeconds: Math.ceil(ageMs / 1000),
      maxStalenessSeconds: balanceSnapshot.maxStalenessSeconds
    }
  });
}

function validateDecimals(decimals: number | undefined): void {
  if (decimals === undefined) {
    return;
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new AssetTransferPlanError("Invalid decimals: expected integer between 0 and 255.", {
      code: "INVALID_DECIMALS",
      field: "decimals",
      value: decimals
    });
  }
}

function validateFollowUpAssetRequirement(
  fundingTarget: FundAndActionTarget,
  followUpActionPlan: FollowUpActionPlan
): void {
  if (!followUpActionPlan.assetRequirement) {
    return;
  }

  if (fundingTarget.tokenAddress.toLowerCase() !== followUpActionPlan.assetRequirement.tokenAddress.toLowerCase()) {
    throw new FollowUpActionError(
      "fundingTarget.tokenAddress does not match follow-up action collateral token.",
      {
        code: "FOLLOW_UP_ASSET_MISMATCH",
        field: "fundingTarget.tokenAddress",
        details: {
          fundingTargetTokenAddress: fundingTarget.tokenAddress,
          followUpTokenAddress: followUpActionPlan.assetRequirement.tokenAddress
        }
      }
    );
  }

  const requiredBalance = toBigint(fundingTarget.requiredAmountRaw, "fundingTarget.requiredAmountRaw");
  const followUpAmount = toBigint(followUpActionPlan.assetRequirement.amountRaw, "followUpAction.payload.collateralAmountRaw");

  if (requiredBalance < followUpAmount) {
    throw new FollowUpActionError(
      "fundingTarget.requiredAmountRaw is lower than follow-up action collateral requirement.",
      {
        code: "FOLLOW_UP_REQUIRED_BALANCE_TOO_LOW",
        field: "fundingTarget.requiredAmountRaw",
        details: {
          fundingTargetRequiredAmountRaw: fundingTarget.requiredAmountRaw,
          followUpCollateralAmountRaw: followUpActionPlan.assetRequirement.amountRaw
        }
      }
    );
  }
}

function computeFundingShortfall(requiredAmountRaw: string, currentBalanceRaw: string): string {
  const required = toBigint(requiredAmountRaw, "fundingTarget.requiredAmountRaw");
  const current = toBigint(currentBalanceRaw, "fundingTarget.currentBalanceRaw");

  if (current >= required) {
    return "0";
  }

  return (required - current).toString(10);
}

export async function buildFundAndActionPlan(
  input: FundAndActionPlanInput
): Promise<FundAndActionPlanOutput> {
  const accountContext = createAgentAccountContext(input.accountContext).result.accountContext;
  const fundingPolicy = input.fundingPolicy
    ? createAgentFundingPolicy(input.fundingPolicy).result.fundingPolicy
    : undefined;

  validateLabel(input.fundingTarget.label);
  validateDecimals(input.fundingTarget.decimals);
  buildErc20TransferAction({
    tokenAddress: input.fundingTarget.tokenAddress,
    to: input.fundingTarget.recipient,
    amountRaw: input.fundingTarget.requiredAmountRaw
  });
  const followUpActionPlan = buildFollowUpActionPlan(input.followUpAction);
  validateFollowUpAssetRequirement(input.fundingTarget, followUpActionPlan);

  const currentBalanceRaw = requireCurrentBalanceRaw(input.fundingTarget.currentBalanceRaw);
  const balanceSnapshot = normalizeBalanceSnapshot(input.fundingTarget.balanceSnapshot);
  const evaluatedAt = resolveEvaluationTimestamp(input.fundingContext.policyEvaluation?.now);
  validateBalanceSnapshotFreshness(balanceSnapshot, evaluatedAt);
  const fundingShortfallRaw = computeFundingShortfall(input.fundingTarget.requiredAmountRaw, currentBalanceRaw);
  const fundingRequired = fundingShortfallRaw !== "0";

  const fundingPlan = fundingRequired
    ? (
        await buildAssetTransferPlanFromAccountContext({
          accountContext,
          fundingPolicy,
          tokenAddress: input.fundingTarget.tokenAddress,
          to: input.fundingTarget.recipient,
          amountRaw: fundingShortfallRaw,
          nonce: input.fundingContext.nonce,
          deadline: input.fundingContext.deadline,
          authorityEpoch: input.fundingContext.authorityEpoch,
          allowedAdaptersRoot: input.fundingContext.allowedAdaptersRoot,
          maxDrawdownBps: input.fundingContext.maxDrawdownBps,
          maxCumulativeDrawdownBps: input.fundingContext.maxCumulativeDrawdownBps,
          payloadBinding: input.fundingContext.payloadBinding,
          extensions: input.fundingContext.extensions,
          symbol: input.fundingTarget.symbol,
          decimals: input.fundingTarget.decimals,
          policyEvaluation: input.fundingContext.policyEvaluation,
          executeContext: input.fundingContext.executeContext
        })
      ).result
    : undefined;

  return {
    result: {
      accountContext,
      ...(fundingPolicy ? { fundingPolicy } : {}),
      fundingTarget: {
        ...input.fundingTarget,
        currentBalanceRaw,
        balanceSnapshot,
        fundingShortfallRaw
      },
      evaluatedAt,
      fundingRequired,
      ...(fundingPlan ? { fundingPlan } : {}),
      followUpAction: input.followUpAction,
      followUpActionPlan,
      steps: [
        {
          kind: "fundTargetAccount",
          status: fundingRequired ? "required" : "skipped",
          summary: fundingRequired
            ? `Fund ${input.fundingTarget.label} with ${fundingShortfallRaw} units of ${input.fundingTarget.tokenAddress}.`
            : `${input.fundingTarget.label} already has sufficient balance.`
        },
        {
          kind: "followUpAction",
          status: "pending",
          summary: followUpActionPlan.summary
        }
      ]
    }
  };
}
