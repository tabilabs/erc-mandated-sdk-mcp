# ERC-8192 SDK + MCP

TypeScript SDK and MCP server workspace for ERC-8192 mandated execution workflows.

## Status

- npm latest SDK package: `@erc-mandated/sdk@0.3.1`
- npm latest MCP package: `@erc-mandated/mcp@0.3.1`
- repo `main` default bundled contract surface: `v0.3.1-agent-contract`

This repository is the developer tooling layer for the ERC-8192 effort. It is not the canonical reference implementation repository.

Canonical references:

- Reference implementation: `https://github.com/tabilabs/mandated-vault-factory`
- ERC submission track: `https://github.com/ethereum/ERCs/pull/1597`
- EthMagicians topic: `https://ethereum-magicians.org/t/erc-8192-mandated-execution-for-tokenized-vaults/27877`

## Packages

- `@erc-mandated/sdk`: TypeScript SDK for vault, mandate, funding-policy, and fund-and-action flows
- `@erc-mandated/mcp`: MCP server + CLI exposing the published tool surface

## Notes

- The public ERC number is now `8192`.
- `npm latest` currently ships `v0.3.1-agent-contract`.
- `v0.1.1-agent-contract` is retained as a legacy rollback target and can still be selected through `ERC_MANDATED_CONTRACT_VERSION`.

## 当前 `main` 分支 Factory 默认部署可用性

- 开箱即用（未传 `factory` 且未配置 env 也可解析）：
  - BSC Testnet `97`
  - BSC Mainnet `56`
- 仍需显式配置 factory：
  - Base Mainnet `8453`

Factory 解析优先级：`input.factory` > `env` > packaged registry > `FACTORY_ADDRESS_NOT_CONFIGURED`。

当前 README 已按本次 `0.3.1` 发布线收口；如需回滚旧 bundle，请显式指定 `ERC_MANDATED_CONTRACT_VERSION`。
