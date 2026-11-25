import { afterEach, describe, expect, test } from "bun:test";
import http from "node:http";
import {
	createHttpServer,
	isHostHeaderAllowed,
	isLoopbackHost,
	isOriginHeaderAllowed,
	parseCliArgs,
} from "./http";

describe("parseCliArgs", () => {
	test("defaults to stdio transport on 127.0.0.1:3000", () => {
		expect(parseCliArgs([], {})).toEqual({
			transport: "stdio",
			port: 3000,
			host: "127.0.0.1",
			allowedHosts: [],
			allowedOrigins: [],
		});
	});

	test("parses CLI flags and overrides env vars", () => {
		expect(
			parseCliArgs(["--transport=http", "--port=4123", "--host=localhost"], {
				MCP_TRANSPORT: "stdio",
				MCP_PORT: "9999",
				MCP_HOST: "0.0.0.0",
				MCP_ALLOWED_HOSTS: "mcp.example.com, localhost:4123",
				MCP_ALLOWED_ORIGINS: "https://app.example.com",
			}),
		).toEqual({
			transport: "http",
			port: 4123,
			host: "localhost",
			allowedHosts: ["mcp.example.com", "localhost:4123"],
			allowedOrigins: ["https://app.example.com"],
		});
	});

	test("reads env vars when flags are omitted", () => {
		expect(
			parseCliArgs([], {
				MCP_TRANSPORT: "http",
				MCP_PORT: "8080",
				MCP_HOST: "::1",
			}),
		).toMatchObject({
			transport: "http",
			port: 8080,
			host: "::1",
		});
	});

	test("rejects unknown transport and invalid ports", () => {
		expect(() => parseCliArgs(["--transport=ws"], {})).toThrow(
			'Unknown transport "ws"',
		);
		expect(() => parseCliArgs(["--port=0"], {})).toThrow("Invalid port");
		expect(() => parseCliArgs(["--port=70000"], {})).toThrow("Invalid port");
		expect(() => parseCliArgs(["--port=abc"], {})).toThrow("Invalid port");
	});
});

describe("Host and Origin validation", () => {
	test("recognizes loopback hosts", () => {
		expect(isLoopbackHost("127.0.0.1")).toBe(true);
		expect(isLoopbackHost("localhost")).toBe(true);
		expect(isLoopbackHost("::1")).toBe(true);
		expect(isLoopbackHost("[::1]")).toBe(true);
		expect(isLoopbackHost("0.0.0.0")).toBe(false);
		expect(isLoopbackHost("example.com")).toBe(false);
	});

	test("blocks non-loopback Host headers when bound to loopback", () => {
		expect(isHostHeaderAllowed("127.0.0.1:3000", "127.0.0.1")).toBe(true);
		expect(isHostHeaderAllowed("localhost:3000", "127.0.0.1")).toBe(true);
		expect(isHostHeaderAllowed("[::1]:3000", "127.0.0.1")).toBe(true);
		expect(isHostHeaderAllowed("evil.com:3000", "127.0.0.1")).toBe(false);
		expect(isHostHeaderAllowed("evil@localhost:3000", "127.0.0.1")).toBe(false);
		expect(isHostHeaderAllowed(undefined, "127.0.0.1")).toBe(false);
	});

	test("enforces explicit allowedHosts when provided", () => {
		expect(
			isHostHeaderAllowed("mcp.example.com", "0.0.0.0", ["mcp.example.com"]),
		).toBe(true);
		expect(
			isHostHeaderAllowed("other.example.com", "0.0.0.0", ["mcp.example.com"]),
		).toBe(false);
	});

	test("blocks cross-origin browser requests by default", () => {
		expect(isOriginHeaderAllowed(undefined, "127.0.0.1")).toBe(true);
		expect(isOriginHeaderAllowed("http://localhost:5173", "127.0.0.1")).toBe(
			true,
		);
		expect(isOriginHeaderAllowed("http://127.0.0.1:8080", "127.0.0.1")).toBe(
			true,
		);
		expect(isOriginHeaderAllowed("https://evil.com", "127.0.0.1")).toBe(false);
		expect(isOriginHeaderAllowed("null", "127.0.0.1")).toBe(false);
		expect(isOriginHeaderAllowed("https://app.example.com", "0.0.0.0")).toBe(
			false,
		);
		expect(
			isOriginHeaderAllowed("https://app.example.com", "0.0.0.0", [
				"https://app.example.com",
			]),
		).toBe(true);
	});
});

describe("Streamable HTTP server", () => {
	let server: http.Server | null = null;

	afterEach(async () => {
		const activeServer = server;
		if (activeServer) {
			await new Promise<void>((resolve) => activeServer.close(() => resolve()));
			server = null;
		}
	});

	async function listen(
		opts: { allowedHosts?: string[]; allowedOrigins?: string[] } = {},
	): Promise<number> {
		const activeServer = createHttpServer({
			host: "127.0.0.1",
			port: 0,
			...opts,
		});
		server = activeServer;
		await new Promise<void>((resolve) =>
			activeServer.listen(0, "127.0.0.1", () => resolve()),
		);
		const addr = activeServer.address();
		if (!addr || typeof addr === "string") {
			throw new Error("Expected numeric port");
		}
		return addr.port;
	}

	function rawRequest(
		port: number,
		options: {
			method?: string;
			path?: string;
			headers?: Record<string, string>;
			body?: string;
		},
	): Promise<{ status: number; body: string }> {
		return new Promise((resolve, reject) => {
			const req = http.request(
				{
					host: "127.0.0.1",
					port,
					method: options.method ?? "POST",
					path: options.path ?? "/mcp",
					headers: options.headers,
				},
				(res) => {
					let data = "";
					res.on("data", (chunk) => (data += chunk));
					res.on("end", () =>
						resolve({ status: res.statusCode ?? 0, body: data }),
					);
				},
			);
			req.on("error", reject);
			if (options.body) req.write(options.body);
			req.end();
		});
	}

	test("handles MCP tools/list POST on /mcp and /", async () => {
		const port = await listen();
		const payload = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
			params: {},
		});

		for (const reqPath of ["/mcp", "/"]) {
			const res = await rawRequest(port, {
				path: reqPath,
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
				},
				body: payload,
			});
			expect(res.status).toBe(200);
			expect(res.body).toContain("pdf-to-markdown");
			expect(res.body).toContain("git-repo-to-markdown");
		}
	});

	test("returns 404 on unknown paths and 405 on GET", async () => {
		const port = await listen();
		const notFound = await rawRequest(port, { path: "/unknown" });
		expect(notFound.status).toBe(404);

		const methodNotAllowed = await rawRequest(port, {
			method: "GET",
			path: "/mcp",
		});
		expect(methodNotAllowed.status).toBe(405);
	});

	test("rejects DNS-rebinding Host headers and cross-origin Origin headers with 403", async () => {
		const port = await listen();
		const payload = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
			params: {},
		});

		const badHost = await rawRequest(port, {
			headers: {
				Host: "rebind.evil.com:3000",
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: payload,
		});
		expect(badHost.status).toBe(403);
		expect(badHost.body).toContain("invalid Host header");

		const badOrigin = await rawRequest(port, {
			headers: {
				Origin: "https://evil.com",
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: payload,
		});
		expect(badOrigin.status).toBe(403);
		expect(badOrigin.body).toContain("invalid Origin header");

		const goodOrigin = await rawRequest(port, {
			headers: {
				Origin: "http://localhost:5173",
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: payload,
		});
		expect(goodOrigin.status).toBe(200);
	});
});
