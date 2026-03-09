import { isAddress, type Address } from "viem";

import { ErcMandatedSdkError } from "./errors.js";
import { toBigint } from "./shared.js";

export interface GenericFollowUpActionIntent {
  kind: string;
  target?: string;
  payload?: Record<string, unknown>;
}

export interface PredictCreateOrderPayload {
  marketId: string;
  collateralTokenAddress: Address;
  collateralAmountRaw: string;
  orderSide?: string;
  outcomeId?: string;
  clientOrderId?: string;
}

export interface PredictCreateOrderActionIntent {
  kind: "predict.createOrder";
  target: string;
  payload: PredictCreateOrderPayload;
}

export type FollowUpActionIntent = GenericFollowUpActionIntent | PredictCreateOrderActionIntent;

export interface FollowUpActionPlan {
  kind: string;
  target?: string;
  executionMode: "offchain-api" | "custom";
  summary: string;
  assetRequirement?: {
    tokenAddress: Address;
    amountRaw: string;
  };
  payload?: object;
}

export type FollowUpActionExecutionStatus = "pending" | "submitted" | "succeeded" | "failed" | "skipped";

export interface FollowUpActionExecutionReference {
  type: "requestId" | "orderId" | "txHash" | "custom";
  value: string;
}

export interface FollowUpActionExecutionError {
  code: string;
  message: string;
  retriable?: boolean;
  details?: Record<string, unknown>;
}

export interface CreateFollowUpActionResultInput {
  followUpActionPlan: FollowUpActionPlan;
  status: FollowUpActionExecutionStatus;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  attempt?: number;
  reference?: FollowUpActionExecutionReference;
  output?: Record<string, unknown>;
  error?: FollowUpActionExecutionError;
}

export interface FollowUpActionResult {
  kind: string;
  target?: string;
  executionMode: FollowUpActionPlan["executionMode"];
  status: FollowUpActionExecutionStatus;
  summary: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  attempt: number;
  reference?: FollowUpActionExecutionReference;
  output?: Record<string, unknown>;
  error?: FollowUpActionExecutionError;
  plan: FollowUpActionPlan;
}

export interface CreateFollowUpActionResultOutput {
  result: {
    followUpActionResult: FollowUpActionResult;
  };
}

export type FollowUpActionErrorCode =
  | "INVALID_FOLLOW_UP_KIND"
  | "INVALID_FOLLOW_UP_TARGET"
  | "INVALID_FOLLOW_UP_EXECUTION_MODE"
  | "INVALID_FOLLOW_UP_SUMMARY"
  | "MISSING_FOLLOW_UP_PAYLOAD"
  | "INVALID_MARKET_ID"
  | "INVALID_COLLATERAL_TOKEN_ADDRESS"
  | "INVALID_FOLLOW_UP_ASSET_REQUIREMENT"
  | "INVALID_RESULT_STATUS"
  | "INVALID_RESULT_TIMESTAMP"
  | "INVALID_RESULT_ATTEMPT"
  | "INVALID_RESULT_REFERENCE"
  | "INVALID_RESULT_ERROR"
  | "FAILED_RESULT_REQUIRES_ERROR"
  | "NON_FAILED_RESULT_CANNOT_INCLUDE_ERROR"
  | "INCOMPLETE_RESULT_CANNOT_INCLUDE_COMPLETED_AT"
  | "FOLLOW_UP_ASSET_MISMATCH"
  | "FOLLOW_UP_REQUIRED_BALANCE_TOO_LOW";

export class FollowUpActionError extends ErcMandatedSdkError {
  readonly code: FollowUpActionErrorCode;
  readonly field:
    | "followUpAction.kind"
    | "followUpAction.target"
    | "followUpAction.executionMode"
    | "followUpAction.summary"
    | "followUpAction.payload"
    | "followUpAction.payload.marketId"
    | "followUpAction.payload.collateralTokenAddress"
    | "followUpAction.payload.collateralAmountRaw"
    | "followUpAction.assetRequirement.tokenAddress"
    | "followUpAction.assetRequirement.amountRaw"
    | "followUpActionResult.status"
    | "followUpActionResult.updatedAt"
    | "followUpActionResult.startedAt"
    | "followUpActionResult.completedAt"
    | "followUpActionResult.attempt"
    | "followUpActionResult.reference.type"
    | "followUpActionResult.reference.value"
    | "followUpActionResult.error"
    | "fundingTarget.tokenAddress"
    | "fundingTarget.requiredAmountRaw";

  constructor(
    message: string,
    params: {
      code: FollowUpActionErrorCode;
      field:
        | "followUpAction.kind"
        | "followUpAction.target"
        | "followUpAction.executionMode"
        | "followUpAction.summary"
        | "followUpAction.payload"
        | "followUpAction.payload.marketId"
        | "followUpAction.payload.collateralTokenAddress"
        | "followUpAction.payload.collateralAmountRaw"
        | "followUpAction.assetRequirement.tokenAddress"
        | "followUpAction.assetRequirement.amountRaw"
        | "followUpActionResult.status"
        | "followUpActionResult.updatedAt"
        | "followUpActionResult.startedAt"
        | "followUpActionResult.completedAt"
        | "followUpActionResult.attempt"
        | "followUpActionResult.reference.type"
        | "followUpActionResult.reference.value"
        | "followUpActionResult.error"
        | "fundingTarget.tokenAddress"
        | "fundingTarget.requiredAmountRaw";
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "FollowUpActionError",
      details: {
        field: params.field,
        ...params.details
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

function validateKind(kind: string): void {
  if (typeof kind === "string" && kind.trim().length > 0) {
    return;
  }

  throw new FollowUpActionError("Invalid followUpAction.kind: expected non-empty string.", {
    code: "INVALID_FOLLOW_UP_KIND",
    field: "followUpAction.kind",
    details: { kind }
  });
}

function validateTarget(target: string | undefined): void {
  if (target === undefined) {
    return;
  }

  if (typeof target === "string" && target.trim().length > 0) {
    return;
  }

  throw new FollowUpActionError("Invalid followUpAction.target: expected non-empty string.", {
    code: "INVALID_FOLLOW_UP_TARGET",
    field: "followUpAction.target",
    details: { target }
  });
}

function validateExecutionMode(executionMode: FollowUpActionPlan["executionMode"]): void {
  if (executionMode === "offchain-api" || executionMode === "custom") {
    return;
  }

  throw new FollowUpActionError("Invalid followUpAction.executionMode.", {
    code: "INVALID_FOLLOW_UP_EXECUTION_MODE",
    field: "followUpAction.executionMode",
    details: { executionMode }
  });
}

function validateSummary(summary: string): void {
  if (typeof summary === "string" && summary.trim().length > 0) {
    return;
  }

  throw new FollowUpActionError("Invalid followUpAction.summary: expected non-empty string.", {
    code: "INVALID_FOLLOW_UP_SUMMARY",
    field: "followUpAction.summary",
    details: { summary }
  });
}

function requirePredictPayload(payload: unknown): PredictCreateOrderPayload {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as unknown as PredictCreateOrderPayload;
  }

  throw new FollowUpActionError("Missing followUpAction.payload for predict.createOrder.", {
    code: "MISSING_FOLLOW_UP_PAYLOAD",
    field: "followUpAction.payload"
  });
}

function validateMarketId(marketId: string): void {
  if (typeof marketId === "string" && marketId.trim().length > 0) {
    return;
  }

  throw new FollowUpActionError("Invalid followUpAction.payload.marketId: expected non-empty string.", {
    code: "INVALID_MARKET_ID",
    field: "followUpAction.payload.marketId",
    details: { marketId }
  });
}

function validateCollateralTokenAddress(tokenAddress: Address): void {
  if (isAddress(tokenAddress)) {
    return;
  }

  throw new FollowUpActionError("Invalid followUpAction.payload.collateralTokenAddress.", {
    code: "INVALID_COLLATERAL_TOKEN_ADDRESS",
    field: "followUpAction.payload.collateralTokenAddress",
    details: { tokenAddress }
  });
}

function normalizeAssetRequirement(
  assetRequirement: FollowUpActionPlan["assetRequirement"]
): FollowUpActionPlan["assetRequirement"] {
  if (!assetRequirement) {
    return undefined;
  }

  validateCollateralTokenAddress(assetRequirement.tokenAddress);

  try {
    toBigint(assetRequirement.amountRaw, "followUpAction.assetRequirement.amountRaw");
  } catch {
    throw new FollowUpActionError("Invalid followUpAction.assetRequirement.amountRaw.", {
      code: "INVALID_FOLLOW_UP_ASSET_REQUIREMENT",
      field: "followUpAction.assetRequirement.amountRaw",
      details: {
        amountRaw: assetRequirement.amountRaw
      }
    });
  }

  return {
    tokenAddress: assetRequirement.tokenAddress,
    amountRaw: assetRequirement.amountRaw
  };
}

function normalizeIsoTimestamp(
  value: string,
  field:
    | "followUpActionResult.updatedAt"
    | "followUpActionResult.startedAt"
    | "followUpActionResult.completedAt"
): string {
  if (!Number.isNaN(Date.parse(value))) {
    return value;
  }

  throw new FollowUpActionError("Invalid ISO datetime string for follow-up action result.", {
    code: "INVALID_RESULT_TIMESTAMP",
    field,
    details: { value }
  });
}

function normalizeFollowUpActionPlan(input: FollowUpActionPlan): FollowUpActionPlan {
  validateKind(input.kind);
  validateTarget(input.target);
  validateExecutionMode(input.executionMode);
  validateSummary(input.summary);

  const assetRequirement = normalizeAssetRequirement(input.assetRequirement);

  return {
    kind: input.kind,
    ...(input.target ? { target: input.target } : {}),
    executionMode: input.executionMode,
    summary: input.summary,
    ...(assetRequirement ? { assetRequirement } : {}),
    ...(input.payload ? { payload: input.payload } : {})
  };
}

function validateResultStatus(status: FollowUpActionExecutionStatus): void {
  if (
    status === "pending" ||
    status === "submitted" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "skipped"
  ) {
    return;
  }

  throw new FollowUpActionError("Invalid followUpActionResult.status.", {
    code: "INVALID_RESULT_STATUS",
    field: "followUpActionResult.status",
    details: { status }
  });
}

function normalizeAttempt(attempt: number | undefined): number {
  const value = attempt ?? 1;

  if (Number.isInteger(value) && value >= 1) {
    return value;
  }

  throw new FollowUpActionError("Invalid followUpActionResult.attempt: expected positive integer.", {
    code: "INVALID_RESULT_ATTEMPT",
    field: "followUpActionResult.attempt",
    details: { attempt: value }
  });
}

function normalizeReference(
  reference: FollowUpActionExecutionReference | undefined
): FollowUpActionExecutionReference | undefined {
  if (!reference) {
    return undefined;
  }

  if (
    reference.type !== "requestId" &&
    reference.type !== "orderId" &&
    reference.type !== "txHash" &&
    reference.type !== "custom"
  ) {
    throw new FollowUpActionError("Invalid followUpActionResult.reference.type.", {
      code: "INVALID_RESULT_REFERENCE",
      field: "followUpActionResult.reference.type",
      details: { type: reference.type }
    });
  }

  if (typeof reference.value !== "string" || reference.value.trim().length === 0) {
    throw new FollowUpActionError("Invalid followUpActionResult.reference.value.", {
      code: "INVALID_RESULT_REFERENCE",
      field: "followUpActionResult.reference.value",
      details: { value: reference.value }
    });
  }

  return {
    type: reference.type,
    value: reference.value
  };
}

function normalizeExecutionError(
  error: FollowUpActionExecutionError | undefined
): FollowUpActionExecutionError | undefined {
  if (!error) {
    return undefined;
  }

  if (typeof error.code !== "string" || error.code.trim().length === 0) {
    throw new FollowUpActionError("Invalid followUpActionResult.error.code.", {
      code: "INVALID_RESULT_ERROR",
      field: "followUpActionResult.error",
      details: { error }
    });
  }

  if (typeof error.message !== "string" || error.message.trim().length === 0) {
    throw new FollowUpActionError("Invalid followUpActionResult.error.message.", {
      code: "INVALID_RESULT_ERROR",
      field: "followUpActionResult.error",
      details: { error }
    });
  }

  return {
    code: error.code,
    message: error.message,
    ...(error.retriable !== undefined ? { retriable: error.retriable } : {}),
    ...(error.details ? { details: error.details } : {})
  };
}

function buildResultSummary(status: FollowUpActionExecutionStatus, plan: FollowUpActionPlan): string {
  const prefix = {
    pending: "Pending",
    submitted: "Submitted",
    succeeded: "Succeeded",
    failed: "Failed",
    skipped: "Skipped"
  }[status];

  return `${prefix}: ${plan.summary}`;
}

export function buildFollowUpActionPlan(input: FollowUpActionIntent): FollowUpActionPlan {
  validateKind(input.kind);
  validateTarget(input.target);

  if (input.kind === "predict.createOrder") {
    const payload = requirePredictPayload(input.payload);
    validateMarketId(payload.marketId);
    validateCollateralTokenAddress(payload.collateralTokenAddress);
    toBigint(payload.collateralAmountRaw, "followUpAction.payload.collateralAmountRaw");

    return {
      kind: input.kind,
      target: input.target,
      executionMode: "offchain-api",
      summary: `Create predict order for market ${payload.marketId} using ${payload.collateralAmountRaw} units of ${payload.collateralTokenAddress}.`,
      assetRequirement: {
        tokenAddress: payload.collateralTokenAddress,
        amountRaw: payload.collateralAmountRaw
      },
      payload: {
        marketId: payload.marketId,
        collateralTokenAddress: payload.collateralTokenAddress,
        collateralAmountRaw: payload.collateralAmountRaw,
        ...(payload.orderSide ? { orderSide: payload.orderSide } : {}),
        ...(payload.outcomeId ? { outcomeId: payload.outcomeId } : {}),
        ...(payload.clientOrderId ? { clientOrderId: payload.clientOrderId } : {})
      }
    };
  }

  return {
    kind: input.kind,
    ...(input.target ? { target: input.target } : {}),
    executionMode: "custom",
    summary: `Run follow-up action: ${input.kind}.`,
    ...(input.payload ? { payload: input.payload } : {})
  };
}

export function createFollowUpActionResult(
  input: CreateFollowUpActionResultInput
): CreateFollowUpActionResultOutput {
  const followUpActionPlan = normalizeFollowUpActionPlan(input.followUpActionPlan);
  validateResultStatus(input.status);

  const updatedAt = normalizeIsoTimestamp(input.updatedAt ?? new Date().toISOString(), "followUpActionResult.updatedAt");
  const startedAt = input.startedAt
    ? normalizeIsoTimestamp(input.startedAt, "followUpActionResult.startedAt")
    : undefined;
  const attempt = normalizeAttempt(input.attempt);
  const reference = normalizeReference(input.reference);
  const error = normalizeExecutionError(input.error);

  if (input.status === "failed" && !error) {
    throw new FollowUpActionError("Failed follow-up action result requires error details.", {
      code: "FAILED_RESULT_REQUIRES_ERROR",
      field: "followUpActionResult.error",
      details: { status: input.status }
    });
  }

  if (input.status !== "failed" && error) {
    throw new FollowUpActionError("Only failed follow-up action results may include error details.", {
      code: "NON_FAILED_RESULT_CANNOT_INCLUDE_ERROR",
      field: "followUpActionResult.error",
      details: { status: input.status }
    });
  }

  const isTerminal = input.status === "succeeded" || input.status === "failed" || input.status === "skipped";

  if (!isTerminal && input.completedAt !== undefined) {
    throw new FollowUpActionError("Incomplete follow-up action result cannot include completedAt.", {
      code: "INCOMPLETE_RESULT_CANNOT_INCLUDE_COMPLETED_AT",
      field: "followUpActionResult.completedAt",
      details: { status: input.status, completedAt: input.completedAt }
    });
  }

  const completedAt = isTerminal
    ? normalizeIsoTimestamp(input.completedAt ?? updatedAt, "followUpActionResult.completedAt")
    : undefined;

  return {
    result: {
      followUpActionResult: {
        kind: followUpActionPlan.kind,
        ...(followUpActionPlan.target ? { target: followUpActionPlan.target } : {}),
        executionMode: followUpActionPlan.executionMode,
        status: input.status,
        summary: buildResultSummary(input.status, followUpActionPlan),
        updatedAt,
        ...(startedAt ? { startedAt } : {}),
        ...(completedAt ? { completedAt } : {}),
        attempt,
        ...(reference ? { reference } : {}),
        ...(input.output ? { output: input.output } : {}),
        ...(error ? { error } : {}),
        plan: followUpActionPlan
      }
    }
  };
}
