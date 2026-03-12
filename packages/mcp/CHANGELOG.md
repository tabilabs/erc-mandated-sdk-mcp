# @erc-mandated/mcp

## 0.3.0

### Minor Changes

- Add multichain bootstrap support and asset transfer execute tools.

### Patch Changes

- Updated dependencies
  - @erc-mandated/sdk@0.3.0

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
