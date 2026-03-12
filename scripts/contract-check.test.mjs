import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function run(args, options = {}) {
  return execFileSync("node", ["scripts/contract-check.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options
  });
}

test("contract-check defaults to v0.2.0 contract", () => {
  const out = run([]);
  assert.match(out, /contract-check: ok \(\d+ tools\)/);
});

test("contract-check defaults to ERC_MANDATED_CONTRACT_VERSION when set", () => {
  const out = run([], {
    env: {
      ...process.env,
      ERC_MANDATED_CONTRACT_VERSION: "v0.1.1-agent-contract"
    }
  });
  assert.match(out, /contract-check: ok \(\d+ tools\)/);
});

test("contract-check accepts explicit --contract v0.1.1-agent-contract", () => {
  const out = run(["--contract", "v0.1.1-agent-contract"]);
  assert.match(out, /contract-check: ok \(\d+ tools\)/);
});

test("contract-check accepts explicit --contract v0.2.0-agent-contract", () => {
  const out = run(["--contract", "v0.2.0-agent-contract"]);
  assert.match(out, /contract-check: ok \(\d+ tools\)/);
});
