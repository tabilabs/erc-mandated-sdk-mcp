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

test("vault_build_asset_transfer_plan returns JSON-safe transfer plan payload", async (t) => {
  const transferAdapter = {
    buildAssetTransferPlan: async () => ({
      result: {
        action: {
          adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          value: "0",
          data: "0xa9059cbb"
        },
        erc20Call: {
          to: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          data: "0xa9059cbb",
          value: "0"
        },
        humanReadableSummary: {
          kind: "erc20Transfer",
          tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          to: "0x2222222222222222222222222222222222222222",
          amountRaw: "1000000",
          symbol: "USDT",
          decimals: 6
        },
        signRequest: {
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
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(transferAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "vault_build_asset_transfer_plan",
    arguments: {
      chainId: 97,
      vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
      executor: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
      to: "0x2222222222222222222222222222222222222222",
      amountRaw: "1000000",
      nonce: "1",
      deadline: "9999999999",
      authorityEpoch: "1",
      allowedAdaptersRoot: "0x" + "00".repeat(32),
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000",
      symbol: "USDT",
      decimals: 6
    }
  });

  const structured = result.structuredContent as {
    result?: {
      humanReadableSummary?: { symbol?: string; decimals?: number };
      signRequest?: { typedData?: { domain?: { chainId?: string } } };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.humanReadableSummary?.symbol, "USDT");
  assert.equal(structured.result?.humanReadableSummary?.decimals, 6);
  assert.equal(structured.result?.signRequest?.typedData?.domain?.chainId, "97");
  assert.doesNotThrow(() => JSON.stringify(result.structuredContent));
});

test("vault_asset_transfer_result_create returns normalized confirmed envelope", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const planResult = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-funding-envelope",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "100000",
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:10:00.000Z",
          maxStalenessSeconds: 300
        }
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1",
        allowedAdaptersRoot: "0x" + "00".repeat(32),
        maxDrawdownBps: "10000",
        maxCumulativeDrawdownBps: "10000",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        }
      },
      followUpAction: {
        kind: "custom.notify"
      }
    }
  });

  const planStructured = planResult.structuredContent as {
    result?: {
      fundingPlan?: unknown;
    };
  };

  const result = await client.callTool({
    name: "vault_asset_transfer_result_create",
    arguments: {
      assetTransferPlan: planStructured.result?.fundingPlan,
      status: "confirmed",
      updatedAt: "2026-03-09T02:00:00.000Z",
      submittedAt: "2026-03-09T01:59:00.000Z",
      chainId: 97,
      txHash: "0x" + "12".repeat(32),
      receipt: {
        blockNumber: "123456",
        blockHash: "0x" + "34".repeat(32),
        confirmations: 3
      }
    }
  });

  const structured = result.structuredContent as {
    result?: {
      assetTransferResult?: {
        status?: string;
        completedAt?: string;
        txHash?: string;
        receipt?: { blockNumber?: string };
      };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.assetTransferResult?.status, "confirmed");
  assert.equal(structured.result?.assetTransferResult?.completedAt, "2026-03-09T02:00:00.000Z");
  assert.equal(structured.result?.assetTransferResult?.txHash, "0x" + "12".repeat(32));
  assert.equal(structured.result?.assetTransferResult?.receipt?.blockNumber, "123456");
});

test("vault_asset_transfer_result_create rejects submitted envelope without txHash", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const planResult = await client.callTool({
    name: "vault_build_asset_transfer_plan",
    arguments: {
      chainId: 97,
      vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
      executor: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
      to: "0x2222222222222222222222222222222222222222",
      amountRaw: "1000000",
      nonce: "1",
      deadline: "9999999999",
      authorityEpoch: "1",
      allowedAdaptersRoot: "0x" + "00".repeat(32),
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000"
    }
  });

  const planStructured = planResult.structuredContent as {
    result?: unknown;
  };

  const result = await client.callTool({
    name: "vault_asset_transfer_result_create",
    arguments: {
      assetTransferPlan: planStructured.result,
      status: "submitted",
      updatedAt: "2026-03-09T02:00:00.000Z"
    }
  });

  const structured = result.structuredContent as {
    error?: { code?: string; message?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "SUBMITTED_RESULT_REQUIRES_TX_HASH");
  assert.ok((structured.error?.message ?? "").includes("txHash"));
});

test("agent_fund_and_action_session_apply_event accepts fundingSubmitted with assetTransferResult envelope", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const planResult = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-session-envelope",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "100000",
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:10:00.000Z",
          maxStalenessSeconds: 300
        }
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1",
        allowedAdaptersRoot: "0x" + "00".repeat(32),
        maxDrawdownBps: "10000",
        maxCumulativeDrawdownBps: "10000",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        }
      },
      followUpAction: {
        kind: "custom.notify"
      }
    }
  });

  const planStructured = planResult.structuredContent as {
    result?: {
      fundingPlan?: unknown;
    };
  };

  const sessionResult = await client.callTool({
    name: "agent_fund_and_action_session_create",
    arguments: {
      fundAndActionPlan: planStructured.result,
      createdAt: "2026-03-09T01:00:00.000Z"
    }
  });

  const fundingEnvelopeResult = await client.callTool({
    name: "vault_asset_transfer_result_create",
    arguments: {
      assetTransferPlan: planStructured.result?.fundingPlan,
      status: "submitted",
      updatedAt: "2026-03-09T01:01:00.000Z",
      submittedAt: "2026-03-09T01:01:00.000Z",
      txHash: "0x" + "12".repeat(32)
    }
  });

  const sessionStructured = sessionResult.structuredContent as {
    result?: {
      session?: unknown;
    };
  };

  const fundingStructured = fundingEnvelopeResult.structuredContent as {
    result?: {
      assetTransferResult?: unknown;
    };
  };

  const result = await client.callTool({
    name: "agent_fund_and_action_session_apply_event",
    arguments: {
      session: sessionStructured.result?.session,
      event: {
        type: "fundingSubmitted",
        assetTransferResult: fundingStructured.result?.assetTransferResult
      }
    }
  });

  const structured = result.structuredContent as {
    result?: {
      session?: {
        fundingStep?: {
          status?: string;
          result?: { status?: string; txHash?: string };
        };
      };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.session?.fundingStep?.status, "submitted");
  assert.equal(structured.result?.session?.fundingStep?.result?.status, "submitted");
  assert.equal(structured.result?.session?.fundingStep?.result?.txHash, "0x" + "12".repeat(32));
});

test("vault_simulate_asset_transfer composes plan builder with simulateExecuteVault", async (t) => {
  const transferAdapter = {
    buildAssetTransferPlan: async () => ({
      result: {
        action: {
          adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          value: "0",
          data: "0xa9059cbb"
        },
        erc20Call: {
          to: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          data: "0xa9059cbb",
          value: "0"
        },
        humanReadableSummary: {
          kind: "erc20Transfer",
          tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          to: "0x2222222222222222222222222222222222222222",
          amountRaw: "1000000"
        },
        signRequest: {
          typedData: { domain: { chainId: 97n } },
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
        },
        simulateExecuteInput: {
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          from: "0x1111111111111111111111111111111111111111",
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
          signature: "0x1234",
          actions: [
            {
              adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
              value: "0",
              data: "0xa9059cbb"
            }
          ],
          adapterProofs: [["0x" + "66".repeat(32)]],
          extensions: "0x"
        }
      }
    }),
    simulateExecuteVault: async () => ({
      result: {
        ok: true,
        blockNumber: 123
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(transferAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "vault_simulate_asset_transfer",
    arguments: {
      chainId: 97,
      vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
      executor: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
      to: "0x2222222222222222222222222222222222222222",
      amountRaw: "1000000",
      nonce: "1",
      deadline: "9999999999",
      authorityEpoch: "1",
      allowedAdaptersRoot: "0x" + "00".repeat(32),
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000",
      signature: "0x1234",
      adapterProofs: [["0x" + "66".repeat(32)]]
    }
  });

  const structured = result.structuredContent as {
    result?: { simulate?: { ok?: boolean; blockNumber?: number } };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.simulate?.ok, true);
  assert.equal(structured.result?.simulate?.blockNumber, 123);
});

test("vault_prepare_asset_transfer composes plan builder with prepareExecuteTx", async (t) => {
  const transferAdapter = {
    buildAssetTransferPlan: async () => ({
      result: {
        action: {
          adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          value: "0",
          data: "0xa9059cbb"
        },
        erc20Call: {
          to: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          data: "0xa9059cbb",
          value: "0"
        },
        humanReadableSummary: {
          kind: "erc20Transfer",
          tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          to: "0x2222222222222222222222222222222222222222",
          amountRaw: "1000000"
        },
        signRequest: {
          typedData: { domain: { chainId: 97n } },
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
        },
        prepareExecuteInput: {
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          from: "0x1111111111111111111111111111111111111111",
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
          signature: "0x1234",
          actions: [
            {
              adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
              value: "0",
              data: "0xa9059cbb"
            }
          ],
          adapterProofs: [["0x" + "66".repeat(32)]],
          extensions: "0x"
        }
      }
    }),
    prepareExecuteTx: async () => ({
      result: {
        txRequest: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          data: "0xdeadbeef",
          value: "0"
        }
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(transferAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "vault_prepare_asset_transfer",
    arguments: {
      chainId: 97,
      vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
      executor: "0x1111111111111111111111111111111111111111",
      tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
      to: "0x2222222222222222222222222222222222222222",
      amountRaw: "1000000",
      nonce: "1",
      deadline: "9999999999",
      authorityEpoch: "1",
      allowedAdaptersRoot: "0x" + "00".repeat(32),
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000",
      signature: "0x1234",
      adapterProofs: [["0x" + "66".repeat(32)]]
    }
  });

  const structured = result.structuredContent as {
    result?: { txRequest?: { to?: string; data?: string } };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.txRequest?.to, "0x92040EBDA2143C3BBD12962479afA87dB6e56059");
  assert.equal(structured.result?.txRequest?.data, "0xdeadbeef");
});

test("agent_account_context_create returns normalized account context", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_account_context_create",
    arguments: {
      agentId: "predict-bot-ctx",
      chainId: 97,
      vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
      authority: "0x1111111111111111111111111111111111111111",
      executor: "0x2222222222222222222222222222222222222222",
      assetRegistryRef: "memory://assets/bsc-testnet",
      fundingPolicyRef: "memory://policy/predict-bot-ctx",
      defaults: {
        allowedAdaptersRoot: "0x" + "aa".repeat(32),
        maxDrawdownBps: "1000",
        maxCumulativeDrawdownBps: "3000",
        payloadBinding: "actionsDigest",
        extensions: "0x"
      },
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-09T00:00:00.000Z"
    }
  });

  const structured = result.structuredContent as {
    result?: {
      accountContext?: {
        agentId?: string;
        assetRegistryRef?: string;
        defaults?: { maxDrawdownBps?: string };
      };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.accountContext?.agentId, "predict-bot-ctx");
  assert.equal(structured.result?.accountContext?.assetRegistryRef, "memory://assets/bsc-testnet");
  assert.equal(structured.result?.accountContext?.defaults?.maxDrawdownBps, "1000");
});

test("agent_funding_policy_create returns normalized funding policy", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_funding_policy_create",
    arguments: {
      policyId: "predict-funding",
      allowedTokenAddresses: ["0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E"],
      allowedRecipients: ["0x2222222222222222222222222222222222222222"],
      maxAmountPerTx: "1000000",
      maxAmountPerWindow: "5000000",
      windowSeconds: 86400,
      expiresAt: "2026-12-31T00:00:00.000Z",
      repeatable: true,
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-09T00:00:00.000Z"
    }
  });

  const structured = result.structuredContent as {
    result?: { fundingPolicy?: { policyId?: string; maxAmountPerTx?: string } };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.fundingPolicy?.policyId, "predict-funding");
  assert.equal(structured.result?.fundingPolicy?.maxAmountPerTx, "1000000");
});

test("vault_check_asset_transfer_policy returns structured violations", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "vault_check_asset_transfer_policy",
    arguments: {
      fundingPolicy: {
        policyId: "predict-funding",
        allowedTokenAddresses: ["0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E"],
        allowedRecipients: ["0x2222222222222222222222222222222222222222"],
        maxAmountPerTx: "100",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
      to: "0x3333333333333333333333333333333333333333",
      amountRaw: "500"
    }
  });

  const structured = result.structuredContent as {
    result?: { allowed?: boolean; violations?: Array<{ code?: string }> };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.allowed, false);
  assert.deepEqual(
    (structured.result?.violations ?? []).map((violation) => violation.code).sort(),
    ["AMOUNT_EXCEEDS_PER_TX", "RECIPIENT_NOT_ALLOWED"].sort()
  );
});

test("vault_build_asset_transfer_plan_from_context returns context-aware plan payload", async (t) => {
  const contextAdapter = {
    buildAssetTransferPlanFromAccountContext: async () => ({
      result: {
        accountContext: {
          agentId: "predict-bot-ctx",
          chainId: 97,
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          authority: "0x1111111111111111111111111111111111111111",
          executor: "0x2222222222222222222222222222222222222222",
          createdAt: "2026-03-09T00:00:00.000Z",
          updatedAt: "2026-03-09T00:00:00.000Z"
        },
        action: {
          adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          value: "0",
          data: "0xa9059cbb"
        },
        erc20Call: {
          to: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          data: "0xa9059cbb",
          value: "0"
        },
        humanReadableSummary: {
          kind: "erc20Transfer",
          tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          to: "0x3333333333333333333333333333333333333333",
          amountRaw: "1000000"
        },
        signRequest: {
          typedData: { domain: { chainId: 97n } },
          mandate: {
            vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
            executor: "0x2222222222222222222222222222222222222222",
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
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(contextAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "vault_build_asset_transfer_plan_from_context",
    arguments: {
      accountContext: {
        agentId: "predict-bot-ctx",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingPolicy: {
        policyId: "predict-funding",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
      to: "0x3333333333333333333333333333333333333333",
      amountRaw: "1000000",
      nonce: "1",
      deadline: "9999999999",
      authorityEpoch: "1",
      allowedAdaptersRoot: "0x" + "00".repeat(32),
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000"
    }
  });

  const structured = result.structuredContent as {
    result?: { accountContext?: { agentId?: string }; signRequest?: { typedData?: { domain?: { chainId?: string } } } };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.accountContext?.agentId, "predict-bot-ctx");
  assert.equal(structured.result?.signRequest?.typedData?.domain?.chainId, "97");
});

test("vault_build_asset_transfer_plan_from_context supports generic 18-decimal asset metadata on real SDK path", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const stakingToken = "0x9999999999999999999999999999999999999999";
  const recipient = "0x4444444444444444444444444444444444444444";

  const result = await client.callTool({
    name: "vault_build_asset_transfer_plan_from_context",
    arguments: {
      accountContext: {
        agentId: "yield-bot-ctx",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        defaults: {
          allowedAdaptersRoot: "0x" + "00".repeat(32),
          maxDrawdownBps: "10000",
          maxCumulativeDrawdownBps: "10000",
          payloadBinding: "actionsDigest",
          extensions: "0x"
        },
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingPolicy: {
        policyId: "yield-topup-policy",
        allowedTokenAddresses: [stakingToken],
        allowedRecipients: [recipient],
        maxAmountPerTx: "5000000000000000000",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      tokenAddress: stakingToken,
      to: recipient,
      amountRaw: "2500000000000000000",
      nonce: "11",
      deadline: "9999999999",
      authorityEpoch: "1",
      symbol: "stUSD",
      decimals: 18
    }
  });

  const structured = result.structuredContent as {
    result?: {
      accountContext?: { agentId?: string };
      policyCheck?: { allowed?: boolean };
      humanReadableSummary?: {
        tokenAddress?: string;
        amountRaw?: string;
        symbol?: string;
        decimals?: number;
      };
      signRequest?: { typedData?: { domain?: { chainId?: string } } };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.accountContext?.agentId, "yield-bot-ctx");
  assert.equal(structured.result?.policyCheck?.allowed, true);
  assert.equal(structured.result?.humanReadableSummary?.tokenAddress, stakingToken);
  assert.equal(structured.result?.humanReadableSummary?.amountRaw, "2500000000000000000");
  assert.equal(structured.result?.humanReadableSummary?.symbol, "stUSD");
  assert.equal(structured.result?.humanReadableSummary?.decimals, 18);
  assert.equal(structured.result?.signRequest?.typedData?.domain?.chainId, "97");
});

test("vault_simulate_asset_transfer_from_context composes context plan builder with simulateExecuteVault", async (t) => {
  const contextAdapter = {
    buildAssetTransferPlanFromAccountContext: async () => ({
      result: {
        accountContext: {
          agentId: "predict-bot-ctx",
          chainId: 97,
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          authority: "0x1111111111111111111111111111111111111111",
          executor: "0x2222222222222222222222222222222222222222",
          createdAt: "2026-03-09T00:00:00.000Z",
          updatedAt: "2026-03-09T00:00:00.000Z"
        },
        action: {
          adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          value: "0",
          data: "0xa9059cbb"
        },
        erc20Call: {
          to: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          data: "0xa9059cbb",
          value: "0"
        },
        humanReadableSummary: {
          kind: "erc20Transfer",
          tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          to: "0x3333333333333333333333333333333333333333",
          amountRaw: "1000000"
        },
        signRequest: {
          typedData: { domain: { chainId: 97n } },
          mandate: {
            vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
            executor: "0x2222222222222222222222222222222222222222",
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
        },
        simulateExecuteInput: {
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          from: "0x2222222222222222222222222222222222222222",
          mandate: {
            vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
            executor: "0x2222222222222222222222222222222222222222",
            nonce: "1",
            deadline: "9999999999",
            authorityEpoch: "1",
            allowedAdaptersRoot: "0x" + "00".repeat(32),
            maxDrawdownBps: "10000",
            maxCumulativeDrawdownBps: "10000",
            payloadDigest: "0x" + "11".repeat(32),
            extensionsHash: "0x" + "22".repeat(32)
          },
          signature: "0x1234",
          actions: [
            {
              adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
              value: "0",
              data: "0xa9059cbb"
            }
          ],
          adapterProofs: [["0x" + "66".repeat(32)]],
          extensions: "0x"
        }
      }
    }),
    simulateExecuteVault: async () => ({
      result: {
        ok: true,
        blockNumber: 321
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(contextAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "vault_simulate_asset_transfer_from_context",
    arguments: {
      accountContext: {
        agentId: "predict-bot-ctx",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingPolicy: {
        policyId: "predict-funding",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
      to: "0x3333333333333333333333333333333333333333",
      amountRaw: "1000000",
      nonce: "1",
      deadline: "9999999999",
      authorityEpoch: "1",
      allowedAdaptersRoot: "0x" + "00".repeat(32),
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000",
      signature: "0x1234",
      adapterProofs: [["0x" + "66".repeat(32)]]
    }
  });

  const structured = result.structuredContent as {
    result?: { accountContext?: { agentId?: string }; simulate?: { blockNumber?: number } };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.accountContext?.agentId, "predict-bot-ctx");
  assert.equal(structured.result?.simulate?.blockNumber, 321);
});

test("vault_prepare_asset_transfer_from_context composes context plan builder with prepareExecuteTx", async (t) => {
  const contextAdapter = {
    buildAssetTransferPlanFromAccountContext: async () => ({
      result: {
        accountContext: {
          agentId: "predict-bot-ctx",
          chainId: 97,
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          authority: "0x1111111111111111111111111111111111111111",
          executor: "0x2222222222222222222222222222222222222222",
          createdAt: "2026-03-09T00:00:00.000Z",
          updatedAt: "2026-03-09T00:00:00.000Z"
        },
        action: {
          adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          value: "0",
          data: "0xa9059cbb"
        },
        erc20Call: {
          to: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          data: "0xa9059cbb",
          value: "0"
        },
        humanReadableSummary: {
          kind: "erc20Transfer",
          tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          to: "0x3333333333333333333333333333333333333333",
          amountRaw: "1000000"
        },
        signRequest: {
          typedData: { domain: { chainId: 97n } },
          mandate: {
            vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
            executor: "0x2222222222222222222222222222222222222222",
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
        },
        prepareExecuteInput: {
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          from: "0x2222222222222222222222222222222222222222",
          mandate: {
            vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
            executor: "0x2222222222222222222222222222222222222222",
            nonce: "1",
            deadline: "9999999999",
            authorityEpoch: "1",
            allowedAdaptersRoot: "0x" + "00".repeat(32),
            maxDrawdownBps: "10000",
            maxCumulativeDrawdownBps: "10000",
            payloadDigest: "0x" + "11".repeat(32),
            extensionsHash: "0x" + "22".repeat(32)
          },
          signature: "0x1234",
          actions: [
            {
              adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
              value: "0",
              data: "0xa9059cbb"
            }
          ],
          adapterProofs: [["0x" + "66".repeat(32)]],
          extensions: "0x"
        }
      }
    }),
    prepareExecuteTx: async () => ({
      result: {
        txRequest: {
          from: "0x2222222222222222222222222222222222222222",
          to: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          data: "0xbeadfeed",
          value: "0"
        }
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(contextAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "vault_prepare_asset_transfer_from_context",
    arguments: {
      accountContext: {
        agentId: "predict-bot-ctx",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingPolicy: {
        policyId: "predict-funding",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
      to: "0x3333333333333333333333333333333333333333",
      amountRaw: "1000000",
      nonce: "1",
      deadline: "9999999999",
      authorityEpoch: "1",
      allowedAdaptersRoot: "0x" + "00".repeat(32),
      maxDrawdownBps: "10000",
      maxCumulativeDrawdownBps: "10000",
      signature: "0x1234",
      adapterProofs: [["0x" + "66".repeat(32)]]
    }
  });

  const structured = result.structuredContent as {
    result?: { accountContext?: { agentId?: string }; txRequest?: { data?: string } };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.accountContext?.agentId, "predict-bot-ctx");
  assert.equal(structured.result?.txRequest?.data, "0xbeadfeed");
});

const validFundAndActionBalanceSnapshot = {
  snapshotAt: "2026-03-09T00:10:00.000Z",
  maxStalenessSeconds: 300,
  observedAtBlock: "123456",
  source: "predict-balance-indexer"
} as const;

test("agent_build_fund_and_action_plan returns funding step when target balance is insufficient", async (t) => {
  const orchestrationAdapter = {
    buildFundAndActionPlan: async () => ({
      result: {
        accountContext: {
          agentId: "predict-bot-fund",
          chainId: 97,
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          authority: "0x1111111111111111111111111111111111111111",
          executor: "0x2222222222222222222222222222222222222222",
          createdAt: "2026-03-09T00:00:00.000Z",
          updatedAt: "2026-03-09T00:00:00.000Z"
        },
        fundingPolicy: {
          policyId: "predict-topup-policy",
          allowedTokenAddresses: ["0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E"],
          allowedRecipients: ["0x3333333333333333333333333333333333333333"],
          createdAt: "2026-03-09T00:00:00.000Z",
          updatedAt: "2026-03-09T00:00:00.000Z"
        },
        fundingTarget: {
          label: "predict-account",
          recipient: "0x3333333333333333333333333333333333333333",
          tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          requiredAmountRaw: "1000000",
          currentBalanceRaw: "250000",
          balanceSnapshot: validFundAndActionBalanceSnapshot,
          fundingShortfallRaw: "750000",
          symbol: "USDT",
          decimals: 6
        },
        evaluatedAt: "2026-03-09T00:12:00.000Z",
        fundingRequired: true,
        fundingPlan: {
          accountContext: {
            agentId: "predict-bot-fund",
            chainId: 97,
            vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
            authority: "0x1111111111111111111111111111111111111111",
            executor: "0x2222222222222222222222222222222222222222",
            createdAt: "2026-03-09T00:00:00.000Z",
            updatedAt: "2026-03-09T00:00:00.000Z"
          },
          action: {
            adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
            value: "0",
            data: "0xa9059cbb"
          },
          erc20Call: {
            to: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
            data: "0xa9059cbb",
            value: "0"
          },
          humanReadableSummary: {
            kind: "erc20Transfer",
            tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
            to: "0x3333333333333333333333333333333333333333",
            amountRaw: "750000",
            symbol: "USDT",
            decimals: 6
          },
          signRequest: {
            typedData: { domain: { chainId: 97n } },
            mandate: {
              vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
              executor: "0x2222222222222222222222222222222222222222",
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
          },
          simulateExecuteInput: {
            chainId: 97,
            vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
            from: "0x2222222222222222222222222222222222222222",
            mandate: {
              vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
              executor: "0x2222222222222222222222222222222222222222",
              nonce: "1",
              deadline: "9999999999",
              authorityEpoch: "1",
              allowedAdaptersRoot: "0x" + "00".repeat(32),
              maxDrawdownBps: "10000",
              maxCumulativeDrawdownBps: "10000",
              payloadDigest: "0x" + "11".repeat(32),
              extensionsHash: "0x" + "22".repeat(32)
            },
            signature: "0x1234",
            actions: [
              {
                adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
                value: "0",
                data: "0xa9059cbb"
              }
            ],
            adapterProofs: [["0x" + "66".repeat(32)]],
            extensions: "0x"
          },
          prepareExecuteInput: {
            chainId: 97,
            vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
            from: "0x2222222222222222222222222222222222222222",
            mandate: {
              vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
              executor: "0x2222222222222222222222222222222222222222",
              nonce: "1",
              deadline: "9999999999",
              authorityEpoch: "1",
              allowedAdaptersRoot: "0x" + "00".repeat(32),
              maxDrawdownBps: "10000",
              maxCumulativeDrawdownBps: "10000",
              payloadDigest: "0x" + "11".repeat(32),
              extensionsHash: "0x" + "22".repeat(32)
            },
            signature: "0x1234",
            actions: [
              {
                adapter: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
                value: "0",
                data: "0xa9059cbb"
              }
            ],
            adapterProofs: [["0x" + "66".repeat(32)]],
            extensions: "0x"
          }
        },
        followUpAction: {
          kind: "predict.createOrder",
          target: "predict-order-engine",
          payload: {
            marketId: "btc-1h-up",
            collateralTokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
            collateralAmountRaw: "500000",
            orderSide: "buy"
          }
        },
        followUpActionPlan: {
          kind: "predict.createOrder",
          target: "predict-order-engine",
          executionMode: "offchain-api",
          summary: "Create predict order for market btc-1h-up using 500000 units of 0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E.",
          assetRequirement: {
            tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
            amountRaw: "500000"
          },
          payload: {
            marketId: "btc-1h-up",
            collateralTokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
            collateralAmountRaw: "500000",
            orderSide: "buy"
          }
        },
        steps: [
          {
            kind: "fundTargetAccount",
            status: "required",
            summary: "Fund predict-account with 750000 units of USDT."
          },
          {
            kind: "followUpAction",
            status: "pending",
            summary: "Run follow-up action: predict.createOrder."
          }
        ]
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(orchestrationAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-fund",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingPolicy: {
        policyId: "predict-topup-policy",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "250000",
        balanceSnapshot: validFundAndActionBalanceSnapshot,
        symbol: "USDT",
        decimals: 6
      },
      fundingContext: {
        nonce: "1",
        deadline: "9999999999",
        authorityEpoch: "1",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        },
        executeContext: {
          signature: "0x1234",
          adapterProofs: [["0x" + "66".repeat(32)]]
        }
      },
      followUpAction: {
        kind: "predict.createOrder",
        target: "predict-order-engine",
        payload: {
          marketId: "btc-1h-up",
          collateralTokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          collateralAmountRaw: "500000",
          orderSide: "buy"
        }
      }
    }
  });

  const structured = result.structuredContent as {
    result?: {
      evaluatedAt?: string;
      fundingRequired?: boolean;
      fundingTarget?: { fundingShortfallRaw?: string; balanceSnapshot?: { snapshotAt?: string } };
      fundingPlan?: { signRequest?: { typedData?: { domain?: { chainId?: string } } } };
      followUpActionPlan?: { executionMode?: string; assetRequirement?: { amountRaw?: string } };
      steps?: Array<{ kind?: string; status?: string }>;
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.evaluatedAt, "2026-03-09T00:12:00.000Z");
  assert.equal(structured.result?.fundingRequired, true);
  assert.equal(structured.result?.fundingTarget?.fundingShortfallRaw, "750000");
  assert.equal(structured.result?.fundingTarget?.balanceSnapshot?.snapshotAt, "2026-03-09T00:10:00.000Z");
  assert.equal(structured.result?.fundingPlan?.signRequest?.typedData?.domain?.chainId, "97");
  assert.equal(structured.result?.followUpActionPlan?.executionMode, "offchain-api");
  assert.equal(structured.result?.followUpActionPlan?.assetRequirement?.amountRaw, "500000");
  assert.deepEqual(
    structured.result?.steps?.map((step) => [step.kind, step.status]),
    [
      ["fundTargetAccount", "required"],
      ["followUpAction", "pending"]
    ]
  );
});

test("agent_build_fund_and_action_plan supports USDC-style predict top-up on real SDK path", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const usdc = "0x7777777777777777777777777777777777777777";
  const predictAccount = "0x3333333333333333333333333333333333333333";

  const result = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-usdc",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        defaults: {
          allowedAdaptersRoot: "0x" + "00".repeat(32),
          maxDrawdownBps: "10000",
          maxCumulativeDrawdownBps: "10000",
          payloadBinding: "actionsDigest",
          extensions: "0x"
        },
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingPolicy: {
        policyId: "predict-usdc-policy",
        allowedTokenAddresses: [usdc],
        allowedRecipients: [predictAccount],
        maxAmountPerTx: "5000000",
        maxAmountPerWindow: "20000000",
        windowSeconds: 86400,
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: predictAccount,
        tokenAddress: usdc,
        requiredAmountRaw: "2500000",
        currentBalanceRaw: "500000",
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:10:00.000Z",
          maxStalenessSeconds: 300,
          observedAtBlock: "123456",
          source: "predict-balance-indexer"
        },
        symbol: "USDC",
        decimals: 6
      },
      fundingContext: {
        nonce: "1",
        deadline: "9999999999",
        authorityEpoch: "1",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z",
          currentSpentInWindow: "1000000"
        }
      },
      followUpAction: {
        kind: "predict.createOrder",
        target: "predict-order-engine",
        payload: {
          marketId: "eth-4h-up",
          collateralTokenAddress: usdc,
          collateralAmountRaw: "2000000",
          orderSide: "buy",
          outcomeId: "up",
          clientOrderId: "ord-usdc-1"
        }
      }
    }
  });

  const structured = result.structuredContent as {
    result?: {
      fundingRequired?: boolean;
      fundingTarget?: { fundingShortfallRaw?: string };
      fundingPolicy?: { policyId?: string };
      fundingPlan?: {
        policyCheck?: { allowed?: boolean };
        humanReadableSummary?: { symbol?: string; decimals?: number; amountRaw?: string; tokenAddress?: string };
      };
      followUpActionPlan?: { executionMode?: string; assetRequirement?: { tokenAddress?: string; amountRaw?: string } };
      steps?: Array<{ kind?: string; status?: string }>;
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.fundingRequired, true);
  assert.equal(structured.result?.fundingPolicy?.policyId, "predict-usdc-policy");
  assert.equal(structured.result?.fundingTarget?.fundingShortfallRaw, "2000000");
  assert.equal(structured.result?.fundingPlan?.policyCheck?.allowed, true);
  assert.equal(structured.result?.fundingPlan?.humanReadableSummary?.tokenAddress, usdc);
  assert.equal(structured.result?.fundingPlan?.humanReadableSummary?.amountRaw, "2000000");
  assert.equal(structured.result?.fundingPlan?.humanReadableSummary?.symbol, "USDC");
  assert.equal(structured.result?.fundingPlan?.humanReadableSummary?.decimals, 6);
  assert.equal(structured.result?.followUpActionPlan?.executionMode, "offchain-api");
  assert.equal(structured.result?.followUpActionPlan?.assetRequirement?.tokenAddress, usdc);
  assert.equal(structured.result?.followUpActionPlan?.assetRequirement?.amountRaw, "2000000");
  assert.deepEqual(
    structured.result?.steps?.map((step) => [step.kind, step.status]),
    [
      ["fundTargetAccount", "required"],
      ["followUpAction", "pending"]
    ]
  );
});

test("agent_build_fund_and_action_plan skips funding step when target balance is already sufficient", async (t) => {
  const orchestrationAdapter = {
    buildFundAndActionPlan: async () => ({
      result: {
        accountContext: {
          agentId: "predict-bot-funded",
          chainId: 97,
          vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
          authority: "0x1111111111111111111111111111111111111111",
          executor: "0x2222222222222222222222222222222222222222",
          createdAt: "2026-03-09T00:00:00.000Z",
          updatedAt: "2026-03-09T00:00:00.000Z"
        },
        fundingTarget: {
          label: "predict-account",
          recipient: "0x3333333333333333333333333333333333333333",
          tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          requiredAmountRaw: "1000000",
          currentBalanceRaw: "1000000",
          balanceSnapshot: validFundAndActionBalanceSnapshot,
          fundingShortfallRaw: "0"
        },
        evaluatedAt: "2026-03-09T00:12:00.000Z",
        fundingRequired: false,
        followUpAction: {
          kind: "custom.notify"
        },
        followUpActionPlan: {
          kind: "custom.notify",
          executionMode: "custom",
          summary: "Run follow-up action: custom.notify."
        },
        steps: [
          {
            kind: "fundTargetAccount",
            status: "skipped",
            summary: "predict-account already has sufficient balance."
          },
          {
            kind: "followUpAction",
            status: "pending",
            summary: "Run follow-up action: custom.notify."
          }
        ]
      }
    })
  } as any;

  const { client, server } = await createConnectedClient(orchestrationAdapter);

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-funded",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "1000000",
        balanceSnapshot: validFundAndActionBalanceSnapshot
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        }
      },
      followUpAction: {
        kind: "custom.notify"
      }
    }
  });

  const structured = result.structuredContent as {
    result?: {
      evaluatedAt?: string;
      fundingRequired?: boolean;
      fundingPlan?: unknown;
      followUpActionPlan?: { executionMode?: string };
      steps?: Array<{ status?: string }>;
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.evaluatedAt, "2026-03-09T00:12:00.000Z");
  assert.equal(structured.result?.fundingRequired, false);
  assert.equal(structured.result?.fundingPlan, undefined);
  assert.equal(structured.result?.followUpActionPlan?.executionMode, "custom");
  assert.deepEqual(
    structured.result?.steps?.map((step) => step.status),
    ["skipped", "pending"]
  );
});

test("agent_build_fund_and_action_plan rejects invalid predict.createOrder payload at schema layer", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-funded",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "1000000",
        balanceSnapshot: validFundAndActionBalanceSnapshot
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1"
      },
      followUpAction: {
        kind: "predict.createOrder",
        target: "predict-order-engine",
        payload: {
          marketId: "btc-1h-up",
          collateralAmountRaw: "500000"
        }
      }
    }
  });

  const structured = result.structuredContent as {
    error?: { code?: string; message?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INVALID_INPUT");
  assert.ok((structured.error?.message ?? "").includes("collateralTokenAddress"));
});

test("agent_build_fund_and_action_plan rejects missing currentBalanceRaw at schema layer", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-funded",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        balanceSnapshot: validFundAndActionBalanceSnapshot
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1"
      },
      followUpAction: {
        kind: "predict.createOrder"
      }
    }
  });

  const structured = result.structuredContent as {
    result?: unknown;
    error?: { code?: string; message?: string; details?: { addedResultFromSchemaRepair?: boolean } };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INVALID_INPUT");
  assert.equal(typeof structured.error?.message, "string");
  assert.ok((structured.error?.message ?? "").includes("currentBalanceRaw"));
  assert.equal(structured.result, undefined);
});

test("agent_build_fund_and_action_plan rejects missing balanceSnapshot at schema layer", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-funded",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "1000000"
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1"
      },
      followUpAction: {
        kind: "custom.notify"
      }
    }
  });

  const structured = result.structuredContent as {
    result?: unknown;
    error?: { code?: string; message?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INVALID_INPUT");
  assert.ok((structured.error?.message ?? "").includes("balanceSnapshot"));
  assert.equal(structured.result, undefined);
});

test("agent_build_fund_and_action_plan rejects stale balance snapshot at SDK layer", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-funded",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "100000",
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:00:00.000Z",
          maxStalenessSeconds: 60
        }
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1",
        policyEvaluation: {
          now: "2026-03-09T00:05:00.000Z"
        }
      },
      followUpAction: {
        kind: "custom.notify"
      }
    }
  });

  const structured = result.structuredContent as {
    error?: { code?: string; message?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "STALE_BALANCE_SNAPSHOT");
  assert.ok((structured.error?.message ?? "").includes("stale"));
});

test("agent_follow_up_action_result_create returns normalized succeeded envelope", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_follow_up_action_result_create",
    arguments: {
      followUpActionPlan: {
        kind: "predict.createOrder",
        target: "predict-order-engine",
        executionMode: "offchain-api",
        summary: "Create predict order for market btc-1h-up using 500000 units of 0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E.",
        assetRequirement: {
          tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          amountRaw: "500000"
        },
        payload: {
          marketId: "btc-1h-up",
          collateralTokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          collateralAmountRaw: "500000",
          orderSide: "buy"
        }
      },
      status: "succeeded",
      updatedAt: "2026-03-09T01:00:00.000Z",
      reference: {
        type: "orderId",
        value: "pred-ord-1"
      },
      output: {
        accepted: true
      }
    }
  });

  const structured = result.structuredContent as {
    result?: {
      followUpActionResult?: {
        status?: string;
        completedAt?: string;
        reference?: { value?: string };
        summary?: string;
      };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.followUpActionResult?.status, "succeeded");
  assert.equal(structured.result?.followUpActionResult?.completedAt, "2026-03-09T01:00:00.000Z");
  assert.equal(structured.result?.followUpActionResult?.reference?.value, "pred-ord-1");
  assert.ok((structured.result?.followUpActionResult?.summary ?? "").includes("Succeeded:"));
});

test("agent_follow_up_action_result_create rejects failed envelope without error", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const result = await client.callTool({
    name: "agent_follow_up_action_result_create",
    arguments: {
      followUpActionPlan: {
        kind: "custom.notify",
        executionMode: "custom",
        summary: "Run follow-up action: custom.notify."
      },
      status: "failed",
      updatedAt: "2026-03-09T01:00:00.000Z"
    }
  });

  const structured = result.structuredContent as {
    error?: { code?: string; message?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "FAILED_RESULT_REQUIRES_ERROR");
  assert.ok((structured.error?.message ?? "").includes("requires error"));
});

test("agent_fund_and_action_session_create returns resumable session from plan", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const planResult = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-session",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "100000",
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:10:00.000Z",
          maxStalenessSeconds: 300
        }
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1",
        allowedAdaptersRoot: "0x" + "11".repeat(32),
        maxDrawdownBps: "1000",
        maxCumulativeDrawdownBps: "2500",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        }
      },
      followUpAction: {
        kind: "predict.createOrder",
        target: "predict-order-engine",
        payload: {
          marketId: "btc-1h-up",
          collateralTokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          collateralAmountRaw: "500000"
        }
      }
    }
  });

  const planStructured = planResult.structuredContent as {
    result?: unknown;
  };

  const result = await client.callTool({
    name: "agent_fund_and_action_session_create",
    arguments: {
      fundAndActionPlan: planStructured.result,
      sessionId: "session-1",
      createdAt: "2026-03-09T01:00:00.000Z"
    }
  });

  const structured = result.structuredContent as {
    result?: {
      session?: {
        sessionId?: string;
        status?: string;
        currentStep?: string;
        fundingStep?: { status?: string };
      };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.session?.sessionId, "session-1");
  assert.equal(structured.result?.session?.status, "pendingFunding");
  assert.equal(structured.result?.session?.currentStep, "fundTargetAccount");
  assert.equal(structured.result?.session?.fundingStep?.status, "pending");
});

test("agent_fund_and_action_session_apply_event rejects follow-up submission before funding confirmation", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const planResult = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-session",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "100000",
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:10:00.000Z",
          maxStalenessSeconds: 300
        }
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1",
        allowedAdaptersRoot: "0x" + "11".repeat(32),
        maxDrawdownBps: "1000",
        maxCumulativeDrawdownBps: "2500",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        }
      },
      followUpAction: {
        kind: "predict.createOrder",
        target: "predict-order-engine",
        payload: {
          marketId: "btc-1h-up",
          collateralTokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          collateralAmountRaw: "500000"
        }
      }
    }
  });

  const planStructured = planResult.structuredContent as {
    result?: unknown;
  };

  const sessionResult = await client.callTool({
    name: "agent_fund_and_action_session_create",
    arguments: {
      fundAndActionPlan: planStructured.result,
      createdAt: "2026-03-09T01:00:00.000Z"
    }
  });

  const sessionStructured = sessionResult.structuredContent as {
    result?: {
      session?: unknown;
    };
  };

  const result = await client.callTool({
    name: "agent_fund_and_action_session_apply_event",
    arguments: {
      session: sessionStructured.result?.session,
      event: {
        type: "followUpSubmitted",
        updatedAt: "2026-03-09T01:01:00.000Z"
      }
    }
  });

  const structured = result.structuredContent as {
    error?: { code?: string; message?: string };
  };

  assert.equal(result.isError, true);
  assert.equal(structured.error?.code, "INVALID_EVENT_TRANSITION");
  assert.ok((structured.error?.message ?? "").includes("follow-up"));
});

test("agent_fund_and_action_session_next_step returns submitFunding task for fresh session", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const planResult = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-session-next-step",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "100000",
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:10:00.000Z",
          maxStalenessSeconds: 300
        }
      },
      fundingContext: {
        nonce: "2",
        deadline: "9999999999",
        authorityEpoch: "1",
        allowedAdaptersRoot: "0x" + "11".repeat(32),
        maxDrawdownBps: "1000",
        maxCumulativeDrawdownBps: "2500",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        }
      },
      followUpAction: {
        kind: "predict.createOrder",
        target: "predict-order-engine",
        payload: {
          marketId: "btc-1h-up",
          collateralTokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
          collateralAmountRaw: "500000"
        }
      }
    }
  });

  const planStructured = planResult.structuredContent as {
    result?: unknown;
  };

  const sessionResult = await client.callTool({
    name: "agent_fund_and_action_session_create",
    arguments: {
      fundAndActionPlan: planStructured.result,
      createdAt: "2026-03-09T01:00:00.000Z"
    }
  });

  const sessionStructured = sessionResult.structuredContent as {
    result?: {
      session?: unknown;
    };
  };

  const result = await client.callTool({
    name: "agent_fund_and_action_session_next_step",
    arguments: {
      session: sessionStructured.result?.session
    }
  });

  const structured = result.structuredContent as {
    result?: {
      task?: {
        kind?: string;
        fundingPlan?: { humanReadableSummary?: { amountRaw?: string } };
      };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.task?.kind, "submitFunding");
  assert.equal(structured.result?.task?.fundingPlan?.humanReadableSummary?.amountRaw, "900000");
});

test("agent_fund_and_action_session_next_step returns completed task for terminal session", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const planResult = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-session-complete",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "1000000",
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:10:00.000Z",
          maxStalenessSeconds: 300
        }
      },
      fundingContext: {
        nonce: "3",
        deadline: "9999999999",
        authorityEpoch: "1",
        allowedAdaptersRoot: "0x" + "11".repeat(32),
        maxDrawdownBps: "1000",
        maxCumulativeDrawdownBps: "2500",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        }
      },
      followUpAction: {
        kind: "custom.notify"
      }
    }
  });

  const planStructured = planResult.structuredContent as {
    result?: {
      followUpActionPlan?: unknown;
    };
  };

  const sessionResult = await client.callTool({
    name: "agent_fund_and_action_session_create",
    arguments: {
      fundAndActionPlan: planStructured.result,
      createdAt: "2026-03-09T01:00:00.000Z"
    }
  });

  const sessionStructured = sessionResult.structuredContent as {
    result?: {
      session?: unknown;
    };
  };

  const followUpResult = await client.callTool({
    name: "agent_follow_up_action_result_create",
    arguments: {
      followUpActionPlan: planStructured.result?.followUpActionPlan,
      status: "succeeded",
      updatedAt: "2026-03-09T01:01:00.000Z"
    }
  });

  const followUpStructured = followUpResult.structuredContent as {
    result?: {
      followUpActionResult?: unknown;
    };
  };

  const completedSession = await client.callTool({
    name: "agent_fund_and_action_session_apply_event",
    arguments: {
      session: sessionStructured.result?.session,
      event: {
        type: "followUpResultReceived",
        followUpActionResult: followUpStructured.result?.followUpActionResult
      }
    }
  });

  const completedStructured = completedSession.structuredContent as {
    result?: {
      session?: unknown;
    };
  };

  const result = await client.callTool({
    name: "agent_fund_and_action_session_next_step",
    arguments: {
      session: completedStructured.result?.session
    }
  });

  const structured = result.structuredContent as {
    result?: {
      task?: {
        kind?: string;
        status?: string;
        result?: { status?: string };
      };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.task?.kind, "completed");
  assert.equal(structured.result?.task?.status, "succeeded");
  assert.equal(structured.result?.task?.result?.status, "succeeded");
});

test("agent_fund_and_action_session_next_step preserves funding failure context on completed task", async (t) => {
  const { client, server } = await createConnectedClient();

  t.after(async () => {
    await client.close();
    await server.close();
  });

  const planResult = await client.callTool({
    name: "agent_build_fund_and_action_plan",
    arguments: {
      accountContext: {
        agentId: "predict-bot-session-funding-failed",
        chainId: 97,
        vault: "0x92040EBDA2143C3BBD12962479afA87dB6e56059",
        authority: "0x1111111111111111111111111111111111111111",
        executor: "0x2222222222222222222222222222222222222222",
        createdAt: "2026-03-09T00:00:00.000Z",
        updatedAt: "2026-03-09T00:00:00.000Z"
      },
      fundingTarget: {
        label: "predict-account",
        recipient: "0x3333333333333333333333333333333333333333",
        tokenAddress: "0x128e3C6376c3Db6a343bC350684b6dEa5999cA4E",
        requiredAmountRaw: "1000000",
        currentBalanceRaw: "100000",
        balanceSnapshot: {
          snapshotAt: "2026-03-09T00:10:00.000Z",
          maxStalenessSeconds: 300
        }
      },
      fundingContext: {
        nonce: "4",
        deadline: "9999999999",
        authorityEpoch: "1",
        allowedAdaptersRoot: "0x" + "11".repeat(32),
        maxDrawdownBps: "1000",
        maxCumulativeDrawdownBps: "2500",
        policyEvaluation: {
          now: "2026-03-09T00:12:00.000Z"
        }
      },
      followUpAction: {
        kind: "custom.notify"
      }
    }
  });

  const planStructured = planResult.structuredContent as {
    result?: {
      fundingPlan?: unknown;
    };
  };

  const sessionResult = await client.callTool({
    name: "agent_fund_and_action_session_create",
    arguments: {
      fundAndActionPlan: planStructured.result,
      createdAt: "2026-03-09T01:00:00.000Z"
    }
  });

  const sessionStructured = sessionResult.structuredContent as {
    result?: {
      session?: unknown;
    };
  };

  const failedFundingResult = await client.callTool({
    name: "vault_asset_transfer_result_create",
    arguments: {
      assetTransferPlan: planStructured.result?.fundingPlan,
      status: "failed",
      updatedAt: "2026-03-09T01:01:00.000Z",
      submittedAt: "2026-03-09T01:00:30.000Z",
      completedAt: "2026-03-09T01:01:00.000Z",
      chainId: 97,
      txHash: "0x" + "ab".repeat(32),
      error: {
        code: "TRANSFER_REVERTED",
        message: "funding reverted"
      }
    }
  });

  const failedFundingStructured = failedFundingResult.structuredContent as {
    result?: {
      assetTransferResult?: unknown;
    };
  };

  const failedSession = await client.callTool({
    name: "agent_fund_and_action_session_apply_event",
    arguments: {
      session: sessionStructured.result?.session,
      event: {
        type: "fundingFailed",
        assetTransferResult: failedFundingStructured.result?.assetTransferResult
      }
    }
  });

  const failedSessionStructured = failedSession.structuredContent as {
    result?: {
      session?: unknown;
    };
  };

  const result = await client.callTool({
    name: "agent_fund_and_action_session_next_step",
    arguments: {
      session: failedSessionStructured.result?.session
    }
  });

  const structured = result.structuredContent as {
    result?: {
      task?: {
        kind?: string;
        status?: string;
        assetTransferResult?: { status?: string; error?: { code?: string } };
      };
    };
  };

  assert.equal(result.isError, false);
  assert.equal(structured.result?.task?.kind, "completed");
  assert.equal(structured.result?.task?.status, "failed");
  assert.equal(structured.result?.task?.assetTransferResult?.status, "failed");
  assert.equal(structured.result?.task?.assetTransferResult?.error?.code, "TRANSFER_REVERTED");
});
