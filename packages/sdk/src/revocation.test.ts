import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeFunctionData,
  type Address,
  type Hex
} from "viem";

import { mandatedVaultAbi } from "./abi/mandatedVault.js";
import {
  checkMandateRevoked,
  checkNonceUsed,
  prepareInvalidateNonceTx,
  prepareRevokeMandateTx,
  type RevocationReadClient
} from "./revocation.js";

test("ABI supports isNonceUsed / isMandateRevoked / invalidateNonce / revokeMandate", () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const authority = "0x5555555555555555555555555555555555555555" as Address;
  const mandateHash = ("0x" + "9".repeat(64)) as Hex;

  // Ensure new function names are accepted by viem ABI tooling.
  // We validate this by encoding calls (and decoding those call datas back).
  assert.doesNotThrow(() => {
    const tx = prepareInvalidateNonceTx({ chainId: 11155111, vault, from: authority, nonce: "1" });
    const decoded = decodeFunctionData({
      abi: mandatedVaultAbi,
      data: tx.result.txRequest.data
    });
    assert.equal(decoded.functionName, "invalidateNonce");
  });

  assert.doesNotThrow(() => {
    const tx = prepareRevokeMandateTx({
      chainId: 11155111,
      vault,
      from: authority,
      mandateHash
    });
    const decoded = decodeFunctionData({
      abi: mandatedVaultAbi,
      data: tx.result.txRequest.data
    });
    assert.equal(decoded.functionName, "revokeMandate");
  });

  assert.doesNotThrow(() => {
    decodeFunctionData({
      abi: mandatedVaultAbi,
      data: prepareInvalidateNonceTx({ chainId: 11155111, vault, from: authority, nonce: "1" }).result.txRequest
        .data
    });
  });

  assert.doesNotThrow(() => {
    decodeFunctionData({
      abi: mandatedVaultAbi,
      data: prepareRevokeMandateTx({
        chainId: 11155111,
        vault,
        from: authority,
        mandateHash
      }).result.txRequest.data
    });
  });
});

test("checkNonceUsed returns { result: { used } }", async () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const authority = "0x5555555555555555555555555555555555555555" as Address;

  const client: RevocationReadClient = {
    async readContract(params) {
      assert.equal(params.functionName, "isNonceUsed");
      return true;
    }
  };

  const out = await checkNonceUsed(
    {
      chainId: 11155111,
      vault,
      authority,
      nonce: "1"
    },
    { client }
  );

  assert.deepEqual(out, { result: { used: true } });
});

test("checkMandateRevoked returns { result: { revoked } }", async () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const mandateHash = ("0x" + "9".repeat(64)) as Hex;

  const client: RevocationReadClient = {
    async readContract(params) {
      assert.equal(params.functionName, "isMandateRevoked");
      return false;
    }
  };

  const out = await checkMandateRevoked(
    {
      chainId: 11155111,
      vault,
      mandateHash
    },
    { client }
  );

  assert.deepEqual(out, { result: { revoked: false } });
});

test("prepareInvalidateNonceTx builds txRequest with invalidateNonce calldata", () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const from = "0x5555555555555555555555555555555555555555" as Address;

  const out = prepareInvalidateNonceTx({
    chainId: 11155111,
    vault,
    from,
    nonce: "1"
  });

  assert.equal(out.result.txRequest.to, vault);
  assert.equal(out.result.txRequest.from, from);
  assert.equal(out.result.txRequest.value, "0");

  const decoded = decodeFunctionData({
    abi: mandatedVaultAbi,
    data: out.result.txRequest.data
  });

  assert.equal(decoded.functionName, "invalidateNonce");
});

test("prepareRevokeMandateTx builds txRequest with revokeMandate calldata", () => {
  const vault = "0x1111111111111111111111111111111111111111" as Address;
  const from = "0x5555555555555555555555555555555555555555" as Address;
  const mandateHash = ("0x" + "9".repeat(64)) as Hex;

  const out = prepareRevokeMandateTx({
    chainId: 11155111,
    vault,
    from,
    mandateHash
  });

  assert.equal(out.result.txRequest.to, vault);
  assert.equal(out.result.txRequest.from, from);
  assert.equal(out.result.txRequest.value, "0");

  const decoded = decodeFunctionData({
    abi: mandatedVaultAbi,
    data: out.result.txRequest.data
  });

  assert.equal(decoded.functionName, "revokeMandate");
});
