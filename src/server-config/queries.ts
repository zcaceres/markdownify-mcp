import {
	type ExpandHome,
	resolveFileAccessPolicy,
} from "../shared/local-access.js";
import type { ServerConfiguration, StartupNotice } from "./nouns.js";
import { isLoopbackHost } from "./verbs.js";

/** Derived HTTP startup notices for file-access policy and non-loopback binding (D9, D23, D24, D33). */
export const startupNotices = (
	config: ServerConfiguration,
	env: Readonly<Record<string, string | undefined>>,
	expandHome: ExpandHome,
	delimiter?: string,
): readonly StartupNotice[] => {
	if (config.transport !== "http") {
		return [];
	}

	const notices: StartupNotice[] = [];
	const filePolicy = resolveFileAccessPolicy(env, expandHome, {
		transport: "http",
		allowUnrestrictedPaths: config.allowUnrestrictedPaths,
		delimiter,
	});
	if (!filePolicy.ok) {
		notices.push({
			level: "warning",
			message: `Warning: ${filePolicy.error}`,
		});
	} else if (filePolicy.value.kind === "disabled") {
		notices.push({
			level: "notice",
			message:
				"Notice: starting HTTP transport with MD_ALLOWED_PATHS unset; local file tools are disabled by default.",
		});
	} else if (filePolicy.value.kind === "unrestricted") {
		notices.push({
			level: "warning",
			message:
				"Warning: starting HTTP transport with unrestricted local file access opted in; file-input tools can read any file accessible to this process.",
		});
	}

	if (!isLoopbackHost(config.host)) {
		notices.push({
			level: "warning",
			message: `Warning: binding unauthenticated HTTP transport to non-loopback host "${config.host}". Place behind an authenticating reverse proxy and set MCP_ALLOWED_HOSTS / MCP_ALLOWED_ORIGINS.`,
		});
	}

	return notices;
};
