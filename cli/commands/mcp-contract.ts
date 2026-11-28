import {
	auditToolCatalog,
	CLASSIC_OPEN_WORLD_BY_TOOL,
	serverCacheHints,
	serverInstructions,
	serverMetadata,
} from "../../src/mcp-contract/queries.ts";
import {
	formatStructuredToolResult,
	validateToolArguments,
} from "../../src/mcp-contract/verbs.ts";
import { err, ok } from "../../src/shared/types.ts";
import { CLASSIC_TOOLS } from "../../src/tools.ts";
import type { Command } from "../command.ts";

export const mcp: Command = {
	kind: "domain",
	usage:
		"mcp info | mcp audit | mcp validate-args <tool> <json> | mcp format-result <text> [path=<p>]",
	summary:
		"inspect MCP server metadata/instructions/cacheHints, audit tool contracts, validate strict per-tool arguments, and format structured tool results",
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
				CLASSIC_TOOLS,
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

		if (sub === "format-result") {
			const [text, pathArg, ...extra] = rest;
			if (text === undefined || extra.length > 0) {
				return err(`usage: ${mcp.usage}`);
			}
			let path: string | undefined;
			if (pathArg !== undefined) {
				if (!pathArg.startsWith("path=")) {
					return err(`usage: ${mcp.usage}`);
				}
				path = pathArg.slice("path=".length);
			}
			const formatted = formatStructuredToolResult({ text, path });
			return ok([
				`content-blocks: ${formatted.content.length}`,
				`structured: ${JSON.stringify(formatted.structuredContent)}`,
				`isError: ${formatted.isError}`,
			]);
		}

		return err(`usage: ${mcp.usage}`);
	},
};
