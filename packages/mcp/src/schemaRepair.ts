import type { LoadedTool } from "./contract/loadTools.js";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequiredTopLevelKeys(outputSchema: JsonObject): string[] {
  const required = outputSchema.required;
  if (!Array.isArray(required)) {
    return [];
  }
  return required.filter((item): item is string => typeof item === "string");
}

function getSchemaProperty(outputSchema: JsonObject, key: string): JsonObject | undefined {
  const properties = outputSchema.properties;
  if (!isObject(properties)) {
    return undefined;
  }
  const value = properties[key];
  return isObject(value) ? value : undefined;
}

function resolveLocalRef(schema: JsonObject, rootSchema: JsonObject): JsonObject {
  if (typeof schema.$ref !== "string") {
    return schema;
  }

  const ref = schema.$ref;
  if (!ref.startsWith("#/")) {
    return schema;
  }

  const segments = ref.slice(2).split("/");
  let current: unknown = rootSchema;

  for (const segment of segments) {
    if (!isObject(current) || !(segment in current)) {
      return schema;
    }
    current = current[segment];
  }

  return isObject(current) ? current : schema;
}

function generateStringFromSchema(schema: JsonObject): string {
  const pattern = typeof schema.pattern === "string" ? schema.pattern : "";

  if (pattern === "^0x[a-fA-F0-9]{40}$") {
    return `0x${"0".repeat(40)}`;
  }

  if (pattern === "^0x[a-fA-F0-9]{64}$") {
    return `0x${"0".repeat(64)}`;
  }

  if (pattern === "^[0-9]+$") {
    return "0";
  }

  if (pattern === "^0x[a-fA-F0-9]*$") {
    return "0x";
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0 && typeof schema.enum[0] === "string") {
    return schema.enum[0];
  }

  const minLength = typeof schema.minLength === "number" ? schema.minLength : 0;
  if (minLength > 0) {
    return "x".repeat(minLength);
  }

  return "";
}

function generateValueFromSchema(schema: JsonObject, rootSchema: JsonObject): unknown {
  const resolved = resolveLocalRef(schema, rootSchema);

  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    return resolved.enum[0];
  }

  const typeValue = resolved.type;
  const type = Array.isArray(typeValue)
    ? typeValue.find((item): item is string => typeof item === "string" && item !== "null")
    : typeof typeValue === "string"
      ? typeValue
      : undefined;

  if (type === "object" || (type === undefined && isObject(resolved.properties))) {
    const properties = isObject(resolved.properties) ? resolved.properties : {};
    const required = Array.isArray(resolved.required)
      ? resolved.required.filter((item): item is string => typeof item === "string")
      : [];

    const result: JsonObject = {};
    for (const key of required) {
      const propertySchema = properties[key];
      result[key] = isObject(propertySchema)
        ? generateValueFromSchema(propertySchema, rootSchema)
        : null;
    }

    return result;
  }

  if (type === "array") {
    const itemsSchema = isObject(resolved.items) ? resolved.items : {};
    const minItems = typeof resolved.minItems === "number" ? resolved.minItems : 0;
    return Array.from({ length: Math.max(0, minItems) }, () =>
      generateValueFromSchema(itemsSchema, rootSchema)
    );
  }

  if (type === "integer" || type === "number") {
    const minimum = typeof resolved.minimum === "number" ? resolved.minimum : 0;
    return Math.max(0, Math.ceil(minimum));
  }

  if (type === "boolean") {
    return false;
  }

  if (type === "string" || type === undefined) {
    return generateStringFromSchema(resolved);
  }

  return null;
}

export function ensurePayloadMatchesOutputSchema(tool: LoadedTool, payload: JsonObject): {
  payload: JsonObject;
  addedResultFromSchemaRepair: boolean;
} {
  if (tool.validateOutput(payload)) {
    return { payload, addedResultFromSchemaRepair: false };
  }

  const requiredKeys = getRequiredTopLevelKeys(tool.outputSchema);
  if (requiredKeys.includes("result") && !("result" in payload)) {
    const resultSchema = getSchemaProperty(tool.outputSchema, "result");
    if (resultSchema) {
      const repaired: JsonObject = {
        ...(payload as unknown as Record<string, unknown>),
        result: generateValueFromSchema(resultSchema, tool.outputSchema)
      };

      if (tool.validateOutput(repaired)) {
        return { payload: repaired, addedResultFromSchemaRepair: true };
      }
    }
  }

  return { payload, addedResultFromSchemaRepair: false };
}
