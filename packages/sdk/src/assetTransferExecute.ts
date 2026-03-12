import { type Address, type Hash, type Hex, isHex } from "viem";

import {
  buildAssetTransferPlanFromAccountContext,
  type AssetTransferPlanFromContextInput,
  type AssetTransferPlanFromContextOutput
} from "./accountContext.js";
import { buildAssetTransferPlan, type AssetTransferPlanInput, type AssetTransferPlanOutput } from "./assetTransfer.js";
import {
  createAssetTransferResult,
  type AssetTransferResult,
  type AssetTransferPlanResultLike
} from "./assetTransferResult.js";
import { prepareExecuteTx, type VaultExecuteBaseInput } from "./execute.js";
import { ErcMandatedSdkError } from "./errors.js";
import { resolveChainId } from "./shared.js";

type MaybePromise<T> = Promise<T> | T;

export type AssetTransferExecuteReceiptStatus = "success" | "reverted" | "timeout";

export type AssetTransferExecuteErrorCode =
  | "EXECUTION_ADAPTER_REQUIRED"
  | "MISSING_EXECUTE_INPUT";

export class AssetTransferExecuteError extends ErcMandatedSdkError {
  readonly code: AssetTransferExecuteErrorCode;
  readonly field: "execution" | "executeContext";

  constructor(
    message: string,
    params: {
      code: AssetTransferExecuteErrorCode;
      field: "execution" | "executeContext";
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "AssetTransferExecuteError",
      details: {
        field: params.field,
        ...params.details
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

export interface AssetTransferExecutionAdapter {
  sendTransaction(parameters: {
    txRequest: {
      from: Address;
      to: Address;
      data: Hex;
      value: "0";
    };
  }): MaybePromise<Hash>;
  waitForTransactionReceipt(parameters: {
    txHash: Hash;
    confirmations?: number;
    timeoutMs?: number;
    pollIntervalMs?: number;
  }): MaybePromise<{
    status: AssetTransferExecuteReceiptStatus;
    blockNumber?: bigint;
    blockHash?: Hex;
    receipt?: unknown;
  }>;
}

export interface AssetTransferExecuteControls {
  confirmations?: number;
  receiptTimeoutMs?: number;
  pollIntervalMs?: number;
  updatedAt?: string;
  submittedAt?: string;
  attempt?: number;
}

export interface AssetTransferExecuteInput
  extends Omit<AssetTransferPlanInput, "executeContext">,
    AssetTransferExecuteControls {
  executeContext: NonNullable<AssetTransferPlanInput["executeContext"]>;
}

export interface AssetTransferExecuteFromContextInput
  extends Omit<AssetTransferPlanFromContextInput, "executeContext">,
    AssetTransferExecuteControls {
  executeContext: NonNullable<AssetTransferPlanFromContextInput["executeContext"]>;
}

interface AssetTransferExecuteBaseResult {
  action: AssetTransferPlanOutput["result"]["action"];
  erc20Call: AssetTransferPlanOutput["result"]["erc20Call"];
  humanReadableSummary: AssetTransferPlanOutput["result"]["humanReadableSummary"];
  signRequest: AssetTransferPlanOutput["result"]["signRequest"];
  txRequest: {
    from: Address;
    to: Address;
    data: Hex;
    value: "0";
  };
  receiptStatus: AssetTransferExecuteReceiptStatus;
  assetTransferResult: AssetTransferResult;
}

export interface AssetTransferExecuteOutput {
  result: AssetTransferExecuteBaseResult;
}

export interface AssetTransferExecuteWithContextOutput {
  result: AssetTransferExecuteBaseResult & {
    accountContext: AssetTransferPlanFromContextOutput["result"]["accountContext"];
    policyCheck?: AssetTransferPlanFromContextOutput["result"]["policyCheck"];
  };
}

function buildFailedResult(input: {
  assetTransferPlan: AssetTransferPlanResultLike;
  txHash: Hash;
  chainId: number;
  submittedAt: string;
  updatedAt: string;
  attempt?: number;
  receiptResult: Awaited<ReturnType<AssetTransferExecutionAdapter["waitForTransactionReceipt"]>>;
}): AssetTransferResult {
  return createAssetTransferResult({
    assetTransferPlan: input.assetTransferPlan,
    status: "failed",
    chainId: input.chainId,
    txHash: input.txHash,
    submittedAt: input.submittedAt,
    updatedAt: input.updatedAt,
    completedAt: input.updatedAt,
    attempt: input.attempt,
    ...(input.receiptResult.blockNumber !== undefined
      ? {
          receipt: {
            blockNumber: input.receiptResult.blockNumber.toString(10),
            ...(input.receiptResult.blockHash ? { blockHash: input.receiptResult.blockHash } : {})
          }
        }
      : {}),
    ...(input.receiptResult.receipt && typeof input.receiptResult.receipt === "object"
      ? {
          output: {
            receipt: input.receiptResult.receipt as Record<string, unknown>
          }
        }
      : {}),
    error: {
      code: "TRANSACTION_REVERTED",
      message: "Asset transfer transaction reverted.",
      retriable: false,
      details: {
        receiptStatus: input.receiptResult.status
      }
    }
  }).result.assetTransferResult;
}

function buildConfirmedResult(input: {
  assetTransferPlan: AssetTransferPlanResultLike;
  txHash: Hash;
  chainId: number;
  confirmations?: number;
  submittedAt: string;
  updatedAt: string;
  attempt?: number;
  receiptResult: Awaited<ReturnType<AssetTransferExecutionAdapter["waitForTransactionReceipt"]>>;
}): AssetTransferResult {
  if (input.receiptResult.blockNumber === undefined) {
    throw new AssetTransferExecuteError(
      "Successful asset transfer execution requires receipt block number.",
      {
        code: "MISSING_EXECUTE_INPUT",
        field: "executeContext",
        details: {
          receiptStatus: input.receiptResult.status
        }
      }
    );
  }

  return createAssetTransferResult({
    assetTransferPlan: input.assetTransferPlan,
    status: "confirmed",
    chainId: input.chainId,
    txHash: input.txHash,
    submittedAt: input.submittedAt,
    updatedAt: input.updatedAt,
    completedAt: input.updatedAt,
    attempt: input.attempt,
    receipt: {
      blockNumber: input.receiptResult.blockNumber.toString(10),
      ...(input.receiptResult.blockHash ? { blockHash: input.receiptResult.blockHash } : {}),
      ...(input.confirmations !== undefined ? { confirmations: input.confirmations } : {})
    },
    ...(input.receiptResult.receipt && typeof input.receiptResult.receipt === "object"
      ? {
          output: {
            receipt: input.receiptResult.receipt as Record<string, unknown>
          }
        }
      : {})
  }).result.assetTransferResult;
}

function buildSubmittedResult(input: {
  assetTransferPlan: AssetTransferPlanResultLike;
  txHash: Hash;
  chainId: number;
  submittedAt: string;
  updatedAt: string;
  attempt?: number;
}): AssetTransferResult {
  return createAssetTransferResult({
    assetTransferPlan: input.assetTransferPlan,
    status: "submitted",
    chainId: input.chainId,
    txHash: input.txHash,
    submittedAt: input.submittedAt,
    updatedAt: input.updatedAt,
    attempt: input.attempt
  }).result.assetTransferResult;
}

function normalizeReceiptBlockHash(receipt: unknown): Hex | undefined {
  if (!receipt || typeof receipt !== "object") {
    return undefined;
  }

  const candidate = (receipt as Record<string, unknown>).blockHash;
  return typeof candidate === "string" && isHex(candidate, { strict: true }) ? (candidate as Hex) : undefined;
}

async function executeFromPlan(input: {
  chainId: number;
  plan: AssetTransferPlanResultLike;
  prepareExecuteInput?: VaultExecuteBaseInput;
  controls: AssetTransferExecuteControls;
  execution?: AssetTransferExecutionAdapter;
}): Promise<{
  txRequest: {
    from: Address;
    to: Address;
    data: Hex;
    value: "0";
  };
  receiptStatus: AssetTransferExecuteReceiptStatus;
  assetTransferResult: AssetTransferResult;
}> {
  if (!input.prepareExecuteInput) {
    throw new AssetTransferExecuteError("Asset transfer execute requires executeContext.", {
      code: "MISSING_EXECUTE_INPUT",
      field: "executeContext"
    });
  }

  if (!input.execution) {
    throw new AssetTransferExecuteError("Asset transfer execute requires an execution adapter.", {
      code: "EXECUTION_ADAPTER_REQUIRED",
      field: "execution"
    });
  }

  const prepared = prepareExecuteTx(input.prepareExecuteInput);
  const txHash = await input.execution.sendTransaction({
    txRequest: prepared.result.txRequest
  });
  const submittedAt = input.controls.submittedAt ?? new Date().toISOString();
  const receiptResult = await input.execution.waitForTransactionReceipt({
    txHash,
    confirmations: input.controls.confirmations,
    timeoutMs: input.controls.receiptTimeoutMs,
    pollIntervalMs: input.controls.pollIntervalMs
  });
  const updatedAt = input.controls.updatedAt ?? new Date().toISOString();
  const normalizedReceiptResult = {
    ...receiptResult,
    ...(receiptResult.receipt && !receiptResult.blockHash
      ? { blockHash: normalizeReceiptBlockHash(receiptResult.receipt) }
      : {})
  };

  if (normalizedReceiptResult.status === "success") {
    return {
      txRequest: prepared.result.txRequest,
      receiptStatus: normalizedReceiptResult.status,
      assetTransferResult: buildConfirmedResult({
        assetTransferPlan: input.plan,
        txHash,
        chainId: input.chainId,
        confirmations: input.controls.confirmations,
        submittedAt,
        updatedAt,
        attempt: input.controls.attempt,
        receiptResult: normalizedReceiptResult
      })
    };
  }

  if (normalizedReceiptResult.status === "reverted") {
    return {
      txRequest: prepared.result.txRequest,
      receiptStatus: normalizedReceiptResult.status,
      assetTransferResult: buildFailedResult({
        assetTransferPlan: input.plan,
        txHash,
        chainId: input.chainId,
        submittedAt,
        updatedAt,
        attempt: input.controls.attempt,
        receiptResult: normalizedReceiptResult
      })
    };
  }

  return {
    txRequest: prepared.result.txRequest,
    receiptStatus: normalizedReceiptResult.status,
    assetTransferResult: buildSubmittedResult({
      assetTransferPlan: input.plan,
      txHash,
      chainId: input.chainId,
      submittedAt,
      updatedAt,
      attempt: input.controls.attempt
    })
  };
}

export async function executeAssetTransfer(
  input: AssetTransferExecuteInput,
  options?: {
    execution?: AssetTransferExecutionAdapter;
  }
): Promise<AssetTransferExecuteOutput> {
  const chainId = resolveChainId(input.chainId);
  const plan = await buildAssetTransferPlan(input);
  const executed = await executeFromPlan({
    chainId,
    plan: plan.result,
    prepareExecuteInput: plan.result.prepareExecuteInput,
    controls: input,
    execution: options?.execution
  });

  return {
    result: {
      action: plan.result.action,
      erc20Call: plan.result.erc20Call,
      humanReadableSummary: plan.result.humanReadableSummary,
      signRequest: plan.result.signRequest,
      txRequest: executed.txRequest,
      receiptStatus: executed.receiptStatus,
      assetTransferResult: executed.assetTransferResult
    }
  };
}

export async function executeAssetTransferFromAccountContext(
  input: AssetTransferExecuteFromContextInput,
  options?: {
    execution?: AssetTransferExecutionAdapter;
  }
): Promise<AssetTransferExecuteWithContextOutput> {
  const plan = await buildAssetTransferPlanFromAccountContext(input);
  const executed = await executeFromPlan({
    chainId: plan.result.accountContext.chainId,
    plan: plan.result,
    prepareExecuteInput: plan.result.prepareExecuteInput,
    controls: input,
    execution: options?.execution
  });

  return {
    result: {
      accountContext: plan.result.accountContext,
      action: plan.result.action,
      erc20Call: plan.result.erc20Call,
      humanReadableSummary: plan.result.humanReadableSummary,
      signRequest: plan.result.signRequest,
      ...(plan.result.policyCheck ? { policyCheck: plan.result.policyCheck } : {}),
      txRequest: executed.txRequest,
      receiptStatus: executed.receiptStatus,
      assetTransferResult: executed.assetTransferResult
    }
  };
}
