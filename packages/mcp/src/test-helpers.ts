import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "./index.js";
import type { McpServerOptions } from "./index.js";
import type { SdkAdapter } from "./tools/sdkAdapter.js";

export async function createConnectedClient(sdkAdapter?: SdkAdapter, serverOptions?: McpServerOptions) {
  const { server } = await createMcpServer({
    ...serverOptions,
    ...(sdkAdapter ? { sdkAdapter } : {})
  });

  const client = new Client({
    name: "mcp-test-client",
    version: "0.2.0"
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}
