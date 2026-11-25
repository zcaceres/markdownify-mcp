#!/usr/bin/env node

import { createServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseCliArgs, startHttpServer } from "./http.js";

async function main() {
  process.env.PYTHONUTF8 = "1";
  const config = parseCliArgs(process.argv.slice(2));

  if (config.transport === "http") {
    await startHttpServer({
      host: config.host,
      port: config.port,
      allowedHosts: config.allowedHosts,
      allowedOrigins: config.allowedOrigins,
    });
    return;
  }

  const transport = new StdioServerTransport();
  const server = createServer();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
