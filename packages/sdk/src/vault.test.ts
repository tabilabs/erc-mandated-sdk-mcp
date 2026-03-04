import assert from "node:assert/strict";
import test from "node:test";

import { type Address } from "viem";

import {
  VaultHealthCheckError,
  healthCheckVault,
  type VaultHealthReadClient
} from "./vault.js";

type ReadCall = {
  functionName: string;
  blockNumber?: bigint;
  args?: readonly unknown[];
};

function buildMockVaultClient(config?: {
  blockNumber?: bigint;
  mandateAuthority?: Address;
  authorityEpoch?: bigint;
  pendingAuthority?: Address;
  nonceThreshold?: bigint;
  totalAssets?: bigint;
}) {
  const calls: ReadCall[] = [];
  let getBlockNumberCalls = 0;

  const state = {
    blockNumber: config?.blockNumber ?? 123n,
    mandateAuthority:
      config?.mandateAuthority ?? ("0x1111111111111111111111111111111111111111" as Address),
    authorityEpoch: config?.authorityEpoch ?? 42n,
    pendingAuthority:
      config?.pendingAuthority ?? ("0x2222222222222222222222222222222222222222" as Address),
    nonceThreshold: config?.nonceThreshold ?? 77n,
    totalAssets: config?.totalAssets ?? 999999n
  };

  const client: VaultHealthReadClient = {
    async getBlockNumber() {
      getBlockNumberCalls += 1;
      return state.blockNumber;
    },
    async readContract(parameters) {
      calls.push({
        functionName: parameters.functionName,
        blockNumber: parameters.blockNumber,
        args: parameters.args
      });

      switch (parameters.functionName) {
        case "mandateAuthority":
          return state.mandateAuthority;
        case "authorityEpoch":
          return state.authorityEpoch;
        case "pendingAuthority":
          return state.pendingAuthority;
        case "nonceThreshold":
          return state.nonceThreshold;
        case "totalAssets":
          return state.totalAssets;
        default:
          throw new Error(`Unexpected functionName: ${String(parameters.functionName)}`);
      }
    }
  };

  return { client, calls, getBlockNumberCalls: () => getBlockNumberCalls, state };
}

test("healthCheckVault maps fields and converts uint values to decimal strings", async () => {
  const vault = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  const { client, calls, getBlockNumberCalls, state } = buildMockVaultClient({
    blockNumber: 456n,
    authorityEpoch: 123456789n,
    nonceThreshold: 300n,
    totalAssets: 9876543210n
  });

  const output = await healthCheckVault(
    {
      chainId: 97,
      vault,
      blockTag: "latest"
    },
    { client }
  );

  assert.equal(getBlockNumberCalls(), 1);
  assert.equal(output.result.blockNumber, 456);
  assert.equal(output.result.vault, vault);
  assert.equal(output.result.mandateAuthority, state.mandateAuthority);
  assert.equal(output.result.authorityEpoch, "123456789");
  assert.equal(output.result.pendingAuthority, state.pendingAuthority);
  assert.equal(output.result.nonceThreshold, "300");
  assert.equal(output.result.totalAssets, "9876543210");

  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.blockNumber, 456n);
  }

  const nonceCall = calls.find((call) => call.functionName === "nonceThreshold");
  assert.deepEqual(nonceCall?.args, [state.mandateAuthority]);
});

test("healthCheckVault uses decimal blockTag and skips getBlockNumber", async () => {
  const vault = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
  const { client, calls, getBlockNumberCalls } = buildMockVaultClient({
    blockNumber: 999n
  });

  const output = await healthCheckVault(
    {
      chainId: 11155111,
      vault,
      blockTag: "789"
    },
    { client }
  );

  assert.equal(getBlockNumberCalls(), 0);
  assert.equal(output.result.blockNumber, 789);
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.blockNumber, 789n);
  }
});

test("healthCheckVault rejects invalid blockTag", async () => {
  const { client } = buildMockVaultClient();

  await assert.rejects(
    async () => {
      await healthCheckVault(
        {
          chainId: 97,
          vault: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
          blockTag: "12.34"
        },
        { client }
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof VaultHealthCheckError);
      assert.equal(error.code, "INVALID_BLOCK_TAG");
      assert.equal(error.field, "blockTag");
      assert.equal(error.value, "12.34");
      return true;
    }
  );
});

test("healthCheckVault rejects invalid vault address", async () => {
  const { client } = buildMockVaultClient();

  await assert.rejects(
    async () => {
      await healthCheckVault(
        {
          chainId: 97,
          vault: "0x123" as Address,
          blockTag: "latest"
        },
        { client }
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof VaultHealthCheckError);
      assert.equal(error.code, "INVALID_VAULT_ADDRESS");
      assert.equal(error.field, "vault");
      assert.equal(error.value, "0x123");
      return true;
    }
  );
});

test("healthCheckVault throws UNEXPECTED_RETURN_TYPE when readContract returns invalid type", async () => {
  const vault = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
  let readContractCalls = 0;

  const client: VaultHealthReadClient = {
    async getBlockNumber() {
      return 100n;
    },
    async readContract(parameters) {
      readContractCalls += 1;
      switch (parameters.functionName) {
        case "mandateAuthority":
          return "0x1111111111111111111111111111111111111111" as Address;
        case "authorityEpoch":
          return "not-a-bigint" as unknown as bigint;
        case "pendingAuthority":
          return "0x2222222222222222222222222222222222222222" as Address;
        case "totalAssets":
          return 10n;
        case "nonceThreshold":
          return 1n;
        default:
          throw new Error(`Unexpected functionName: ${String(parameters.functionName)}`);
      }
    }
  };

  await assert.rejects(
    async () => {
      await healthCheckVault(
        {
          chainId: 97,
          vault,
          blockTag: "latest"
        },
        { client }
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof VaultHealthCheckError);
      assert.equal(error.code, "UNEXPECTED_RETURN_TYPE");
      assert.equal(error.field, "authorityEpoch");
      assert.equal(error.value, "not-a-bigint");
      return true;
    }
  );

  assert.equal(readContractCalls, 4);
});

test("healthCheckVault rejects oversized decimal blockTag before any RPC calls", async () => {
  const vault = "0xffffffffffffffffffffffffffffffffffffffff" as Address;
  const { client, calls, getBlockNumberCalls } = buildMockVaultClient();
  const oversizedBlockTag = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(10);

  await assert.rejects(
    async () => {
      await healthCheckVault(
        {
          chainId: 97,
          vault,
          blockTag: oversizedBlockTag
        },
        { client }
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof VaultHealthCheckError);
      assert.equal(error.code, "BLOCK_NUMBER_OUT_OF_RANGE");
      assert.equal(error.field, "blockNumber");
      assert.equal(error.value, oversizedBlockTag);
      return true;
    }
  );

  assert.equal(getBlockNumberCalls(), 0);
  assert.equal(calls.length, 0);
});

test("healthCheckVault rejects oversized decimal blockTag even without injected client", async () => {
  const oversizedBlockTag = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(10);

  await assert.rejects(
    async () => {
      await healthCheckVault({
        chainId: 97,
        vault: "0x1111111111111111111111111111111111111111" as Address,
        blockTag: oversizedBlockTag
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof VaultHealthCheckError);
      assert.equal(error.code, "BLOCK_NUMBER_OUT_OF_RANGE");
      assert.equal(error.field, "blockNumber");
      assert.equal(error.value, oversizedBlockTag);
      return true;
    }
  );
});

test("healthCheckVault rejects block number beyond JS safe integer", async () => {
  const { client } = buildMockVaultClient({
    blockNumber: BigInt(Number.MAX_SAFE_INTEGER) + 1n
  });

  await assert.rejects(
    async () => {
      await healthCheckVault(
        {
          chainId: 97,
          vault: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          blockTag: "latest"
        },
        { client }
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof VaultHealthCheckError);
      assert.equal(error.code, "BLOCK_NUMBER_OUT_OF_RANGE");
      assert.equal(error.field, "blockNumber");
      return true;
    }
  );
});
