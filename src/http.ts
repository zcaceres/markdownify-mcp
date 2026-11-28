import http from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { Toolset } from "./mcp-contract/nouns.js";
import { createServer } from "./server.js";
import { startupDiagnostics } from "./server-config/queries.js";
import {
	checkHttpRequest,
	isHostHeaderAllowed,
	isLoopbackHost,
	isOriginHeaderAllowed,
	parseServerConfiguration,
} from "./server-config/verbs.js";
import { expandHome } from "./utils.js";

export { isHostHeaderAllowed, isLoopbackHost, isOriginHeaderAllowed };

export type CliConfig = {
	transport: "stdio" | "http";
	port: number;
	host: string;
	allowedHosts: string[];
	allowedOrigins: string[];
	allowUnrestrictedPaths: boolean;
	toolset: Toolset;
};

export type HttpServerOptions = {
	host: string;
	port: number;
	allowedHosts?: string[];
	allowedOrigins?: string[];
	allowUnrestrictedPaths?: boolean;
	toolset?: Toolset;
};

export function parseCliArgs(
	argv: string[],
	env: NodeJS.ProcessEnv = process.env,
): CliConfig {
	const parsed = parseServerConfiguration(argv, env);
	if (!parsed.ok) {
		throw new Error(parsed.error);
	}
	return {
		...parsed.value,
		allowedHosts: [...parsed.value.allowedHosts],
		allowedOrigins: [...parsed.value.allowedOrigins],
	};
}

function sendJsonError(
	res: http.ServerResponse,
	status: number,
	code: number,
	message: string,
	extraHeaders: Record<string, string> = {},
): void {
	res.writeHead(status, {
		"Content-Type": "application/json",
		...extraHeaders,
	});
	res.end(
		JSON.stringify({
			jsonrpc: "2.0",
			error: { code, message },
			id: null,
		}),
	);
}

export function createHttpServer(options: HttpServerOptions): http.Server {
	const {
		host,
		allowedHosts = [],
		allowedOrigins = [],
		allowUnrestrictedPaths,
		toolset = "compact",
	} = options;

	const mcpHandler = createMcpHandler(
		() =>
			createServer({
				transport: "http",
				allowUnrestrictedPaths,
				toolset,
			}),
		{
			onerror: (error) => {
				console.error("[transport error]", error);
			},
		},
	);
	const nodeHandler = toNodeHandler(mcpHandler, {
		onerror: (error) => {
			console.error("Error handling MCP HTTP request:", error);
		},
	});

	const httpServer = http.createServer(async (req, res) => {
		const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
		const originHeader = Array.isArray(req.headers.origin)
			? req.headers.origin[0]
			: req.headers.origin;
		const guard = checkHttpRequest(
			{
				method: req.method ?? "",
				pathname,
				hostHeader: req.headers.host,
				originHeader,
			},
			{ host, allowedHosts, allowedOrigins },
		);
		if (!guard.allowed) {
			sendJsonError(
				res,
				guard.status,
				-32000,
				guard.message,
				guard.allowHeader ? { Allow: guard.allowHeader } : {},
			);
			return;
		}

		await nodeHandler(req, res);
	});

	httpServer.on("close", () => {
		mcpHandler.close().catch(() => {});
	});

	return httpServer;
}

export async function startHttpServer(
	options: HttpServerOptions,
): Promise<http.Server> {
	const diagnostics = startupDiagnostics(
		{
			transport: "http",
			port: options.port,
			host: options.host,
			allowedHosts: options.allowedHosts ?? [],
			allowedOrigins: options.allowedOrigins ?? [],
			allowUnrestrictedPaths: options.allowUnrestrictedPaths === true,
			toolset: options.toolset ?? "classic",
		},
		process.env,
		expandHome,
	);
	for (const diagnostic of diagnostics) {
		console.error(diagnostic.message);
	}

	const httpServer = createHttpServer(options);

	await new Promise<void>((resolve, reject) => {
		httpServer.once("error", reject);
		httpServer.listen(options.port, options.host, () => {
			httpServer.off("error", reject);
			const addr = httpServer.address();
			const boundPort =
				typeof addr === "object" && addr ? addr.port : options.port;
			const displayHost = options.host.includes(":")
				? `[${options.host}]`
				: options.host;
			console.error(
				`markdownify-mcp listening on http://${displayHost}:${boundPort}/mcp (streamable HTTP transport)`,
			);
			resolve();
		});
	});

	const shutdown = () => {
		httpServer.close(() => process.exit(0));
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	return httpServer;
}
