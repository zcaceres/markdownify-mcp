import type { Toolset } from "../../src/mcp-contract/nouns.ts";
import {
	expectedOpenWorldByToolset,
	formatStructuredToolResult,
	serverCacheHints,
	serverInstructions,
	serverMetadata,
	toolContractAudit,
} from "../../src/mcp-contract/queries.ts";
import { validateToolArguments } from "../../src/mcp-contract/verbs.ts";
import { err, ok } from "../../src/shared/types.ts";
import { toolsForToolset } from "../../src/tools.ts";
import type { Command } from "../command.ts";

const parseToolsetArg = (raw: string | undefined): Toolset | undefined => {
	if (raw === undefined || raw === "compact") return "compact";
	if (raw === "classic") return "classic";
	return undefined;
};

export const mcp: Command = {
	kind: "domain",
	usage:
		"mcp info [classic|compact] | mcp audit [classic|compact] | mcp validate-args <tool> <json> [toolset=classic|compact] | mcp format-result <text> [path=<p>]",
	summary:
		"inspect MCP server metadata/instructions/cacheHints, audit tool contracts, validate strict per-tool arguments, and format structured tool results",
	run: async ([sub, ...rest]) => {
		if (sub === "info") {
			const toolset = parseToolsetArg(rest[0]);
			if (!toolset || rest.length > 1) {
				return err(`usage: ${mcp.usage}`);
			}
			const meta = serverMetadata();
			const hints = serverCacheHints();
			const instructions = serverInstructions(toolset).trim();
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
			const toolset = parseToolsetArg(rest[0]);
			if (!toolset || rest.length > 1) {
				return err(`usage: ${mcp.usage}`);
			}
			const report = toolContractAudit(
				toolsForToolset(toolset),
				expectedOpenWorldByToolset(toolset),
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
			const [toolName, ...remaining] = rest;
			if (!toolName || remaining.length === 0) {
				return err(`usage: ${mcp.usage}`);
			}
			let toolset: Toolset = "compact";
			const last = remaining[remaining.length - 1];
			let jsonParts = remaining;
			if (last?.startsWith("toolset=")) {
				const parsedToolset = parseToolsetArg(last.slice("toolset=".length));
				if (!parsedToolset) {
					return err(
						`Unknown toolset "${last.slice("toolset=".length)}". Supported values: classic, compact`,
					);
				}
				toolset = parsedToolset;
				jsonParts = remaining.slice(0, -1);
			}
			const rawJson = jsonParts.join(" ").trim();
			if (!rawJson) {
				return err(`usage: ${mcp.usage}`);
			}
			let parsedJson: unknown;
			try {
				parsedJson = JSON.parse(rawJson);
			} catch {
				return err("Invalid arguments: expected valid JSON");
			}
			const validated = validateToolArguments(toolName, parsedJson, toolset);
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
