import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createConnectedClient } from "./test-helpers.js";
import { loadTools } from "./contract/loadTools.js";

test("tools/list 返回的工具名必须与冻结契约完全一致", async (t) => {
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

test("非法地址 input 必须返回 toolError(code/message)", async (t) => {
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

test("缺失 required 字段必须返回 toolError(code/message)", async (t) => {
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

test("合法 input 但未配置 factory 地址必须返回结构化错误", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  // 确保测试不依赖本机/CI 环境变量状态。
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

test("成功路径 outputSchema 不匹配时必须返回 INTERNAL_OUTPUT_SCHEMA_MISMATCH", async (t) => {
  // 注入一个返回错误形状的 adapter，确保不是 handler 自己报错，而是成功路径兜底校验生效。
  const badAdapter = {
    healthCheckVault: async () => {
      return {
        result: {
          // outputSchema 里 blockNumber 是 integer，但这里故意给 string
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

test("成功路径 outputSchema 不匹配且 result required 时仍需补齐 result", async (t) => {
  const badAdapter = {
    predictVaultAddress: async () => {
      return {
        // outputSchema 要求 predictedVault 是 address，这里故意给不匹配的字符串
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

  // factory_predict_vault_address 的 outputSchema 顶层 required=["result"]。
  // 即使是 INTERNAL_OUTPUT_SCHEMA_MISMATCH，也必须返回可通过 outputSchema 的 payload。
  assert.notEqual(typeof structured.result, "undefined");
  assert.equal(structured.error?.details?.addedResultFromSchemaRepair, true);
});

test("loadTools 遇到重复 tool.name 时必须抛错", async () => {
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
