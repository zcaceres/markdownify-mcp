import { describe, expect, test } from "bun:test";
import { err, ok } from "../shared/types.js";
import { MarkdownFilePath } from "./nouns.js";
import type { MarkdownRetrievalPorts } from "./ports.js";
import { markdownFileResult } from "./queries.js";
import {
	isMarkdownExtension,
	retrieveMarkdownFile,
	validateMarkdownRetrievalRequest,
} from "./verbs.js";

describe("isMarkdownExtension & validateMarkdownRetrievalRequest (RM-1, RM-2, D8, D18, D25, D26)", () => {
	test("accepts .md and .markdown case-insensitively and rejects other extensions", () => {
		expect(isMarkdownExtension("/data/notes.md")).toBe(true);
		expect(isMarkdownExtension("/data/README.MD")).toBe(true);
		expect(isMarkdownExtension("/data/doc.markdown")).toBe(true);
		expect(isMarkdownExtension("/data/Guide.Markdown")).toBe(true);
		expect(isMarkdownExtension("/data/notes.txt")).toBe(false);
		expect(isMarkdownExtension("/data/report.pdf")).toBe(false);
		expect(isMarkdownExtension("/data/README")).toBe(false);
	});

	test("accepts POSIX, Windows, and tilde Markdown paths and rejects missing, blank, relative, or non-Markdown paths", () => {
		expect(validateMarkdownRetrievalRequest("/data/notes.md")).toEqual(
			ok({ filePath: MarkdownFilePath("/data/notes.md") }),
		);
		expect(validateMarkdownRetrievalRequest("~/docs/README.MD")).toEqual(
			ok({ filePath: MarkdownFilePath("~/docs/README.MD") }),
		);
		expect(
			validateMarkdownRetrievalRequest("C:\\Users\\a\\notes.Markdown"),
		).toEqual(
			ok({ filePath: MarkdownFilePath("C:\\Users\\a\\notes.Markdown") }),
		);

		expect(validateMarkdownRetrievalRequest(undefined)).toEqual(
			err("File path is required for this tool"),
		);
		expect(validateMarkdownRetrievalRequest("   ")).toEqual(
			err("File path is required for this tool"),
		);
		expect(validateMarkdownRetrievalRequest(123)).toEqual(
			err("File path is required for this tool"),
		);
		expect(validateMarkdownRetrievalRequest("README.md")).toEqual(
			err('File path "README.md" must be an absolute path or start with ~/'),
		);
		expect(validateMarkdownRetrievalRequest("./notes.md")).toEqual(
			err('File path "./notes.md" must be an absolute path or start with ~/'),
		);
		expect(validateMarkdownRetrievalRequest("/data/notes.txt")).toEqual(
			err("Required file is not a Markdown file."),
		);
	});
});

describe("markdownFileResult (RM-6, RM-7, D5, D27)", () => {
	test("preserves exact UTF-8 text verbatim including empty and whitespace-only content", () => {
		expect(markdownFileResult("/data/a.md", "# Title\n")).toEqual({
			path: "/data/a.md",
			text: "# Title\n",
		});
		expect(markdownFileResult("/data/empty.md", "")).toEqual({
			path: "/data/empty.md",
			text: "",
		});
		expect(markdownFileResult("/data/ws.md", "  \n\t ")).toEqual({
			path: "/data/ws.md",
			text: "  \n\t ",
		});
	});
});

describe("retrieveMarkdownFile (RM-3..RM-7, D6, D9, D17, D21, D23..D27, I2)", () => {
	const makePorts = (
		overrides: Partial<MarkdownRetrievalPorts> = {},
	): MarkdownRetrievalPorts => ({
		expandHome: (p) => (p.startsWith("~/") ? `/home/user/${p.slice(2)}` : p),
		resolveRealpath: async (p) => p,
		statFile: async () => ({ kind: "file" }),
		readTextFile: async () => ok("# Hello"),
		...overrides,
	});

	test("expands ~ and returns realpath and verbatim contents", async () => {
		const res = await retrieveMarkdownFile(
			{ filePath: MarkdownFilePath("~/docs/guide.Markdown") },
			makePorts({
				readTextFile: async (p) => ok(`content from ${p}`),
			}),
		);
		expect(res).toEqual(
			ok({
				path: "/home/user/docs/guide.Markdown",
				text: "content from /home/user/docs/guide.Markdown",
			}),
		);
	});

	test("returns realpath for an in-bounds symlink to a Markdown file (D27)", async () => {
		const res = await retrieveMarkdownFile(
			{ filePath: MarkdownFilePath("/data/alias.md") },
			makePorts({
				resolveRealpath: async (p) =>
					p === "/data/alias.md" ? "/data/REAL.MD" : p,
				readTextFile: async () => ok("# Real Doc"),
			}),
			{
				accessPolicy: { kind: "allowed-paths", directories: ["/data"] },
				pathDelimiter: ":",
			},
		);
		expect(res).toEqual(ok({ path: "/data/REAL.MD", text: "# Real Doc" }));
	});

	test("refuses .md symlink targeting a non-Markdown file inside Allowed Paths (D26)", async () => {
		let readCalled = false;
		const res = await retrieveMarkdownFile(
			{ filePath: MarkdownFilePath("/data/disguised.md") },
			makePorts({
				resolveRealpath: async (p) =>
					p === "/data/disguised.md" ? "/data/secret.env" : p,
				readTextFile: async () => {
					readCalled = true;
					return ok("SECRET=1");
				},
			}),
			{
				accessPolicy: { kind: "allowed-paths", directories: ["/data"] },
				pathDelimiter: ":",
			},
		);
		expect(res).toEqual(err("Required file is not a Markdown file."));
		expect(readCalled).toBe(false);
	});

	test("enforces Allowed Paths and escaping symlinks before statFile (D21, I2)", async () => {
		let statCalled = false;
		const ports = makePorts({
			resolveRealpath: async (p) =>
				p === "/data/escape.md" ? "/outside/secret.md" : p,
			statFile: async () => {
				statCalled = true;
				return { kind: "missing" };
			},
		});

		const outside = await retrieveMarkdownFile(
			{ filePath: MarkdownFilePath("/etc/missing.md") },
			ports,
			{
				accessPolicy: { kind: "allowed-paths", directories: ["/data"] },
				pathDelimiter: ":",
			},
		);
		expect(outside.ok).toBe(false);
		if (!outside.ok) {
			expect(outside.error).toContain("outside the allowed directories");
		}
		expect(statCalled).toBe(false);

		const symlinkEscape = await retrieveMarkdownFile(
			{ filePath: MarkdownFilePath("/data/escape.md") },
			ports,
			{
				accessPolicy: { kind: "allowed-paths", directories: ["/data"] },
				pathDelimiter: ":",
			},
		);
		expect(symlinkEscape.ok).toBe(false);
		if (!symlinkEscape.ok) {
			expect(symlinkEscape.error).toContain("outside the allowed directories");
		}
		expect(statCalled).toBe(false);
	});

	test("refuses immediately when accessPolicy is disabled (RM-3, D9, D23)", async () => {
		let statCalled = false;
		const res = await retrieveMarkdownFile(
			{ filePath: MarkdownFilePath("/data/notes.md") },
			makePorts({
				statFile: async () => {
					statCalled = true;
					return { kind: "file" };
				},
			}),
			{ accessPolicy: { kind: "disabled" } },
		);
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error).toContain("Local file tools are disabled in HTTP mode");
		}
		expect(statCalled).toBe(false);
	});

	test("rejects missing, directory, non-regular, and unreadable targets before reading (RM-5, D17, D25)", async () => {
		for (const [stat, expected] of [
			[{ kind: "missing" as const }, "File does not exist: /data/a.md"],
			[
				{ kind: "directory" as const },
				"Path is a directory, not a file: /data/a.md",
			],
			[
				{ kind: "not-a-file" as const },
				"Path is not a regular file: /data/a.md",
			],
			[{ kind: "unreadable" as const }, "File is not readable: /data/a.md"],
		] as const) {
			let readCalled = false;
			const res = await retrieveMarkdownFile(
				{ filePath: MarkdownFilePath("/data/a.md") },
				makePorts({
					statFile: async () => stat,
					readTextFile: async () => {
						readCalled = true;
						return ok("never");
					},
				}),
			);
			expect(res).toEqual(err(expected));
			expect(readCalled).toBe(false);
		}
	});
});
