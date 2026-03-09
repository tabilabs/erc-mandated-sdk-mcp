import { isAddress, type Address, type Hex } from "viem";

import { type AssetTransferPlanInput, type AssetTransferPlanOutput, buildAssetTransferPlan } from "./assetTransfer.js";
import { ErcMandatedSdkError } from "./errors.js";
import { resolveChainId } from "./shared.js";
import type { MandatePayloadBinding } from "./mandate.js";
import {
  type AgentFundingPolicy,
  type CheckAssetTransferAgainstFundingPolicyOutput,
  checkAssetTransferAgainstFundingPolicy,
  FundingPolicyViolationError
} from "./fundingPolicy.js";

export type AgentAccountContextErrorCode =
  | "INVALID_AGENT_ID"
  | "INVALID_VAULT_ADDRESS"
  | "INVALID_AUTHORITY_ADDRESS"
  | "INVALID_EXECUTOR_ADDRESS"
  | "MISSING_CONTEXT_DEFAULT";

export class AgentAccountContextError extends ErcMandatedSdkError {
  readonly code: AgentAccountContextErrorCode;
  readonly field:
    | "agentId"
    | "vault"
    | "authority"
    | "executor"
    | "allowedAdaptersRoot"
    | "maxDrawdownBps"
    | "maxCumulativeDrawdownBps";

  constructor(
    message: string,
    params: {
      code: AgentAccountContextErrorCode;
      field:
        | "agentId"
        | "vault"
        | "authority"
        | "executor"
        | "allowedAdaptersRoot"
        | "maxDrawdownBps"
        | "maxCumulativeDrawdownBps";
      value?: unknown;
    }
  ) {
    super(message, {
      code: params.code,
      name: "AgentAccountContextError",
      details: {
        field: params.field,
        value: params.value
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

export interface AgentAccountContext {
  agentId: string;
  chainId: number;
  vault: Address;
  authority: Address;
  executor: Address;
  assetRegistryRef?: string;
  fundingPolicyRef?: string;
  defaults?: {
    allowedAdaptersRoot?: Hex;
    maxDrawdownBps?: string;
    maxCumulativeDrawdownBps?: string;
    payloadBinding?: MandatePayloadBinding;
    extensions?: Hex;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentAccountContextInput {
  agentId: string;
  chainId?: number;
  vault: Address;
  authority: Address;
  executor: Address;
  assetRegistryRef?: string;
  fundingPolicyRef?: string;
  defaults?: AgentAccountContext["defaults"];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAgentAccountContextOutput {
  result: {
    accountContext: AgentAccountContext;
  };
}

export interface AssetTransferPlanFromContextInput {
  accountContext: AgentAccountContext;
  fundingPolicy?: AgentFundingPolicy;
  tokenAddress: Address;
  to: Address;
  amountRaw: string;
  nonce: string;
  deadline: string;
  authorityEpoch: string;
  allowedAdaptersRoot?: Hex;
  maxDrawdownBps?: string;
  maxCumulativeDrawdownBps?: string;
  payloadBinding?: MandatePayloadBinding;
  extensions?: Hex;
  symbol?: string;
  decimals?: number;
  policyEvaluation?: {
    now?: string;
    currentSpentInWindow?: string;
  };
  executeContext?: AssetTransferPlanInput["executeContext"];
}

export interface AssetTransferPlanFromContextOutput extends AssetTransferPlanOutput {
  result: AssetTransferPlanOutput["result"] & {
    accountContext: AgentAccountContext;
    policyCheck?: CheckAssetTransferAgainstFundingPolicyOutput["result"];
  };
}

function validateAgentId(agentId: string): void {
  if (typeof agentId === "string" && agentId.trim().length > 0) {
    return;
  }

  throw new AgentAccountContextError("Invalid agentId: expected non-empty string.", {
    code: "INVALID_AGENT_ID",
    field: "agentId",
    value: agentId
  });
}

function validateAddress(value: Address, field: "vault" | "authority" | "executor"): void {
  if (isAddress(value)) {
    return;
  }

  const codeByField = {
    vault: "INVALID_VAULT_ADDRESS",
    authority: "INVALID_AUTHORITY_ADDRESS",
    executor: "INVALID_EXECUTOR_ADDRESS"
  } as const;

  throw new AgentAccountContextError(`Invalid ${field} address provided in input.${field}.`, {
    code: codeByField[field],
    field,
    value
  });
}

function requireContextDefault(
  value: string | undefined,
  field: "allowedAdaptersRoot" | "maxDrawdownBps" | "maxCumulativeDrawdownBps"
): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new AgentAccountContextError(`Missing required account context default: ${field}.`, {
    code: "MISSING_CONTEXT_DEFAULT",
    field,
    value
  });
}

export function createAgentAccountContext(
  input: CreateAgentAccountContextInput
): CreateAgentAccountContextOutput {
  validateAgentId(input.agentId);
  validateAddress(input.vault, "vault");
  validateAddress(input.authority, "authority");
  validateAddress(input.executor, "executor");

  const nowIso = new Date().toISOString();

  return {
    result: {
      accountContext: {
        agentId: input.agentId,
        chainId: resolveChainId(input.chainId),
        vault: input.vault,
        authority: input.authority,
        executor: input.executor,
        ...(input.assetRegistryRef ? { assetRegistryRef: input.assetRegistryRef } : {}),
        ...(input.fundingPolicyRef ? { fundingPolicyRef: input.fundingPolicyRef } : {}),
        ...(input.defaults ? { defaults: input.defaults } : {}),
        createdAt: input.createdAt ?? nowIso,
        updatedAt: input.updatedAt ?? input.createdAt ?? nowIso
      }
    }
  };
}

export async function buildAssetTransferPlanFromAccountContext(
  input: AssetTransferPlanFromContextInput
): Promise<AssetTransferPlanFromContextOutput> {
  const context = createAgentAccountContext(input.accountContext).result.accountContext;

  const allowedAdaptersRoot =
    input.allowedAdaptersRoot ??
    (requireContextDefault(context.defaults?.allowedAdaptersRoot, "allowedAdaptersRoot") as Hex);
  const maxDrawdownBps =
    input.maxDrawdownBps ?? requireContextDefault(context.defaults?.maxDrawdownBps, "maxDrawdownBps");
  const maxCumulativeDrawdownBps =
    input.maxCumulativeDrawdownBps ??
    requireContextDefault(context.defaults?.maxCumulativeDrawdownBps, "maxCumulativeDrawdownBps");

  const policyCheck = input.fundingPolicy
    ? checkAssetTransferAgainstFundingPolicy({
        fundingPolicy: input.fundingPolicy,
        tokenAddress: input.tokenAddress,
        to: input.to,
        amountRaw: input.amountRaw,
        now: input.policyEvaluation?.now,
        currentSpentInWindow: input.policyEvaluation?.currentSpentInWindow
      }).result
    : undefined;

  if (policyCheck && !policyCheck.allowed) {
    throw new FundingPolicyViolationError(policyCheck.violations);
  }

  const plan = await buildAssetTransferPlan({
    chainId: context.chainId,
    vault: context.vault,
    executor: context.executor,
    tokenAddress: input.tokenAddress,
    to: input.to,
    amountRaw: input.amountRaw,
    nonce: input.nonce,
    deadline: input.deadline,
    authorityEpoch: input.authorityEpoch,
    allowedAdaptersRoot,
    maxDrawdownBps,
    maxCumulativeDrawdownBps,
    payloadBinding: input.payloadBinding ?? context.defaults?.payloadBinding,
    extensions: input.extensions ?? context.defaults?.extensions,
    symbol: input.symbol,
    decimals: input.decimals,
    executeContext: input.executeContext
  });

  return {
    result: {
      ...plan.result,
      accountContext: context,
      ...(policyCheck ? { policyCheck } : {})
    }
  };
}
