import {
	type ExpandHome,
	resolveFileAccessPolicy,
} from "../shared/local-access.js";
import type { ServerConfiguration, StartupDiagnostic } from "./nouns.js";
import { isLoopbackHost } from "./verbs.js";

/** Derived HTTP Startup Diagnostics for File Access Policy and non-loopback binding (D9, D23, D24, D33, D35, D36). */
export const startupDiagnostics = (
	config: ServerConfiguration,
	env: Readonly<Record<string, string | undefined>>,
	expandHome: ExpandHome,
	delimiter?: string,
): readonly StartupDiagnostic[] => {
	if (config.transport !== "http") {
		return [];
	}

	const diagnostics: StartupDiagnostic[] = [];
	const filePolicy = resolveFileAccessPolicy(env, expandHome, {
		transport: "http",
		allowUnrestrictedPaths: config.allowUnrestrictedPaths,
		delimiter,
	});
	if (!filePolicy.ok) {
		diagnostics.push({
			level: "warning",
			message: `Warning: ${filePolicy.error}`,
		});
	} else if (filePolicy.value.kind === "disabled") {
		diagnostics.push({
			level: "notice",
			message:
				"Notice: starting HTTP transport with MD_ALLOWED_PATHS unset; local file tools are disabled by default.",
		});
	} else if (filePolicy.value.kind === "unrestricted") {
		diagnostics.push({
			level: "warning",
			message:
				"Warning: starting HTTP transport with unrestricted local file access opted in; file-input tools can read any file accessible to this process.",
		});
	}

	if (!isLoopbackHost(config.host)) {
		diagnostics.push({
			level: "warning",
			message: `Warning: binding unauthenticated HTTP transport to non-loopback host "${config.host}". Place behind an authenticating reverse proxy and set MCP_ALLOWED_HOSTS / MCP_ALLOWED_ORIGINS.`,
		});
	}

	return diagnostics;
};
