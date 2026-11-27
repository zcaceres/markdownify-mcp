import { describe, expect, test } from "bun:test";
import type { Tool } from "@modelcontextprotocol/server";
import * as tools from "../tools.js";
import {
	auditToolCatalog,
	CLASSIC_OPEN_WORLD_BY_TOOL,
	COMPACT_OPEN_WORLD_BY_TOOL,
	serverCacheHints,
	serverInstructions,
	serverMetadata,
} from "./queries.js";
import { formatStructuredToolResult, validateToolArguments } from "./verbs.js";

describe("mcp-contract metadata, instructions, and cacheHints (MC-1, MC-2, D48)", () => {
	test("serverMetadata returns enriched Implementation fields", () => {
		const meta = serverMetadata();
		expect(meta.name).toBe("mcp-markdownify-server");
		expect(meta.title).toBe("Markdownify MCP");
		expect(meta.version).toBe("1.2.0");
		expect(meta.description.length).toBeGreaterThan(20);
		expect(meta.websiteUrl).toBe("https://github.com/zcaceres/markdownify-mcp");
	});

	test("serverInstructions provides concise routing, path, HTTP, and capability guidance", () => {
		const instructions = serverInstructions();
		expect(instructions).toContain("webpage-to-markdown");
		expect(instructions).toContain("git-repo-to-markdown");
		expect(instructions).toContain("get-markdown-file");
		expect(instructions).toContain("MD_ALLOWED_PATHS");
		expect(instructions).toContain("image-to-markdown");
	});

	test("serverCacheHints advertises 1-hour public caching for tools/list and server/discover", () => {
		expect(serverCacheHints()).toEqual({
			"tools/list": { ttlMs: 3_600_000, cacheScope: "public" },
			"server/discover": { ttlMs: 3_600_000, cacheScope: "public" },
		});
	});
});

describe("auditToolCatalog cross-provider contract checks (MC-3, MC-4, D47, D48, D52)", () => {
	test("all 11 exported classic tools pass auditToolCatalog with 0 issues", () => {
		const report = auditToolCatalog(
			tools.CLASSIC_TOOLS,
			CLASSIC_OPEN_WORLD_BY_TOOL,
		);
		expect(report.toolCount).toBe(11);
		expect(report.issues).toEqual([]);
		expect(report.ok).toBe(true);
	});

	test("all 4 exported compact tools pass auditToolCatalog with 0 issues and compact instructions name only compact tools (MC-7, D51)", () => {
		const report = auditToolCatalog(
			tools.COMPACT_TOOLS,
			COMPACT_OPEN_WORLD_BY_TOOL,
		);
		expect(report.toolCount).toBe(4);
		expect(report.issues).toEqual([]);
		expect(report.ok).toBe(true);

		const compactInstructions = serverInstructions("compact");
		expect(compactInstructions).toContain("convert-web-url");
		expect(compactInstructions).toContain("convert-local-file");
		expect(compactInstructions).toContain("convert-git-repo");
		expect(compactInstructions).toContain("get-markdown-file");
		expect(compactInstructions).not.toContain("pdf-to-markdown");
	});

	test("flags missing destructiveHint, mismatched title, single-sentence description, bad param name, and Gemini-incompatible keywords", () => {
		const badTool: Tool = {
			name: "bad-tool",
			title: "Wrong Title",
			description: "Only one sentence.",
			inputSchema: {
				type: "object",
				additionalProperties: false,
				$schema: "https://json-schema.org/draft/2020-12/schema",
				properties: {
					"bad-param": {
						type: "string",
						description: "",
					},
				},
				required: ["bad-param"],
			},
			annotations: {
				title: "Different Title",
				readOnlyHint: true,
			},
		};

		const report = auditToolCatalog([badTool], { "bad-tool": false });
		expect(report.ok).toBe(false);
		const messages = report.issues.map((i) => i.message);
		expect(messages.some((m) => m.includes("title"))).toBe(true);
		expect(messages.some((m) => m.includes("destructiveHint"))).toBe(true);
		expect(messages.some((m) => m.includes("idempotentHint"))).toBe(true);
		expect(messages.some((m) => m.includes("openWorldHint"))).toBe(true);
		expect(messages.some((m) => m.includes("2 sentences"))).toBe(true);
		expect(messages.some((m) => m.includes("additionalProperties"))).toBe(true);
		expect(messages.some((m) => m.includes("$schema"))).toBe(true);
		expect(messages.some((m) => m.includes("bad-param"))).toBe(true);
		expect(messages.some((m) => m.includes("outputSchema"))).toBe(true);
	});
});

describe("formatStructuredToolResult (MC-6, D49, D50)", () => {
	test("formats conversion results with text content and { markdown } structuredContent without truncation", () => {
		const largeMarkdown = `# Large\n${"a".repeat(150_000)}`;
		const formatted = formatStructuredToolResult({ text: largeMarkdown });
		expect(formatted.isError).toBe(false);
		expect(formatted.content).toEqual([{ type: "text", text: largeMarkdown }]);
		expect(formatted.structuredContent).toEqual({ markdown: largeMarkdown });
		expect(formatted.structuredContent.markdown.length).toBe(
			largeMarkdown.length,
		);
	});

	test("formats get-markdown-file results with Output file block plus { path, markdown } structuredContent", () => {
		const formatted = formatStructuredToolResult({
			path: "/data/notes.md",
			text: "# Notes\n",
		});
		expect(formatted.isError).toBe(false);
		expect(formatted.content).toEqual([
			{ type: "text", text: "Output file: /data/notes.md" },
			{ type: "text", text: "# Notes\n" },
		]);
		expect(formatted.structuredContent).toEqual({
			path: "/data/notes.md",
			markdown: "# Notes\n",
		});
	});
});

describe("validateToolArguments per-tool strict validation (MC-5, D8, D52)", () => {
	test("accepts valid arguments for web, local file, git repo, and markdown tools", () => {
		expect(
			validateToolArguments("webpage-to-markdown", {
				url: "https://example.com",
			}),
		).toEqual({ ok: true, value: { url: "https://example.com" } });

		expect(
			validateToolArguments("pdf-to-markdown", {
				filepath: "/data/report.pdf",
			}),
		).toEqual({ ok: true, value: { filepath: "/data/report.pdf" } });

		expect(
			validateToolArguments("git-repo-to-markdown", {
				url: "octocat/Hello-World",
				branch: "main",
				compress: true,
			}),
		).toEqual({
			ok: true,
			value: { url: "octocat/Hello-World", branch: "main", compress: true },
		});

		expect(validateToolArguments("pdf-to-markdown", undefined)).toEqual({
			ok: true,
			value: {},
		});
	});

	test("rejects unknown keys, cross-tool keys, wrong types, non-objects, and unknown tools", () => {
		expect(
			validateToolArguments("pdf-to-markdown", { file_path: "/a.pdf" }),
		).toEqual({
			ok: false,
			error: 'Invalid arguments: Unrecognized key: "file_path"',
		});

		expect(
			validateToolArguments("pdf-to-markdown", {
				url: "https://example.com",
			}),
		).toEqual({
			ok: false,
			error: 'Invalid arguments: Unrecognized key: "url"',
		});

		expect(
			validateToolArguments("webpage-to-markdown", {
				url: "https://example.com",
				branch: "main",
			}),
		).toEqual({
			ok: false,
			error: 'Invalid arguments: Unrecognized key: "branch"',
		});

		const wrongType = validateToolArguments("git-repo-to-markdown", {
			url: "octocat/Hello-World",
			compress: "yes",
		});
		expect(wrongType.ok).toBe(false);
		if (!wrongType.ok) {
			expect(wrongType.error).toContain("Invalid arguments: compress:");
			expect(wrongType.error).not.toContain("\n");
		}

		expect(validateToolArguments("pdf-to-markdown", "not-an-object")).toEqual({
			ok: false,
			error: "Invalid arguments: expected an object",
		});

		expect(validateToolArguments("does-not-exist", {})).toEqual({
			ok: false,
			error: "Tool not found",
		});

		expect(
			validateToolArguments(
				"convert-web-url",
				{ url: "https://example.com" },
				"compact",
			),
		).toEqual({ ok: true, value: { url: "https://example.com" } });

		expect(
			validateToolArguments(
				"pdf-to-markdown",
				{ filepath: "/data/report.pdf" },
				"compact",
			),
		).toEqual({ ok: false, error: "Tool not found" });

		expect(
			validateToolArguments(
				"convert-local-file",
				{ filepath: "/data/report.pdf" },
				"classic",
			),
		).toEqual({ ok: false, error: "Tool not found" });
	});
});
