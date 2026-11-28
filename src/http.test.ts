import { afterEach, describe, expect, test } from "bun:test";
import http from "node:http";
import type { Tool } from "@modelcontextprotocol/server";
import {
	createHttpServer,
	isHostHeaderAllowed,
	isLoopbackHost,
	isOriginHeaderAllowed,
	parseCliArgs,
} from "./http";
import {
	CLASSIC_OPEN_WORLD_BY_TOOL,
	COMPACT_OPEN_WORLD_BY_TOOL,
	toolContractAudit,
} from "./mcp-contract/queries";

describe("parseCliArgs", () => {
	test("defaults to stdio transport on 127.0.0.1:3000 with compact toolset", () => {
		expect(parseCliArgs([], {})).toEqual({
			transport: "stdio",
			port: 3000,
			host: "127.0.0.1",
			allowedHosts: [],
			allowedOrigins: [],
			allowUnrestrictedPaths: false,
			toolset: "compact",
		});
	});

	test("parses CLI flags and overrides env vars", () => {
		expect(
			parseCliArgs(
				[
					"--transport=http",
					"--port=4123",
					"--host=localhost",
					"--allow-unrestricted-paths",
					"--toolset=compact",
				],
				{
					MCP_TRANSPORT: "stdio",
					MCP_PORT: "9999",
					MCP_HOST: "0.0.0.0",
					MCP_ALLOWED_HOSTS: "mcp.example.com, localhost:4123",
					MCP_ALLOWED_ORIGINS: "https://app.example.com",
					MCP_TOOLSET: "classic",
				},
			),
		).toEqual({
			transport: "http",
			port: 4123,
			host: "localhost",
			allowedHosts: ["mcp.example.com", "localhost:4123"],
			allowedOrigins: ["https://app.example.com"],
			allowUnrestrictedPaths: true,
			toolset: "compact",
		});
	});

	test("reads env vars when flags are omitted", () => {
		expect(
			parseCliArgs([], {
				MCP_TRANSPORT: "http",
				MCP_PORT: "8080",
				MCP_HOST: "::1",
				MCP_ALLOW_UNRESTRICTED_PATHS: "true",
			}),
		).toMatchObject({
			transport: "http",
			port: 8080,
			host: "::1",
			allowUnrestrictedPaths: true,
		});
	});

	test("rejects unknown transport, invalid ports, and unknown CLI flags (D32)", () => {
		expect(() => parseCliArgs(["--transport=ws"], {})).toThrow(
			'Unknown transport "ws"',
		);
		expect(() => parseCliArgs(["--port=0"], {})).toThrow("Invalid port");
		expect(() => parseCliArgs(["--port=70000"], {})).toThrow("Invalid port");
		expect(() => parseCliArgs(["--port=abc"], {})).toThrow("Invalid port");
		expect(() => parseCliArgs(["--transprot=http"], {})).toThrow(
			'Unknown CLI argument "--transprot=http"',
		);
		expect(() => parseCliArgs(["unexpected"], {})).toThrow(
			'Unknown CLI argument "unexpected"',
		);
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
		opts: {
			allowedHosts?: string[];
			allowedOrigins?: string[];
			allowUnrestrictedPaths?: boolean;
			toolset?: "classic" | "compact";
		} = {},
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

	async function closeServer(): Promise<void> {
		const activeServer = server;
		if (activeServer) {
			await new Promise<void>((resolve) => activeServer.close(() => resolve()));
			server = null;
		}
	}

	function rawRequest(
		port: number,
		options: {
			method?: string;
			path?: string;
			headers?: Record<string, string>;
			body?: string;
		},
	): Promise<{
		status: number;
		headers: http.IncomingHttpHeaders;
		body: string;
	}> {
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
						resolve({
							status: res.statusCode ?? 0,
							headers: res.headers,
							body: data,
						}),
					);
				},
			);
			req.on("error", reject);
			if (options.body) req.write(options.body);
			req.end();
		});
	}

	function parseMcpJsonRpc(body: string): Record<string, unknown> {
		const trimmed = body.trim();
		if (trimmed.startsWith("{")) {
			return JSON.parse(trimmed) as Record<string, unknown>;
		}
		const dataLine = trimmed
			.split(/\r?\n/)
			.find((line) => line.startsWith("data:"));
		if (!dataLine) {
			throw new Error(`Unable to parse MCP HTTP payload: ${body}`);
		}
		return JSON.parse(dataLine.slice("data:".length).trim()) as Record<
			string,
			unknown
		>;
	}

	test("handles MCP tools/list POST on /mcp and / with default 4 compact tools (SC-3, SC-8, D51)", async () => {
		const port = await listen();
		const payload = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/list",
			params: {},
		});

		const expectedTools = [
			"convert-git-repo",
			"convert-local-file",
			"convert-web-url",
			"get-markdown-file",
		];

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
			const parsed = parseMcpJsonRpc(res.body);
			const result = parsed.result as { tools?: Tool[] };
			const listedTools = result.tools ?? [];
			const names = listedTools.map((t) => t.name).sort();
			expect(names).toEqual(expectedTools);
			const audit = toolContractAudit(listedTools, COMPACT_OPEN_WORLD_BY_TOOL);
			expect(audit.issues).toEqual([]);
			expect(audit.ok).toBe(true);
		}
	});

	test("returns 404 on unknown paths and 405 with Allow: POST on GET and DELETE (SC-4, SC-8, D33)", async () => {
		const port = await listen();
		const notFound = await rawRequest(port, { path: "/unknown" });
		expect(notFound.status).toBe(404);

		for (const method of ["GET", "DELETE"]) {
			const methodNotAllowed = await rawRequest(port, {
				method,
				path: "/mcp",
			});
			expect(methodNotAllowed.status).toBe(405);
			expect(methodNotAllowed.headers.allow).toBe("POST");
		}
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

	test("enforces D9 fail-closed local file blocking, D23 opt-out, and D8 unknown tool error over live HTTP POST /mcp (SC-3, SC-8, D8, D9, D23)", async () => {
		const savedAllowed = process.env.MD_ALLOWED_PATHS;
		const savedOptOut = process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
		delete process.env.MD_ALLOWED_PATHS;
		delete process.env.MCP_ALLOW_UNRESTRICTED_PATHS;

		const callOverHttp = async (
			port: number,
			name: string,
			args: Record<string, unknown>,
		) => {
			const res = await rawRequest(port, {
				path: "/mcp",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/call",
					params: { name, arguments: args },
				}),
			});
			expect(res.status).toBe(200);
			const parsed = parseMcpJsonRpc(res.body);
			return parsed.result as {
				isError?: boolean;
				content?: Array<{ type: string; text?: string }>;
			};
		};

		try {
			const port = await listen();
			const pdfResult = await callOverHttp(port, "convert-local-file", {
				filepath: "/data/report.pdf",
			});
			expect(pdfResult.isError).toBe(true);
			expect(pdfResult.content?.[0]?.text).toContain(
				"Local file tools are disabled in HTTP mode",
			);

			const mdResult = await callOverHttp(port, "get-markdown-file", {
				filepath: "/data/notes.md",
			});
			expect(mdResult.isError).toBe(true);
			expect(mdResult.content?.[0]?.text).toContain(
				"Local file tools are disabled in HTTP mode",
			);

			const unknownResult = await callOverHttp(port, "no-such-tool", {});
			expect(unknownResult.isError).toBe(true);
			expect(unknownResult.content?.[0]?.text).toBe("Error: Tool not found");

			await closeServer();

			// Opt-in Classic Toolset over live HTTP exposes all 11 format-specific tools passing full audit (MC-7, D3, D51)
			const classicPort = await listen({ toolset: "classic" });
			const classicListRes = await rawRequest(classicPort, {
				path: "/mcp",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 3,
					method: "tools/list",
					params: {},
				}),
			});
			expect(classicListRes.status).toBe(200);
			const classicParsed = parseMcpJsonRpc(classicListRes.body);
			const classicTools =
				(classicParsed.result as { tools?: Tool[] }).tools ?? [];
			expect(classicTools.map((t) => t.name).sort()).toEqual([
				"audio-to-markdown",
				"bing-search-to-markdown",
				"docx-to-markdown",
				"get-markdown-file",
				"git-repo-to-markdown",
				"image-to-markdown",
				"pdf-to-markdown",
				"pptx-to-markdown",
				"webpage-to-markdown",
				"xlsx-to-markdown",
				"youtube-to-markdown",
			]);
			const classicAudit = toolContractAudit(
				classicTools,
				CLASSIC_OPEN_WORLD_BY_TOOL,
			);
			expect(classicAudit.issues).toEqual([]);
			expect(classicAudit.ok).toBe(true);

			await closeServer();

			// D23 opt-out passes the HTTP fail-closed gate and reaches filesystem validation
			const optOutPort = await listen({ allowUnrestrictedPaths: true });
			const optOutResult = await callOverHttp(
				optOutPort,
				"convert-local-file",
				{
					filepath: "/nonexistent/http-d23-check.pdf",
				},
			);
			expect(optOutResult.isError).toBe(true);
			expect(optOutResult.content?.[0]?.text).toContain("File does not exist:");
		} finally {
			if (savedAllowed === undefined) delete process.env.MD_ALLOWED_PATHS;
			else process.env.MD_ALLOWED_PATHS = savedAllowed;
			if (savedOptOut === undefined)
				delete process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
			else process.env.MCP_ALLOW_UNRESTRICTED_PATHS = savedOptOut;
		}
	});
});
