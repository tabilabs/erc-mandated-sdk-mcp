import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { loadTools } from "./loadTools.js";

const ENV_KEY = "ERC_MANDATED_CONTRACT_VERSION";
const LATEST_FILE_URL = new URL("../../contracts/latest.json", import.meta.url);

interface LatestContractPointer {
  contractVersion: string;
}

test("loadTools: default resolves contract version from latest.json", async () => {
  const savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];

  try {
    const latestContent = await readFile(LATEST_FILE_URL, "utf8");
    const latestParsed = JSON.parse(latestContent) as LatestContractPointer;

    const contract = await loadTools();
    assert.equal(contract.contractVersion, latestParsed.contractVersion);
  } finally {
    if (savedEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = savedEnv;
    }
  }
});

test("loadTools: env override takes priority over latest.json", async () => {
  const savedEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = "v0.1.1-agent-contract";

  try {
    const contract = await loadTools();
    assert.equal(contract.contractVersion, "v0.1.1-agent-contract");
  } finally {
    if (savedEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = savedEnv;
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
