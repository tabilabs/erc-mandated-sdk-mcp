import type { ToolError } from "../index.js";
import { toToolError, mapUnknownErrorToToolError } from "../errors.js";
import type { SdkAdapter } from "./sdkAdapter.js";

type JsonObject = Record<string, unknown>;

type JsonResult = {
  result?: unknown;
  error?: ToolError;
};

type ToolInput<T extends keyof SdkAdapter> = Parameters<SdkAdapter[T]>[0];

type AssetTransferExecuteArgs = ToolInput<"buildAssetTransferPlan"> & {
  from?: string;
  signature: string;
  adapterProofs: string[][];
};

type AssetTransferFromContextExecuteArgs = ToolInput<"buildAssetTransferPlanFromAccountContext"> & {
  from?: string;
  signature: string;
  adapterProofs: string[][];
};

export async function handleToolCall(toolName: string, args: JsonObject, sdk: SdkAdapter): Promise<JsonResult> {
  try {
    switch (toolName) {
      case "agent_account_context_create": {
        const input = args as unknown as ToolInput<"createAgentAccountContext">;
        return (await sdk.createAgentAccountContext(input)) as unknown as JsonResult;
      }

      case "agent_funding_policy_create": {
        const input = args as unknown as ToolInput<"createAgentFundingPolicy">;
        return (await sdk.createAgentFundingPolicy(input)) as unknown as JsonResult;
      }

      case "agent_build_fund_and_action_plan": {
        const input = args as unknown as ToolInput<"buildFundAndActionPlan">;
        return (await sdk.buildFundAndActionPlan(input)) as unknown as JsonResult;
      }

      case "vault_check_asset_transfer_policy": {
        const input = args as unknown as ToolInput<"checkAssetTransferAgainstFundingPolicy">;
        return (await sdk.checkAssetTransferAgainstFundingPolicy(input)) as unknown as JsonResult;
      }

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

      case "vault_build_asset_transfer_plan": {
        const input = args as unknown as ToolInput<"buildAssetTransferPlan">;
        return (await sdk.buildAssetTransferPlan(input)) as unknown as JsonResult;
      }

      case "vault_build_asset_transfer_plan_from_context": {
        const input = args as unknown as ToolInput<"buildAssetTransferPlanFromAccountContext">;
        return (await sdk.buildAssetTransferPlanFromAccountContext(input)) as unknown as JsonResult;
      }

      case "vault_simulate_asset_transfer": {
        const input = args as unknown as AssetTransferExecuteArgs;
        const plan = await sdk.buildAssetTransferPlan({
          ...input,
          executeContext: {
            from: input.from as `0x${string}` | undefined,
            signature: input.signature as `0x${string}`,
            adapterProofs: input.adapterProofs as `0x${string}`[][]
          }
        });

        if (!plan.result.simulateExecuteInput) {
          return {
            error: toToolError("INTERNAL_PLAN_ERROR", "Asset transfer plan did not produce simulate input.", {
              tool: toolName
            })
          };
        }

        const simulation = await sdk.simulateExecuteVault(plan.result.simulateExecuteInput);

        return {
          result: {
            action: plan.result.action,
            erc20Call: plan.result.erc20Call,
            humanReadableSummary: plan.result.humanReadableSummary,
            signRequest: plan.result.signRequest,
            simulate: simulation.result
          }
        };
      }

      case "vault_simulate_asset_transfer_from_context": {
        const input = args as unknown as AssetTransferFromContextExecuteArgs;
        const plan = await sdk.buildAssetTransferPlanFromAccountContext({
          ...input,
          executeContext: {
            from: input.from as `0x${string}` | undefined,
            signature: input.signature as `0x${string}`,
            adapterProofs: input.adapterProofs as `0x${string}`[][]
          }
        });

        if (!plan.result.simulateExecuteInput) {
          return {
            error: toToolError("INTERNAL_PLAN_ERROR", "Asset transfer plan did not produce simulate input.", {
              tool: toolName
            })
          };
        }

        const simulation = await sdk.simulateExecuteVault(plan.result.simulateExecuteInput);

        return {
          result: {
            accountContext: plan.result.accountContext,
            action: plan.result.action,
            erc20Call: plan.result.erc20Call,
            humanReadableSummary: plan.result.humanReadableSummary,
            signRequest: plan.result.signRequest,
            simulate: simulation.result
          }
        };
      }

      case "vault_prepare_asset_transfer": {
        const input = args as unknown as AssetTransferExecuteArgs;
        const plan = await sdk.buildAssetTransferPlan({
          ...input,
          executeContext: {
            from: input.from as `0x${string}` | undefined,
            signature: input.signature as `0x${string}`,
            adapterProofs: input.adapterProofs as `0x${string}`[][]
          }
        });

        if (!plan.result.prepareExecuteInput) {
          return {
            error: toToolError("INTERNAL_PLAN_ERROR", "Asset transfer plan did not produce prepare input.", {
              tool: toolName
            })
          };
        }

        const prepared = await sdk.prepareExecuteTx(plan.result.prepareExecuteInput);

        return {
          result: {
            action: plan.result.action,
            erc20Call: plan.result.erc20Call,
            humanReadableSummary: plan.result.humanReadableSummary,
            signRequest: plan.result.signRequest,
            txRequest: prepared.result.txRequest
          }
        };
      }

      case "vault_prepare_asset_transfer_from_context": {
        const input = args as unknown as AssetTransferFromContextExecuteArgs;
        const plan = await sdk.buildAssetTransferPlanFromAccountContext({
          ...input,
          executeContext: {
            from: input.from as `0x${string}` | undefined,
            signature: input.signature as `0x${string}`,
            adapterProofs: input.adapterProofs as `0x${string}`[][]
          }
        });

        if (!plan.result.prepareExecuteInput) {
          return {
            error: toToolError("INTERNAL_PLAN_ERROR", "Asset transfer plan did not produce prepare input.", {
              tool: toolName
            })
          };
        }

        const prepared = await sdk.prepareExecuteTx(plan.result.prepareExecuteInput);

        return {
          result: {
            accountContext: plan.result.accountContext,
            action: plan.result.action,
            erc20Call: plan.result.erc20Call,
            humanReadableSummary: plan.result.humanReadableSummary,
            signRequest: plan.result.signRequest,
            txRequest: prepared.result.txRequest
          }
        };
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
