import type { ToolError } from "../index.js";
import { toToolError, mapUnknownErrorToToolError } from "../errors.js";
import type { SdkAdapter } from "./sdkAdapter.js";

type JsonObject = Record<string, unknown>;

type JsonResult = {
  result?: unknown;
  error?: ToolError;
};

type ToolInput<T extends keyof SdkAdapter> = Parameters<SdkAdapter[T]>[0];

export async function handleToolCall(toolName: string, args: JsonObject, sdk: SdkAdapter): Promise<JsonResult> {
  try {
    switch (toolName) {
      case "vault_health_check": {
        const input = args as unknown as ToolInput<"healthCheckVault">;
        return (await sdk.healthCheckVault(input)) as unknown as JsonResult;
      }

      case "factory_predict_vault_address": {
        const input = args as unknown as ToolInput<"predictVaultAddress">;
        return (await sdk.predictVaultAddress(input)) as unknown as JsonResult;
      }

      case "factory_create_vault_prepare": {
        const input = args as unknown as ToolInput<"prepareCreateVaultTx">;
        return (await sdk.prepareCreateVaultTx(input)) as unknown as JsonResult;
      }

      case "mandate_build_sign_request": {
        const input = args as unknown as ToolInput<"buildMandateSignRequest">;
        return (await sdk.buildMandateSignRequest(input)) as unknown as JsonResult;
      }

      case "vault_simulate_execute": {
        const input = args as unknown as ToolInput<"simulateExecuteVault">;
        return (await sdk.simulateExecuteVault(input)) as unknown as JsonResult;
      }

      case "vault_execute_prepare": {
        const input = args as unknown as ToolInput<"prepareExecuteTx">;
        return (await sdk.prepareExecuteTx(input)) as unknown as JsonResult;
      }

      case "vault_check_nonce": {
        const input = args as unknown as ToolInput<"checkNonceUsed">;
        return (await sdk.checkNonceUsed(input)) as unknown as JsonResult;
      }

      case "mandate_check_revoked": {
        const input = args as unknown as ToolInput<"checkMandateRevoked">;
        return (await sdk.checkMandateRevoked(input)) as unknown as JsonResult;
      }

      case "vault_invalidate_nonce_prepare": {
        const input = args as unknown as ToolInput<"prepareInvalidateNonceTx">;
        return (await sdk.prepareInvalidateNonceTx(input)) as unknown as JsonResult;
      }

      case "vault_revoke_mandate_prepare": {
        const input = args as unknown as ToolInput<"prepareRevokeMandateTx">;
        return (await sdk.prepareRevokeMandateTx(input)) as unknown as JsonResult;
      }

      default:
        return {
          error: toToolError("NOT_IMPLEMENTED", `${toolName} is not implemented yet`, {
            tool: toolName
          })
        };
    }
  } catch (error: unknown) {
    return {
      error: mapUnknownErrorToToolError(error)
    };
  }
}
