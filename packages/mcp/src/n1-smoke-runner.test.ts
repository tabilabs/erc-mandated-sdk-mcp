import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createConnectedClient as createConnectedClientBase } from "./test-helpers.js";

import type { SdkAdapter } from "./tools/sdkAdapter.js";
import { loadTools } from "./contract/loadTools.js";

const STUB_SDK_ADAPTER = {
  healthCheckVault: async (input: any) => {
    return {
      result: {
        blockNumber: 0,
        vault: input.vault,
        mandateAuthority: "0x5555555555555555555555555555555555555555",
        authorityEpoch: "1",
        pendingAuthority: "0x0000000000000000000000000000000000000000",
        nonceThreshold: "0",
        totalAssets: "0"
      }
    };
  },
  buildMandateSignRequest: async () => {
    return {
      result: {
        // smoke runner 只做 outputSchema 校验 + expect 字段存在性断言，这里无需构造完整 typedData。
        typedData: {},
        mandate: {
          vault: "0x1111111111111111111111111111111111111111",
          executor: "0x2222222222222222222222222222222222222222",
          nonce: "1",
          deadline: "0",
          authorityEpoch: "1",
          allowedAdaptersRoot: "0x" + "a".repeat(64),
          maxDrawdownBps: "10000",
          maxCumulativeDrawdownBps: "10000",
          payloadDigest: "0x" + "b".repeat(64),
          extensionsHash: "0x" + "c".repeat(64)
        },
        mandateHash: "0x" + "9".repeat(64),
        actionsDigest: "0x" + "b".repeat(64),
        extensionsHash: "0x" + "c".repeat(64)
      }
    };
  },
  predictVaultAddress: async () => {
    return {
      result: {
        predictedVault: "0x7777777777777777777777777777777777777777"
      }
    };
  },
  prepareCreateVaultTx: async () => {
    return {
      result: {
        predictedVault: "0x7777777777777777777777777777777777777777",
        txRequest: {
          from: "0x2222222222222222222222222222222222222222",
          to: "0x8888888888888888888888888888888888888888",
          data: "0x",
          value: "0"
        }
      }
    };
  },
  simulateExecuteVault: async () => {
    return {
      result: {
        ok: true,
        blockNumber: 0
      }
    };
  },
  prepareExecuteTx: async () => {
    return {
      result: {
        txRequest: {
          from: "0x2222222222222222222222222222222222222222",
          to: "0x1111111111111111111111111111111111111111",
          data: "0x",
          value: "0"
        }
      }
    };
  },
  checkNonceUsed: async () => {
    return {
      result: {
        used: false
      }
    };
  },
  checkMandateRevoked: async () => {
    return {
      result: {
        revoked: false
      }
    };
  },
  prepareInvalidateNonceTx: async () => {
    return {
      result: {
        txRequest: {
          from: "0x5555555555555555555555555555555555555555",
          to: "0x1111111111111111111111111111111111111111",
          data: "0x",
          value: "0"
        }
      }
    };
  },
  prepareRevokeMandateTx: async () => {
    return {
      result: {
        txRequest: {
          from: "0x5555555555555555555555555555555555555555",
          to: "0x1111111111111111111111111111111111111111",
          data: "0x",
          value: "0"
        }
      }
    };
  }
} as any;

async function createConnectedClient() {
  return createConnectedClientBase(STUB_SDK_ADAPTER);
}

type Step = {
  tool: string;
  input: Record<string, unknown>;
  expect?: Record<string, unknown>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("N1 fixtures smoke runner: 顺序执行 steps.json，并用 outputSchema 做 partial 校验", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const contract = await loadTools();

  const fixturesPath = new URL(
    `../contracts/${contract.contractVersion}/fixtures/n1-smoke/steps.json`,
    import.meta.url
  );

  const stepsRaw = JSON.parse(await readFile(fixturesPath, "utf8")) as unknown;
  assert.ok(Array.isArray(stepsRaw), "steps.json must be an array");

  const steps = stepsRaw as Step[];
  const toolByName = new Map(contract.tools.map((tool) => [tool.name, tool] as const));

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    assert.equal(typeof step.tool, "string", `steps[${i}].tool must be string`);
    assert.ok(isObject(step.input), `steps[${i}].input must be object`);

    const loadedTool = toolByName.get(step.tool);
    assert.ok(loadedTool, `unknown tool in fixture: ${step.tool}`);

    // 先保证 fixture input 本身满足冻结 inputSchema（否则 fixture 就是坏的）。
    assert.equal(
      loadedTool.validateInput(step.input),
      true,
      `fixture input fails schema for ${step.tool}: ${JSON.stringify(loadedTool.validateInput.errors ?? [])}`
    );

    const result = await client.callTool({
      name: step.tool,
      arguments: step.input
    });

    // MCP 返回必须满足冻结 outputSchema（这是 MCP 的硬约束）。
    assert.equal(
      loadedTool.validateOutput(result.structuredContent),
      true,
      `output fails schema for ${step.tool}: ${JSON.stringify(loadedTool.validateOutput.errors ?? [])}`
    );

    if (step.expect !== undefined) {
      // fixture 的 expect 是 partial 形状（参考 scripts/contract-check.mjs 的 validatePartial 思路）
      assert.ok(isObject(step.expect), `steps[${i}].expect must be object`);

      const structured = (result.structuredContent ?? {}) as Record<string, unknown>;
      const actualResult = (structured.result ?? {}) as unknown;

      // 当前 N1 运行在无 RPC/mock 环境下：只做形状校验（expect 里的值多数是占位），
      // 这里不做深度等值断言，避免把 smoke runner 变成“链上真值断言”。
      if (isObject(step.expect.result)) {
        assert.ok(isObject(actualResult), `steps[${i}] expected result object`);
        for (const key of Object.keys(step.expect.result)) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(actualResult, key),
            `steps[${i}] missing result.${key} in actual output`
          );
        }
      }

      if (isObject(step.expect.error)) {
        const actualError = (structured.error ?? {}) as unknown;
        assert.ok(isObject(actualError), `steps[${i}] expected error object`);
        for (const key of Object.keys(step.expect.error)) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(actualError, key),
            `steps[${i}] missing error.${key} in actual output`
          );
        }
      }
    }
  }
});
