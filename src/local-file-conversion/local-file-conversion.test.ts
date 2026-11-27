import { describe, expect, test } from "bun:test";
import { err, ok } from "../shared/types.js";
import { LOCAL_FILE_TOOLS, LocalFilePath } from "./nouns.js";
import type { LocalFileConversionPorts } from "./ports.js";
import { markdownResult } from "./queries.js";
import {
	checkFileAccess,
	convertLocalFile,
	formatMarkitdownError,
	parseLocalFileLimits,
	resolveFileAccessPolicy,
	validateLocalFileRequest,
	verifyReadableFile,
} from "./verbs.js";

describe("validateLocalFileRequest (LF-1, LF-2, D3, D8, D18)", () => {
	test("accepts all six local file tools with POSIX, Windows, or tilde paths", () => {
		for (const tool of LOCAL_FILE_TOOLS) {
			expect(validateLocalFileRequest(tool, "/data/report.pdf")).toEqual(
				ok({ tool, filePath: LocalFilePath("/data/report.pdf") }),
			);
		}
		expect(validateLocalFileRequest("pdf-to-markdown", "~/docs/a.pdf")).toEqual(
			ok({
				tool: "pdf-to-markdown",
				filePath: LocalFilePath("~/docs/a.pdf"),
			}),
		);
		expect(
			validateLocalFileRequest("pdf-to-markdown", "C:\\Users\\a\\doc.pdf"),
		).toEqual(
			ok({
				tool: "pdf-to-markdown",
				filePath: LocalFilePath("C:\\Users\\a\\doc.pdf"),
			}),
		);
		expect(
			validateLocalFileRequest("pdf-to-markdown", "\\\\server\\share\\doc.pdf"),
		).toEqual(
			ok({
				tool: "pdf-to-markdown",
				filePath: LocalFilePath("\\\\server\\share\\doc.pdf"),
			}),
		);
	});

	test("rejects unknown tools, missing/blank/non-string paths, and bare relative paths", () => {
		expect(
			validateLocalFileRequest("webpage-to-markdown", "/data/a.pdf"),
		).toEqual(err('Unknown local file tool "webpage-to-markdown"'));
		expect(validateLocalFileRequest("pdf-to-markdown", undefined)).toEqual(
			err("File path is required for this tool"),
		);
		expect(validateLocalFileRequest("pdf-to-markdown", "   ")).toEqual(
			err("File path is required for this tool"),
		);
		expect(validateLocalFileRequest("pdf-to-markdown", 42)).toEqual(
			err("File path is required for this tool"),
		);
		expect(validateLocalFileRequest("pdf-to-markdown", "report.pdf")).toEqual(
			err('File path "report.pdf" must be an absolute path or start with ~/'),
		);
		expect(
			validateLocalFileRequest("docx-to-markdown", "./notes/draft.docx"),
		).toEqual(
			err(
				'File path "./notes/draft.docx" must be an absolute path or start with ~/',
			),
		);
	});
});

describe("verifyReadableFile (LF-5, D17)", () => {
	test("accepts regular readable files and rejects missing, directory, and unreadable targets", () => {
		expect(verifyReadableFile("/data/ok.pdf", { kind: "file" })).toEqual(
			ok(undefined),
		);
		expect(
			verifyReadableFile("/data/missing.pdf", { kind: "missing" }),
		).toEqual(err("File does not exist: /data/missing.pdf"));
		expect(verifyReadableFile("/data/dir", { kind: "directory" })).toEqual(
			err("Path is a directory, not a file: /data/dir"),
		);
		expect(
			verifyReadableFile("/data/locked.pdf", { kind: "unreadable" }),
		).toEqual(err("File is not readable: /data/locked.pdf"));
	});
});

describe("formatMarkitdownError (LF-9, D4, D22)", () => {
	test("formats missing binary, timeout, generic failure, and MissingDependencyException hint", () => {
		expect(formatMarkitdownError({ kind: "missing" })).toBe(
			"markitdown executable not found",
		);
		expect(formatMarkitdownError({ kind: "timeout", timeoutMs: 60_000 })).toBe(
			"Conversion timed out after 60000ms",
		);
		expect(
			formatMarkitdownError({ kind: "failed", reason: "exit code 1" }),
		).toBe("Conversion failed: exit code 1");
		expect(
			formatMarkitdownError({
				kind: "failed",
				reason:
					"MissingDependencyException: AudioConverter requires speech_recognition",
			}),
		).toBe(
			"Conversion failed: MissingDependencyException: AudioConverter requires speech_recognition. This format requires markitdown[all] (full local install) rather than the slim Docker pdf profile.",
		);
	});
});

describe("markdownResult (LF-7, LF-11, D5, D16)", () => {
	test("normalizes whitespace-only stdout to empty string", () => {
		expect(markdownResult("# Doc")).toEqual({ text: "# Doc" });
		expect(markdownResult(" \n\t ")).toEqual({ text: "" });
	});
});

describe("convertLocalFile (LF-5..LF-9, LF-11)", () => {
	const makePorts = (
		overrides: Partial<LocalFileConversionPorts> = {},
	): { ports: LocalFileConversionPorts; markitdownInputs: string[] } => {
		const markitdownInputs: string[] = [];
		const ports: LocalFileConversionPorts = {
			expandHome: (p) => (p.startsWith("~/") ? `/home/user/${p.slice(2)}` : p),
			resolveRealpath: async (p) => p,
			statFile: async () => ({ kind: "file" }),
			convertWithMarkitdown: async (inputPath) => {
				markitdownInputs.push(inputPath);
				return ok("# Converted");
			},
			...overrides,
		};
		return { ports, markitdownInputs };
	};

	test("expands ~ and converts readable Local File via markitdown", async () => {
		const ctx = makePorts();
		const result = await convertLocalFile(
			{ tool: "pptx-to-markdown", filePath: LocalFilePath("~/slides.pptx") },
			ctx.ports,
		);
		expect(result).toEqual(ok({ text: "# Converted" }));
		expect(ctx.markitdownInputs).toEqual(["/home/user/slides.pptx"]);
	});

	test("refuses missing/directory/unreadable files without invoking markitdown (D17)", async () => {
		const ctx = makePorts({ statFile: async () => ({ kind: "missing" }) });
		expect(
			await convertLocalFile(
				{ tool: "pdf-to-markdown", filePath: LocalFilePath("/data/nope.pdf") },
				ctx.ports,
			),
		).toEqual(err("File does not exist: /data/nope.pdf"));
		expect(ctx.markitdownInputs).toEqual([]);
	});

	test("preserves HTML-prefixed text on local files (D20) and normalizes empty output (D16)", async () => {
		const htmlCtx = makePorts({
			convertWithMarkitdown: async () =>
				ok("<!DOCTYPE html><html><body>Guide</body></html>"),
		});
		expect(
			await convertLocalFile(
				{
					tool: "docx-to-markdown",
					filePath: LocalFilePath("/data/guide.docx"),
				},
				htmlCtx.ports,
			),
		).toEqual(ok({ text: "<!DOCTYPE html><html><body>Guide</body></html>" }));

		const emptyCtx = makePorts({
			convertWithMarkitdown: async () => ok("   \n  "),
		});
		expect(
			await convertLocalFile(
				{
					tool: "image-to-markdown",
					filePath: LocalFilePath("/data/photo.jpg"),
				},
				emptyCtx.ports,
			),
		).toEqual(ok({ text: "" }));
	});

	test("checks Allowed Paths BEFORE statFile and rejects symlinks escaping Allowed Paths (LF-4, D21, I2)", async () => {
		let statCalled = false;
		const ctx = makePorts({
			resolveRealpath: async (p) =>
				p === "/data/escape.pdf" ? "/outside/secret.pdf" : p,
			statFile: async () => {
				statCalled = true;
				return { kind: "missing" };
			},
		});

		const outOfBounds = await convertLocalFile(
			{
				tool: "pdf-to-markdown",
				filePath: LocalFilePath("/etc/missing.pdf"),
			},
			ctx.ports,
			{
				accessPolicy: { kind: "allowed-paths", directories: ["/data"] },
				pathDelimiter: ":",
			},
		);
		expect(outOfBounds.ok).toBe(false);
		if (!outOfBounds.ok) {
			expect(outOfBounds.error).toContain("outside the allowed directories");
		}
		expect(statCalled).toBe(false);

		const symlinkEscape = await convertLocalFile(
			{
				tool: "pdf-to-markdown",
				filePath: LocalFilePath("/data/escape.pdf"),
			},
			ctx.ports,
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
		const inBoundsLink = await convertLocalFile(
			{
				tool: "pdf-to-markdown",
				filePath: LocalFilePath("/data/alias.pdf"),
			},
			makePorts({
				resolveRealpath: async (p) =>
					p === "/data/alias.pdf" ? "/data/report.pdf" : p,
			}).ports,
			{
				accessPolicy: { kind: "allowed-paths", directories: ["/data"] },
				pathDelimiter: ":",
			},
		);
		expect(inBoundsLink).toEqual(ok({ text: "# Converted" }));
	});

	test("refuses immediately when accessPolicy is disabled in HTTP mode (LF-3, D9, D23)", async () => {
		let statCalled = false;
		const ctx = makePorts({
			statFile: async () => {
				statCalled = true;
				return { kind: "file" };
			},
		});
		const result = await convertLocalFile(
			{ tool: "pdf-to-markdown", filePath: LocalFilePath("/data/report.pdf") },
			ctx.ports,
			{ accessPolicy: { kind: "disabled" } },
		);
		expect(result).toEqual(
			err(
				"Local file tools are disabled in HTTP mode when MD_ALLOWED_PATHS is unset. Set MD_ALLOWED_PATHS, or pass --allow-unrestricted-paths / MCP_ALLOW_UNRESTRICTED_PATHS=true to opt out.",
			),
		);
		expect(statCalled).toBe(false);
	});
});

describe("resolveFileAccessPolicy & checkFileAccess (LF-3, LF-4, D6, D9, D23, D24)", () => {
	const mockExpand = (p: string) =>
		p.startsWith("~/") ? `/home/user/${p.slice(2)}` : p;

	test("defaults to unrestricted in stdio and disabled in http unless configured or opted out (D6, D9, D23)", () => {
		expect(resolveFileAccessPolicy({}, mockExpand, { delimiter: ":" })).toEqual(
			ok({ kind: "unrestricted" }),
		);
		expect(
			resolveFileAccessPolicy({ MCP_TRANSPORT: "http" }, mockExpand, {
				delimiter: ":",
			}),
		).toEqual(ok({ kind: "disabled" }));
		expect(
			resolveFileAccessPolicy(
				{ MCP_TRANSPORT: "http", MCP_ALLOW_UNRESTRICTED_PATHS: "true" },
				mockExpand,
				{ delimiter: ":" },
			),
		).toEqual(ok({ kind: "unrestricted" }));
		expect(
			resolveFileAccessPolicy({ MCP_TRANSPORT: "http" }, mockExpand, {
				allowUnrestrictedPaths: true,
				delimiter: ":",
			}),
		).toEqual(ok({ kind: "unrestricted" }));
		expect(
			resolveFileAccessPolicy(
				{ MCP_TRANSPORT: "http", MD_ALLOWED_PATHS: "/data:~/docs" },
				mockExpand,
				{ delimiter: ":" },
			),
		).toEqual(
			ok({
				kind: "allowed-paths",
				directories: ["/data", "/home/user/docs"],
			}),
		);
		// D23: MD_SHARE_DIR is removed and ignored
		expect(
			resolveFileAccessPolicy({ MD_SHARE_DIR: "/legacy" }, mockExpand, {
				delimiter: ":",
			}),
		).toEqual(ok({ kind: "unrestricted" }));
		expect(
			resolveFileAccessPolicy(
				{ MCP_TRANSPORT: "http", MD_SHARE_DIR: "/legacy" },
				mockExpand,
				{ delimiter: ":" },
			),
		).toEqual(ok({ kind: "disabled" }));
	});

	test("fails closed when MD_ALLOWED_PATHS is explicitly set but empty or delimiter-only (D24)", () => {
		for (const raw of ["", "   ", ":", " : : "]) {
			expect(
				resolveFileAccessPolicy({ MD_ALLOWED_PATHS: raw }, mockExpand, {
					delimiter: ":",
				}),
			).toEqual(
				err(
					"MD_ALLOWED_PATHS is set but contains no valid directories. Specify at least one directory or unset MD_ALLOWED_PATHS.",
				),
			);
		}
	});

	test("rejects prefix-sibling directories and .. traversals", async () => {
		const policy = { kind: "allowed-paths" as const, directories: ["/data"] };
		expect(
			(
				await checkFileAccess(
					"/data-evil/a.pdf",
					"/data-evil/a.pdf",
					policy,
					async (p) => p,
					":",
				)
			).ok,
		).toBe(false);
		expect(
			(
				await checkFileAccess(
					"/data/../etc/passwd",
					"/etc/passwd",
					policy,
					async (p) => p,
					":",
				)
			).ok,
		).toBe(false);
	});
});

describe("parseLocalFileLimits & timeout enforcement (LF-10, D7, D13)", () => {
	test("defaults to 60_000ms and parses positive integer overrides", () => {
		expect(parseLocalFileLimits({})).toEqual(
			ok({ markitdownTimeoutMs: 60_000 }),
		);
		expect(parseLocalFileLimits({ MD_MARKITDOWN_TIMEOUT_MS: "   " })).toEqual(
			ok({ markitdownTimeoutMs: 60_000 }),
		);
		expect(
			parseLocalFileLimits({ MD_MARKITDOWN_TIMEOUT_MS: " 5000 " }),
		).toEqual(ok({ markitdownTimeoutMs: 5_000 }));
	});

	test("rejects zero, negative, non-numeric, float, and unsafe integer values", () => {
		for (const bad of ["0", "-10", "fast", "12.5", "99999999999999999999"]) {
			expect(parseLocalFileLimits({ MD_MARKITDOWN_TIMEOUT_MS: bad })).toEqual(
				err(
					`Invalid MD_MARKITDOWN_TIMEOUT_MS "${bad}": must be a positive integer`,
				),
			);
		}
	});

	test("passes custom markitdownTimeoutMs and formats timeout errors", async () => {
		let seenTimeout: number | undefined;
		const result = await convertLocalFile(
			{ tool: "pdf-to-markdown", filePath: LocalFilePath("/data/large.pdf") },
			{
				expandHome: (p) => p,
				resolveRealpath: async (p) => p,
				statFile: async () => ({ kind: "file" }),
				convertWithMarkitdown: async (_inputPath, timeoutMs) => {
					seenTimeout = timeoutMs;
					return err({ kind: "timeout", timeoutMs });
				},
			},
			{ markitdownTimeoutMs: 5_000 },
		);
		expect(seenTimeout).toBe(5_000);
		expect(result).toEqual(err("Conversion timed out after 5000ms"));
	});
});
