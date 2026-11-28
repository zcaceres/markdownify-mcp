import { describe, expect, test } from "bun:test";
import { err, ok } from "../shared/types.js";
import { startupDiagnostics } from "./queries.js";
import {
	checkHttpRequest,
	isHostHeaderAllowed,
	isLoopbackHost,
	isOriginHeaderAllowed,
	parseServerConfiguration,
} from "./verbs.js";

describe("parseServerConfiguration (SC-1, SC-2, MC-7, D1, D2, D23, D32, D51)", () => {
	test("defaults to stdio on 127.0.0.1:3000 with classic toolset and allows CLI flags to override env vars", () => {
		expect(parseServerConfiguration([], {})).toEqual(
			ok({
				transport: "stdio",
				port: 3000,
				host: "127.0.0.1",
				allowedHosts: [],
				allowedOrigins: [],
				allowUnrestrictedPaths: false,
				toolset: "classic",
			}),
		);

		expect(
			parseServerConfiguration(
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
		).toEqual(
			ok({
				transport: "http",
				port: 4123,
				host: "localhost",
				allowedHosts: ["mcp.example.com", "localhost:4123"],
				allowedOrigins: ["https://app.example.com"],
				allowUnrestrictedPaths: true,
				toolset: "compact",
			}),
		);

		expect(
			parseServerConfiguration([], { MCP_TOOLSET: "compact" }),
		).toMatchObject({
			ok: true,
			value: { toolset: "compact" },
		});
	});

	test("rejects unknown CLI flags, positional args, and invalid values (D32, D51)", () => {
		expect(parseServerConfiguration(["--transprot=http"], {})).toEqual(
			err(
				'Unknown CLI argument "--transprot=http". Supported flags: --transport=stdio|http, --host=HOST, --port=N, --allow-unrestricted-paths, --toolset=classic|compact',
			),
		);
		expect(parseServerConfiguration(["--allow-unrestricted"], {})).toEqual(
			err(
				'Unknown CLI argument "--allow-unrestricted". Supported flags: --transport=stdio|http, --host=HOST, --port=N, --allow-unrestricted-paths, --toolset=classic|compact',
			),
		);
		expect(parseServerConfiguration(["extra-arg"], {})).toEqual(
			err(
				'Unknown CLI argument "extra-arg". Supported flags: --transport=stdio|http, --host=HOST, --port=N, --allow-unrestricted-paths, --toolset=classic|compact',
			),
		);
		expect(parseServerConfiguration(["--transport=ws"], {})).toEqual(
			err('Unknown transport "ws". Supported values: stdio, http'),
		);
		expect(parseServerConfiguration(["--toolset=minimal"], {})).toEqual(
			err('Unknown toolset "minimal". Supported values: classic, compact'),
		);
		expect(parseServerConfiguration([], { MCP_TOOLSET: "invalid" })).toEqual(
			err('Unknown toolset "invalid". Supported values: classic, compact'),
		);
		expect(parseServerConfiguration(["--port=0"], {})).toEqual(
			err('Invalid port "0". Must be an integer between 1 and 65535.'),
		);
		expect(parseServerConfiguration(["--host="], {})).toEqual(
			err("Invalid host: must not be empty."),
		);
	});
});

describe("checkHttpRequest & Host/Origin helpers (SC-4, SC-5, SC-6, D33, I5)", () => {
	test("checks loopback hosts, Host headers, and Origin headers", () => {
		expect(isLoopbackHost("127.0.0.1")).toBe(true);
		expect(isLoopbackHost("[::1]")).toBe(true);
		expect(isLoopbackHost("0.0.0.0")).toBe(false);
		expect(isHostHeaderAllowed("localhost:3000", "127.0.0.1")).toBe(true);
		expect(isHostHeaderAllowed("evil.com:3000", "127.0.0.1")).toBe(false);
		expect(isOriginHeaderAllowed(undefined, "0.0.0.0")).toBe(true);
		expect(isOriginHeaderAllowed("https://evil.com", "127.0.0.1")).toBe(false);
	});

	test("enforces 404 routing, 403 Host/Origin, and 405 POST-only", () => {
		const loopback = {
			host: "127.0.0.1",
			allowedHosts: [] as readonly string[],
			allowedOrigins: [] as readonly string[],
		};
		expect(
			checkHttpRequest(
				{ method: "POST", pathname: "/mcp", hostHeader: "127.0.0.1:3000" },
				loopback,
			),
		).toEqual({ allowed: true });
		expect(
			checkHttpRequest(
				{ method: "GET", pathname: "/health", hostHeader: "127.0.0.1:3000" },
				loopback,
			),
		).toEqual({ allowed: false, status: 404, message: "Not found" });
		expect(
			checkHttpRequest(
				{ method: "POST", pathname: "/mcp", hostHeader: "evil.com:3000" },
				loopback,
			),
		).toEqual({
			allowed: false,
			status: 403,
			message: "Forbidden: invalid Host header",
		});
		expect(
			checkHttpRequest(
				{
					method: "POST",
					pathname: "/mcp",
					hostHeader: "127.0.0.1:3000",
					originHeader: "https://evil.com",
				},
				loopback,
			),
		).toEqual({
			allowed: false,
			status: 403,
			message: "Forbidden: invalid Origin header",
		});
		expect(
			checkHttpRequest(
				{ method: "GET", pathname: "/mcp", hostHeader: "127.0.0.1:3000" },
				loopback,
			),
		).toEqual({
			allowed: false,
			status: 405,
			message: "Method not allowed",
			allowHeader: "POST",
		});
	});
});

describe("startupDiagnostics (SC-7, D9, D23, D24, D33, D35, D36)", () => {
	const mockExpand = (p: string) => p;

	test("computes Startup Diagnostics for disabled file tools, unrestricted opt-in, empty MD_ALLOWED_PATHS, and non-loopback bind", () => {
		const base = {
			transport: "http" as const,
			port: 3000,
			host: "127.0.0.1",
			allowedHosts: [],
			allowedOrigins: [],
			allowUnrestrictedPaths: false,
			toolset: "classic" as const,
		};

		expect(startupDiagnostics(base, {}, mockExpand)).toEqual([
			{
				level: "notice",
				message:
					"Notice: starting HTTP transport with MD_ALLOWED_PATHS unset; local file tools are disabled by default.",
			},
		]);

		expect(
			startupDiagnostics(
				{ ...base, host: "0.0.0.0", allowUnrestrictedPaths: true },
				{},
				mockExpand,
			),
		).toEqual([
			{
				level: "warning",
				message:
					"Warning: starting HTTP transport with unrestricted local file access opted in; file-input tools can read any file accessible to this process.",
			},
			{
				level: "warning",
				message:
					'Warning: binding unauthenticated HTTP transport to non-loopback host "0.0.0.0". Place behind an authenticating reverse proxy and set MCP_ALLOWED_HOSTS / MCP_ALLOWED_ORIGINS.',
			},
		]);

		expect(
			startupDiagnostics(base, { MD_ALLOWED_PATHS: ":" }, mockExpand),
		).toEqual([
			{
				level: "warning",
				message:
					"Warning: MD_ALLOWED_PATHS is set but contains no valid directories. Specify at least one directory or unset MD_ALLOWED_PATHS.",
			},
		]);

		expect(
			startupDiagnostics(base, { MD_ALLOWED_PATHS: "/data" }, mockExpand),
		).toEqual([]);
	});
});
