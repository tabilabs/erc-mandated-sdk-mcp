import { isAddressEqual } from "viem";

import * as sdk from "@erc-mandated/sdk";

import { BOOTSTRAP_PRIVATE_KEY_ENV, ENABLE_BROADCAST_ENV } from "./runtimeBootstrap.js";
import { createRuntimeExecutionAdapter, getRuntimeAccountFromEnv } from "./runtimeWalletAdapter.js";

export const EXECUTOR_PRIVATE_KEY_ENV = "ERC_MANDATED_EXECUTOR_PRIVATE_KEY";

export type RuntimeAssetTransferErrorCode =
  | "EXECUTION_BROADCAST_DISABLED"
  | "EXECUTOR_PRIVATE_KEY_NOT_CONFIGURED"
  | "EXECUTION_FROM_ADDRESS_MISMATCH";

export class RuntimeAssetTransferError extends sdk.ErcMandatedSdkError {
  readonly code: RuntimeAssetTransferErrorCode;

  constructor(
    message: string,
    params: {
      code: RuntimeAssetTransferErrorCode;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "RuntimeAssetTransferError",
      details: params.details
    });
    this.code = params.code;
  }
}

const EXECUTION_PRIVATE_KEY_ENV_CANDIDATES = [EXECUTOR_PRIVATE_KEY_ENV, BOOTSTRAP_PRIVATE_KEY_ENV] as const;

function ensureRuntimeExecutionEnabled() {
  if (process.env[ENABLE_BROADCAST_ENV] === "1") {
    return;
  }

  throw new RuntimeAssetTransferError(
    `asset transfer execute mode requires ${ENABLE_BROADCAST_ENV}=1.`,
    {
      code: "EXECUTION_BROADCAST_DISABLED",
      details: {
        envKey: ENABLE_BROADCAST_ENV
      }
    }
  );
}

function getExecutorAccount() {
  const account = getRuntimeAccountFromEnv(EXECUTION_PRIVATE_KEY_ENV_CANDIDATES);

  if (account) {
    return account;
  }

  throw new RuntimeAssetTransferError(
    `asset transfer execute requires one of ${EXECUTION_PRIVATE_KEY_ENV_CANDIDATES.join(
      ", "
    )} to be configured server-side.`,
    {
      code: "EXECUTOR_PRIVATE_KEY_NOT_CONFIGURED",
      details: {
        envKeys: [...EXECUTION_PRIVATE_KEY_ENV_CANDIDATES]
      }
    }
  );
}

function assertRuntimeFromMatchesSigner(input: {
  requestedFrom: `0x${string}` | undefined;
  expectedFrom: `0x${string}`;
  signerAddress: `0x${string}`;
}): `0x${string}` {
  const effectiveFrom = input.requestedFrom ?? input.expectedFrom;

  if (!isAddressEqual(effectiveFrom, input.expectedFrom) || !isAddressEqual(effectiveFrom, input.signerAddress)) {
    throw new RuntimeAssetTransferError(
      "Asset transfer execute runtime signer must match the executor/from address.",
      {
        code: "EXECUTION_FROM_ADDRESS_MISMATCH",
        details: {
          expectedFrom: input.expectedFrom,
          requestedFrom: input.requestedFrom,
          signerAddress: input.signerAddress
        }
      }
    );
  }

  return effectiveFrom;
}

export async function executeAssetTransferWithRuntime(
  input: sdk.AssetTransferExecuteInput
): Promise<sdk.AssetTransferExecuteOutput> {
  ensureRuntimeExecutionEnabled();
  const account = getExecutorAccount();
  const effectiveFrom = assertRuntimeFromMatchesSigner({
    requestedFrom: input.executeContext.from,
    expectedFrom: input.executor,
    signerAddress: account.address
  });
  const chainId = sdk.getChainConfig(input.chainId).id;

  return sdk.executeAssetTransfer(
    {
      ...input,
      executeContext: {
        ...input.executeContext,
        from: effectiveFrom
      }
    },
    {
      execution: createRuntimeExecutionAdapter(chainId, account)
    }
  );
}

export async function executeAssetTransferFromAccountContextWithRuntime(
  input: sdk.AssetTransferExecuteFromContextInput
): Promise<sdk.AssetTransferExecuteWithContextOutput> {
  ensureRuntimeExecutionEnabled();
  const account = getExecutorAccount();
  const effectiveFrom = assertRuntimeFromMatchesSigner({
    requestedFrom: input.executeContext.from,
    expectedFrom: input.accountContext.executor,
    signerAddress: account.address
  });
  const chainId = sdk.getChainConfig(input.accountContext.chainId).id;

  return sdk.executeAssetTransferFromAccountContext(
    {
      ...input,
      executeContext: {
        ...input.executeContext,
        from: effectiveFrom
      }
    },
    {
      execution: createRuntimeExecutionAdapter(chainId, account)
    }
  );
}
