import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { getAllowedPaths } from "./utils.js";

export type CliConfig = {
	transport: "stdio" | "http";
	port: number;
	host: string;
	allowedHosts: string[];
	allowedOrigins: string[];
};

export type HttpServerOptions = {
	host: string;
	port: number;
	allowedHosts?: string[];
	allowedOrigins?: string[];
};

function parseCsvList(raw: string | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

export function isLoopbackHost(host: string): boolean {
	const normalized = host
		.trim()
		.replace(/^\[(.*)\]$/, "$1")
		.toLowerCase();
	return (
		normalized === "127.0.0.1" ||
		normalized === "localhost" ||
		normalized === "::1"
	);
}

export function isHostHeaderAllowed(
	hostHeader: string | undefined,
	bindHost: string,
	allowedHosts: string[] = [],
): boolean {
	if (!hostHeader?.trim()) return false;
	const trimmed = hostHeader.trim();

	let parsed: URL;
	try {
		parsed = new URL(`http://${trimmed}`);
	} catch {
		return false;
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.pathname !== "/" ||
		parsed.search ||
		parsed.hash
	) {
		return false;
	}

	const normalizedHost = trimmed.toLowerCase();
	const hostname = parsed.hostname.toLowerCase();

	if (allowedHosts.length > 0) {
		const allowedSet = new Set(allowedHosts.map((h) => h.toLowerCase()));
		return allowedSet.has(normalizedHost) || allowedSet.has(hostname);
	}

	if (isLoopbackHost(bindHost)) {
		return isLoopbackHost(hostname);
	}

	return true;
}

export function isOriginHeaderAllowed(
	originHeader: string | undefined,
	bindHost: string,
	allowedOrigins: string[] = [],
): boolean {
	if (originHeader === undefined) return true;
	const trimmed = originHeader.trim();
	if (!trimmed) return false;

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return false;
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return false;
	}

	if (allowedOrigins.length > 0) {
		return allowedOrigins.includes(parsed.origin);
	}

	if (isLoopbackHost(bindHost)) {
		return isLoopbackHost(parsed.hostname);
	}

	return false;
}

export function parseCliArgs(
	argv: string[],
	env: NodeJS.ProcessEnv = process.env,
): CliConfig {
	const transportArg = argv.find((a) => a.startsWith("--transport="));
	const transport = transportArg
		? transportArg.slice("--transport=".length)
		: env.MCP_TRANSPORT || "stdio";
	if (transport !== "stdio" && transport !== "http") {
		throw new Error(
			`Unknown transport "${transport}". Supported values: stdio, http`,
		);
	}

	const portArg = argv.find((a) => a.startsWith("--port="));
	const rawPort = portArg
		? portArg.slice("--port=".length)
		: env.MCP_PORT || "3000";
	if (!/^\d+$/.test(rawPort)) {
		throw new Error(
			`Invalid port "${rawPort}". Must be an integer between 1 and 65535.`,
		);
	}
	const port = Number.parseInt(rawPort, 10);
	if (port < 1 || port > 65535) {
		throw new Error(
			`Invalid port "${rawPort}". Must be an integer between 1 and 65535.`,
		);
	}

	const hostArg = argv.find((a) => a.startsWith("--host="));
	const host = (
		hostArg ? hostArg.slice("--host=".length) : env.MCP_HOST || "127.0.0.1"
	).trim();
	if (!host) {
		throw new Error("Invalid host: must not be empty.");
	}

	return {
		transport,
		port,
		host,
		allowedHosts: parseCsvList(env.MCP_ALLOWED_HOSTS),
		allowedOrigins: parseCsvList(env.MCP_ALLOWED_ORIGINS),
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
	const { host, allowedHosts = [], allowedOrigins = [] } = options;

	return http.createServer(async (req, res) => {
		const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
		if (pathname !== "/" && pathname !== "/mcp") {
			sendJsonError(res, 404, -32000, "Not found");
			return;
		}

		if (!isHostHeaderAllowed(req.headers.host, host, allowedHosts)) {
			sendJsonError(res, 403, -32000, "Forbidden: invalid Host header");
			return;
		}

		const originHeader = Array.isArray(req.headers.origin)
			? req.headers.origin[0]
			: req.headers.origin;
		if (!isOriginHeaderAllowed(originHeader, host, allowedOrigins)) {
			sendJsonError(res, 403, -32000, "Forbidden: invalid Origin header");
			return;
		}

		if (req.method !== "POST") {
			sendJsonError(res, 405, -32000, "Method not allowed", { Allow: "POST" });
			return;
		}

		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});
		transport.onerror = (error) => {
			console.error("[transport error]", error);
		};
		const server = createServer();

		let closed = false;
		const cleanup = () => {
			if (closed) return;
			closed = true;
			transport.close().catch(() => {});
			server.close().catch(() => {});
		};
		res.on("close", cleanup);

		try {
			await server.connect(transport);
			await transport.handleRequest(req, res);
		} catch (error) {
			cleanup();
			console.error("Error handling MCP HTTP request:", error);
			if (!res.headersSent) {
				sendJsonError(res, 500, -32603, "Internal server error");
			}
		}
	});
}

export async function startHttpServer(
	options: HttpServerOptions,
): Promise<http.Server> {
	if (!getAllowedPaths()) {
		console.error(
			"Warning: starting HTTP transport with MD_ALLOWED_PATHS unset; file-input tools can read any file accessible to this process.",
		);
	}
	if (!isLoopbackHost(options.host)) {
		console.error(
			`Warning: binding unauthenticated HTTP transport to non-loopback host "${options.host}". Place behind an authenticating reverse proxy and set MCP_ALLOWED_HOSTS / MCP_ALLOWED_ORIGINS.`,
		);
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
