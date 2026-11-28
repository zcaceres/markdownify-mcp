import type { Tool } from "@modelcontextprotocol/server";
import type {
	ServerCacheHints,
	ServerMetadata,
	StructuredToolResult,
	ToolContractAudit,
	ToolContractIssue,
	Toolset,
} from "./nouns.js";

const GEMINI_TOOL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_.:-]*$/;
const GEMINI_PARAM_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_TOOL_NAME_LEN = 63;
const MAX_PARAM_NAME_LEN = 64;
const FORBIDDEN_GEMINI_SCHEMA_KEYS = new Set([
	"additionalProperties",
	"$schema",
	"$ref",
	"$defs",
]);

export const CLASSIC_OPEN_WORLD_BY_TOOL: Readonly<Record<string, boolean>> = {
	"youtube-to-markdown": true,
	"bing-search-to-markdown": true,
	"webpage-to-markdown": true,
	"git-repo-to-markdown": true,
	"pdf-to-markdown": false,
	"image-to-markdown": false,
	"audio-to-markdown": false,
	"docx-to-markdown": false,
	"xlsx-to-markdown": false,
	"pptx-to-markdown": false,
	"get-markdown-file": false,
};

export const COMPACT_OPEN_WORLD_BY_TOOL: Readonly<Record<string, boolean>> = {
	"convert-web-url": true,
	"convert-git-repo": true,
	"convert-local-file": false,
	"get-markdown-file": false,
};

export const expectedOpenWorldByToolset = (
	toolset: Toolset,
): Readonly<Record<string, boolean>> =>
	toolset === "compact"
		? COMPACT_OPEN_WORLD_BY_TOOL
		: CLASSIC_OPEN_WORLD_BY_TOOL;

export const serverMetadata = (): ServerMetadata => ({
	name: "mcp-markdownify-server",
	title: "Markdownify MCP",
	version: "1.2.0",
	description:
		"Single-operator, stateless MCP server for converting webpages, YouTube videos, Bing search pages, remote Git repositories, and local documents into Markdown.",
	websiteUrl: "https://github.com/zcaceres/markdownify-mcp",
});

export const serverInstructions = (toolset: Toolset = "classic"): string => {
	if (toolset === "compact") {
		return [
			"Markdownify MCP (compact toolset) converts web URLs, remote Git repositories, and local files into Markdown on demand without modifying files or state.",
			"Tool selection: use convert-web-url for public http(s) webpages, YouTube videos, Bing search pages, and hosted documents; use convert-git-repo for public Git repositories or GitHub owner/repo shorthand; use convert-local-file for local non-Markdown files (PDF, DOCX, XLSX, PPTX, image, audio); and use get-markdown-file to read existing local .md/.markdown files verbatim.",
			"Constraints: convert-local-file and get-markdown-file require absolute or ~/ paths and fail closed in HTTP mode unless MD_ALLOWED_PATHS (or the unrestricted opt-out) is configured; all remote URLs must be public http(s) addresses (private/loopback hosts are blocked); JS-rendered SPAs fail if raw HTML is returned; local images return metadata only without external vision models; slim Docker images only include PDF support.",
		].join("\n");
	}
	return [
		"Markdownify MCP converts web URLs, remote Git repositories, and local files into Markdown on demand without modifying files or state.",
		"Tool selection: use webpage-to-markdown for general http(s) webpages and hosted documents (PDF, DOCX, XLSX, PPTX, images, audio); use youtube-to-markdown for YouTube videos, bing-search-to-markdown for Bing search result pages, git-repo-to-markdown for public Git repositories (or GitHub owner/repo shorthand), the format-specific local file tools for local non-Markdown files, and get-markdown-file to read existing local .md/.markdown files verbatim.",
		"Constraints: local file tools and get-markdown-file require absolute or ~/ paths and fail closed in HTTP mode unless MD_ALLOWED_PATHS (or the unrestricted opt-out) is configured; all remote URLs must be public http(s) addresses (private/loopback hosts are blocked); JS-rendered SPAs fail if raw HTML is returned; image-to-markdown returns metadata only without external vision models; slim Docker images only include PDF support.",
	].join("\n");
};

export const serverCacheHints = (): ServerCacheHints => ({
	"tools/list": { ttlMs: 3_600_000, cacheScope: "public" },
	"server/discover": { ttlMs: 3_600_000, cacheScope: "public" },
});

const countSentences = (text: string): number =>
	text
		.trim()
		.split(/[.!?]+(?:\s|$)/)
		.map((part) => part.trim())
		.filter(Boolean).length;

const scanForbiddenSchemaKeys = (
	value: unknown,
	path: string,
	toolName: string,
	issues: ToolContractIssue[],
): void => {
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			scanForbiddenSchemaKeys(value[i], `${path}[${i}]`, toolName, issues);
		}
		return;
	}
	for (const [key, child] of Object.entries(value)) {
		const childPath = path ? `${path}.${key}` : key;
		if (FORBIDDEN_GEMINI_SCHEMA_KEYS.has(key)) {
			issues.push({
				tool: toolName,
				message: `inputSchema contains Gemini-incompatible keyword "${key}" at ${childPath}`,
			});
		}
		scanForbiddenSchemaKeys(child, childPath, toolName, issues);
	}
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Audit a Tool catalog against cross-provider Anthropic, Gemini, and OpenAI contracts (D47, D48, D52). */
export const auditToolCatalog = (
	tools: readonly Tool[],
	expectedOpenWorldByName: Readonly<Record<string, boolean>>,
): ToolContractAudit => {
	const issues: ToolContractIssue[] = [];

	for (const tool of tools) {
		const name = tool.name;

		// Name rules (Gemini / OpenAI / Anthropic)
		if (name.length === 0 || name.length > MAX_TOOL_NAME_LEN) {
			issues.push({
				tool: name,
				message: `tool name length ${name.length} must be between 1 and ${MAX_TOOL_NAME_LEN}`,
			});
		}
		if (!GEMINI_TOOL_NAME_RE.test(name)) {
			issues.push({
				tool: name,
				message: `tool name "${name}" does not match Gemini-safe pattern`,
			});
		}

		// Top-level title matching annotations.title (D47)
		const topTitle = tool.title?.trim() ?? "";
		const annTitle = tool.annotations?.title?.trim() ?? "";
		if (!topTitle) {
			issues.push({
				tool: name,
				message: "missing non-empty top-level title (D47)",
			});
		}
		if (!annTitle || topTitle !== annTitle) {
			issues.push({
				tool: name,
				message: `top-level title "${topTitle}" must match annotations.title "${annTitle}" (D47)`,
			});
		}

		// Complete explicit ToolAnnotations booleans (D47)
		const ann = tool.annotations;
		if (ann?.readOnlyHint !== true) {
			issues.push({
				tool: name,
				message: "annotations.readOnlyHint must be explicitly true (D47)",
			});
		}
		if (ann?.destructiveHint !== false) {
			issues.push({
				tool: name,
				message: "annotations.destructiveHint must be explicitly false (D47)",
			});
		}
		if (ann?.idempotentHint !== true) {
			issues.push({
				tool: name,
				message: "annotations.idempotentHint must be explicitly true (D47)",
			});
		}
		const expectedOpenWorld = expectedOpenWorldByName[name];
		if (typeof ann?.openWorldHint !== "boolean") {
			issues.push({
				tool: name,
				message: "annotations.openWorldHint must be an explicit boolean (D47)",
			});
		} else if (
			expectedOpenWorld !== undefined &&
			ann.openWorldHint !== expectedOpenWorld
		) {
			issues.push({
				tool: name,
				message: `annotations.openWorldHint is ${String(ann.openWorldHint)}, expected ${String(expectedOpenWorld)} (D47)`,
			});
		}

		// Multi-sentence tool description (D48)
		const desc = tool.description?.trim() ?? "";
		if (countSentences(desc) < 2) {
			issues.push({
				tool: name,
				message: "description must contain at least 2 sentences (D48)",
			});
		}

		// Gemini-safe wire inputSchema & parameter hygiene (D48, D52)
		scanForbiddenSchemaKeys(tool.inputSchema, "inputSchema", name, issues);
		const properties = tool.inputSchema.properties;
		if (isPlainObject(properties)) {
			for (const [paramName, rawProp] of Object.entries(properties)) {
				if (
					paramName.length > MAX_PARAM_NAME_LEN ||
					!GEMINI_PARAM_NAME_RE.test(paramName)
				) {
					issues.push({
						tool: name,
						message: `parameter "${paramName}" does not match Gemini-safe [a-zA-Z_][a-zA-Z0-9_]* rule (D52)`,
					});
				}
				if (!isPlainObject(rawProp)) {
					issues.push({
						tool: name,
						message: `parameter "${paramName}" schema must be an object`,
					});
					continue;
				}
				if (typeof rawProp.type !== "string" || !rawProp.type.trim()) {
					issues.push({
						tool: name,
						message: `parameter "${paramName}" is missing an explicit type`,
					});
				}
				if (
					typeof rawProp.description !== "string" ||
					!rawProp.description.trim()
				) {
					issues.push({
						tool: name,
						message: `parameter "${paramName}" is missing a non-empty description (D48)`,
					});
				}
			}
		}

		// Structured outputSchema contract (D49, D52)
		const outputSchema = tool.outputSchema;
		if (!isPlainObject(outputSchema)) {
			issues.push({
				tool: name,
				message: "missing outputSchema object (D49)",
			});
		} else {
			scanForbiddenSchemaKeys(outputSchema, "outputSchema", name, issues);
			if (outputSchema.type !== "object") {
				issues.push({
					tool: name,
					message: 'outputSchema.type must be "object" (D49)',
				});
			}
			const outProps = isPlainObject(outputSchema.properties)
				? outputSchema.properties
				: undefined;
			const outReq = Array.isArray(outputSchema.required)
				? outputSchema.required
				: [];
			const markdownProp = outProps?.markdown;
			if (!isPlainObject(markdownProp) || markdownProp.type !== "string") {
				issues.push({
					tool: name,
					message:
						'outputSchema.properties.markdown must declare type "string" (D49)',
				});
			}
			if (!outReq.includes("markdown")) {
				issues.push({
					tool: name,
					message: 'outputSchema.required must include "markdown" (D49)',
				});
			}
			if (name === "get-markdown-file") {
				const pathProp = outProps?.path;
				if (!isPlainObject(pathProp) || pathProp.type !== "string") {
					issues.push({
						tool: name,
						message:
							'outputSchema.properties.path must declare type "string" for get-markdown-file (D49)',
					});
				}
				if (!outReq.includes("path")) {
					issues.push({
						tool: name,
						message:
							'outputSchema.required must include "path" for get-markdown-file (D49)',
					});
				}
			}
		}
	}

	return {
		ok: issues.length === 0,
		toolCount: tools.length,
		issues,
	};
};

/** Format a successful MarkdownResult with backwards-compatible content text and typed structuredContent without truncation (D49, D50). */
export const formatStructuredToolResult = (result: {
	readonly text: string;
	readonly path?: string;
}): StructuredToolResult => {
	if (result.path !== undefined) {
		return {
			content: [
				{ type: "text", text: `Output file: ${result.path}` },
				{ type: "text", text: result.text },
			],
			structuredContent: {
				path: result.path,
				markdown: result.text,
			},
			isError: false,
		};
	}

	return {
		content: [{ type: "text", text: result.text }],
		structuredContent: {
			markdown: result.text,
		},
		isError: false,
	};
};
