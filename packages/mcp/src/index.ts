import { pathToFileURL } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import * as sdk from "@erc-mandated/sdk";

const DEFAULT_SDK_ADAPTER = {
  createAgentAccountContext: sdk.createAgentAccountContext,
  createAgentFundingPolicy: sdk.createAgentFundingPolicy,
  buildFundAndActionPlan: sdk.buildFundAndActionPlan,
  createFundAndActionExecutionSession: sdk.createFundAndActionExecutionSession,
  applyFundAndActionExecutionEvent: sdk.applyFundAndActionExecutionEvent,
  resolveFundAndActionExecutionTask: sdk.resolveFundAndActionExecutionTask,
  createFollowUpActionResult: sdk.createFollowUpActionResult,
  createAssetTransferResult: sdk.createAssetTransferResult,
  checkAssetTransferAgainstFundingPolicy: sdk.checkAssetTransferAgainstFundingPolicy,
  buildAssetTransferPlanFromAccountContext: sdk.buildAssetTransferPlanFromAccountContext,
  executeAssetTransferFromAccountContext: executeAssetTransferFromAccountContextWithRuntime,
  bootstrapVault: bootstrapVaultWithRuntime,
  healthCheckVault: sdk.healthCheckVault,
  buildAssetTransferPlan: sdk.buildAssetTransferPlan,
  executeAssetTransfer: executeAssetTransferWithRuntime,
  buildMandateSignRequest: sdk.buildMandateSignRequest,
  predictVaultAddress: sdk.predictVaultAddress,
  prepareCreateVaultTx: sdk.prepareCreateVaultTx,
  simulateExecuteVault: sdk.simulateExecuteVault,
  prepareExecuteTx: sdk.prepareExecuteTx,

  checkNonceUsed: sdk.checkNonceUsed,
  checkMandateRevoked: sdk.checkMandateRevoked,
  prepareInvalidateNonceTx: sdk.prepareInvalidateNonceTx,
  prepareRevokeMandateTx: sdk.prepareRevokeMandateTx
};

import { type LoadedTool, loadTools } from "./contract/loadTools.js";
import { toToolError } from "./errors.js";
import { buildErrorToolResult, makeTextContent, normalizeAjvErrors } from "./errorResponse.js";
import {
  executeAssetTransferFromAccountContextWithRuntime,
  executeAssetTransferWithRuntime
} from "./runtimeAssetTransfer.js";
import { bootstrapVaultWithRuntime } from "./runtimeBootstrap.js";
import { ensurePayloadMatchesOutputSchema, getSchemaRepairModeFromEnv } from "./schemaRepair.js";
import { loadSupportedChainsFromEnv } from "./supportedChains.js";
import { handleToolCall } from "./tools/handlers.js";
import type { SdkAdapter } from "./tools/sdkAdapter.js";

export interface McpInfo {
  name: string;
  version: string;
}

export function getMcpInfo(): McpInfo {
  return {
    name: "@erc-mandated/mcp",
    version: "0.2.0"
  };
}

export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

export interface McpServerOptions {
  sdkAdapter?: SdkAdapter;
  supportedChains?: sdk.SupportedChain[];
}

type JsonObject = Record<string, unknown>;

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeForJson<T>(value: T): T {
  const walk = (input: unknown): JsonValue => {
    if (typeof input === "bigint") {
      return input.toString();
    }

    if (
      input === null ||
      typeof input === "string" ||
      typeof input === "number" ||
      typeof input === "boolean"
    ) {
      return input;
    }

    if (Array.isArray(input)) {
      return input.map((item) => walk(item));
    }

    if (typeof input === "object") {
      const out: Record<string, JsonValue> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }

    return String(input);
  };

  return walk(value) as T;
}

export async function createMcpServer(options?: McpServerOptions): Promise<{ server: Server }> {
  const info = getMcpInfo();
  const contract = await loadTools();

  if (options?.supportedChains && options.supportedChains.length > 0) {
    sdk.registerSupportedChains(options.supportedChains);
  }

  const server = new Server(
    {
      name: info.name,
      version: info.version
    },
    {
      capabilities: {
        tools: {
          listChanged: false
        }
      }
    }
  );

  const tools = contract.tools;
  const toolByName = new Map<string, LoadedTool>(tools.map((tool) => [tool.name, tool]));

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema
      }))
    };
  });

  const logLevel = process.env.MCP_LOG_LEVEL ?? "info";
  const schemaRepairMode = getSchemaRepairModeFromEnv();

  function logJsonl(event: Record<string, unknown>) {
    if (logLevel === "none") {
      return;
    }
    try {
      process.stderr.write(`${JSON.stringify(event)}\n`);
    } catch {
      // ignore logging failures
    }
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolByName.get(request.params.name);

    if (!tool) {
      const error = toToolError("TOOL_NOT_FOUND", `Tool not found: ${request.params.name}`);
      return {
        isError: true,
        content: makeTextContent(error.message),
        structuredContent: { error }
      };
    }

    const validInput = tool.validateInput(request.params.arguments ?? {});
    if (!validInput) {
      return buildErrorToolResult(
        tool,
        toToolError("INVALID_INPUT", normalizeAjvErrors(tool.validateInput.errors ?? []), {
          tool: tool.name,
          validationErrors: {
            errors: (tool.validateInput.errors ?? []) as unknown
          }
        }),
        schemaRepairMode
      );
    }

    const startedAt = Date.now();
    logJsonl({
      event: "tool.call.start",
      toolName: tool.name,
      contractVersion: contract.contractVersion
    });

    const sdkAdapter = options?.sdkAdapter ?? DEFAULT_SDK_ADAPTER;

    const structured = await handleToolCall(tool.name, request.params.arguments ?? {}, sdkAdapter);

    const normalized = ensurePayloadMatchesOutputSchema(tool, structured, schemaRepairMode);
    if (normalized.addedResultFromSchemaRepair && isObject(structured.error)) {
      const maybeErr = structured.error as unknown as Partial<ToolError>;
      if (typeof maybeErr.message === "string") {
        // preserve existing behavior: mark schema repair explicitly in error.details
        const err = structured.error as unknown as ToolError;
        const existingDetails = isObject(err.details) ? err.details : {};
        normalized.payload.error = {
          ...err,
          details: {
            ...existingDetails,
            addedResultFromSchemaRepair: true
          }
        };
      }
    }

    // Final hard gate: output must match frozen outputSchema on both success and error paths.
    const outputSchemaValid = tool.validateOutput(normalized.payload);
    if (!outputSchemaValid) {
      const payloadWithError = normalized.payload as JsonObject & { error?: unknown };
      const originalError = isObject(payloadWithError.error)
        ? (payloadWithError.error as unknown as ToolError)
        : undefined;

      const details: Record<string, unknown> = {
        tool: tool.name,
        validationErrors: {
          errors: (tool.validateOutput.errors ?? []) as unknown
        }
      };

      if (originalError) {
        details.originalError = {
          code: originalError.code,
          message: originalError.message,
          details: originalError.details,
          suggestion: originalError.suggestion
        };
      }

      const internalError: ToolError = {
        code: "INTERNAL_OUTPUT_SCHEMA_MISMATCH",
        message: normalizeAjvErrors(tool.validateOutput.errors ?? []),
        details
      };

      logJsonl({
        event: "tool.call.end",
        toolName: tool.name,
        contractVersion: contract.contractVersion,
        durationMs: Date.now() - startedAt,
        isError: true,
        addedResultFromSchemaRepair: normalized.addedResultFromSchemaRepair
      });

      // Even internal failures must conform to the frozen outputSchema (some tools require top-level `result`).
      return buildErrorToolResult(tool, internalError, "repair", false);
    }

    // If handler returned an error payload and it already satisfies outputSchema, keep isError=true.
    if (isObject(normalized.payload.error)) {
      const err = normalized.payload.error as unknown as ToolError;
      logJsonl({
        event: "tool.call.end",
        toolName: tool.name,
        contractVersion: contract.contractVersion,
        durationMs: Date.now() - startedAt,
        isError: true,
        addedResultFromSchemaRepair: normalized.addedResultFromSchemaRepair
      });
      return {
        isError: true,
        content: makeTextContent(err.message),
        structuredContent: normalized.payload
      };
    }

    logJsonl({
      event: "tool.call.end",
      toolName: tool.name,
      contractVersion: contract.contractVersion,
      durationMs: Date.now() - startedAt,
      isError: false,
      addedResultFromSchemaRepair: normalized.addedResultFromSchemaRepair
    });

    // Success
    return {
      isError: false,
      content: makeTextContent("ok"),
      structuredContent: normalizeForJson(normalized.payload)
    };
  });

  return { server };
}

export async function runMcpServer(): Promise<void> {
  const supportedChains = await loadSupportedChainsFromEnv();
  const { server } = await createMcpServer({ supportedChains });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMcpServer().catch((error) => {
    console.error("MCP server failed to start:", error);
    process.exit(1);
  });
}
