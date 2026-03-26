#!/usr/bin/env node
/* Minimal contract guardrails for parallel SDK/MCP development.
 *
 * Goals:
 * - Validate current contract artifacts are well-formed.
 * - Optionally compare against a git base ref to detect breaking changes.
 * - Validate fixtures roughly match tool input schemas (subset validator, no deps).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const CONTRACT_VERSION_ENV_KEY = "ERC_MANDATED_CONTRACT_VERSION";

let inCompatCompare = false;

function fail(msg) {
  throw new Error(msg);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    fail(`invalid json at ${p}: ${e.message}`);
  }
}

function readDefaultContractVersion() {
  const latestPath = path.join(repoRoot, "packages", "mcp", "contracts", "latest.json");
  const latestDoc = readJson(latestPath);

  if (!latestDoc || typeof latestDoc.contractVersion !== "string" || latestDoc.contractVersion.length === 0) {
    fail(`invalid latest contract metadata at ${latestPath}`);
  }

  return latestDoc.contractVersion;
}

function readJsonFromGit(ref, relPath) {
  try {
    const out = execFileSync("git", ["show", `${ref}:${relPath}`], { stdio: ["ignore", "pipe", "pipe"] }).toString(
      "utf8"
    );
    return JSON.parse(out);
  } catch (e) {
    return null;
  }
}

function parseArgs(argv) {
  const envContractVersion = process.env[CONTRACT_VERSION_ENV_KEY];
  const args = {
    baseRef: null,
    contractVersion: typeof envContractVersion === "string" && envContractVersion.length > 0
      ? envContractVersion
      : readDefaultContractVersion()
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") {
      const v = argv[++i];
      if (!v) fail("--base requires a value");
      args.baseRef = v;
      continue;
    }
    if (a === "--contract") {
      const v = argv[++i];
      if (!v) fail("--contract requires a value");
      args.contractVersion = v;
      continue;
    }
    if (a === "-h" || a === "--help") {
      console.log("Usage: node scripts/contract-check.mjs [--contract <version>] [--base <git-ref>]");
      process.exit(0);
    }
    fail(`unknown arg: ${a}`);
  }
  return args;
}

function validateContractDoc(doc, selectedContractVersion) {
  if (doc.contractVersion !== selectedContractVersion) {
    fail(
      `contractVersion mismatch: expected ${selectedContractVersion}, got ${String(doc.contractVersion)}`
    );
  }

  if (!Array.isArray(doc.tools) || doc.tools.length === 0) {
    fail("tools must be a non-empty array");
  }

  const names = new Set();
  for (const t of doc.tools) {
    if (!t || typeof t !== "object") fail("tool entry must be object");
    if (typeof t.name !== "string" || !t.name) fail("tool.name must be non-empty string");
    if (names.has(t.name)) fail(`duplicate tool name: ${t.name}`);
    names.add(t.name);
    if (typeof t.description !== "string" || !t.description) fail(`tool.description missing for ${t.name}`);
    if (!t.inputSchema || typeof t.inputSchema !== "object") fail(`tool.inputSchema missing for ${t.name}`);
    if (!t.outputSchema || typeof t.outputSchema !== "object") fail(`tool.outputSchema missing for ${t.name}`);
  }

  if (!doc.definitions || typeof doc.definitions !== "object") {
    fail("definitions must be an object");
  }
}

function indexTools(tools) {
  const m = new Map();
  for (const t of tools) m.set(t.name, t);
  return m;
}

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function asSet(arr) {
  return new Set(Array.isArray(arr) ? arr : []);
}

function isBreakingRestrictionAdded(kind, baseVal, headVal) {
  if (baseVal === undefined && headVal !== undefined) return kind === "input";
  if (baseVal !== undefined && headVal === undefined) return false;
  return baseVal !== headVal;
}

function compareEnum(baseEnum, headEnum, kind, p) {
  if (baseEnum === undefined && headEnum === undefined) return;
  if (baseEnum !== undefined && headEnum === undefined) return; // relaxed
  if (baseEnum === undefined && headEnum !== undefined) {
    if (kind === "input") fail(`${p}: enum added (restrictive for input)`);
    return;
  }
  const baseSet = new Set(baseEnum);
  const headSet = new Set(headEnum);
  for (const v of baseSet) {
    if (!headSet.has(v)) fail(`${p}: enum value removed (${String(v)})`);
  }
}

function compareNumberBound(keyword, baseNum, headNum, kind, p) {
  if (baseNum === undefined && headNum === undefined) return;
  if (baseNum === undefined && headNum !== undefined) {
    if (kind === "input") fail(`${p}: ${keyword} added (restrictive for input)`);
    return;
  }
  if (baseNum !== undefined && headNum === undefined) return; // relaxed
  if (keyword === "minimum" || keyword === "minItems" || keyword === "minLength") {
    if (headNum > baseNum && kind === "input") fail(`${p}: ${keyword} increased (${baseNum} -> ${headNum})`);
    if (headNum !== baseNum && kind === "output") fail(`${p}: ${keyword} changed (${baseNum} -> ${headNum})`);
    return;
  }
  if (keyword === "maximum" || keyword === "maxItems" || keyword === "maxLength") {
    if (headNum < baseNum && kind === "input") fail(`${p}: ${keyword} decreased (${baseNum} -> ${headNum})`);
    if (headNum !== baseNum && kind === "output") fail(`${p}: ${keyword} changed (${baseNum} -> ${headNum})`);
    return;
  }
  if (headNum !== baseNum) {
    if (kind === "input") fail(`${p}: ${keyword} changed (${baseNum} -> ${headNum})`);
    if (kind === "output") fail(`${p}: ${keyword} changed (${baseNum} -> ${headNum})`);
  }
}

function compareSchemaCompat(baseSchema, headSchema, kind, p, defsBase, defsHead) {
  if (!isObject(baseSchema) || !isObject(headSchema)) return;

  if (baseSchema.$ref || headSchema.$ref) {
    if (baseSchema.$ref && !headSchema.$ref) return; // expanded inline => ok
    if (!baseSchema.$ref && headSchema.$ref) {
      if (kind === "input") fail(`${p}: changed to $ref (potentially restrictive)`);
      return;
    }
    if (baseSchema.$ref !== headSchema.$ref) fail(`${p}: $ref changed (${baseSchema.$ref} -> ${headSchema.$ref})`);
    const refName = baseSchema.$ref?.replace("#/definitions/", "");
    if (refName && defsBase?.[refName] && defsHead?.[refName]) {
      compareSchemaCompat(defsBase[refName], defsHead[refName], kind, `${p}.$ref(${refName})`, defsBase, defsHead);
    }
    return;
  }

  if (baseSchema.type && headSchema.type && baseSchema.type !== headSchema.type) {
    fail(`${p}: type changed (${baseSchema.type} -> ${headSchema.type})`);
  }

  // Pattern/format are tricky; treat added/changed pattern as breaking for input.
  if (isBreakingRestrictionAdded(kind, baseSchema.pattern, headSchema.pattern)) {
    if (kind === "input") fail(`${p}: pattern added/changed`);
    if (kind === "output") fail(`${p}: pattern changed`);
  }
  if (isBreakingRestrictionAdded(kind, baseSchema.format, headSchema.format)) {
    if (kind === "input") fail(`${p}: format added/changed`);
    if (kind === "output") fail(`${p}: format changed`);
  }

  compareEnum(baseSchema.enum, headSchema.enum, kind, `${p}.enum`);
  for (const k of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) {
    compareNumberBound(k, baseSchema[k], headSchema[k], kind, `${p}.${k}`);
  }

  // additionalProperties: tightening is breaking for input
  const baseAP = baseSchema.additionalProperties;
  const headAP = headSchema.additionalProperties;
  if (baseAP !== false && headAP === false && kind === "input") {
    fail(`${p}: additionalProperties tightened to false`);
  }

  if (baseSchema.type === "object" || headSchema.type === "object" || baseSchema.properties || headSchema.properties) {
    const baseReq = asSet(baseSchema.required);
    const headReq = asSet(headSchema.required);
    if (kind === "input") {
      for (const r of headReq) {
        if (!baseReq.has(r)) fail(`${p}: required field added for input (${r})`);
      }
    } else {
      for (const r of baseReq) {
        if (!headReq.has(r)) fail(`${p}: required field removed for output (${r})`);
      }
    }

    const baseProps = baseSchema.properties || {};
    const headProps = headSchema.properties || {};

    for (const key of Object.keys(baseProps)) {
      if (!Object.prototype.hasOwnProperty.call(headProps, key)) {
        fail(`${p}: property removed (${key})`);
      }
      compareSchemaCompat(baseProps[key], headProps[key], kind, `${p}.properties.${key}`, defsBase, defsHead);
    }
    // adding properties is ok (optional). If it is added+required, required check above catches for input.
  }

  if (baseSchema.type === "array" || headSchema.type === "array" || baseSchema.items || headSchema.items) {
    if (baseSchema.items && headSchema.items) {
      compareSchemaCompat(baseSchema.items, headSchema.items, kind, `${p}.items`, defsBase, defsHead);
    }
  }
}

function compareContractCompat(baseDoc, headDoc) {
  const baseTools = indexTools(baseDoc.tools || []);
  const headTools = indexTools(headDoc.tools || []);

  for (const [name] of baseTools) {
    if (!headTools.has(name)) fail(`breaking: tool removed (${name})`);
  }

  for (const [name, baseTool] of baseTools) {
    const headTool = headTools.get(name);
    compareSchemaCompat(baseTool.inputSchema, headTool.inputSchema, "input", `tools.${name}.inputSchema`, baseDoc.definitions, headDoc.definitions);
      compareSchemaCompat(baseTool.outputSchema, headTool.outputSchema, "output", `tools.${name}.outputSchema`, baseDoc.definitions, headDoc.definitions);
  }
}

// Fixture validation (subset JSON-schema validator for our contract subset)
function validate(value, schema, defs, p) {
  const errs = [];
  if (!isObject(schema)) return errs;
  if (schema.$ref) {
    const refName = schema.$ref.replace("#/definitions/", "");
    const target = defs?.[refName];
    if (!target) {
      errs.push(`${p}: missing ref ${schema.$ref}`);
      return errs;
    }
    return validate(value, target, defs, `${p}($ref:${refName})`);
  }

  if (schema.type === "object" || schema.properties || schema.required) {
    if (!isObject(value)) {
      errs.push(`${p}: expected object`);
      return errs;
    }
    const req = Array.isArray(schema.required) ? schema.required : [];
    for (const r of req) {
      if (!Object.prototype.hasOwnProperty.call(value, r)) errs.push(`${p}: missing required field ${r}`);
    }
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) errs.push(`${p}: unexpected property ${k}`);
      }
    }
    for (const [k, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        errs.push(...validate(value[k], sub, defs, `${p}.${k}`));
      }
    }
    return errs;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errs.push(`${p}: expected array`);
      return errs;
    }
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errs.push(`${p}: minItems violated`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) errs.push(`${p}: maxItems violated`);
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        errs.push(...validate(value[i], schema.items, defs, `${p}[${i}]`));
      }
    }
    return errs;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      errs.push(`${p}: expected string`);
      return errs;
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errs.push(`${p}: minLength violated`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) errs.push(`${p}: maxLength violated`);
    if (schema.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) errs.push(`${p}: pattern violated`);
    }
    if (schema.enum && !schema.enum.includes(value)) errs.push(`${p}: enum violated`);
    return errs;
  }

  if (schema.type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      errs.push(`${p}: expected integer`);
      return errs;
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) errs.push(`${p}: minimum violated`);
    if (schema.enum && !schema.enum.includes(value)) errs.push(`${p}: enum violated`);
    return errs;
  }

  if (schema.type === "boolean") {
    if (typeof value !== "boolean") errs.push(`${p}: expected boolean`);
    return errs;
  }

  return errs;
}

// Like validate(), but does not enforce required fields (used for "expect" partial output shapes).
function validatePartial(value, schema, defs, p) {
  const errs = [];
  if (!isObject(schema)) return errs;
  if (schema.$ref) {
    const refName = schema.$ref.replace("#/definitions/", "");
    const target = defs?.[refName];
    if (!target) {
      errs.push(`${p}: missing ref ${schema.$ref}`);
      return errs;
    }
    return validatePartial(value, target, defs, `${p}($ref:${refName})`);
  }

  if (schema.type === "object" || schema.properties || schema.required) {
    if (!isObject(value)) {
      errs.push(`${p}: expected object`);
      return errs;
    }
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) errs.push(`${p}: unexpected property ${k}`);
      }
    }
    for (const [k, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        errs.push(...validatePartial(value[k], sub, defs, `${p}.${k}`));
      }
    }
    return errs;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errs.push(`${p}: expected array`);
      return errs;
    }
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errs.push(`${p}: minItems violated`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) errs.push(`${p}: maxItems violated`);
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        errs.push(...validatePartial(value[i], schema.items, defs, `${p}[${i}]`));
      }
    }
    return errs;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      errs.push(`${p}: expected string`);
      return errs;
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errs.push(`${p}: minLength violated`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) errs.push(`${p}: maxLength violated`);
    if (schema.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) errs.push(`${p}: pattern violated`);
    }
    if (schema.enum && !schema.enum.includes(value)) errs.push(`${p}: enum violated`);
    return errs;
  }

  if (schema.type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      errs.push(`${p}: expected integer`);
      return errs;
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) errs.push(`${p}: minimum violated`);
    if (schema.enum && !schema.enum.includes(value)) errs.push(`${p}: enum violated`);
    return errs;
  }

  if (schema.type === "boolean") {
    if (typeof value !== "boolean") errs.push(`${p}: expected boolean`);
    return errs;
  }

  return errs;
}

function validateFixtures(headDoc, selectedContractVersion) {
  const fixturesDir = path.join(repoRoot, "packages", "mcp", "contracts", selectedContractVersion, "fixtures");
  if (!fs.existsSync(fixturesDir)) return;
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      if (ent.isFile() && ent.name === "steps.json") {
        const steps = readJson(p);
        if (!Array.isArray(steps)) fail(`fixture ${p} must be an array`);
        const toolMap = indexTools(headDoc.tools);
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          if (!isObject(s)) fail(`fixture ${p}[${i}] must be object`);
          if (typeof s.tool !== "string" || !s.tool) fail(`fixture ${p}[${i}].tool missing`);
          if (!toolMap.has(s.tool)) fail(`fixture ${p}[${i}]: unknown tool ${s.tool}`);
          if (!isObject(s.input)) fail(`fixture ${p}[${i}].input must be object`);
          const tool = toolMap.get(s.tool);
          const errs = validate(s.input, tool.inputSchema, headDoc.definitions, `fixture:${path.relative(repoRoot, p)}[${i}].input`);
          if (errs.length) fail(errs[0]);

          if (Object.prototype.hasOwnProperty.call(s, "expect")) {
            if (!isObject(s.expect)) fail(`fixture ${p}[${i}].expect must be object`);
            const oerrs = validatePartial(
              s.expect,
              tool.outputSchema,
              headDoc.definitions,
              `fixture:${path.relative(repoRoot, p)}[${i}].expect`
            );
            if (oerrs.length) fail(oerrs[0]);
          }
        }
      }
    }
  };
  walk(fixturesDir);
}

function remediationForBreaking() {
  console.error("");
  console.error("Remediation:");
  console.error("- 不要对已冻结的契约版本做破坏性修改。");
  console.error("- 新建版本目录，例如 `contracts/v0.2.0-agent-contract/`，复制并修改 `mcp-tools.json/shared-types.ts/error-codes.md/fixtures`。");
  console.error("- 更新 replan 文档对契约路径的引用，并按流程打 tag/冻结。");
}

function main() {
  const args = parseArgs(process.argv);

  const contractDir = path.join(repoRoot, "packages", "mcp", "contracts", args.contractVersion);
  const toolsPath = path.join(contractDir, "mcp-tools.json");

  if (!fs.existsSync(toolsPath)) fail(`missing ${toolsPath}`);
  const doc = readJson(toolsPath);
  validateContractDoc(doc, args.contractVersion);

  if (args.baseRef) {
    const relToolsPath = path.posix.join("contracts", args.contractVersion, "mcp-tools.json");
    const baseDoc = readJsonFromGit(args.baseRef, relToolsPath);
    if (!baseDoc) {
      console.log(`contract-check: base contract not found (${args.baseRef}:${relToolsPath}), skipping compat compare`);
    } else {
      validateContractDoc(baseDoc, args.contractVersion);
      inCompatCompare = true;
      compareContractCompat(baseDoc, doc);
      inCompatCompare = false;
    }
  }

  validateFixtures(doc, args.contractVersion);

  console.log(`contract-check: ok (${doc.tools.length} tools)`);
}

try {
  main();
} catch (e) {
  console.error(`contract-check: ${e.message}`);
  if (inCompatCompare) remediationForBreaking();
  process.exit(1);
}
