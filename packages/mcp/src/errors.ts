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

function normalizeForJson(value: unknown, visited = new WeakSet<object>()): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item, visited));
  }

  if (value && typeof value === "object") {
    if (visited.has(value as object)) {
      return "[Circular]";
    }

    visited.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeForJson(v, visited);
    }
    return out;
  }

  return value;
}

export function mapUnknownErrorToToolError(error: unknown): ToolError {
  if (error && typeof error === "object") {
    const anyErr = error as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      details?: unknown;
      suggestion?: unknown;
    };
    const message =
      typeof anyErr.message === "string" && anyErr.message.length > 0
        ? anyErr.message
        : String(error);

    const details: Record<string, unknown> = {
      ...(typeof anyErr.name === "string" ? { name: anyErr.name } : {}),
      ...(anyErr.details && typeof anyErr.details === "object"
        ? { ...(normalizeForJson(anyErr.details) as Record<string, unknown>) }
        : {})
    };

    const suggestion = typeof anyErr.suggestion === "string" ? anyErr.suggestion : undefined;

    if (typeof anyErr.code === "string" && /^[A-Z0-9_]+$/.test(anyErr.code)) {
      return {
        code: anyErr.code,
        message,
        ...(Object.keys(details).length > 0 ? { details } : {}),
        ...(suggestion ? { suggestion } : {})
      };
    }

    return {
      code: "SDK_ERROR",
      message,
      ...(Object.keys(details).length > 0 ? { details } : {}),
      ...(suggestion ? { suggestion } : {})
    };
  }

  return toToolError("SDK_ERROR", String(error));
}
