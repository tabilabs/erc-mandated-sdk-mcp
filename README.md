# ERC-8192 SDK + MCP

TypeScript SDK and MCP server workspace for ERC-8192 mandated execution workflows.

## Status

- SDK package: `@erc-mandated/sdk@0.2.0`
- MCP package: `@erc-mandated/mcp@0.2.0`
- Current bundled contract surface: `v0.2.0-agent-contract`

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
- The default MCP bundle now targets the `ERC-8192` active contract line via `v0.2.0-agent-contract`.
- `v0.1.1-agent-contract` is retained as a legacy rollback target and can still be selected through `ERC_MANDATED_CONTRACT_VERSION`.
