import * as sdk from "@erc-mandated/sdk";
import { createRuntimeExecutionAdapter, getRuntimeAccountFromEnv } from "./runtimeWalletAdapter.js";

export const BOOTSTRAP_PRIVATE_KEY_ENV = "ERC_MANDATED_BOOTSTRAP_PRIVATE_KEY";
export const ENABLE_BROADCAST_ENV = "ERC_MANDATED_ENABLE_BROADCAST";

export type RuntimeBootstrapErrorCode =
  | "BOOTSTRAP_BROADCAST_DISABLED"
  | "BOOTSTRAP_PRIVATE_KEY_NOT_CONFIGURED";

export class RuntimeBootstrapError extends sdk.ErcMandatedSdkError {
  readonly code: RuntimeBootstrapErrorCode;

  constructor(
    message: string,
    params: {
      code: RuntimeBootstrapErrorCode;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, {
      code: params.code,
      name: "RuntimeBootstrapError",
      details: params.details
    });
    this.code = params.code;
  }
}

export async function bootstrapVaultWithRuntime(
  input: sdk.VaultBootstrapInput
): Promise<sdk.VaultBootstrapOutput> {
  const account = getRuntimeAccountFromEnv([BOOTSTRAP_PRIVATE_KEY_ENV]);
  const chainId = sdk.getChainConfig(input.chainId).id;
  const signerAddress = input.signerAddress ?? account?.address;
  const broadcastEnabled = process.env[ENABLE_BROADCAST_ENV] === "1";

  if (input.mode === "execute" && !broadcastEnabled) {
    throw new RuntimeBootstrapError(
      `vault_bootstrap execute mode requires ${ENABLE_BROADCAST_ENV}=1.`,
      {
        code: "BOOTSTRAP_BROADCAST_DISABLED",
        details: {
          envKey: ENABLE_BROADCAST_ENV
        }
      }
    );
  }

  if (input.mode === "execute" && !account) {
    throw new RuntimeBootstrapError(
      `vault_bootstrap execute mode requires ${BOOTSTRAP_PRIVATE_KEY_ENV} to be configured server-side.`,
      {
        code: "BOOTSTRAP_PRIVATE_KEY_NOT_CONFIGURED",
        details: {
          envKey: BOOTSTRAP_PRIVATE_KEY_ENV
        }
      }
    );
  }

  const execution =
    input.mode === "execute" && broadcastEnabled && account
      ? createRuntimeExecutionAdapter(chainId, account)
      : undefined;

  return sdk.bootstrapVault(
    {
      ...input,
      ...(signerAddress ? { signerAddress } : {})
    },
    execution
      ? {
          execution
        }
      : undefined
  );
}
