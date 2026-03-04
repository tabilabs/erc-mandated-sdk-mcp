import test from "node:test";
import assert from "node:assert/strict";

import { loadTools } from "./loadTools.js";

const ENV_KEY = "ERC_MANDATED_CONTRACT_VERSION";

test("loadTools: default loads v0.1.1", async () => {
  const saved = process.env[ENV_KEY];
  delete process.env[ENV_KEY];

  try {
    const contract = await loadTools();
    assert.equal(contract.contractVersion, "v0.1.1-agent-contract");
  } finally {
    if (saved === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = saved;
    }
  }
});

test("loadTools: env override unknown version throws", async () => {
  const saved = process.env[ENV_KEY];
  process.env[ENV_KEY] = "v0.1.0-agent-contract";

  try {
    await assert.rejects(
      async () => {
        await loadTools();
      },
      (error: unknown) => {
        if (!(error instanceof Error)) {
          return false;
        }
        return error.message.includes("v0.1.0-agent-contract");
      }
    );
  } finally {
    if (saved === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = saved;
    }
  }
});

test("loadTools: unknown env contract version throws", async () => {
  const saved = process.env[ENV_KEY];
  process.env[ENV_KEY] = "v9.9.9-agent-contract";

  try {
    await assert.rejects(
      async () => {
        await loadTools();
      },
      (error: unknown) => {
        if (!(error instanceof Error)) {
          return false;
        }
        return error.message.includes("v9.9.9-agent-contract");
      }
    );
  } finally {
    if (saved === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = saved;
    }
  }
});
