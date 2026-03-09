import { isAddress, type Address } from "viem";

import { ErcMandatedSdkError } from "./errors.js";
import { toBigint } from "./shared.js";

export type FundingPolicyErrorCode =
  | "INVALID_POLICY_ID"
  | "INVALID_TOKEN_ADDRESS"
  | "INVALID_RECIPIENT_ADDRESS"
  | "INVALID_WINDOW_SECONDS"
  | "INVALID_EXPIRES_AT"
  | "TOKEN_NOT_ALLOWED"
  | "RECIPIENT_NOT_ALLOWED"
  | "AMOUNT_EXCEEDS_PER_TX"
  | "AMOUNT_EXCEEDS_WINDOW"
  | "POLICY_EXPIRED";

export class FundingPolicyError extends ErcMandatedSdkError {
  readonly code: FundingPolicyErrorCode;
  readonly field:
    | "policyId"
    | "allowedTokenAddresses"
    | "allowedRecipients"
    | "windowSeconds"
    | "expiresAt"
    | "tokenAddress"
    | "to"
    | "amountRaw"
    | "currentSpentInWindow"
    | "now";

  constructor(
    message: string,
    params: {
      code: FundingPolicyErrorCode;
      field:
        | "policyId"
        | "allowedTokenAddresses"
        | "allowedRecipients"
        | "windowSeconds"
        | "expiresAt"
        | "tokenAddress"
        | "to"
        | "amountRaw"
        | "currentSpentInWindow"
        | "now";
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "FundingPolicyError",
      details: {
        field: params.field,
        ...params.details
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

export class FundingPolicyViolationError extends ErcMandatedSdkError {
  readonly violations: CheckAssetTransferAgainstFundingPolicyOutput["result"]["violations"];

  constructor(violations: CheckAssetTransferAgainstFundingPolicyOutput["result"]["violations"]) {
    super("Funding policy rejected asset transfer.", {
      code: "FUNDING_POLICY_VIOLATION",
      name: "FundingPolicyViolationError",
      details: {
        violations
      }
    });
    this.violations = violations;
  }
}

export interface AgentFundingPolicy {
  policyId: string;
  allowedTokenAddresses?: Address[];
  allowedRecipients?: Address[];
  maxAmountPerTx?: string;
  maxAmountPerWindow?: string;
  windowSeconds?: number;
  expiresAt?: string;
  repeatable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentFundingPolicyInput {
  policyId: string;
  allowedTokenAddresses?: Address[];
  allowedRecipients?: Address[];
  maxAmountPerTx?: string;
  maxAmountPerWindow?: string;
  windowSeconds?: number;
  expiresAt?: string;
  repeatable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAgentFundingPolicyOutput {
  result: {
    fundingPolicy: AgentFundingPolicy;
  };
}

export interface CheckAssetTransferAgainstFundingPolicyInput {
  fundingPolicy: AgentFundingPolicy;
  tokenAddress: Address;
  to: Address;
  amountRaw: string;
  now?: string;
  currentSpentInWindow?: string;
}

export interface CheckAssetTransferAgainstFundingPolicyOutput {
  result: {
    allowed: boolean;
    fundingPolicy: AgentFundingPolicy;
    violations: Array<{
      code: FundingPolicyErrorCode;
      field: string;
      message: string;
    }>;
  };
}

function validatePolicyId(policyId: string): void {
  if (typeof policyId === "string" && policyId.trim().length > 0) {
    return;
  }

  throw new FundingPolicyError("Invalid policyId: expected non-empty string.", {
    code: "INVALID_POLICY_ID",
    field: "policyId"
  });
}

function validateAddressList(
  values: Address[] | undefined,
  field: "allowedTokenAddresses" | "allowedRecipients"
): void {
  if (!values) {
    return;
  }

  for (const value of values) {
    if (!isAddress(value)) {
      throw new FundingPolicyError(`Invalid address in ${field}.`, {
        code: field === "allowedTokenAddresses" ? "INVALID_TOKEN_ADDRESS" : "INVALID_RECIPIENT_ADDRESS",
        field,
        details: {
          value
        }
      });
    }
  }
}

function validateExpiresAt(expiresAt: string | undefined): void {
  if (expiresAt === undefined) {
    return;
  }

  if (Number.isNaN(Date.parse(expiresAt))) {
    throw new FundingPolicyError("Invalid expiresAt: expected ISO datetime string.", {
      code: "INVALID_EXPIRES_AT",
      field: "expiresAt",
      details: {
        expiresAt
      }
    });
  }
}

function validateWindowSeconds(windowSeconds: number | undefined): void {
  if (windowSeconds === undefined) {
    return;
  }

  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new FundingPolicyError("Invalid windowSeconds: expected positive integer.", {
      code: "INVALID_WINDOW_SECONDS",
      field: "windowSeconds",
      details: {
        windowSeconds
      }
    });
  }
}

export function createAgentFundingPolicy(
  input: CreateAgentFundingPolicyInput
): CreateAgentFundingPolicyOutput {
  validatePolicyId(input.policyId);
  validateAddressList(input.allowedTokenAddresses, "allowedTokenAddresses");
  validateAddressList(input.allowedRecipients, "allowedRecipients");
  validateWindowSeconds(input.windowSeconds);
  validateExpiresAt(input.expiresAt);

  if (input.maxAmountPerTx !== undefined) {
    toBigint(input.maxAmountPerTx, "maxAmountPerTx");
  }

  if (input.maxAmountPerWindow !== undefined) {
    toBigint(input.maxAmountPerWindow, "maxAmountPerWindow");
  }

  const nowIso = new Date().toISOString();

  return {
    result: {
      fundingPolicy: {
        policyId: input.policyId,
        ...(input.allowedTokenAddresses ? { allowedTokenAddresses: input.allowedTokenAddresses } : {}),
        ...(input.allowedRecipients ? { allowedRecipients: input.allowedRecipients } : {}),
        ...(input.maxAmountPerTx ? { maxAmountPerTx: input.maxAmountPerTx } : {}),
        ...(input.maxAmountPerWindow ? { maxAmountPerWindow: input.maxAmountPerWindow } : {}),
        ...(input.windowSeconds !== undefined ? { windowSeconds: input.windowSeconds } : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        ...(input.repeatable !== undefined ? { repeatable: input.repeatable } : {}),
        createdAt: input.createdAt ?? nowIso,
        updatedAt: input.updatedAt ?? input.createdAt ?? nowIso
      }
    }
  };
}

export function checkAssetTransferAgainstFundingPolicy(
  input: CheckAssetTransferAgainstFundingPolicyInput
): CheckAssetTransferAgainstFundingPolicyOutput {
  const fundingPolicy = createAgentFundingPolicy(input.fundingPolicy).result.fundingPolicy;

  if (!isAddress(input.tokenAddress)) {
    throw new FundingPolicyError("Invalid tokenAddress.", {
      code: "INVALID_TOKEN_ADDRESS",
      field: "tokenAddress",
      details: { tokenAddress: input.tokenAddress }
    });
  }

  if (!isAddress(input.to)) {
    throw new FundingPolicyError("Invalid recipient address.", {
      code: "INVALID_RECIPIENT_ADDRESS",
      field: "to",
      details: { to: input.to }
    });
  }

  const amountRaw = toBigint(input.amountRaw, "amountRaw");
  const currentSpentInWindow = input.currentSpentInWindow
    ? toBigint(input.currentSpentInWindow, "currentSpentInWindow")
    : 0n;

  const violations: CheckAssetTransferAgainstFundingPolicyOutput["result"]["violations"] = [];

  if (
    fundingPolicy.allowedTokenAddresses &&
    fundingPolicy.allowedTokenAddresses.length > 0 &&
    !fundingPolicy.allowedTokenAddresses.includes(input.tokenAddress)
  ) {
    violations.push({
      code: "TOKEN_NOT_ALLOWED",
      field: "tokenAddress",
      message: "Token address is not allowed by funding policy."
    });
  }

  if (
    fundingPolicy.allowedRecipients &&
    fundingPolicy.allowedRecipients.length > 0 &&
    !fundingPolicy.allowedRecipients.includes(input.to)
  ) {
    violations.push({
      code: "RECIPIENT_NOT_ALLOWED",
      field: "to",
      message: "Recipient address is not allowed by funding policy."
    });
  }

  if (fundingPolicy.maxAmountPerTx !== undefined && amountRaw > toBigint(fundingPolicy.maxAmountPerTx, "maxAmountPerTx")) {
    violations.push({
      code: "AMOUNT_EXCEEDS_PER_TX",
      field: "amountRaw",
      message: "Transfer amount exceeds maxAmountPerTx."
    });
  }

  if (fundingPolicy.maxAmountPerWindow !== undefined) {
    const maxAmountPerWindow = toBigint(fundingPolicy.maxAmountPerWindow, "maxAmountPerWindow");
    if (currentSpentInWindow + amountRaw > maxAmountPerWindow) {
      violations.push({
        code: "AMOUNT_EXCEEDS_WINDOW",
        field: "currentSpentInWindow",
        message: "Transfer amount exceeds remaining window allowance."
      });
    }
  }

  if (fundingPolicy.expiresAt) {
    const now = input.now ?? new Date().toISOString();
    const nowMs = Date.parse(now);
    if (Number.isNaN(nowMs)) {
      throw new FundingPolicyError("Invalid now: expected ISO datetime string.", {
        code: "INVALID_EXPIRES_AT",
        field: "now",
        details: { now }
      });
    }

    if (nowMs > Date.parse(fundingPolicy.expiresAt)) {
      violations.push({
        code: "POLICY_EXPIRED",
        field: "expiresAt",
        message: "Funding policy has expired."
      });
    }
  }

  return {
    result: {
      allowed: violations.length === 0,
      fundingPolicy,
      violations
    }
  };
}
