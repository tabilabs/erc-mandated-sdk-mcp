import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createConnectedClient } from "./test-helpers.js";
import { loadTools } from "./contract/loadTools.js";

test("tools/list must exactly match frozen contract tool names", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const contract = await loadTools();
  const expectedNames = contract.tools.map((tool) => tool.name);

  const listed = await client.listTools();
  const actualNames = listed.tools.map((tool) => tool.name);

  assert.deepEqual(actualNames, expectedNames);
});

test("invalid address input must return toolError(code/message)", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "factory_predict_vault_address",
    arguments: {
      asset: "0x123",
      name: "Vault",
      symbol: "VLT",
      authority: "0x1111111111111111111111111111111111111111",
      salt: "0x" + "1".repeat(64)
    }
  });

  const structured = result.structuredContent as {
    result?: unknown;
    error?: { code?: string; message?: string; details?: { addedResultFromSchemaRepair?: boolean } };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INVALID_INPUT");
  assert.equal(typeof structured.error?.message, "string");
  assert.ok((structured.error?.message ?? "").length > 0);
  assert.notEqual(typeof structured.result, "undefined");
  assert.equal(structured.error?.details?.addedResultFromSchemaRepair, true);
});

test("missing required fields must return toolError(code/message)", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "factory_predict_vault_address",
    arguments: {
      asset: "0x2222222222222222222222222222222222222222",
      name: "Vault",
      symbol: "VLT",
      authority: "0x1111111111111111111111111111111111111111"
    }
  });

  const structured = result.structuredContent as {
    result?: unknown;
    error?: { code?: string; message?: string; details?: { addedResultFromSchemaRepair?: boolean } };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INVALID_INPUT");
  assert.equal(typeof structured.error?.message, "string");
  assert.ok((structured.error?.message ?? "").length > 0);
  assert.notEqual(typeof structured.result, "undefined");
  assert.equal(structured.error?.details?.addedResultFromSchemaRepair, true);
});

test("valid input without factory address config must return structured error", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  // Ensure this test does not depend on local/CI environment variable state.
  const savedEnv = {
    BSC_TESTNET_FACTORY_ADDRESS: process.env.BSC_TESTNET_FACTORY_ADDRESS,
    BSC_TESTNET_FACTORY: process.env.BSC_TESTNET_FACTORY,
    FACTORY_ADDRESS: process.env.FACTORY_ADDRESS
  };

  delete process.env.BSC_TESTNET_FACTORY_ADDRESS;
  delete process.env.BSC_TESTNET_FACTORY;
  delete process.env.FACTORY_ADDRESS;

  t.after(() => {
    process.env.BSC_TESTNET_FACTORY_ADDRESS = savedEnv.BSC_TESTNET_FACTORY_ADDRESS;
    process.env.BSC_TESTNET_FACTORY = savedEnv.BSC_TESTNET_FACTORY;
    process.env.FACTORY_ADDRESS = savedEnv.FACTORY_ADDRESS;
  });

  const result = await client.callTool({
    name: "factory_predict_vault_address",
    arguments: {
      asset: "0x2222222222222222222222222222222222222222",
      name: "Vault",
      symbol: "VLT",
      authority: "0x1111111111111111111111111111111111111111",
      salt: "0x" + "1".repeat(64)
    }
  });

  const structured = result.structuredContent as {
    result?: unknown;
    error?: { code?: string; message?: string; details?: { addedResultFromSchemaRepair?: boolean } };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "FACTORY_ADDRESS_NOT_CONFIGURED");
  assert.equal(typeof structured.error?.message, "string");
  assert.ok((structured.error?.message ?? "").length > 0);
  assert.notEqual(typeof structured.result, "undefined");
  assert.equal(structured.error?.details?.addedResultFromSchemaRepair, true);
});

test("strict mode turns handler error payload mismatch into INTERNAL_OUTPUT_SCHEMA_MISMATCH", async (t) => {
  const savedMode = process.env.MCP_SCHEMA_REPAIR_MODE;
  process.env.MCP_SCHEMA_REPAIR_MODE = "strict";

  const savedEnv = {
    BSC_TESTNET_FACTORY_ADDRESS: process.env.BSC_TESTNET_FACTORY_ADDRESS,
    BSC_TESTNET_FACTORY: process.env.BSC_TESTNET_FACTORY,
    FACTORY_ADDRESS: process.env.FACTORY_ADDRESS
  };

  delete process.env.BSC_TESTNET_FACTORY_ADDRESS;
  delete process.env.BSC_TESTNET_FACTORY;
  delete process.env.FACTORY_ADDRESS;

  t.after(() => {
    if (savedMode === undefined) {
      delete process.env.MCP_SCHEMA_REPAIR_MODE;
    } else {
      process.env.MCP_SCHEMA_REPAIR_MODE = savedMode;
    }

    process.env.BSC_TESTNET_FACTORY_ADDRESS = savedEnv.BSC_TESTNET_FACTORY_ADDRESS;
    process.env.BSC_TESTNET_FACTORY = savedEnv.BSC_TESTNET_FACTORY;
    process.env.FACTORY_ADDRESS = savedEnv.FACTORY_ADDRESS;
  });

  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "factory_predict_vault_address",
    arguments: {
      asset: "0x2222222222222222222222222222222222222222",
      name: "Vault",
      symbol: "VLT",
      authority: "0x1111111111111111111111111111111111111111",
      salt: "0x" + "1".repeat(64)
    }
  });

  const structured = result.structuredContent as {
    result?: unknown;
    error?: {
      code?: string;
      message?: string;
      details?: {
        addedResultFromSchemaRepair?: boolean;
        originalError?: {
          code?: string;
          message?: string;
          details?: {
            field?: string;
            chainId?: number;
            envKeys?: string[];
          };
        };
      };
    };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INTERNAL_OUTPUT_SCHEMA_MISMATCH");
  assert.notEqual(typeof structured.result, "undefined");
  assert.equal(structured.error?.details?.addedResultFromSchemaRepair, undefined);
  assert.equal(structured.error?.details?.originalError?.code, "FACTORY_ADDRESS_NOT_CONFIGURED");
  assert.equal(typeof structured.error?.details?.originalError?.message, "string");
  assert.ok((structured.error?.details?.originalError?.message ?? "").length > 0);

  const originalDetails =
    structured.error?.details?.originalError?.details as
      | {
          field?: string;
          chainId?: number;
          envKeys?: string[];
        }
      | undefined;

  assert.equal(originalDetails?.field, "factory");
  assert.equal(originalDetails?.chainId, 97);
  assert.ok(Array.isArray(originalDetails?.envKeys));
  assert.ok((originalDetails?.envKeys ?? []).includes("BSC_TESTNET_FACTORY_ADDRESS"));
});

test("success path must return INTERNAL_OUTPUT_SCHEMA_MISMATCH when outputSchema mismatches", async (t) => {
  // Inject an adapter that returns an invalid success shape,
  // so we verify the success-path outputSchema guard (not a handler-thrown error).
  const badAdapter = {
    healthCheckVault: async () => {
      return {
        result: {
          // outputSchema expects blockNumber as integer, but we intentionally return string
          blockNumber: "oops",
          vault: "0x1111111111111111111111111111111111111111",
          mandateAuthority: "0x5555555555555555555555555555555555555555",
          authorityEpoch: "1",
          pendingAuthority: "0x0000000000000000000000000000000000000000",
          nonceThreshold: "0",
          totalAssets: "0"
        }
      };
    }
  } as any;

  const { client, server } = await createConnectedClient(badAdapter as any);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "vault_health_check",
    arguments: {
      chainId: 11155111,
      vault: "0x1111111111111111111111111111111111111111",
      blockTag: "latest"
    }
  });

  const structured = result.structuredContent as {
    error?: { code?: string; message?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INTERNAL_OUTPUT_SCHEMA_MISMATCH");
  assert.equal(typeof structured.error?.message, "string");
  assert.ok((structured.error?.message ?? "").length > 0);
});

test("strict mode keeps contract envelope valid for required result output mismatch", async (t) => {
  const savedMode = process.env.MCP_SCHEMA_REPAIR_MODE;
  process.env.MCP_SCHEMA_REPAIR_MODE = "strict";

  t.after(() => {
    if (savedMode === undefined) {
      delete process.env.MCP_SCHEMA_REPAIR_MODE;
    } else {
      process.env.MCP_SCHEMA_REPAIR_MODE = savedMode;
    }
  });

  const badAdapter = {
    predictVaultAddress: async () => {
      return {
        // outputSchema expects predictedVault as address; intentionally return mismatched string
        result: {
          predictedVault: "oops"
        }
      };
    }
  } as any;

  const { client, server } = await createConnectedClient(badAdapter as any);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "factory_predict_vault_address",
    arguments: {
      chainId: 11155111,
      asset: "0x2222222222222222222222222222222222222222",
      name: "Vault",
      symbol: "VLT",
      authority: "0x1111111111111111111111111111111111111111",
      salt: "0x" + "1".repeat(64)
    }
  });

  const structured = result.structuredContent as {
    result?: unknown;
    error?: { code?: string; message?: string; details?: { addedResultFromSchemaRepair?: boolean } };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INTERNAL_OUTPUT_SCHEMA_MISMATCH");
  assert.equal(typeof structured.error?.message, "string");
  assert.ok((structured.error?.message ?? "").length > 0);

  // strict 模式下，业务 payload 不 repair，但错误 envelope 仍必须满足 frozen outputSchema。
  assert.notEqual(typeof structured.result, "undefined");
  assert.equal(structured.error?.details?.addedResultFromSchemaRepair, undefined);
});

test("repair mode still backfills required result for output mismatch", async (t) => {
  const savedMode = process.env.MCP_SCHEMA_REPAIR_MODE;
  process.env.MCP_SCHEMA_REPAIR_MODE = "repair";

  t.after(() => {
    if (savedMode === undefined) {
      delete process.env.MCP_SCHEMA_REPAIR_MODE;
    } else {
      process.env.MCP_SCHEMA_REPAIR_MODE = savedMode;
    }
  });

  const badAdapter = {
    predictVaultAddress: async () => ({
      result: {
        predictedVault: "oops"
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(badAdapter as any);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "factory_predict_vault_address",
    arguments: {
      chainId: 11155111,
      asset: "0x2222222222222222222222222222222222222222",
      name: "Vault",
      symbol: "VLT",
      authority: "0x1111111111111111111111111111111111111111",
      salt: "0x" + "1".repeat(64)
    }
  });

  const structured = result.structuredContent as {
    result?: unknown;
    error?: { code?: string; message?: string; details?: { addedResultFromSchemaRepair?: boolean } };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INTERNAL_OUTPUT_SCHEMA_MISMATCH");
  assert.notEqual(typeof structured.result, "undefined");
  assert.equal(structured.error?.details?.addedResultFromSchemaRepair, undefined);
});

test("loadTools must throw on duplicate tool.name", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "mcp-contract-duplicate-"));

  try {
    const contractPath = join(tempDir, "mcp-tools.json");
    const minimalTool = {
      name: "dup_tool",
      description: "duplicate tool",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      outputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          error: { $ref: "#/definitions/toolError" }
        }
      }
    };

    const contract = {
      contractVersion: "v0.1.0-agent-contract",
      schemaVersion: "2026-03-03",
      tools: [minimalTool, minimalTool],
      definitions: {
        toolError: {
          type: "object",
          additionalProperties: false,
          required: ["code", "message"],
          properties: {
            code: { type: "string" },
            message: { type: "string" }
          }
        }
      }
    };

    await writeFile(contractPath, JSON.stringify(contract), "utf8");

    await assert.rejects(
      async () => {
        await loadTools(contractPath);
      },
      (error: unknown) => {
        if (!(error instanceof Error)) {
          return false;
        }

        return (
          error.message.includes("duplicate tool name") && error.message.includes("dup_tool")
        );
      }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("mapUnknownErrorToToolError handles circular details without crashing", async (t) => {
  const circular: { self?: unknown; marker: string } = { marker: "circular" };
  circular.self = circular;

  const circularAdapter = {
    predictVaultAddress: async () => {
      throw Object.assign(new Error("boom"), {
        code: "SDK_ERROR",
        details: circular
      });
    }
  } as any;

  const { client, server } = await createConnectedClient(circularAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "factory_predict_vault_address",
    arguments: {
      chainId: 11155111,
      asset: "0x2222222222222222222222222222222222222222",
      name: "Vault",
      symbol: "VLT",
      authority: "0x1111111111111111111111111111111111111111",
      salt: "0x" + "1".repeat(64)
    }
  });

  const structured = result.structuredContent as {
    error?: { code?: string; details?: { marker?: string; self?: unknown } };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "SDK_ERROR");
  assert.equal(structured.error?.details?.marker, "circular");
  assert.equal(structured.error?.details?.self, "[Circular]");
});

test("mandate_build_sign_request result must be JSON-serializable (BigInt-safe)", async (t) => {
  const bigintAdapter = {
    buildMandateSignRequest: async () => ({
      result: {
        typedData: {
          domain: {
            chainId: 97n,
            verifyingContract: "0x92040EBDA2143C3BBD12962479afA87dB6e56059"
          }
        },
        mandate: {
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          executor: "0x1111111111111111111111111111111111111111",
          nonce: "1",
          deadline: "9999999999",
          authorityEpoch: "1",
          allowedAdaptersRoot: "0x" + "00".repeat(32),
          maxDrawdownBps: "10000",
          maxCumulativeDrawdownBps: "10000",
          payloadDigest: "0x" + "11".repeat(32),
          extensionsHash: "0x" + "22".repeat(32)
        },
        mandateHash: "0x" + "33".repeat(32),
        actionsDigest: "0x" + "44".repeat(32),
        extensionsHash: "0x" + "55".repeat(32)
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(bigintAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "mandate_build_sign_request",
    arguments: {
      chainId: 97,
      vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
      executor: "0x1111111111111111111111111111111111111111",
      nonce: "1",
      deadline: "9999999999",
      authorityEpoch: "1",
      allowedAdaptersRoot: "0x" + "00".repeat(32),
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000",
      payloadBinding: "actionsDigest",
      actions: [
        {
          adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          value: "0",
          data: "0x"
        }
      ],
      extensions: "0x"
    }
  });

  assert.equal(result.isError, false);
  assert.doesNotThrow(() => JSON.stringify(result.structuredContent));
});
