import {
	auditToolCatalog,
	CLASSIC_OPEN_WORLD_BY_TOOL,
	serverCacheHints,
	serverInstructions,
	serverMetadata,
} from "../../src/mcp-contract/queries.ts";
import { validateToolArguments } from "../../src/mcp-contract/verbs.ts";
import { err, ok } from "../../src/shared/types.ts";
import * as tools from "../../src/tools.ts";
import type { Command } from "../command.ts";

export const mcp: Command = {
	kind: "domain",
	usage: "mcp info | mcp audit | mcp validate-args <tool> <json>",
	summary:
		"inspect MCP server metadata/instructions/cacheHints, audit tool contracts, and validate strict per-tool arguments",
	run: async ([sub, ...rest]) => {
		if (sub === "info") {
			const meta = serverMetadata();
			const hints = serverCacheHints();
			const instructions = serverInstructions().trim();
			const listHint = hints["tools/list"];
			const discoverHint = hints["server/discover"];
			return ok([
				`server: ${meta.name} (${meta.title}) v${meta.version}`,
				`website: ${meta.websiteUrl}`,
				`cache-hints: tools/list=${listHint.ttlMs}ms(${listHint.cacheScope}), server/discover=${discoverHint.ttlMs}ms(${discoverHint.cacheScope})`,
				`instructions: ${instructions.length > 0 ? "present" : "missing"}`,
			]);
		}

		if (sub === "audit") {
			const report = auditToolCatalog(
				Object.values(tools),
				CLASSIC_OPEN_WORLD_BY_TOOL,
			);
			if (!report.ok) {
				return err(
					report.issues
						.map((issue) => `${issue.tool}: ${issue.message}`)
						.join("; "),
				);
			}
			return ok([`ok: audited ${report.toolCount} tools (0 issues)`]);
		}

		if (sub === "validate-args") {
			const [toolName, ...jsonParts] = rest;
			const rawJson = jsonParts.join(" ").trim();
			if (!toolName || !rawJson) {
				return err(`usage: ${mcp.usage}`);
			}
			let parsedJson: unknown;
			try {
				parsedJson = JSON.parse(rawJson);
			} catch {
				return err("Invalid arguments: expected valid JSON");
			}
			const validated = validateToolArguments(toolName, parsedJson);
			if (!validated.ok) return err(validated.error);
			return ok([`ok: ${toolName} ${JSON.stringify(validated.value)}`]);
		}

		return err(`usage: ${mcp.usage}`);
	},
};
