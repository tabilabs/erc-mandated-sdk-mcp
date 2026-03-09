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

export type FollowUpActionErrorCode =
  | "INVALID_FOLLOW_UP_KIND"
  | "INVALID_FOLLOW_UP_TARGET"
  | "MISSING_FOLLOW_UP_PAYLOAD"
  | "INVALID_MARKET_ID"
  | "INVALID_COLLATERAL_TOKEN_ADDRESS"
  | "FOLLOW_UP_ASSET_MISMATCH"
  | "FOLLOW_UP_REQUIRED_BALANCE_TOO_LOW";

export class FollowUpActionError extends ErcMandatedSdkError {
  readonly code: FollowUpActionErrorCode;
  readonly field:
    | "followUpAction.kind"
    | "followUpAction.target"
    | "followUpAction.payload"
    | "followUpAction.payload.marketId"
    | "followUpAction.payload.collateralTokenAddress"
    | "followUpAction.payload.collateralAmountRaw"
    | "fundingTarget.tokenAddress"
    | "fundingTarget.requiredAmountRaw";

  constructor(
    message: string,
    params: {
      code: FollowUpActionErrorCode;
      field:
        | "followUpAction.kind"
        | "followUpAction.target"
        | "followUpAction.payload"
        | "followUpAction.payload.marketId"
        | "followUpAction.payload.collateralTokenAddress"
        | "followUpAction.payload.collateralAmountRaw"
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
