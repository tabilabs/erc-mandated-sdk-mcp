import assert from "node:assert/strict";
import test from "node:test";

import { encodeFunctionData, toFunctionSelector, type Address, type Hash } from "viem";

import { vaultFactoryAbi } from "./abi/vaultFactory.js";
import {
  FactoryConfigError,
  prepareCreateVaultTx,
  predictVaultAddress,
  type FactoryAddressSource,
  type VaultFactoryReadClient
} from "./factory.js";

const BSC_TESTNET_FACTORY_ENV_KEYS = [
  "BSC_TESTNET_FACTORY_ADDRESS",
  "BSC_TESTNET_FACTORY",
  "FACTORY_ADDRESS"
] as const;

const BSC_MAINNET_FACTORY_ENV_KEYS = [
  "BSC_MAINNET_FACTORY_ADDRESS",
  "BSC_FACTORY_ADDRESS",
  "FACTORY_ADDRESS"
] as const;

const BASE_MAINNET_FACTORY_ENV_KEYS = [
  "BASE_MAINNET_FACTORY_ADDRESS",
  "BASE_FACTORY_ADDRESS",
  "FACTORY_ADDRESS"
] as const;

const BSC_TESTNET_REGISTRY_FACTORY = "0xbC71DD7c14aD11384143A40166EAeCD6cc9bAb95" as Address;
const BSC_MAINNET_REGISTRY_FACTORY = "0x6eFC613Ece5D95e4a7b69B4EddD332CeeCbb61c6" as Address;
const CONTRACT_VERSION_ENV = "ERC_MANDATED_CONTRACT_VERSION";

function assertFactorySource(value: unknown, expected: FactoryAddressSource): void {
  assert.equal(value, expected);
}

function snapshotEnv(keys: readonly string[]): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function buildMockReadClient(predictedVault: Address) {
  const calls: Array<{
    address: Address;
    functionName: string;
    args: readonly unknown[];
  }> = [];

  const client: VaultFactoryReadClient = {
    async readContract(parameters) {
      calls.push({
        address: parameters.address,
        functionName: parameters.functionName,
        args: parameters.args
      });

      return predictedVault;
    }
  };

  return { client, calls };
}

test("prepareCreateVaultTx encodes calldata selector and builds txRequest with value=0", async () => {
  const factory = "0x1111111111111111111111111111111111111111" as Address;
  const from = "0x2222222222222222222222222222222222222222" as Address;
  const asset = "0x3333333333333333333333333333333333333333" as Address;
  const authority = "0x4444444444444444444444444444444444444444" as Address;
  const salt = `0x${"aa".repeat(32)}` as Hash;
  const predictedVault = "0x5555555555555555555555555555555555555555" as Address;

  const { client, calls } = buildMockReadClient(predictedVault);

  const output = await prepareCreateVaultTx(
    {
      chainId: 97,
      factory,
      from,
      asset,
      name: "Vault Name",
      symbol: "VAULT",
      authority,
      salt
    },
    { client }
  );

  const expectedData = encodeFunctionData({
    abi: vaultFactoryAbi,
    functionName: "createVault",
    args: [asset, "Vault Name", "VAULT", authority, salt]
  });

  assert.equal(output.result.txRequest.to, factory);
  assert.equal(output.result.txRequest.from, from);
  assert.equal(output.result.txRequest.value, "0");
  assert.equal(output.result.txRequest.data, expectedData);
  assertFactorySource(output.result.factorySource, "input");

  const createVaultSelector = toFunctionSelector(
    "function createVault(address asset, string name, string symbol, address authority, bytes32 salt)"
  );
  assert.equal(output.result.txRequest.data.slice(0, 10), createVaultSelector);

  assert.equal(output.result.predictedVault, predictedVault);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.address, factory);
  assert.equal(calls[0]?.functionName, "predictVaultAddress");
  assert.deepEqual(calls[0]?.args, [from, asset, "Vault Name", "VAULT", authority, salt]);
});

test("predictVaultAddress uses readContract with non-creator overload args", async () => {
  const factory = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  const asset = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
  const authority = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
  const salt = `0x${"11".repeat(32)}` as Hash;
  const predictedVault = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;

  const { client, calls } = buildMockReadClient(predictedVault);

  const output = await predictVaultAddress(
    {
      chainId: 11155111,
      factory,
      asset,
      name: "Vault",
      symbol: "VLT",
      authority,
      salt
    },
    { client }
  );

  assert.equal(output.result.predictedVault, predictedVault);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.address, factory);
  assert.equal(calls[0]?.functionName, "predictVaultAddress");
  assert.deepEqual(calls[0]?.args, [asset, "Vault", "VLT", authority, salt]);
});

test("predictVaultAddress defaults chainId=97 and reads factory from env", async () => {
  const envSnapshot = snapshotEnv(BSC_TESTNET_FACTORY_ENV_KEYS);
  const predictedVault = "0x6666666666666666666666666666666666666666" as Address;
  const envFactory = "0x7777777777777777777777777777777777777777" as Address;

  process.env.BSC_TESTNET_FACTORY_ADDRESS = envFactory;
  delete process.env.BSC_TESTNET_FACTORY;
  delete process.env.FACTORY_ADDRESS;

  try {
    const { client, calls } = buildMockReadClient(predictedVault);

    const output = await predictVaultAddress(
      {
        asset: "0x8888888888888888888888888888888888888888" as Address,
        name: "Env Vault",
        symbol: "ENV",
        authority: "0x9999999999999999999999999999999999999999" as Address,
        salt: `0x${"22".repeat(32)}` as Hash
      },
      { client }
    );

    assert.equal(output.result.predictedVault, predictedVault);
    assertFactorySource(output.result.factorySource, "env");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.address, envFactory);
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("predictVaultAddress resolves from registry on BSC Testnet when input/env are missing", async () => {
  const envSnapshot = snapshotEnv(BSC_TESTNET_FACTORY_ENV_KEYS);

  delete process.env.BSC_TESTNET_FACTORY_ADDRESS;
  delete process.env.BSC_TESTNET_FACTORY;
  delete process.env.FACTORY_ADDRESS;

  try {
    const predictedVault = "0x6666666666666666666666666666666666666666" as Address;
    const { client, calls } = buildMockReadClient(predictedVault);

    const output = await predictVaultAddress(
      {
        chainId: 97,
        asset: "0x2222222222222222222222222222222222222222" as Address,
        name: "RegistryFallback",
        symbol: "RF",
        authority: "0x3333333333333333333333333333333333333333" as Address,
        salt: `0x${"33".repeat(32)}` as Hash
      },
      { client }
    );

    assert.equal(output.result.predictedVault, predictedVault);
    assertFactorySource(output.result.factorySource, "registry");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.address, BSC_TESTNET_REGISTRY_FACTORY);
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("predictVaultAddress resolves from registry on BSC Mainnet when input/env are missing", async () => {
  const envSnapshot = snapshotEnv(BSC_MAINNET_FACTORY_ENV_KEYS);

  delete process.env.BSC_MAINNET_FACTORY_ADDRESS;
  delete process.env.BSC_FACTORY_ADDRESS;
  delete process.env.FACTORY_ADDRESS;

  try {
    const predictedVault = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const { client, calls } = buildMockReadClient(predictedVault);

    const output = await predictVaultAddress(
      {
        chainId: 56,
        asset: "0x2222222222222222222222222222222222222222" as Address,
        name: "MainnetRegistryFallback",
        symbol: "MRF",
        authority: "0x3333333333333333333333333333333333333333" as Address,
        salt: `0x${"55".repeat(32)}` as Hash
      },
      { client }
    );

    assert.equal(output.result.predictedVault, predictedVault);
    assertFactorySource(output.result.factorySource, "registry");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.address, BSC_MAINNET_REGISTRY_FACTORY);
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("predictVaultAddress keeps old behavior when active deployment registry version has no packaged entries", async () => {
  const envSnapshot = snapshotEnv(BSC_TESTNET_FACTORY_ENV_KEYS);

  delete process.env.BSC_TESTNET_FACTORY_ADDRESS;
  delete process.env.BSC_TESTNET_FACTORY;
  delete process.env.FACTORY_ADDRESS;

  try {
    const { client } = buildMockReadClient("0x1111111111111111111111111111111111111111" as Address);

    await assert.rejects(
      async () => {
        await predictVaultAddress(
          {
            chainId: 97,
            asset: "0x2222222222222222222222222222222222222222" as Address,
            name: "LegacyContractLine",
            symbol: "LCL",
            authority: "0x3333333333333333333333333333333333333333" as Address,
            salt: `0x${"58".repeat(32)}` as Hash
          },
          {
            client,
            deploymentContractVersion: "v0.3.0-agent-contract"
          }
        );
      },
      (error: unknown) => {
        assert.ok(error instanceof FactoryConfigError);
        assert.equal(error.code, "FACTORY_ADDRESS_NOT_CONFIGURED");
        assert.equal(error.chainId, 97);
        return true;
      }
    );
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("predictVaultAddress respects ERC_MANDATED_CONTRACT_VERSION for legacy contract line", async () => {
  const envSnapshot = snapshotEnv([...BSC_TESTNET_FACTORY_ENV_KEYS, CONTRACT_VERSION_ENV]);

  delete process.env.BSC_TESTNET_FACTORY_ADDRESS;
  delete process.env.BSC_TESTNET_FACTORY;
  delete process.env.FACTORY_ADDRESS;
  process.env[CONTRACT_VERSION_ENV] = "v0.3.0-agent-contract";

  try {
    const { client } = buildMockReadClient("0x1111111111111111111111111111111111111111" as Address);

    await assert.rejects(
      async () => {
        await predictVaultAddress(
          {
            chainId: 97,
            asset: "0x2222222222222222222222222222222222222222" as Address,
            name: "LegacyContractLineEnv",
            symbol: "LCLE",
            authority: "0x3333333333333333333333333333333333333333" as Address,
            salt: `0x${"59".repeat(32)}` as Hash
          },
          { client }
        );
      },
      (error: unknown) => {
        assert.ok(error instanceof FactoryConfigError);
        assert.equal(error.code, "FACTORY_ADDRESS_NOT_CONFIGURED");
        assert.equal(error.chainId, 97);
        return true;
      }
    );
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("predictVaultAddress prefers input factory over env and registry", async () => {
  const envSnapshot = snapshotEnv(BSC_TESTNET_FACTORY_ENV_KEYS);
  const inputFactory = "0x1111111111111111111111111111111111111111" as Address;
  const envFactory = "0x7777777777777777777777777777777777777777" as Address;

  process.env.BSC_TESTNET_FACTORY_ADDRESS = envFactory;
  delete process.env.BSC_TESTNET_FACTORY;
  delete process.env.FACTORY_ADDRESS;

  try {
    const predictedVault = "0x9999999999999999999999999999999999999999" as Address;
    const { client, calls } = buildMockReadClient(predictedVault);

    const output = await predictVaultAddress(
      {
        chainId: 97,
        factory: inputFactory,
        asset: "0x2222222222222222222222222222222222222222" as Address,
        name: "InputPriority",
        symbol: "IP",
        authority: "0x3333333333333333333333333333333333333333" as Address,
        salt: `0x${"66".repeat(32)}` as Hash
      },
      { client }
    );

    assert.equal(output.result.predictedVault, predictedVault);
    assertFactorySource(output.result.factorySource, "input");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.address, inputFactory);
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("predictVaultAddress throws FACTORY_ADDRESS_NOT_CONFIGURED on Base Mainnet when input/env are missing", async () => {
  const envSnapshot = snapshotEnv(BASE_MAINNET_FACTORY_ENV_KEYS);

  delete process.env.BASE_MAINNET_FACTORY_ADDRESS;
  delete process.env.BASE_FACTORY_ADDRESS;
  delete process.env.FACTORY_ADDRESS;

  try {
    const { client } = buildMockReadClient("0x1111111111111111111111111111111111111111" as Address);

    await assert.rejects(
      async () => {
        await predictVaultAddress(
          {
            chainId: 8453,
            asset: "0x2222222222222222222222222222222222222222" as Address,
            name: "NoBaseDefault",
            symbol: "NBD",
            authority: "0x3333333333333333333333333333333333333333" as Address,
            salt: `0x${"77".repeat(32)}` as Hash
          },
          { client }
        );
      },
      (error: unknown) => {
        assert.ok(error instanceof FactoryConfigError);
        assert.equal(error.code, "FACTORY_ADDRESS_NOT_CONFIGURED");
        assert.equal(error.chainId, 8453);
        assert.equal(error.field, "factory");
        assert.deepEqual(error.envKeys, [...BASE_MAINNET_FACTORY_ENV_KEYS]);
        return true;
      }
    );
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("predictVaultAddress fails fast for invalid factory env address and reports envKey", async () => {
  const envSnapshot = snapshotEnv(BSC_TESTNET_FACTORY_ENV_KEYS);

  process.env.BSC_TESTNET_FACTORY_ADDRESS = "0x123";
  delete process.env.BSC_TESTNET_FACTORY;
  delete process.env.FACTORY_ADDRESS;

  try {
    const { client } = buildMockReadClient("0x1111111111111111111111111111111111111111" as Address);

    await assert.rejects(
      async () => {
        await predictVaultAddress(
          {
            asset: "0x2222222222222222222222222222222222222222" as Address,
            name: "BadEnv",
            symbol: "BE",
            authority: "0x3333333333333333333333333333333333333333" as Address,
            salt: `0x${"44".repeat(32)}` as Hash
          },
          { client }
        );
      },
      (error: unknown) => {
        assert.ok(error instanceof FactoryConfigError);
        assert.equal(error.code, "INVALID_FACTORY_ADDRESS");
        assert.equal(error.chainId, 97);
        assert.equal(error.field, "factory");
        assert.equal(error.envKey, "BSC_TESTNET_FACTORY_ADDRESS");
        assert.equal(error.value, "0x123");
        return true;
      }
    );
  } finally {
    restoreEnv(envSnapshot);
  }
});

test("prepareCreateVaultTx throws INVALID_SALT with structured error fields", async () => {
  const factory = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  const from = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
  const invalidSalt = "0x1234" as Hash;

  const { client, calls } = buildMockReadClient("0xcccccccccccccccccccccccccccccccccccccccc" as Address);

  await assert.rejects(
    async () => {
      await prepareCreateVaultTx(
        {
          chainId: 97,
          factory,
          from,
          asset: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
          name: "BadSalt",
          symbol: "BS",
          authority: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
          salt: invalidSalt
        },
        { client }
      );
    },
    (error: unknown) => {
      assert.ok(error instanceof FactoryConfigError);
      assert.equal(error.code, "INVALID_SALT");
      assert.equal(error.chainId, 97);
      assert.equal(error.field, "salt");
      assert.equal(error.value, invalidSalt);
      return true;
    }
  );

  assert.equal(calls.length, 0);
});
