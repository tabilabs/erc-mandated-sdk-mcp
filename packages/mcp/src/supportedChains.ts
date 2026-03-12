import { readFile } from "node:fs/promises";

import type { SupportedChain } from "@erc-mandated/sdk";

export const SUPPORTED_CHAINS_JSON_ENV = "ERC_MANDATED_SUPPORTED_CHAINS_JSON";
export const SUPPORTED_CHAINS_FILE_ENV = "ERC_MANDATED_SUPPORTED_CHAINS_FILE";

export class SupportedChainConfigError extends Error {
  readonly code:
    | "SUPPORTED_CHAINS_CONFIG_CONFLICT"
    | "SUPPORTED_CHAINS_CONFIG_INVALID_JSON"
    | "SUPPORTED_CHAINS_CONFIG_INVALID_SHAPE";
  readonly source: string;

  constructor(
    message: string,
    params: {
      code:
        | "SUPPORTED_CHAINS_CONFIG_CONFLICT"
        | "SUPPORTED_CHAINS_CONFIG_INVALID_JSON"
        | "SUPPORTED_CHAINS_CONFIG_INVALID_SHAPE";
      source: string;
    }
  ) {
    super(message);
    this.name = "SupportedChainConfigError";
    this.code = params.code;
    this.source = params.source;
  }
}

function expectString(value: unknown, field: string, source: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new SupportedChainConfigError(
    `Invalid supported chain config in ${source}: ${field} must be a non-empty string.`,
    {
      code: "SUPPORTED_CHAINS_CONFIG_INVALID_SHAPE",
      source
    }
  );
}

function expectStringArray(value: unknown, field: string, source: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new SupportedChainConfigError(
      `Invalid supported chain config in ${source}: ${field} must be an array of non-empty strings.`,
      {
        code: "SUPPORTED_CHAINS_CONFIG_INVALID_SHAPE",
        source
      }
    );
  }

  return [...value];
}

function normalizeSupportedChain(value: unknown, index: number, source: string): SupportedChain {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupportedChainConfigError(
      `Invalid supported chain config in ${source}: entry ${index} must be an object.`,
      {
        code: "SUPPORTED_CHAINS_CONFIG_INVALID_SHAPE",
        source
      }
    );
  }

  const input = value as Record<string, unknown>;
  const id = input.id;

  if (!Number.isInteger(id) || (id as number) <= 0) {
    throw new SupportedChainConfigError(
      `Invalid supported chain config in ${source}: entry ${index}.id must be a positive integer.`,
      {
        code: "SUPPORTED_CHAINS_CONFIG_INVALID_SHAPE",
        source
      }
    );
  }

  const rpcUrlEnvCandidates = expectStringArray(
    input.rpcUrlEnvCandidates,
    `entry ${index}.rpcUrlEnvCandidates`,
    source
  );
  const factoryEnvCandidates = expectStringArray(
    input.factoryEnvCandidates,
    `entry ${index}.factoryEnvCandidates`,
    source
  );

  return {
    id: id as number,
    name: expectString(input.name, `entry ${index}.name`, source),
    rpcUrlEnvVar: expectString(input.rpcUrlEnvVar, `entry ${index}.rpcUrlEnvVar`, source),
    ...(rpcUrlEnvCandidates ? { rpcUrlEnvCandidates } : {}),
    ...(factoryEnvCandidates ? { factoryEnvCandidates } : {})
  };
}

export function parseSupportedChainsJson(raw: string, source: string): SupportedChain[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    throw new SupportedChainConfigError(
      `Invalid supported chain config JSON in ${source}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      {
        code: "SUPPORTED_CHAINS_CONFIG_INVALID_JSON",
        source
      }
    );
  }

  if (!Array.isArray(parsed)) {
    throw new SupportedChainConfigError(
      `Invalid supported chain config in ${source}: expected a JSON array.`,
      {
        code: "SUPPORTED_CHAINS_CONFIG_INVALID_SHAPE",
        source
      }
    );
  }

  return parsed.map((entry, index) => normalizeSupportedChain(entry, index, source));
}

export async function loadSupportedChainsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Promise<SupportedChain[] | undefined> {
  const inlineJson = env[SUPPORTED_CHAINS_JSON_ENV];
  const filePath = env[SUPPORTED_CHAINS_FILE_ENV];

  if (inlineJson && filePath) {
    throw new SupportedChainConfigError(
      `Set only one of ${SUPPORTED_CHAINS_JSON_ENV} or ${SUPPORTED_CHAINS_FILE_ENV}.`,
      {
        code: "SUPPORTED_CHAINS_CONFIG_CONFLICT",
        source: "env"
      }
    );
  }

  if (inlineJson) {
    return parseSupportedChainsJson(inlineJson, SUPPORTED_CHAINS_JSON_ENV);
  }

  if (filePath) {
    const raw = await readFile(filePath, "utf8");
    return parseSupportedChainsJson(raw, filePath);
  }

  return undefined;
}
