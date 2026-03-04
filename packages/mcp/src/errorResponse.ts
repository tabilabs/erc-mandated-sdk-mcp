import type { LoadedTool } from "./contract/loadTools.js";
import type { ToolError } from "./index.js";
import { ensurePayloadMatchesOutputSchema } from "./schemaRepair.js";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeAjvErrors(errors: unknown): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    return "validation failed";
  }

  return errors
    .map((err) => {
      if (!isObject(err)) {
        return "invalid input";
      }

      const path =
        typeof err.instancePath === "string" && err.instancePath.length > 0 ? err.instancePath : "$";
      const message = typeof err.message === "string" ? err.message : "invalid";

      if (isObject(err.params) && typeof err.params.missingProperty === "string") {
        return `${path}: missing required property ${err.params.missingProperty}`;
      }

      return `${path}: ${message}`;
    })
    .join("; ");
}

export function makeTextContent(text: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text }];
}

export function buildErrorToolResult(tool: LoadedTool, error: ToolError) {
  const basePayload: JsonObject = { error };
  const repaired = ensurePayloadMatchesOutputSchema(tool, basePayload);

  if (repaired.addedResultFromSchemaRepair) {
    const existingDetails = isObject(error.details) ? error.details : {};
    const patchedError: ToolError = {
      ...error,
      details: {
        ...existingDetails,
        addedResultFromSchemaRepair: true
      }
    };

    repaired.payload.error = patchedError;

    if (!tool.validateOutput(repaired.payload)) {
      const secondRepair = ensurePayloadMatchesOutputSchema(tool, {
        error: patchedError
      });
      repaired.payload = secondRepair.payload;
    }
  }

  if (!tool.validateOutput(repaired.payload)) {
    const internalError: ToolError = {
      code: "INTERNAL_OUTPUT_SCHEMA_MISMATCH",
      message: normalizeAjvErrors(tool.validateOutput.errors ?? []),
      details: {
        tool: tool.name,
        validationErrors: {
          errors: (tool.validateOutput.errors ?? []) as unknown
        }
      }
    };

    return {
      isError: true,
      content: makeTextContent(internalError.message),
      structuredContent: { error: internalError }
    };
  }

  return {
    isError: true,
    content: makeTextContent(error.message),
    structuredContent: repaired.payload
  };
}
