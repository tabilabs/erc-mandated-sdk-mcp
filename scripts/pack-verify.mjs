#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, access, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const execFileP = promisify(execFile);

function repoRootFromHere() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..");
}

async function run(cmd, args, cwd, extraEnv) {
  const { stdout, stderr } = await execFileP(cmd, args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv
    },
    maxBuffer: 10 * 1024 * 1024
  });
  return { stdout, stderr };
}

async function packOne(pkgDir) {
  const { stdout } = await run("npm", ["pack", "--json"], pkgDir);

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (e) {
    throw new Error(`npm pack --json 输出非 JSON: ${String(e)}\nstdout=${stdout}`);
  }

  assert.ok(Array.isArray(parsed) && parsed.length > 0, "npm pack 返回为空");

  const fileName = parsed[0]?.filename;
  assert.equal(typeof fileName, "string", "npm pack 未返回 filename");

  const tgzAbs = path.join(pkgDir, fileName);
  await access(tgzAbs, fsConstants.R_OK);

  return tgzAbs;
}

async function verifyEsmImports(sandboxDir) {
  const scriptPath = path.join(sandboxDir, "verify-imports.mjs");

  await writeFile(
    scriptPath,
    [
      "import assert from 'node:assert/strict';",
      "const sdk = await import('@erc-mandated/sdk');",
      "const mcp = await import('@erc-mandated/mcp');",
      "assert.equal(typeof sdk.healthCheckVault, 'function');",
      "assert.equal(typeof mcp.createMcpServer, 'function');",
      "assert.ok(Object.keys(sdk).length > 0);",
      "assert.ok(Object.keys(mcp).length > 0);",
      "console.log('esm-import: ok');"
    ].join("\n"),
    "utf8"
  );

  await run(process.execPath, [scriptPath], sandboxDir);
}

async function verifyMcpListTools(sandboxDir) {
  const cliEntry = path.join(
    sandboxDir,
    "node_modules",
    "@erc-mandated",
    "mcp",
    "dist",
    "cli.js"
  );

  await access(cliEntry, fsConstants.R_OK);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliEntry],
    env: {
      ...process.env,
      MCP_LOG_LEVEL: "none"
    }
  });

  const client = new Client({
    name: "pack-verify-client",
    version: "0.1.0"
  });

  try {
    await client.connect(transport);
    const listed = await client.listTools();

    const names = (listed.tools ?? []).map((t) => t.name);

    assert.ok(names.length > 0, "tools/list 返回空");
    assert.ok(
      names.includes("vault_health_check"),
      `tools/list 未包含 vault_health_check, 实际: ${JSON.stringify(names)}`
    );
  } finally {
    await Promise.allSettled([client.close(), transport.close()]);
  }
}

async function main() {
  const root = repoRootFromHere();

  await run("npm", ["run", "build"], root);

  const sdkDir = path.join(root, "packages", "sdk");
  const mcpDir = path.join(root, "packages", "mcp");

  let sandboxDir;
  try {
    const [sdkTgz, mcpTgz] = await Promise.all([packOne(sdkDir), packOne(mcpDir)]);

    sandboxDir = await mkdtemp(path.join(tmpdir(), "erc-pack-verify-"));

    await run("npm", ["init", "-y"], sandboxDir);

    await run("npm", ["i", "--no-audit", "--no-fund", sdkTgz, mcpTgz], sandboxDir);

    const oldCwd = process.cwd();
    process.chdir(sandboxDir);

    try {
      await verifyEsmImports(sandboxDir);
      await verifyMcpListTools(sandboxDir);
    } finally {
      process.chdir(oldCwd);
    }

    console.log("pack-verify: ok");
  } finally {
    if (sandboxDir) {
      await rm(sandboxDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error("pack-verify: failed");
  console.error(err);
  process.exit(1);
});
