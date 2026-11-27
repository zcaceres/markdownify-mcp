import {
	HTTP_UNRESTRICTED_CLI_FLAG,
	HTTP_UNRESTRICTED_ENV_VAR,
} from "../shared/local-access.js";
import { err, ok, type Result } from "../shared/types.js";
import type {
	HttpGuardConfig,
	HttpRequestGuardResult,
	IncomingHttpRequest,
	ServerConfiguration,
} from "./nouns.js";

const SUPPORTED_FLAGS =
	"--transport=stdio|http, --host=HOST, --port=N, --allow-unrestricted-paths";

const parseCsvList = (raw: string | undefined): string[] => {
	if (!raw) return [];
	return raw
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
};

export const isLoopbackHost = (host: string): boolean => {
	const normalized = host
		.trim()
		.replace(/^\[(.*)\]$/, "$1")
		.toLowerCase();
	return (
		normalized === "127.0.0.1" ||
		normalized === "localhost" ||
		normalized === "::1"
	);
};

export const isHostHeaderAllowed = (
	hostHeader: string | undefined,
	bindHost: string,
	allowedHosts: readonly string[] = [],
): boolean => {
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
};

export const isOriginHeaderAllowed = (
	originHeader: string | undefined,
	bindHost: string,
	allowedOrigins: readonly string[] = [],
): boolean => {
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
};

/** Parse Server Configuration from CLI argv and env vars, rejecting unknown flags (D1, D2, D23, D32). */
export const parseServerConfiguration = (
	argv: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
): Result<ServerConfiguration, string> => {
	let transportArg: string | undefined;
	let portArg: string | undefined;
	let hostArg: string | undefined;
	let allowUnrestrictedFlag = false;

	for (const arg of argv) {
		if (arg.startsWith("--transport=")) {
			transportArg = arg.slice("--transport=".length);
		} else if (arg.startsWith("--port=")) {
			portArg = arg.slice("--port=".length);
		} else if (arg.startsWith("--host=")) {
			hostArg = arg.slice("--host=".length);
		} else if (arg === HTTP_UNRESTRICTED_CLI_FLAG) {
			allowUnrestrictedFlag = true;
		} else {
			return err(
				`Unknown CLI argument "${arg}". Supported flags: ${SUPPORTED_FLAGS}`,
			);
		}
	}

	const transport =
		transportArg !== undefined ? transportArg : env.MCP_TRANSPORT || "stdio";
	if (transport !== "stdio" && transport !== "http") {
		return err(
			`Unknown transport "${transport}". Supported values: stdio, http`,
		);
	}

	const rawPort = portArg !== undefined ? portArg : env.MCP_PORT || "3000";
	if (!/^\d+$/.test(rawPort)) {
		return err(
			`Invalid port "${rawPort}". Must be an integer between 1 and 65535.`,
		);
	}
	const port = Number.parseInt(rawPort, 10);
	if (port < 1 || port > 65535) {
		return err(
			`Invalid port "${rawPort}". Must be an integer between 1 and 65535.`,
		);
	}

	const host = (
		hostArg !== undefined ? hostArg : env.MCP_HOST || "127.0.0.1"
	).trim();
	if (!host) {
		return err("Invalid host: must not be empty.");
	}

	const allowUnrestrictedPaths =
		allowUnrestrictedFlag ||
		env[HTTP_UNRESTRICTED_ENV_VAR]?.trim().toLowerCase() === "true";

	return ok({
		transport,
		port,
		host,
		allowedHosts: parseCsvList(env.MCP_ALLOWED_HOSTS),
		allowedOrigins: parseCsvList(env.MCP_ALLOWED_ORIGINS),
		allowUnrestrictedPaths,
	});
};

/** Evaluate Streamable HTTP path routing, Host/Origin guards, and POST-only enforcement (D33, I5). */
export const checkHttpRequest = (
	req: IncomingHttpRequest,
	config: HttpGuardConfig,
): HttpRequestGuardResult => {
	if (req.pathname !== "/" && req.pathname !== "/mcp") {
		return { allowed: false, status: 404, message: "Not found" };
	}

	if (!isHostHeaderAllowed(req.hostHeader, config.host, config.allowedHosts)) {
		return {
			allowed: false,
			status: 403,
			message: "Forbidden: invalid Host header",
		};
	}

	if (
		!isOriginHeaderAllowed(req.originHeader, config.host, config.allowedOrigins)
	) {
		return {
			allowed: false,
			status: 403,
			message: "Forbidden: invalid Origin header",
		};
	}

	if (req.method !== "POST") {
		return {
			allowed: false,
			status: 405,
			message: "Method not allowed",
			allowHeader: "POST",
		};
	}

	return { allowed: true };
};
