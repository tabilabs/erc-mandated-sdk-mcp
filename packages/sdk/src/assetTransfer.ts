import { encodeFunctionData, isAddress, parseAbi, type Address, type Hex } from "viem";

import type { ExecuteAction, VaultExecuteBaseInput } from "./execute.js";
import type { MandateBuildSignRequestInput, MandateBuildSignRequestOutput, MandatePayloadBinding } from "./mandate.js";
import { buildMandateSignRequest } from "./mandate.js";
import { ErcMandatedSdkError } from "./errors.js";
import { toBigint } from "./shared.js";

const erc20TransferAbi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

export type AssetTransferPlanErrorCode =
  | "INVALID_TOKEN_ADDRESS"
  | "INVALID_RECIPIENT_ADDRESS"
  | "INVALID_DECIMALS";

export class AssetTransferPlanError extends ErcMandatedSdkError {
  readonly code: AssetTransferPlanErrorCode;
  readonly field: "tokenAddress" | "to" | "decimals";

  constructor(
    message: string,
    params: {
      code: AssetTransferPlanErrorCode;
      field: "tokenAddress" | "to" | "decimals";
      value?: string | number;
    }
  ) {
    super(message, {
      code: params.code,
      name: "AssetTransferPlanError",
      details: {
        field: params.field,
        value: params.value
      }
    });
    this.code = params.code;
    this.field = params.field;
  }
}

export interface Erc20TransferActionInput {
  tokenAddress: Address;
  to: Address;
  amountRaw: string;
}

export interface Erc20TransferActionOutput {
  result: {
    action: ExecuteAction;
    erc20Call: {
      to: Address;
      data: Hex;
      value: "0";
    };
  };
}

export interface AssetTransferPlanInput {
  chainId?: number;
  vault: Address;
  executor: Address;
  tokenAddress: Address;
  to: Address;
  amountRaw: string;
  nonce: string;
  deadline: string;
  authorityEpoch: string;
  allowedAdaptersRoot: Hex;
  maxDrawdownBps: string;
  maxCumulativeDrawdownBps: string;
  payloadBinding?: MandatePayloadBinding;
  extensions?: Hex;
  symbol?: string;
  decimals?: number;
  executeContext?: {
    from?: Address;
    signature: Hex;
    adapterProofs: Hex[][];
  };
}

export interface AssetTransferPlanOutput {
  result: {
    action: ExecuteAction;
    erc20Call: {
      to: Address;
      data: Hex;
      value: "0";
    };
    humanReadableSummary: {
      kind: "erc20Transfer";
      tokenAddress: Address;
      to: Address;
      amountRaw: string;
      symbol?: string;
      decimals?: number;
    };
    signRequest: MandateBuildSignRequestOutput["result"];
    simulateExecuteInput?: VaultExecuteBaseInput;
    prepareExecuteInput?: VaultExecuteBaseInput;
  };
}

function validateAddress(value: Address, field: "tokenAddress" | "to"): void {
  if (isAddress(value)) {
    return;
  }

  throw new AssetTransferPlanError(`Invalid ${field} address provided in input.${field}.`, {
    code: field === "tokenAddress" ? "INVALID_TOKEN_ADDRESS" : "INVALID_RECIPIENT_ADDRESS",
    field,
    value
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

export function buildErc20TransferAction(input: Erc20TransferActionInput): Erc20TransferActionOutput {
  validateAddress(input.tokenAddress, "tokenAddress");
  validateAddress(input.to, "to");

  const amount = toBigint(input.amountRaw, "amountRaw");

  const data = encodeFunctionData({
    abi: erc20TransferAbi,
    functionName: "transfer",
    args: [input.to, amount]
  });

  return {
    result: {
      action: {
        adapter: input.tokenAddress,
        value: "0",
        data
      },
      erc20Call: {
        to: input.tokenAddress,
        data,
        value: "0"
      }
    }
  };
}

export async function buildAssetTransferPlan(input: AssetTransferPlanInput): Promise<AssetTransferPlanOutput> {
  validateDecimals(input.decimals);

  const actionResult = buildErc20TransferAction({
    tokenAddress: input.tokenAddress,
    to: input.to,
    amountRaw: input.amountRaw
  });

  const extensions = input.extensions ?? ("0x" as Hex);

  const mandateBuildInput: MandateBuildSignRequestInput = {
    chainId: input.chainId,
    vault: input.vault,
    executor: input.executor,
    nonce: input.nonce,
    deadline: input.deadline,
    authorityEpoch: input.authorityEpoch,
    allowedAdaptersRoot: input.allowedAdaptersRoot,
    maxDrawdownBps: input.maxDrawdownBps,
    maxCumulativeDrawdownBps: input.maxCumulativeDrawdownBps,
    payloadBinding: input.payloadBinding,
    actions: [actionResult.result.action],
    extensions
  };

  const signRequest = await buildMandateSignRequest(mandateBuildInput);

  const executeInput: VaultExecuteBaseInput | undefined = input.executeContext
    ? {
        chainId: input.chainId,
        vault: input.vault,
        from: input.executeContext.from ?? input.executor,
        mandate: signRequest.result.mandate,
        signature: input.executeContext.signature,
        actions: [actionResult.result.action],
        adapterProofs: input.executeContext.adapterProofs,
        extensions
      }
    : undefined;

  return {
    result: {
      action: actionResult.result.action,
      erc20Call: actionResult.result.erc20Call,
      humanReadableSummary: {
        kind: "erc20Transfer",
        tokenAddress: input.tokenAddress,
        to: input.to,
        amountRaw: input.amountRaw,
        ...(input.symbol ? { symbol: input.symbol } : {}),
        ...(input.decimals !== undefined ? { decimals: input.decimals } : {})
      },
      signRequest: signRequest.result,
      ...(executeInput ? { simulateExecuteInput: executeInput, prepareExecuteInput: executeInput } : {})
    }
  };
}
