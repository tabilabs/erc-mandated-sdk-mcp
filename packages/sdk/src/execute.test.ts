import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeFunctionData,
  type Address,
  type Hex
} from "viem";

import { mandatedVaultAbi } from "./abi/mandatedVault.js";
import { NetworkConfigError } from "./networks.js";
import { prepareExecuteTx, simulateExecuteVault, type ExecuteSimulateClient } from "./execute.js";

test("prepareExecuteTx returns txRequest and simulate uses identical calldata", async () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const from = "0x2222222222222222222222222222222222222222" as Address;

  const mandate = {
    vault,
    executor: from,
    nonce: "1",
    deadline: "0",
    authorityEpoch: "1",
    allowedAdaptersRoot: ("0x" + "a".repeat(64)) as Hex,
    maxDrawdownBps: "10000",
    maxCumulativeDrawdownBps: "10000",
    payloadDigest: ("0x" + "b".repeat(64)) as Hex,
    extensionsHash: ("0x" + "c".repeat(64)) as Hex
  };

  const actions = [
    {
      adapter: "0x3333333333333333333333333333333333333333" as Address,
      value: "0",
      data: "0x095ea7b3" as Hex
    }
  ];

  const adapterProofs = [[("0x" + "d".repeat(64)) as Hex]];
  const signature = "0x" as Hex;
  const extensions = "0x" as Hex;

  let simulateCallData: Hex | undefined;

  const client: ExecuteSimulateClient = {
    async getBlockNumber() {
      return 123n;
    },
    async call(params: { to: Address; data: Hex; from?: Address }) {
      simulateCallData = params.data;
      return {
        data: "0x" as Hex
      };
    }
  };

  const prepareOut = await prepareExecuteTx({
    chainId: 11155111,
    vault,
    from,
    mandate,
    signature,
    actions,
    adapterProofs,
    extensions
  });

  const simulateOut = await simulateExecuteVault(
    {
      chainId: 11155111,
      vault,
      from,
      mandate,
      signature,
      actions,
      adapterProofs,
      extensions
    },
    { client }
  );

  assert.equal(simulateOut.result.ok, true);
  assert.equal(simulateOut.result.blockNumber, 123);

  assert.ok(simulateCallData, "simulate should call eth_call with calldata");
  assert.equal(prepareOut.result.txRequest.data, simulateCallData);
  assert.equal(prepareOut.result.txRequest.to, vault);
  assert.equal(prepareOut.result.txRequest.from, from);
  assert.equal(prepareOut.result.txRequest.value, "0");

  // sanity: the calldata should decode as an `execute` call once ABI is updated.
  assert.doesNotThrow(() => {
    decodeFunctionData({
      abi: mandatedVaultAbi,
      data: prepareOut.result.txRequest.data
    });
  });
});

test("prepareExecuteTx throws if mandate.deadline exceeds JS safe integer", () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const from = "0x2222222222222222222222222222222222222222" as Address;

  const mandate = {
    vault,
    executor: from,
    nonce: "1",
    deadline: (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(10),
    authorityEpoch: "1",
    allowedAdaptersRoot: ("0x" + "a".repeat(64)) as Hex,
    maxDrawdownBps: "10000",
    maxCumulativeDrawdownBps: "10000",
    payloadDigest: ("0x" + "b".repeat(64)) as Hex,
    extensionsHash: ("0x" + "c".repeat(64)) as Hex
  };

  assert.throws(() => {
    prepareExecuteTx({
      chainId: 11155111,
      vault,
      from,
      mandate,
      signature: "0x" as Hex,
      actions: [
        {
          adapter: "0x3333333333333333333333333333333333333333" as Address,
          value: "0",
          data: "0x095ea7b3" as Hex
        }
      ],
      adapterProofs: [[("0x" + "d".repeat(64)) as Hex]],
      extensions: "0x" as Hex
    });
  });
});

test("prepareExecuteTx accepts boundary values for uint48 deadline and bps", () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const from = "0x2222222222222222222222222222222222222222" as Address;

  assert.doesNotThrow(() => {
    prepareExecuteTx({
      chainId: 11155111,
      vault,
      from,
      mandate: {
        vault,
        executor: from,
        nonce: "1",
        deadline: ((1n << 48n) - 1n).toString(10),
        authorityEpoch: "1",
        allowedAdaptersRoot: ("0x" + "a".repeat(64)) as Hex,
        maxDrawdownBps: "10000",
        maxCumulativeDrawdownBps: "10000",
        payloadDigest: ("0x" + "b".repeat(64)) as Hex,
        extensionsHash: ("0x" + "c".repeat(64)) as Hex
      },
      signature: "0x" as Hex,
      actions: [
        {
          adapter: "0x3333333333333333333333333333333333333333" as Address,
          value: "0",
          data: "0x095ea7b3" as Hex
        }
      ],
      adapterProofs: [[("0x" + "d".repeat(64)) as Hex]],
      extensions: "0x" as Hex
    });
  });
});

test("prepareExecuteTx throws if drawdown bps out of range", () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const from = "0x2222222222222222222222222222222222222222" as Address;

  const mandate = {
    vault,
    executor: from,
    nonce: "1",
    deadline: "0",
    authorityEpoch: "1",
    allowedAdaptersRoot: ("0x" + "a".repeat(64)) as Hex,
    maxDrawdownBps: "10001",
    maxCumulativeDrawdownBps: "70000",
    payloadDigest: ("0x" + "b".repeat(64)) as Hex,
    extensionsHash: ("0x" + "c".repeat(64)) as Hex
  };

  assert.throws(() => {
    prepareExecuteTx({
      chainId: 11155111,
      vault,
      from,
      mandate,
      signature: "0x" as Hex,
      actions: [
        {
          adapter: "0x3333333333333333333333333333333333333333" as Address,
          value: "0",
          data: "0x095ea7b3" as Hex
        }
      ],
      adapterProofs: [[("0x" + "d".repeat(64)) as Hex]],
      extensions: "0x" as Hex
    });
  });
});

test("simulateExecuteVault returns structured revertDecoded fields on call failure", async () => {
  const client: ExecuteSimulateClient = {
    async getBlockNumber() {
      return 123n;
    },
    async call() {
      const error = new Error("execution reverted");
      (error as Error & { name?: string; shortMessage?: string; data?: string }).name =
        "CallExecutionError";
      (error as Error & { shortMessage?: string }).shortMessage =
        "Execution reverted for unknown reason";
      (error as Error & { data?: string }).data = "0x08c379a0";
      throw error;
    }
  };

  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const from = "0x2222222222222222222222222222222222222222" as Address;

  const out = await simulateExecuteVault(
    {
      chainId: 11155111,
      vault,
      from,
      mandate: {
        vault,
        executor: from,
        nonce: "1",
        deadline: "0",
        authorityEpoch: "1",
        allowedAdaptersRoot: ("0x" + "a".repeat(64)) as Hex,
        maxDrawdownBps: "10000",
        maxCumulativeDrawdownBps: "10000",
        payloadDigest: ("0x" + "b".repeat(64)) as Hex,
        extensionsHash: ("0x" + "c".repeat(64)) as Hex
      },
      signature: "0x" as Hex,
      actions: [],
      adapterProofs: [],
      extensions: "0x" as Hex
    },
    { client }
  );

  assert.equal(out.result.ok, false);
  const revert = out.result.revertDecoded as
    | {
        message?: string;
        name?: string;
        shortMessage?: string;
        rawData?: string;
      }
    | undefined;

  assert.equal(revert?.name, "CallExecutionError");
  assert.equal(revert?.shortMessage, "Execution reverted for unknown reason");
  assert.equal(revert?.rawData, "0x08c379a0");
  assert.equal(typeof revert?.message, "string");
});

test("simulateExecuteVault rethrows NetworkConfigError when RPC env is missing", async (t) => {
  const saved = process.env.BSC_TESTNET_RPC_URL;
  delete process.env.BSC_TESTNET_RPC_URL;

  t.after(() => {
    if (saved === undefined) {
      delete process.env.BSC_TESTNET_RPC_URL;
    } else {
      process.env.BSC_TESTNET_RPC_URL = saved;
    }
  });

  await assert.rejects(
    async () => {
      await simulateExecuteVault({
        chainId: 97,
        vault: "0x1111111111111111111111111111111111111111" as Address,
        from: "0x2222222222222222222222222222222222222222" as Address,
        mandate: {
          vault: "0x1111111111111111111111111111111111111111" as Address,
          executor: "0x2222222222222222222222222222222222222222" as Address,
          nonce: "1",
          deadline: "0",
          authorityEpoch: "1",
          allowedAdaptersRoot: ("0x" + "a".repeat(64)) as Hex,
          maxDrawdownBps: "10000",
          maxCumulativeDrawdownBps: "10000",
          payloadDigest: ("0x" + "b".repeat(64)) as Hex,
          extensionsHash: ("0x" + "c".repeat(64)) as Hex
        },
        signature: "0x" as Hex,
        actions: [],
        adapterProofs: [],
        extensions: "0x" as Hex
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof NetworkConfigError);
      assert.equal(error.code, "RPC_URL_NOT_CONFIGURED");
      assert.equal(error.chainId, 97);
      return true;
    }
  );
});
