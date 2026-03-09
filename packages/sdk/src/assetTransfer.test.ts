import assert from "node:assert/strict";
import test from "node:test";

import { decodeFunctionData, type Address, type Hex } from "viem";

import { prepareExecuteTx } from "./execute.js";
import { buildAssetTransferPlan, buildErc20TransferAction, AssetTransferPlanError } from "./assetTransfer.js";

test("buildErc20TransferAction encodes transfer calldata and maps adapter to token address", () => {
  const tokenAddress = "0x1111111111111111111111111111111111111111" as Address;
  const to = "0x2222222222222222222222222222222222222222" as Address;

  const output = buildErc20TransferAction({
    tokenAddress,
    to,
    amountRaw: "123456"
  });

  assert.equal(output.result.action.adapter, tokenAddress);
  assert.equal(output.result.action.value, "0");
  assert.equal(output.result.erc20Call.to, tokenAddress);
  assert.equal(output.result.erc20Call.value, "0");

  const decoded = decodeFunctionData({
    abi: [
      {
        type: "function",
        name: "transfer",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" }
        ],
        outputs: [{ name: "", type: "bool" }]
      }
    ],
    data: output.result.action.data
  });

  assert.equal(decoded.functionName, "transfer");
  assert.deepEqual(decoded.args, [to, 123456n]);
});

test("buildErc20TransferAction rejects invalid token address", () => {
  assert.throws(
    () =>
      buildErc20TransferAction({
        tokenAddress: "0x123" as Address,
        to: "0x2222222222222222222222222222222222222222" as Address,
        amountRaw: "1"
      }),
    (error: unknown) => {
      assert.ok(error instanceof AssetTransferPlanError);
      assert.equal(error.code, "INVALID_TOKEN_ADDRESS");
      return true;
    }
  );
});

test("buildAssetTransferPlan builds sign request and execute inputs from a single transfer intent", async () => {
  const vault = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  const executor = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
  const tokenAddress = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
  const recipient = "0xdddddddddddddddddddddddddddddddddddddddd" as Address;

  const plan = await buildAssetTransferPlan({
    chainId: 11155111,
    vault,
    executor,
    tokenAddress,
    to: recipient,
    amountRaw: "5000000",
    nonce: "7",
    deadline: "999999",
    authorityEpoch: "3",
    allowedAdaptersRoot: ("0x" + "11".repeat(32)) as Hex,
    maxDrawdownBps: "10000",
    maxCumulativeDrawdownBps: "10000",
    symbol: "USDT",
    decimals: 6,
    executeContext: {
      signature: "0x1234" as Hex,
      adapterProofs: [[("0x" + "22".repeat(32)) as Hex]]
    }
  });

  assert.equal(plan.result.humanReadableSummary.kind, "erc20Transfer");
  assert.equal(plan.result.humanReadableSummary.tokenAddress, tokenAddress);
  assert.equal(plan.result.humanReadableSummary.to, recipient);
  assert.equal(plan.result.humanReadableSummary.amountRaw, "5000000");
  assert.equal(plan.result.humanReadableSummary.symbol, "USDT");
  assert.equal(plan.result.humanReadableSummary.decimals, 6);

  assert.equal(plan.result.signRequest.mandate.executor, executor);
  assert.equal(plan.result.signRequest.mandate.vault, vault);
  assert.equal(plan.result.signRequest.actionsDigest, plan.result.signRequest.mandate.payloadDigest);

  assert.deepEqual(plan.result.signRequest.typedData.message.executor, executor);
  assert.equal(plan.result.simulateExecuteInput?.from, executor);
  assert.equal(plan.result.prepareExecuteInput?.signature, "0x1234");
  assert.deepEqual(plan.result.prepareExecuteInput?.adapterProofs, [[("0x" + "22".repeat(32)) as Hex]]);

  const tx = prepareExecuteTx(plan.result.prepareExecuteInput!);
  assert.equal(tx.result.txRequest.to, vault);
  assert.equal(tx.result.txRequest.from, executor);
});

test("buildAssetTransferPlan omits execute inputs when signature context is not provided", async () => {
  const plan = await buildAssetTransferPlan({
    vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    executor: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    tokenAddress: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    to: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
    amountRaw: "42",
    nonce: "1",
    deadline: "0",
    authorityEpoch: "1",
    allowedAdaptersRoot: ("0x" + "33".repeat(32)) as Hex,
    maxDrawdownBps: "10000",
    maxCumulativeDrawdownBps: "10000"
  });

  assert.equal(plan.result.signRequest.mandate.extensionsHash.length, 66);
  assert.equal(plan.result.simulateExecuteInput, undefined);
  assert.equal(plan.result.prepareExecuteInput, undefined);
});

test("buildAssetTransferPlan rejects invalid decimals", async () => {
  await assert.rejects(
    async () => {
      await buildAssetTransferPlan({
        vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
        executor: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        tokenAddress: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
        to: "0xdddddddddddddddddddddddddddddddddddddddd" as Address,
        amountRaw: "42",
        nonce: "1",
        deadline: "0",
        authorityEpoch: "1",
        allowedAdaptersRoot: ("0x" + "33".repeat(32)) as Hex,
        maxDrawdownBps: "10000",
        maxCumulativeDrawdownBps: "10000",
        decimals: -1
      });
    },
    (error: unknown) => {
      assert.ok(error instanceof AssetTransferPlanError);
      assert.equal(error.code, "INVALID_DECIMALS");
      return true;
    }
  );
});
