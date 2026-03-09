import assert from "node:assert/strict";
import test from "node:test";

import { arbitrum } from "viem/chains";

import {
  type SupportedChain,
  NetworkConfigError,
  getChainConfig,
  getRpcUrl,
  getSupportedChains,
  registerSupportedChain,
  registerSupportedChains,
  resetSupportedChains
} from "./networks.js";

test("getSupportedChains returns BSC Testnet first and Sepolia as fallback", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());
  const chains = getSupportedChains();

  assert.deepEqual(
    chains.map((chain: { id: number }) => chain.id),
    [97, 11155111]
  );
  assert.equal(chains[0]?.name, "BSC Testnet");
  assert.equal(chains[1]?.name, "Sepolia");
});

test("getChainConfig defaults to BSC Testnet", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());
  const chain = getChainConfig();

  assert.equal(chain.id, 97);
  assert.equal(chain.rpcUrlEnvVar, "BSC_TESTNET_RPC_URL");
});

test("getChainConfig selects Sepolia when chainId=11155111", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());
  const chain = getChainConfig(11155111);

  assert.equal(chain.id, 11155111);
  assert.equal(chain.rpcUrlEnvVar, "SEPOLIA_RPC_URL");
});

test("getRpcUrl reads from environment variable", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());
  const previous = process.env.BSC_TESTNET_RPC_URL;

  process.env.BSC_TESTNET_RPC_URL = "https://bsc-testnet.example";
  try {
    assert.equal(getRpcUrl(), "https://bsc-testnet.example");
  } finally {
    if (previous === undefined) {
      delete process.env.BSC_TESTNET_RPC_URL;
    } else {
      process.env.BSC_TESTNET_RPC_URL = previous;
    }
  }
});

test("getRpcUrl throws a structured error when env is missing", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());
  const previous = process.env.BSC_TESTNET_RPC_URL;

  delete process.env.BSC_TESTNET_RPC_URL;
  try {
    assert.throws(
      () => getRpcUrl(),
      (error: unknown) => {
        assert.ok(error instanceof NetworkConfigError);
        assert.equal(error.code, "RPC_URL_NOT_CONFIGURED");
        assert.equal(error.chainId, 97);
        assert.equal(error.rpcUrlEnvVar, "BSC_TESTNET_RPC_URL");
        return true;
      }
    );
  } finally {
    if (previous === undefined) {
      delete process.env.BSC_TESTNET_RPC_URL;
    } else {
      process.env.BSC_TESTNET_RPC_URL = previous;
    }
  }
});

test("external mutation of returned supported chains does not pollute internal config", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());
  const chains = getSupportedChains();

  chains[0]!.name = "Mutated Network";

  const chainsAfterMutation = getSupportedChains();
  const defaultChain = getChainConfig();

  assert.equal(chainsAfterMutation[0]?.name, "BSC Testnet");
  assert.equal(defaultChain.name, "BSC Testnet");
});

test("external mutation of returned viemChain does not pollute internal config", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());

  registerSupportedChain({
    id: 31337,
    name: "Local Dev",
    rpcUrlEnvVar: "LOCAL_DEV_RPC_URL",
    viemChain: {
      id: 31337,
      name: "Local Dev",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18
      },
      rpcUrls: {
        default: { http: ["https://local-dev.example"] }
      }
    } as unknown as NonNullable<SupportedChain["viemChain"]>
  });

  const first = getChainConfig(31337);
  (first.viemChain as any).rpcUrls.default.http[0] = "https://mutated.example";

  const second = getChainConfig(31337);
  assert.equal((second.viemChain as any).rpcUrls.default.http[0], "https://local-dev.example");
});

test("getChainConfig throws UNSUPPORTED_CHAIN for unknown chainId", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());
  assert.throws(
    () => getChainConfig(1),
    (error: unknown) => {
      assert.ok(error instanceof NetworkConfigError);
      assert.equal(error.code, "UNSUPPORTED_CHAIN");
      assert.equal(error.chainId, 1);
      return true;
    }
  );
});

test("getRpcUrl throws structured error for Sepolia when env is missing", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());
  const previous = process.env.SEPOLIA_RPC_URL;

  delete process.env.SEPOLIA_RPC_URL;
  try {
    assert.throws(
      () => getRpcUrl(11155111),
      (error: unknown) => {
        assert.ok(error instanceof NetworkConfigError);
        assert.equal(error.code, "RPC_URL_NOT_CONFIGURED");
        assert.equal(error.chainId, 11155111);
        assert.equal(error.rpcUrlEnvVar, "SEPOLIA_RPC_URL");
        return true;
      }
    );
  } finally {
    if (previous === undefined) {
      delete process.env.SEPOLIA_RPC_URL;
    } else {
      process.env.SEPOLIA_RPC_URL = previous;
    }
  }
});

test("registerSupportedChain adds custom chain with viemChain and rpc env", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());

  const previous = process.env.ARBITRUM_RPC_URL;
  process.env.ARBITRUM_RPC_URL = "https://arbitrum.example";

  registerSupportedChain({
    id: 42161,
    name: "Arbitrum One",
    rpcUrlEnvVar: "ARBITRUM_RPC_URL",
    viemChain: arbitrum,
    factoryEnvCandidates: ["ARBITRUM_FACTORY_ADDRESS", "FACTORY_ADDRESS"]
  });

  try {
    const chain = getChainConfig(42161) as SupportedChain & { viemChain?: unknown };
    assert.equal(chain.id, 42161);
    assert.equal(chain.name, "Arbitrum One");
    assert.equal(chain.rpcUrlEnvVar, "ARBITRUM_RPC_URL");
    assert.equal(getRpcUrl(42161), "https://arbitrum.example");
    assert.deepEqual(chain.factoryEnvCandidates, ["ARBITRUM_FACTORY_ADDRESS", "FACTORY_ADDRESS"]);
    assert.notEqual(chain.viemChain, arbitrum);
    assert.equal(chain.viemChain?.id, arbitrum.id);
  } finally {
    if (previous === undefined) {
      delete process.env.ARBITRUM_RPC_URL;
    } else {
      process.env.ARBITRUM_RPC_URL = previous;
    }
  }
});

test("registerSupportedChain overrides existing chain config", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());

  registerSupportedChain({
    id: 97,
    name: "BSC Testnet Custom",
    rpcUrlEnvVar: "CUSTOM_BSC_RPC_URL",
    factoryEnvCandidates: ["CUSTOM_BSC_FACTORY"]
  });

  const chain = getChainConfig(97);
  assert.equal(chain.name, "BSC Testnet Custom");
  assert.equal(chain.rpcUrlEnvVar, "CUSTOM_BSC_RPC_URL");
  assert.deepEqual(chain.factoryEnvCandidates, ["CUSTOM_BSC_FACTORY"]);
});

test("registerSupportedChains registers multiple chains", (t) => {
  resetSupportedChains();
  t.after(() => resetSupportedChains());

  registerSupportedChains([
    {
      id: 8453,
      name: "Base",
      rpcUrlEnvVar: "BASE_RPC_URL"
    },
    {
      id: 10,
      name: "Optimism",
      rpcUrlEnvVar: "OPTIMISM_RPC_URL"
    }
  ]);

  const chainIds = getSupportedChains().map((chain) => chain.id);
  assert.ok(chainIds.includes(8453));
  assert.ok(chainIds.includes(10));
});
