import { isHex, type Hex } from "viem";

import type { AssetTransferPlanOutput } from "./assetTransfer.js";
import { ErcMandatedSdkError } from "./errors.js";
import { toBigint } from "./shared.js";

export type AssetTransferExecutionStatus = "pending" | "submitted" | "confirmed" | "failed" | "skipped";

export interface AssetTransferExecutionError {
  code: string;
  message: string;
  retriable?: boolean;
  details?: Record<string, unknown>;
}

export interface AssetTransferReceipt {
  blockNumber: string;
  blockHash?: Hex;
  confirmations?: number;
}

export interface CreateAssetTransferResultInput {
  assetTransferPlan: AssetTransferPlanOutput["result"];
  status: AssetTransferExecutionStatus;
  updatedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  attempt?: number;
  chainId?: number;
  txHash?: Hex;
  receipt?: AssetTransferReceipt;
  output?: Record<string, unknown>;
  error?: AssetTransferExecutionError;
}

export interface AssetTransferResult {
  status: AssetTransferExecutionStatus;
  summary: string;
  updatedAt: string;
  submittedAt?: string;
  completedAt?: string;
  attempt: number;
  chainId?: number;
  txHash?: Hex;
  receipt?: AssetTransferReceipt;
  output?: Record<string, unknown>;
  error?: AssetTransferExecutionError;
  plan: AssetTransferPlanOutput["result"];
}

export interface CreateAssetTransferResultOutput {
  result: {
    assetTransferResult: AssetTransferResult;
  };
}

export type AssetTransferResultErrorCode =
  | "INVALID_RESULT_STATUS"
  | "INVALID_RESULT_TIMESTAMP"
  | "INVALID_RESULT_ATTEMPT"
  | "INVALID_RESULT_CHAIN_ID"
  | "INVALID_RESULT_TX_HASH"
  | "INVALID_RESULT_RECEIPT"
  | "INVALID_RESULT_ERROR"
  | "SUBMITTED_RESULT_REQUIRES_TX_HASH"
  | "CONFIRMED_RESULT_REQUIRES_RECEIPT"
  | "FAILED_RESULT_REQUIRES_ERROR"
  | "NON_FAILED_RESULT_CANNOT_INCLUDE_ERROR"
  | "INCOMPLETE_RESULT_CANNOT_INCLUDE_COMPLETED_AT"
  | "PENDING_RESULT_CANNOT_INCLUDE_ONCHAIN_DATA"
  | "SKIPPED_RESULT_CANNOT_INCLUDE_ONCHAIN_DATA";

export class AssetTransferResultError extends ErcMandatedSdkError {
  readonly code: AssetTransferResultErrorCode;
  readonly field:
    | "assetTransferResult.status"
    | "assetTransferResult.updatedAt"
    | "assetTransferResult.submittedAt"
    | "assetTransferResult.completedAt"
    | "assetTransferResult.attempt"
    | "assetTransferResult.chainId"
    | "assetTransferResult.txHash"
    | "assetTransferResult.receipt"
    | "assetTransferResult.error";

  constructor(
    message: string,
    params: {
      code: AssetTransferResultErrorCode;
      field:
        | "assetTransferResult.status"
        | "assetTransferResult.updatedAt"
        | "assetTransferResult.submittedAt"
        | "assetTransferResult.completedAt"
        | "assetTransferResult.attempt"
        | "assetTransferResult.chainId"
        | "assetTransferResult.txHash"
        | "assetTransferResult.receipt"
        | "assetTransferResult.error";
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "AssetTransferResultError",
      details: {
        field: params.field,
        ...params.details
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

function validateResultStatus(status: string): asserts status is AssetTransferExecutionStatus {
  if (
    status === "pending" ||
    status === "submitted" ||
    status === "confirmed" ||
    status === "failed" ||
    status === "skipped"
  ) {
    return;
  }

  throw new AssetTransferResultError("Invalid assetTransferResult.status.", {
    code: "INVALID_RESULT_STATUS",
    field: "assetTransferResult.status",
    details: { status }
  });
}

function normalizeIsoTimestamp(
  value: string,
  field:
    | "assetTransferResult.updatedAt"
    | "assetTransferResult.submittedAt"
    | "assetTransferResult.completedAt"
): string {
  if (!Number.isNaN(Date.parse(value))) {
    return value;
  }

  throw new AssetTransferResultError("Invalid ISO datetime string for asset transfer result.", {
    code: "INVALID_RESULT_TIMESTAMP",
    field,
    details: { value }
  });
}

function normalizeAttempt(attempt: number | undefined): number {
  if (attempt === undefined) {
    return 1;
  }

  if (Number.isInteger(attempt) && attempt > 0) {
    return attempt;
  }

  throw new AssetTransferResultError("Invalid assetTransferResult.attempt: expected positive integer.", {
    code: "INVALID_RESULT_ATTEMPT",
    field: "assetTransferResult.attempt",
    details: { attempt }
  });
}

function normalizeChainId(chainId: number | undefined): number | undefined {
  if (chainId === undefined) {
    return undefined;
  }

  if (Number.isInteger(chainId) && chainId > 0) {
    return chainId;
  }

  throw new AssetTransferResultError("Invalid assetTransferResult.chainId: expected positive integer.", {
    code: "INVALID_RESULT_CHAIN_ID",
    field: "assetTransferResult.chainId",
    details: { chainId }
  });
}

function normalizeTxHash(txHash: Hex | undefined): Hex | undefined {
  if (txHash === undefined) {
    return undefined;
  }

  if (isHex(txHash, { strict: true }) && txHash.length === 66) {
    return txHash;
  }

  throw new AssetTransferResultError("Invalid assetTransferResult.txHash.", {
    code: "INVALID_RESULT_TX_HASH",
    field: "assetTransferResult.txHash",
    details: { txHash }
  });
}

function normalizeReceipt(receipt: AssetTransferReceipt | undefined): AssetTransferReceipt | undefined {
  if (!receipt) {
    return undefined;
  }

  try {
    toBigint(receipt.blockNumber, "assetTransferResult.receipt.blockNumber");
  } catch {
    throw new AssetTransferResultError("Invalid assetTransferResult.receipt.blockNumber.", {
      code: "INVALID_RESULT_RECEIPT",
      field: "assetTransferResult.receipt",
      details: { receipt }
    });
  }

  if (receipt.blockHash !== undefined && (!isHex(receipt.blockHash, { strict: true }) || receipt.blockHash.length !== 66)) {
    throw new AssetTransferResultError("Invalid assetTransferResult.receipt.blockHash.", {
      code: "INVALID_RESULT_RECEIPT",
      field: "assetTransferResult.receipt",
      details: { receipt }
    });
  }

  if (
    receipt.confirmations !== undefined &&
    (!Number.isInteger(receipt.confirmations) || receipt.confirmations < 0)
  ) {
    throw new AssetTransferResultError("Invalid assetTransferResult.receipt.confirmations.", {
      code: "INVALID_RESULT_RECEIPT",
      field: "assetTransferResult.receipt",
      details: { receipt }
    });
  }

  return {
    blockNumber: receipt.blockNumber,
    ...(receipt.blockHash ? { blockHash: receipt.blockHash } : {}),
    ...(receipt.confirmations !== undefined ? { confirmations: receipt.confirmations } : {})
  };
}

function normalizeExecutionError(
  error: AssetTransferExecutionError | undefined
): AssetTransferExecutionError | undefined {
  if (!error) {
    return undefined;
  }

  if (typeof error.code !== "string" || error.code.trim().length === 0) {
    throw new AssetTransferResultError("Invalid assetTransferResult.error.code.", {
      code: "INVALID_RESULT_ERROR",
      field: "assetTransferResult.error",
      details: { error }
    });
  }

  if (typeof error.message !== "string" || error.message.trim().length === 0) {
    throw new AssetTransferResultError("Invalid assetTransferResult.error.message.", {
      code: "INVALID_RESULT_ERROR",
      field: "assetTransferResult.error",
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

function buildResultSummary(
  status: AssetTransferExecutionStatus,
  plan: AssetTransferPlanOutput["result"]
): string {
  const prefix = {
    pending: "Pending",
    submitted: "Submitted",
    confirmed: "Confirmed",
    failed: "Failed",
    skipped: "Skipped"
  }[status];
  const assetLabel = plan.humanReadableSummary.symbol ?? plan.humanReadableSummary.tokenAddress;

  return `${prefix}: Transfer ${plan.humanReadableSummary.amountRaw} units of ${assetLabel} to ${plan.humanReadableSummary.to}.`;
}

export function createAssetTransferResult(
  input: CreateAssetTransferResultInput
): CreateAssetTransferResultOutput {
  validateResultStatus(input.status);

  const updatedAt = normalizeIsoTimestamp(
    input.updatedAt ?? new Date().toISOString(),
    "assetTransferResult.updatedAt"
  );
  const submittedAt = input.submittedAt
    ? normalizeIsoTimestamp(input.submittedAt, "assetTransferResult.submittedAt")
    : undefined;
  const attempt = normalizeAttempt(input.attempt);
  const chainId = normalizeChainId(input.chainId);
  const txHash = normalizeTxHash(input.txHash);
  const receipt = normalizeReceipt(input.receipt);
  const error = normalizeExecutionError(input.error);

  if (input.status === "submitted" && !txHash) {
    throw new AssetTransferResultError("Submitted asset transfer result requires txHash.", {
      code: "SUBMITTED_RESULT_REQUIRES_TX_HASH",
      field: "assetTransferResult.txHash",
      details: { status: input.status }
    });
  }

  if (input.status === "confirmed" && (!txHash || !receipt)) {
    throw new AssetTransferResultError("Confirmed asset transfer result requires txHash and receipt.", {
      code: "CONFIRMED_RESULT_REQUIRES_RECEIPT",
      field: !txHash ? "assetTransferResult.txHash" : "assetTransferResult.receipt",
      details: { status: input.status }
    });
  }

  if (input.status === "failed" && !error) {
    throw new AssetTransferResultError("Failed asset transfer result requires error details.", {
      code: "FAILED_RESULT_REQUIRES_ERROR",
      field: "assetTransferResult.error",
      details: { status: input.status }
    });
  }

  if (input.status !== "failed" && error) {
    throw new AssetTransferResultError("Only failed asset transfer results may include error details.", {
      code: "NON_FAILED_RESULT_CANNOT_INCLUDE_ERROR",
      field: "assetTransferResult.error",
      details: { status: input.status }
    });
  }

  if (input.status === "pending" && (txHash || receipt)) {
    throw new AssetTransferResultError("Pending asset transfer result cannot include onchain transaction data.", {
      code: "PENDING_RESULT_CANNOT_INCLUDE_ONCHAIN_DATA",
      field: txHash ? "assetTransferResult.txHash" : "assetTransferResult.receipt",
      details: { status: input.status }
    });
  }

  if (input.status === "skipped" && (txHash || receipt)) {
    throw new AssetTransferResultError("Skipped asset transfer result cannot include onchain transaction data.", {
      code: "SKIPPED_RESULT_CANNOT_INCLUDE_ONCHAIN_DATA",
      field: txHash ? "assetTransferResult.txHash" : "assetTransferResult.receipt",
      details: { status: input.status }
    });
  }

  const isTerminal = input.status === "confirmed" || input.status === "failed" || input.status === "skipped";

  if (!isTerminal && input.completedAt !== undefined) {
    throw new AssetTransferResultError("Incomplete asset transfer result cannot include completedAt.", {
      code: "INCOMPLETE_RESULT_CANNOT_INCLUDE_COMPLETED_AT",
      field: "assetTransferResult.completedAt",
      details: { status: input.status, completedAt: input.completedAt }
    });
  }

  const completedAt = isTerminal
    ? normalizeIsoTimestamp(input.completedAt ?? updatedAt, "assetTransferResult.completedAt")
    : undefined;

  return {
    result: {
      assetTransferResult: {
        status: input.status,
        summary: buildResultSummary(input.status, input.assetTransferPlan),
        updatedAt,
        ...(submittedAt ? { submittedAt } : {}),
        ...(completedAt ? { completedAt } : {}),
        attempt,
        ...(chainId !== undefined ? { chainId } : {}),
        ...(txHash ? { txHash } : {}),
        ...(receipt ? { receipt } : {}),
        ...(input.output ? { output: input.output } : {}),
        ...(error ? { error } : {}),
        plan: input.assetTransferPlan
      }
    }
  };
}
