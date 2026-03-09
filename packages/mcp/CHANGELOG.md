# @erc-mandated/mcp

## 0.1.1

### Patch Changes

- Fix MCP success response serialization for `mandate_build_sign_request` by normalizing `BigInt` values into JSON-safe strings before stdio transport.

  Add regression test coverage to ensure `structuredContent` is always `JSON.stringify`-safe on success paths.
