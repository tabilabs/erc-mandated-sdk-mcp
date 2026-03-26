# @erc-mandated/mcp

## 0.3.1

### Minor Changes

- Add `factory_get_default_address` tool to query packaged default factory deployment by chainId.
- `factory_predict_vault_address` and `factory_create_vault_prepare` now include `factorySource` in success result payloads (`input` | `env` | `registry`).
- Document runtime behavior for the current main branch: BSC Testnet `97` and BSC Mainnet `56` are out-of-box for factory fallback via packaged registry; Base Mainnet `8453` still requires explicit factory configuration.

## 0.3.0

### Minor Changes

- Add multichain bootstrap support and asset transfer execute tools.

### Patch Changes

- Updated dependencies
  - @erc-mandated/sdk@0.3.1

## 0.2.0

### Minor Changes

- Add fund-and-action next-step orchestration support.

  SDK now exposes a fund-and-action driver layer that resolves resumable execution sessions into concrete tasks and can advance them through adapter-provided events.

  MCP now exposes `agent_fund_and_action_session_next_step` so external agents and apps can inspect the next funding or follow-up step without embedding runtime executors inside the MCP boundary.

### Patch Changes

- Updated dependencies
  - @erc-mandated/sdk@0.2.0

## 0.1.1

### Patch Changes

- Fix MCP success response serialization for `mandate_build_sign_request` by normalizing `BigInt` values into JSON-safe strings before stdio transport.

  Add regression test coverage to ensure `structuredContent` is always `JSON.stringify`-safe on success paths.
