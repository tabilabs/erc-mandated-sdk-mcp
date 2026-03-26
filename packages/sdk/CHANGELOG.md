# @erc-mandated/sdk

## 0.3.1

### Minor Changes

- Add packaged default deployment registry for VaultFactory on BSC Testnet `97` and BSC Mainnet `56`.
- Factory resolution now follows `input.factory > env > registry > error`.
- Expose `getDefaultDeployment(chainId)` for querying packaged default factory deployments.
- Include `factorySource` in `predictVaultAddress` and `prepareCreateVaultTx` results to show whether factory came from `input`, `env`, or `registry`.

## 0.3.0

### Minor Changes

- Add multichain bootstrap support and asset transfer execute tools.

## 0.2.0

### Minor Changes

- Add fund-and-action next-step orchestration support.

  SDK now exposes a fund-and-action driver layer that resolves resumable execution sessions into concrete tasks and can advance them through adapter-provided events.

  MCP now exposes `agent_fund_and_action_session_next_step` so external agents and apps can inspect the next funding or follow-up step without embedding runtime executors inside the MCP boundary.
