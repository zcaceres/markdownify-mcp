#!/usr/bin/env node

import http from "node:http";
import { createServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function parseArgs(argv: string[]): { transport: "stdio" | "http"; port: number } {
  const transportArg = argv.find((a) => a.startsWith("--transport="));
  const transport = transportArg ? transportArg.split("=")[1] : process.env.MCP_TRANSPORT || "stdio";
  if (transport !== "stdio" && transport !== "http") {
    throw new Error(`Unknown transport "${transport}". Supported values: stdio, http`);
  }
  const portArg = argv.find((a) => a.startsWith("--port="));
  const port = portArg ? parseInt(portArg.split("=")[1], 10) : parseInt(process.env.MCP_PORT || "3000", 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid port "${port}". Must be a positive integer.`);
  }
  return { transport: transport as "stdio" | "http", port };
}

async function runStdio() {
  const transport = new StdioServerTransport();
  const server = createServer();
  await server.connect(transport);
}

async function runHttp(port: number) {
  const httpServer = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed" },
        id: null,
      }));
      return;
    }

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      transport.onerror = (error) => {
        console.error("[transport error]", error);
      };
      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res);
      res.on("close", () => {
        transport.close().catch(() => {});
      });
    } catch (error) {
      console.error("Error handling MCP HTTP request:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        }));
      }
    }
  });

  httpServer.listen(port, () => {
    console.error(`markdownify-mcp listening on http://0.0.0.0:${port}/ (streamable HTTP transport)`);
  });

  const shutdown = () => {
    httpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  process.env.PYTHONUTF8 = '1';
  const { transport, port } = parseArgs(process.argv.slice(2));
  if (transport === "http") {
    await runHttp(port);
  } else {
    await runStdio();
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
