import { describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import {
	auditToolCatalog,
	CLASSIC_OPEN_WORLD_BY_TOOL,
	COMPACT_OPEN_WORLD_BY_TOOL,
} from "./mcp-contract/queries.js";
import { createServer } from "./server.js";

describe("MCP server boundary (WU-1, D8)", () => {
	async function withClient<T>(
		run: (client: Client) => Promise<T>,
		serverOptions?: Parameters<typeof createServer>[0],
	): Promise<T> {
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		const server = createServer(serverOptions);
		const client = new Client({ name: "test-client", version: "0.0.1" });
		await server.connect(serverTransport);
		await client.connect(clientTransport);
		try {
			return await run(client);
		} finally {
			await client.close();
			await server.close();
		}
	}

	function firstText(res: Awaited<ReturnType<Client["callTool"]>>): string {
		const content = res.content as Array<{ type: string; text?: string }>;
		return content[0]?.text ?? "";
	}

	test("exposes all 11 stable tools on tools/list and returns concise isError: true for unknown tools (SC-3, D3, D8)", async () => {
		await withClient(async (client) => {
			const listed = await client.listTools();
			expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
				"audio-to-markdown",
				"bing-search-to-markdown",
				"docx-to-markdown",
				"get-markdown-file",
				"git-repo-to-markdown",
				"image-to-markdown",
				"pdf-to-markdown",
				"pptx-to-markdown",
				"webpage-to-markdown",
				"xlsx-to-markdown",
				"youtube-to-markdown",
			]);

			const unknown = await client.callTool({
				name: "does-not-exist",
				arguments: {},
			});
			expect(unknown.isError).toBe(true);
			const text = firstText(unknown);
			expect(text).toBe("Error: Tool not found");
			expect(text).not.toContain("\n");
		});
	});

	test("returns concise single-line isError: true when tool arguments fail schema validation or include unknown keys (MC-5, D8, D52)", async () => {
		await withClient(async (client) => {
			const res = await client.callTool({
				name: "webpage-to-markdown",
				arguments: { url: 12345 as unknown as string },
			});
			expect(res.isError).toBe(true);
			const text = firstText(res);
			expect(text).toContain("Error: Invalid arguments: url:");
			expect(text).not.toContain("\n");

			const typo = await client.callTool({
				name: "pdf-to-markdown",
				arguments: { file_path: "/data/report.pdf" },
			});
			expect(typo.isError).toBe(true);
			expect(firstText(typo)).toBe(
				'Error: Invalid arguments: Unrecognized key: "file_path"',
			);

			const crossTool = await client.callTool({
				name: "webpage-to-markdown",
				arguments: { url: "https://example.com", branch: "main" },
			});
			expect(crossTool.isError).toBe(true);
			expect(firstText(crossTool)).toBe(
				'Error: Invalid arguments: Unrecognized key: "branch"',
			);
		});
	});

	test("exposes enriched server info, instructions, complete ToolAnnotations, titles, descriptions, and Gemini-safe schemas (MC-1..MC-4, D47, D48, D52)", async () => {
		await withClient(async (client) => {
			const serverInfo = client.getServerVersion();
			expect(serverInfo?.name).toBe("mcp-markdownify-server");
			expect(serverInfo?.title).toBe("Markdownify MCP");
			expect(serverInfo?.description?.length ?? 0).toBeGreaterThan(20);
			expect(serverInfo?.websiteUrl).toBe(
				"https://github.com/zcaceres/markdownify-mcp",
			);

			const instructions = client.getInstructions();
			expect(instructions).toBeDefined();
			expect(instructions).toContain("webpage-to-markdown");
			expect(instructions).toContain("MD_ALLOWED_PATHS");

			const listed = await client.listTools();
			const audit = auditToolCatalog(listed.tools, CLASSIC_OPEN_WORLD_BY_TOOL);
			expect(audit.issues).toEqual([]);
			expect(audit.ok).toBe(true);
		});
	});

	test("returns typed structuredContent alongside content text on get-markdown-file and omits structuredContent on errors (MC-6, D8, D49, D50)", async () => {
		const sampleMd = resolve(import.meta.dir, "sample-data", "test.md");
		const expectedRealPath = realpathSync(sampleMd);
		await withClient(async (client) => {
			const res = await client.callTool({
				name: "get-markdown-file",
				arguments: { filepath: sampleMd },
			});
			expect(res.isError).toBe(false);
			const content = res.content as Array<{ type: string; text?: string }>;
			expect(content[0]?.text).toBe(`Output file: ${expectedRealPath}`);
			expect(content[1]?.text).toContain("# Test Markdown Sample");
			expect(res.structuredContent).toEqual({
				path: expectedRealPath,
				markdown: content[1]?.text,
			});

			const errRes = await client.callTool({
				name: "get-markdown-file",
				arguments: { filepath: "/data/not-markdown.txt" },
			});
			expect(errRes.isError).toBe(true);
			expect(errRes.structuredContent).toBeUndefined();
		});
	});

	test("returns structured isError: true when tool arguments are omitted", async () => {
		await withClient(async (client) => {
			const res = await client.callTool({
				name: "webpage-to-markdown",
			});
			expect(res.isError).toBe(true);
			expect(firstText(res)).toBe("Error: URL is required for this tool");
		});
	});

	test("routes web tool calls through validateWebRequest for whitespace and malformed URLs (WU-1, D8)", async () => {
		await withClient(async (client) => {
			const blank = await client.callTool({
				name: "webpage-to-markdown",
				arguments: { url: "   " },
			});
			expect(blank.isError).toBe(true);
			expect(firstText(blank)).toBe("Error: URL is required for this tool");

			const bad = await client.callTool({
				name: "webpage-to-markdown",
				arguments: { url: "not-a-url" },
			});
			expect(bad.isError).toBe(true);
			expect(firstText(bad)).toBe('Error: Invalid URL "not-a-url"');
		});
	});

	test("routes local file tools through validateLocalFileRequest for blank and relative paths (LF-1, LF-2, D18)", async () => {
		await withClient(async (client) => {
			const blank = await client.callTool({
				name: "pdf-to-markdown",
				arguments: { filepath: "   " },
			});
			expect(blank.isError).toBe(true);
			expect(firstText(blank)).toBe(
				"Error: File path is required for this tool",
			);

			const rel = await client.callTool({
				name: "pdf-to-markdown",
				arguments: { filepath: "report.pdf" },
			});
			expect(rel.isError).toBe(true);
			expect(firstText(rel)).toBe(
				'Error: File path "report.pdf" must be an absolute path or start with ~/',
			);

			const relMd = await client.callTool({
				name: "get-markdown-file",
				arguments: { filepath: "README.md" },
			});
			expect(relMd.isError).toBe(true);
			expect(firstText(relMd)).toBe(
				'Error: File path "README.md" must be an absolute path or start with ~/',
			);

			const nonMd = await client.callTool({
				name: "get-markdown-file",
				arguments: { filepath: "/data/notes.txt" },
			});
			expect(nonMd.isError).toBe(true);
			expect(firstText(nonMd)).toBe(
				"Error: Required file is not a Markdown file.",
			);
		});
	});

	test("routes git-repo-to-markdown through validateGitRepoRequest and stays enabled in HTTP mode (GR-1..GR-3, GR-8, D9, D29)", async () => {
		const savedAllowed = process.env.MD_ALLOWED_PATHS;
		const savedOptOut = process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
		delete process.env.MD_ALLOWED_PATHS;
		delete process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
		try {
			await withClient(
				async (client) => {
					const creds = await client.callTool({
						name: "git-repo-to-markdown",
						arguments: { url: "https://token@github.com/owner/repo" },
					});
					expect(creds.isError).toBe(true);
					expect(firstText(creds)).toBe(
						"Error: Repository URLs with embedded credentials are not allowed.",
					);

					const badBranch = await client.callTool({
						name: "git-repo-to-markdown",
						arguments: {
							url: "octocat/Hello-World",
							branch: "--upload-pack=id",
						},
					});
					expect(badBranch.isError).toBe(true);
					expect(firstText(badBranch)).toContain("Invalid branch name");
					expect(firstText(badBranch)).not.toContain(
						"Local file tools are disabled",
					);
				},
				{ transport: "http" },
			);
		} finally {
			if (savedAllowed === undefined) delete process.env.MD_ALLOWED_PATHS;
			else process.env.MD_ALLOWED_PATHS = savedAllowed;
			if (savedOptOut === undefined)
				delete process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
			else process.env.MCP_ALLOW_UNRESTRICTED_PATHS = savedOptOut;
		}
	});

	test("enforces HTTP fail-closed policy, D23 opt-out, and D24 empty MD_ALLOWED_PATHS across local file tools including get-markdown-file (LF-3, D9, D23, D24)", async () => {
		const savedAllowed = process.env.MD_ALLOWED_PATHS;
		const savedOptOut = process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
		delete process.env.MD_ALLOWED_PATHS;
		delete process.env.MCP_ALLOW_UNRESTRICTED_PATHS;

		try {
			await withClient(
				async (client) => {
					const pdfRes = await client.callTool({
						name: "pdf-to-markdown",
						arguments: { filepath: "/data/report.pdf" },
					});
					expect(pdfRes.isError).toBe(true);
					expect(firstText(pdfRes)).toContain(
						"Local file tools are disabled in HTTP mode",
					);

					const getRes = await client.callTool({
						name: "get-markdown-file",
						arguments: { filepath: "/data/notes.md" },
					});
					expect(getRes.isError).toBe(true);
					expect(firstText(getRes)).toContain(
						"Local file tools are disabled in HTTP mode",
					);
				},
				{ transport: "http" },
			);

			// D23 opt-out via env var allows proceeding past the HTTP policy gate
			process.env.MCP_ALLOW_UNRESTRICTED_PATHS = "true";
			await withClient(
				async (client) => {
					const res = await client.callTool({
						name: "pdf-to-markdown",
						arguments: { filepath: "/nonexistent/d23-opt-out-check.pdf" },
					});
					expect(res.isError).toBe(true);
					expect(firstText(res)).toContain("File does not exist:");
				},
				{ transport: "http" },
			);
			delete process.env.MCP_ALLOW_UNRESTRICTED_PATHS;

			// D23 opt-out via CLI option allows proceeding past the HTTP policy gate
			await withClient(
				async (client) => {
					const res = await client.callTool({
						name: "pdf-to-markdown",
						arguments: { filepath: "/nonexistent/d23-flag-check.pdf" },
					});
					expect(res.isError).toBe(true);
					expect(firstText(res)).toContain("File does not exist:");
				},
				{ transport: "http", allowUnrestrictedPaths: true },
			);

			// D24: explicitly set empty MD_ALLOWED_PATHS fails closed even in stdio mode
			process.env.MD_ALLOWED_PATHS = "   ";
			await withClient(async (client) => {
				const res = await client.callTool({
					name: "pdf-to-markdown",
					arguments: { filepath: "/data/report.pdf" },
				});
				expect(res.isError).toBe(true);
				expect(firstText(res)).toContain(
					"MD_ALLOWED_PATHS is set but contains no valid directories",
				);
			});
		} finally {
			if (savedAllowed === undefined) delete process.env.MD_ALLOWED_PATHS;
			else process.env.MD_ALLOWED_PATHS = savedAllowed;
			if (savedOptOut === undefined)
				delete process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
			else process.env.MCP_ALLOW_UNRESTRICTED_PATHS = savedOptOut;
		}
	});

	test("compact Toolset exposes 4 capability tools, enforces strict Toolset membership, HTTP D9 gating, and structured outputs (MC-7, D9, D47-D52)", async () => {
		const savedAllowed = process.env.MD_ALLOWED_PATHS;
		const savedOptOut = process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
		delete process.env.MD_ALLOWED_PATHS;
		delete process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
		const sampleMd = resolve(import.meta.dir, "sample-data", "test.md");
		const expectedRealPath = realpathSync(sampleMd);

		try {
			await withClient(
				async (client) => {
					const listed = await client.listTools();
					expect(listed.tools.map((t) => t.name).sort()).toEqual([
						"convert-git-repo",
						"convert-local-file",
						"convert-web-url",
						"get-markdown-file",
					]);
					const audit = auditToolCatalog(
						listed.tools,
						COMPACT_OPEN_WORLD_BY_TOOL,
					);
					expect(audit.issues).toEqual([]);
					expect(audit.ok).toBe(true);
					expect(client.getInstructions()).toContain("convert-web-url");

					const classicRejected = await client.callTool({
						name: "pdf-to-markdown",
						arguments: { filepath: "/data/report.pdf" },
					});
					expect(classicRejected.isError).toBe(true);
					expect(firstText(classicRejected)).toBe("Error: Tool not found");

					const mdRes = await client.callTool({
						name: "get-markdown-file",
						arguments: { filepath: sampleMd },
					});
					expect(mdRes.isError).toBe(false);
					expect(mdRes.structuredContent).toEqual({
						path: expectedRealPath,
						markdown: expect.stringContaining("# Test Markdown Sample"),
					});
				},
				{ toolset: "compact" },
			);

			await withClient(
				async (client) => {
					const localBlocked = await client.callTool({
						name: "convert-local-file",
						arguments: { filepath: "/data/report.pdf" },
					});
					expect(localBlocked.isError).toBe(true);
					expect(firstText(localBlocked)).toContain(
						"Local file tools are disabled in HTTP mode",
					);

					const webBadUrl = await client.callTool({
						name: "convert-web-url",
						arguments: { url: "not-a-url" },
					});
					expect(webBadUrl.isError).toBe(true);
					expect(firstText(webBadUrl)).toBe('Error: Invalid URL "not-a-url"');

					const gitBadBranch = await client.callTool({
						name: "convert-git-repo",
						arguments: {
							url: "octocat/Hello-World",
							branch: "--upload-pack=id",
						},
					});
					expect(gitBadBranch.isError).toBe(true);
					expect(firstText(gitBadBranch)).toContain("Invalid branch name");
				},
				{ transport: "http", toolset: "compact" },
			);
		} finally {
			if (savedAllowed === undefined) delete process.env.MD_ALLOWED_PATHS;
			else process.env.MD_ALLOWED_PATHS = savedAllowed;
			if (savedOptOut === undefined)
				delete process.env.MCP_ALLOW_UNRESTRICTED_PATHS;
			else process.env.MCP_ALLOW_UNRESTRICTED_PATHS = savedOptOut;
		}
	});
});
