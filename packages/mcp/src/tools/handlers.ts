import type { Address, Hex } from "viem";

import type { ToolError } from "../index.js";
import { toToolError, mapUnknownErrorToToolError } from "../errors.js";
import type { SdkAdapter } from "./sdkAdapter.js";

type JsonObject = Record<string, unknown>;

type JsonResult = {
  result?: unknown;
  error?: ToolError;
};

export async function handleToolCall(toolName: string, args: JsonObject, sdk: SdkAdapter): Promise<JsonResult> {
  try {
    switch (toolName) {
      case "vault_health_check": {
        const input = args as unknown as {
          chainId?: number;
          vault: Address;
          blockTag?: string;
        };
        return (await sdk.healthCheckVault(input)) as unknown as JsonResult;
      }

      case "factory_predict_vault_address": {
        const input = args as unknown as {
          chainId?: number;
          factory?: Address;
          asset: Address;
          name: string;
          symbol: string;
          authority: Address;
          salt: Hex;
        };
        return (await sdk.predictVaultAddress(input)) as unknown as JsonResult;
      }

      case "factory_create_vault_prepare": {
        const input = args as unknown as {
          chainId?: number;
          factory?: Address;
          from: Address;
          asset: Address;
          name: string;
          symbol: string;
          authority: Address;
          salt: Hex;
        };
        return (await sdk.prepareCreateVaultTx(input)) as unknown as JsonResult;
      }

      case "mandate_build_sign_request": {
        // Complex nested input type - Ajv already validated against schema
        return (await sdk.buildMandateSignRequest(args as any)) as unknown as JsonResult;
      }

      case "vault_simulate_execute": {
        // Complex nested input type - Ajv already validated against schema
        return (await sdk.simulateExecuteVault(args as any)) as unknown as JsonResult;
      }

      case "vault_execute_prepare": {
        // Complex nested input type - Ajv already validated against schema
        return (await sdk.prepareExecuteTx(args as any)) as unknown as JsonResult;
      }

      case "vault_check_nonce": {
        return (await sdk.checkNonceUsed(args as any)) as unknown as JsonResult;
      }

      case "mandate_check_revoked": {
        return (await sdk.checkMandateRevoked(args as any)) as unknown as JsonResult;
      }

      case "vault_invalidate_nonce_prepare": {
        return (await sdk.prepareInvalidateNonceTx(args as any)) as unknown as JsonResult;
      }

      case "vault_revoke_mandate_prepare": {
        return (await sdk.prepareRevokeMandateTx(args as any)) as unknown as JsonResult;
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
