#!/usr/bin/env node
import { runMcpServer } from "./index.js";

runMcpServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
