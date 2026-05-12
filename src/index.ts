#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
	process.env.PYTHONUTF8 = "1";
	const transport = new StdioServerTransport();
	const server = createServer();
	await server.connect(transport);
}

main().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
