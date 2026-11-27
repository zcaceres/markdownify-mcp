import { startupDiagnostics } from "../../src/server-config/queries.ts";
import {
	checkHttpRequest,
	parseServerConfiguration,
} from "../../src/server-config/verbs.ts";
import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

export const serve: Command = {
	kind: "domain",
	usage:
		"serve config [flags...] | serve check-http <method> <path> [host=<h>] [origin=<o>] | serve diagnostics [flags...]",
	summary:
		"parse Server Configuration, check HTTP Host/Origin/routing guards, and inspect Startup Diagnostics",
	run: async ([sub, ...rest], world) => {
		if (sub === "config") {
			const parsed = parseServerConfiguration(rest, world.env);
			if (!parsed.ok) return err(parsed.error);
			const cfg = parsed.value;
			return ok([
				`transport: ${cfg.transport}`,
				`host: ${cfg.host}`,
				`port: ${cfg.port}`,
				`allowed-hosts: ${cfg.allowedHosts.length > 0 ? cfg.allowedHosts.join(", ") : "(default)"}`,
				`allowed-origins: ${cfg.allowedOrigins.length > 0 ? cfg.allowedOrigins.join(", ") : "(default)"}`,
				`allow-unrestricted-paths: ${cfg.allowUnrestrictedPaths}`,
				`toolset: ${cfg.toolset}`,
			]);
		}

		if (sub === "check-http") {
			const [method, pathname, ...headerArgs] = rest;
			if (!method || !pathname) return err(`usage: ${serve.usage}`);
			let hostHeader: string | undefined;
			let originHeader: string | undefined;
			for (const token of headerArgs) {
				if (token.startsWith("host=")) {
					hostHeader = token.slice("host=".length);
				} else if (token.startsWith("origin=")) {
					originHeader = token.slice("origin=".length);
				} else {
					return err(`usage: ${serve.usage}`);
				}
			}

			const parsed = parseServerConfiguration([], world.env);
			if (!parsed.ok) return err(parsed.error);
			const check = checkHttpRequest(
				{ method, pathname, hostHeader, originHeader },
				parsed.value,
			);
			if (check.allowed) {
				return ok(["http: allow"]);
			}
			const suffix = check.allowHeader ? ` (Allow: ${check.allowHeader})` : "";
			return ok([`http: ${check.status} ${check.message}${suffix}`]);
		}

		if (sub === "diagnostics") {
			const parsed = parseServerConfiguration(rest, world.env);
			if (!parsed.ok) return err(parsed.error);
			const delimiter = world.mode === "mock" ? ":" : undefined;
			const diagnostics = startupDiagnostics(
				parsed.value,
				world.env,
				world.filesystem.expandHome,
				delimiter,
			);
			if (diagnostics.length === 0) {
				return ok(["(none)"]);
			}
			return ok(diagnostics.map((d) => `${d.level}: ${d.message}`));
		}

		return err(`usage: ${serve.usage}`);
	},
};
