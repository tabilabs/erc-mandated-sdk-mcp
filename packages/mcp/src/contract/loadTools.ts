import { readFile } from "node:fs/promises";

import AjvModule from "ajv";
import type { ValidateFunction } from "ajv";

// CJS/ESM 兼容：某些环境下 Ajv 导出为 { default: Ajv }，某些为直接导出。
const Ajv = AjvModule.default ?? AjvModule;

export interface ContractTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface ContractToolFile {
  contractVersion: string;
  schemaVersion: string;
  tools: ContractTool[];
  definitions?: Record<string, unknown>;
}

export interface LoadedTool extends ContractTool {
  validateInput: ValidateFunction;
  validateOutput: ValidateFunction;
}

export interface LoadedTools {
  sourcePath: string;
  contractVersion: string;
  schemaVersion: string;
  tools: LoadedTool[];
}

const CONTRACT_VERSION_ENV_KEY = "ERC_MANDATED_CONTRACT_VERSION";
const LATEST_CONTRACT_POINTER_URL = new URL("../../contracts/latest.json", import.meta.url);

interface LatestContractPointer {
  contractVersion: string;
}

function assertLatestContractPointer(value: unknown): asserts value is LatestContractPointer {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid latest contract file: root must be an object");
  }

  const candidate = value as Partial<LatestContractPointer>;
  if (typeof candidate.contractVersion !== "string" || candidate.contractVersion.length === 0) {
    throw new Error("Invalid latest contract file: contractVersion must be non-empty string");
  }
}

async function getSelectedContractVersion(): Promise<string> {
  const v = process.env[CONTRACT_VERSION_ENV_KEY];
  if (typeof v === "string" && v.length > 0) {
    return v;
  }

  const latestContent = await readFile(LATEST_CONTRACT_POINTER_URL, "utf8");
  const latestParsed: unknown = JSON.parse(latestContent);
  assertLatestContractPointer(latestParsed);

  return latestParsed.contractVersion;
}

function contractToolsUrlForVersion(contractVersion: string): URL {
  return new URL(`../../contracts/${contractVersion}/mcp-tools.json`, import.meta.url);
}

async function getDefaultContractPath(): Promise<URL> {
  const contractVersion = await getSelectedContractVersion();
  return contractToolsUrlForVersion(contractVersion);
}

function assertContractToolFile(value: unknown): asserts value is ContractToolFile {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid contract file: root must be an object");
  }

  const candidate = value as Partial<ContractToolFile>;
  if (typeof candidate.contractVersion !== "string") {
    throw new Error("Invalid contract file: contractVersion must be string");
  }

  if (typeof candidate.schemaVersion !== "string") {
    throw new Error("Invalid contract file: schemaVersion must be string");
  }

  if (!Array.isArray(candidate.tools)) {
    throw new Error("Invalid contract file: tools must be an array");
  }

  for (const tool of candidate.tools) {
    if (!tool || typeof tool !== "object") {
      throw new Error("Invalid contract file: each tool must be object");
    }

    const maybeTool = tool as Partial<ContractTool>;
    if (typeof maybeTool.name !== "string" || maybeTool.name.length === 0) {
      throw new Error("Invalid contract file: tool.name must be non-empty string");
    }

    if (!maybeTool.inputSchema || typeof maybeTool.inputSchema !== "object") {
      throw new Error(`Invalid contract file: tool ${maybeTool.name} missing inputSchema`);
    }

    if (!maybeTool.outputSchema || typeof maybeTool.outputSchema !== "object") {
      throw new Error(`Invalid contract file: tool ${maybeTool.name} missing outputSchema`);
    }
  }
}

function withDefinitions(
  schema: Record<string, unknown>,
  definitions?: Record<string, unknown>
): Record<string, unknown> {
  if (!definitions) {
    return schema;
  }

  if (typeof schema.definitions === "object" && schema.definitions !== null) {
    return schema;
  }

  return {
    ...schema,
    definitions
  };
}

export async function loadTools(contractPath?: URL | string): Promise<LoadedTools> {
  const resolvedPath = contractPath ?? (await getDefaultContractPath());
  const sourcePath = typeof resolvedPath === "string" ? resolvedPath : resolvedPath.pathname;

  let content: string;
  try {
    content = await readFile(resolvedPath, "utf8");
  } catch (e) {
    if (contractPath !== undefined) {
      throw new Error(`Contract tools file not found at explicit path: ${sourcePath}`);
    }

    const selected = await getSelectedContractVersion();
    throw new Error(
      `Contract tools file not found for contractVersion='${selected}'. ` +
        `Set ${CONTRACT_VERSION_ENV_KEY} to a valid version like 'v0.2.0-agent-contract'. ` +
        `Tried path: ${sourcePath}`
    );
  }

  const parsed: unknown = JSON.parse(content);

  assertContractToolFile(parsed);

  const seenNames = new Set<string>();
  for (const tool of parsed.tools) {
    if (seenNames.has(tool.name)) {
      throw new Error(`Invalid contract file: duplicate tool name '${tool.name}'`);
    }
    seenNames.add(tool.name);
  }

  const ajv = new Ajv({
    strict: true,
    allErrors: true
  });

  const tools: LoadedTool[] = parsed.tools.map((tool) => {
    const inputSchema = withDefinitions(tool.inputSchema, parsed.definitions);
    const outputSchema = withDefinitions(tool.outputSchema, parsed.definitions);

    return {
      ...tool,
      inputSchema,
      outputSchema,
      validateInput: ajv.compile(inputSchema),
      validateOutput: ajv.compile(outputSchema)
    };
  });

  return {
    sourcePath,
    contractVersion: parsed.contractVersion,
    schemaVersion: parsed.schemaVersion,
    tools
  };
}
