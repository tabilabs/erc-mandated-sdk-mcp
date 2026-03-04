import type { ToolError } from "./index.js";

export function toToolError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ToolError {
  return {
    code,
    message,
    ...(details ? { details } : {})
  };
}

export function mapUnknownErrorToToolError(error: unknown): ToolError {
  if (error && typeof error === "object") {
    const anyErr = error as { name?: unknown; message?: unknown; code?: unknown };
    const message =
      typeof anyErr.message === "string" && anyErr.message.length > 0
        ? anyErr.message
        : String(error);

    if (typeof anyErr.code === "string" && /^[A-Z0-9_]+$/.test(anyErr.code)) {
      return toToolError(anyErr.code, message, {
        name: typeof anyErr.name === "string" ? anyErr.name : undefined
      });
    }

    return toToolError("SDK_ERROR", message, {
      name: typeof anyErr.name === "string" ? anyErr.name : undefined
    });
  }

  return toToolError("SDK_ERROR", String(error));
}
