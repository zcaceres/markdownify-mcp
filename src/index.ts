#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { parseCliArgs, startHttpServer } from "./http.js";
import { createServer } from "./server.js";

async function main() {
	process.env.PYTHONUTF8 = "1";
	const config = parseCliArgs(process.argv.slice(2));

	if (config.transport === "http") {
		await startHttpServer({
			host: config.host,
			port: config.port,
			allowedHosts: config.allowedHosts,
			allowedOrigins: config.allowedOrigins,
			allowUnrestrictedPaths: config.allowUnrestrictedPaths,
		});
		return;
	}

	serveStdio(() => createServer(), {
		onerror: (error) => {
			console.error("[stdio error]", error);
		},
	});
}

main().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
