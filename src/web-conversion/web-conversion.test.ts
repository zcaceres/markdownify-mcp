import { describe, expect, test } from "bun:test";
import { err, ok } from "../shared/types.js";
import { WebUrl } from "./nouns.js";
import type { WebConversionPorts } from "./ports.js";
import { markdownResult } from "./queries.js";
import {
	checkConvertedOutput,
	checkHttpStatus,
	convertWebUrl,
	inferTempExtension,
	parseWebLimits,
	shouldPassUrlDirectly,
	validateWebRequest,
	validateWebUrl,
} from "./verbs.js";

describe("validateWebRequest (WU-1, D3, D8)", () => {
	test("accepts all three web tools with a valid URL", () => {
		for (const tool of [
			"webpage-to-markdown",
			"youtube-to-markdown",
			"bing-search-to-markdown",
		] as const) {
			const result = validateWebRequest(tool, "https://example.com/page");
			expect(result).toEqual(
				ok({ tool, url: WebUrl("https://example.com/page") }),
			);
		}
	});

	test("rejects unknown tool names", () => {
		expect(
			validateWebRequest("pdf-to-markdown", "https://example.com"),
		).toEqual(err('Unknown web tool "pdf-to-markdown"'));
	});

	test("rejects missing, empty, or non-string URL", () => {
		expect(validateWebRequest("webpage-to-markdown", undefined)).toEqual(
			err("URL is required for this tool"),
		);
		expect(validateWebRequest("webpage-to-markdown", "   ")).toEqual(
			err("URL is required for this tool"),
		);
		expect(validateWebRequest("webpage-to-markdown", 123)).toEqual(
			err("URL is required for this tool"),
		);
	});

	test("rejects malformed URLs", () => {
		expect(validateWebRequest("webpage-to-markdown", "not-a-url")).toEqual(
			err('Invalid URL "not-a-url"'),
		);
	});
});

describe("checkHttpStatus (WU-4, D12)", () => {
	test("accepts 2xx statuses", () => {
		expect(checkHttpStatus(200, "https://example.com")).toEqual(ok(undefined));
		expect(checkHttpStatus(204, "https://example.com")).toEqual(ok(undefined));
	});

	test("rejects non-2xx statuses with status code and URL", () => {
		expect(checkHttpStatus(404, "https://example.com/missing")).toEqual(
			err("HTTP 404 fetching https://example.com/missing"),
		);
		expect(checkHttpStatus(500, "https://example.com/err")).toEqual(
			err("HTTP 500 fetching https://example.com/err"),
		);
	});
});

describe("markdownResult (WU-11, WU-14, D5, D16)", () => {
	test("returns derived MarkdownResult with text only and normalizes whitespace-only output", () => {
		expect(markdownResult("# Hello")).toEqual({ text: "# Hello" });
		expect(markdownResult("   \n\t  ")).toEqual({ text: "" });
	});
});

describe("convertWebUrl (WU-3, WU-4, WU-7, WU-10, WU-11, WU-14)", () => {
	const makePorts = (
		overrides: Partial<WebConversionPorts> = {},
	): {
		ports: WebConversionPorts;
		cleanedUp: string[];
		stagedCount: number;
	} => {
		const state = { cleanedUp: [] as string[], stagedCount: 0 };
		const ports: WebConversionPorts = {
			resolveHost: async () => ok([{ address: "93.184.216.34", family: 4 }]),
			fetchWebUrl: async (url) =>
				ok({
					status: 200,
					body: new TextEncoder().encode("<h1>Example</h1>"),
					finalUrl: url,
				}),
			stageTempFile: async () => {
				state.stagedCount++;
				return ok({
					path: "/tmp/markdownify-1/markdown_output_1.html",
					cleanupDir: "/tmp/markdownify-1",
				});
			},
			cleanupTempFile: async (tempFile) => {
				state.cleanedUp.push(tempFile.cleanupDir);
			},
			convertWithMarkitdown: async () => ok("# Example"),
			...overrides,
		};
		return {
			ports,
			cleanedUp: state.cleanedUp,
			get stagedCount() {
				return state.stagedCount;
			},
		};
	};

	test("fetches, stages, converts, cleans up, and returns MarkdownResult", async () => {
		const ctx = makePorts();
		const result = await convertWebUrl(
			{
				tool: "webpage-to-markdown",
				url: WebUrl("https://example.com/article"),
			},
			ctx.ports,
		);
		expect(result).toEqual(ok({ text: "# Example" }));
		expect(ctx.stagedCount).toBe(1);
		expect(ctx.cleanedUp).toEqual(["/tmp/markdownify-1"]);
	});

	test("returns empty MarkdownResult when markitdown emits only whitespace (D16)", async () => {
		const ctx = makePorts({
			convertWithMarkitdown: async () => ok("   \n  "),
		});
		const result = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/blank") },
			ctx.ports,
		);
		expect(result).toEqual(ok({ text: "" }));
		expect(ctx.cleanedUp).toEqual(["/tmp/markdownify-1"]);
	});

	test("rejects non-2xx HTTP responses without staging a Temporary File (D12)", async () => {
		const ctx = makePorts({
			fetchWebUrl: async (url) =>
				ok({
					status: 404,
					body: new TextEncoder().encode("Not Found"),
					finalUrl: url,
				}),
		});
		const result = await convertWebUrl(
			{
				tool: "webpage-to-markdown",
				url: WebUrl("https://example.com/missing"),
			},
			ctx.ports,
		);
		expect(result).toEqual(
			err("HTTP 404 fetching https://example.com/missing"),
		);
		expect(ctx.stagedCount).toBe(0);
	});

	test("cleans up Temporary File when markitdown fails or is missing (I4)", async () => {
		const failCtx = makePorts({
			convertWithMarkitdown: async () =>
				err({ kind: "failed", reason: "exit code 1" }),
		});
		expect(
			await convertWebUrl(
				{ tool: "webpage-to-markdown", url: WebUrl("https://example.com") },
				failCtx.ports,
			),
		).toEqual(err("Conversion failed: exit code 1"));
		expect(failCtx.cleanedUp).toEqual(["/tmp/markdownify-1"]);

		const missingCtx = makePorts({
			convertWithMarkitdown: async () => err({ kind: "missing" }),
		});
		expect(
			await convertWebUrl(
				{ tool: "webpage-to-markdown", url: WebUrl("https://example.com") },
				missingCtx.ports,
			),
		).toEqual(err("markitdown executable not found"));
		expect(missingCtx.cleanedUp).toEqual(["/tmp/markdownify-1"]);
	});

	test("reports network failure without staging a Temporary File", async () => {
		const ctx = makePorts({
			fetchWebUrl: async () =>
				err({ kind: "network", reason: "connection refused" }),
		});
		const result = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/down") },
			ctx.ports,
		);
		expect(result).toEqual(
			err(
				"Network error fetching https://example.com/down: connection refused",
			),
		);
		expect(ctx.stagedCount).toBe(0);
	});

	test("follows valid public redirects including relative Location headers (WU-5, D14)", async () => {
		const fetchedUrls: string[] = [];
		const ctx = makePorts({
			fetchWebUrl: async (url) => {
				fetchedUrls.push(url);
				if (url === "https://example.com/old") {
					return ok({
						status: 301,
						body: new Uint8Array(),
						finalUrl: url,
						location: "/new",
					});
				}
				return ok({
					status: 200,
					body: new TextEncoder().encode("<h1>Moved</h1>"),
					finalUrl: url,
				});
			},
		});
		const result = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/old") },
			ctx.ports,
		);
		expect(result).toEqual(ok({ text: "# Example" }));
		expect(fetchedUrls).toEqual([
			"https://example.com/old",
			"https://example.com/new",
		]);
		expect(ctx.cleanedUp).toEqual(["/tmp/markdownify-1"]);
	});

	test("aborts redirect to private target before fetching disallowed hop (WU-5, I1)", async () => {
		const fetchedUrls: string[] = [];
		const ctx = makePorts({
			fetchWebUrl: async (url) => {
				fetchedUrls.push(url);
				return ok({
					status: 302,
					body: new Uint8Array(),
					finalUrl: url,
					location: "http://127.0.0.1:8080/secret",
				});
			},
		});
		const result = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/start") },
			ctx.ports,
		);
		expect(result).toEqual(
			err(
				"Fetching http://127.0.0.1:8080/secret is potentially dangerous, aborting.",
			),
		);
		expect(fetchedUrls).toEqual(["https://example.com/start"]);
		expect(ctx.stagedCount).toBe(0);
	});

	test("allows exactly maxRedirects hops and rejects the next redirect (WU-5, D13)", async () => {
		const fetchedUrls: string[] = [];
		const ctx = makePorts({
			fetchWebUrl: async (url) => {
				fetchedUrls.push(url);
				if (url === "https://example.com/r0") {
					return ok({
						status: 302,
						body: new Uint8Array(),
						finalUrl: url,
						location: "https://example.com/r1",
					});
				}
				if (url === "https://example.com/r1") {
					return ok({
						status: 302,
						body: new Uint8Array(),
						finalUrl: url,
						location: "https://example.com/r2",
					});
				}
				if (url === "https://example.com/r2") {
					return ok({
						status: 302,
						body: new Uint8Array(),
						finalUrl: url,
						location: "https://example.com/r3",
					});
				}
				return ok({
					status: 200,
					body: new TextEncoder().encode("<h1>Hop 3</h1>"),
					finalUrl: url,
				});
			},
		});
		const exactOk = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/r0") },
			ctx.ports,
			{ maxRedirects: 3 },
		);
		expect(exactOk).toEqual(ok({ text: "# Example" }));
		expect(fetchedUrls).toHaveLength(4);

		const loopUrls: string[] = [];
		const loopCtx = makePorts({
			fetchWebUrl: async (url) => {
				loopUrls.push(url);
				return ok({
					status: 302,
					body: new Uint8Array(),
					finalUrl: url,
					location:
						url === "https://example.com/a"
							? "https://example.com/b"
							: "https://example.com/a",
				});
			},
		});
		const tooMany = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/a") },
			loopCtx.ports,
			{ maxRedirects: 3 },
		);
		expect(tooMany).toEqual(err("Too many redirects"));
		expect(loopUrls).toHaveLength(4);
	});
});

describe("validateWebUrl (WU-2, D14, I1)", () => {
	const publicDns = async () => ok([{ address: "93.184.216.34", family: 4 }]);

	test("rejects non-http(s) schemes", async () => {
		expect(await validateWebUrl("file:///etc/passwd", publicDns)).toEqual(
			err("Only http: and https: schemes are allowed."),
		);
		expect(await validateWebUrl("ftp://example.com/x", publicDns)).toEqual(
			err("Only http: and https: schemes are allowed."),
		);
	});

	test("rejects blocked hostnames and private IPv4/IPv6 literals without DNS", async () => {
		let dnsCalled = false;
		const spyDns = async () => {
			dnsCalled = true;
			return ok([{ address: "93.184.216.34", family: 4 }]);
		};
		for (const url of [
			"http://localhost/admin",
			"http://sub.localhost/admin",
			"http://metadata.google.internal/",
			"http://printer.local/",
			"http://127.0.0.1/",
			"http://169.254.169.254/",
			"http://[::1]:8080/",
			"http://[::ffff:7f00:1]/",
		]) {
			expect(await validateWebUrl(url, spyDns)).toEqual(
				err(`Fetching ${url} is potentially dangerous, aborting.`),
			);
		}
		expect(dnsCalled).toBe(false);
	});

	test("accepts public IP literals without DNS lookup", async () => {
		let dnsCalled = false;
		const spyDns = async () => {
			dnsCalled = true;
			return ok([]);
		};
		expect(await validateWebUrl("https://93.184.216.34/doc", spyDns)).toEqual(
			ok(WebUrl("https://93.184.216.34/doc")),
		);
		expect(dnsCalled).toBe(false);
	});

	test("fails closed on DNS error, empty records, or any private resolved IP", async () => {
		expect(
			await validateWebUrl("https://missing.example/p", async () =>
				err("ENOTFOUND"),
			),
		).toEqual(
			err(
				'Could not resolve host "missing.example" for https://missing.example/p.',
			),
		);
		expect(
			await validateWebUrl("https://empty.example/p", async () => ok([])),
		).toEqual(
			err(
				'Could not resolve host "empty.example" for https://empty.example/p.',
			),
		);
		expect(
			await validateWebUrl("https://dual.example/p", async () =>
				ok([
					{ address: "93.184.216.34", family: 4 },
					{ address: "::1", family: 6 },
				]),
			),
		).toEqual(
			err(
				"Fetching https://dual.example/p is potentially dangerous, aborting.",
			),
		);
	});
});

describe("inferTempExtension (WU-8, D10, D15)", () => {
	test("prefers known Content-Type over extensionless or mismatched pathname", () => {
		expect(
			inferTempExtension(
				"https://example.com/download?id=1",
				"application/pdf; charset=binary",
			),
		).toBe("pdf");
		expect(
			inferTempExtension(
				"https://example.com/doc",
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			),
		).toBe("docx");
		expect(inferTempExtension("https://example.com/img", "image/png")).toBe(
			"png",
		);
		expect(inferTempExtension("https://example.com/clip", "audio/mpeg")).toBe(
			"mp3",
		);
		expect(
			inferTempExtension(
				"https://example.com/raw",
				"text/plain; charset=utf-8",
			),
		).toBe("txt");
		expect(
			inferTempExtension("https://example.com/data", "application/json"),
		).toBe("json");
		expect(inferTempExtension("https://example.com/table", "text/csv")).toBe(
			"csv",
		);
	});

	test("falls back to recognized URL pathname extension when Content-Type is ambiguous or absent", () => {
		expect(
			inferTempExtension(
				"https://example.com/files/deck.pptx",
				"application/octet-stream",
			),
		).toBe("pptx");
		expect(
			inferTempExtension("https://example.com/DOC.PDF?v=2#p1", undefined),
		).toBe("pdf");
		expect(inferTempExtension("https://example.com/photo.jpeg", null)).toBe(
			"jpg",
		);
		expect(
			inferTempExtension("https://example.com/notes.markdown", undefined),
		).toBe("md");
	});

	test("defaults to html when neither Content-Type nor pathname identifies a known type", () => {
		expect(
			inferTempExtension(
				"https://example.com/mystery",
				"application/octet-stream",
			),
		).toBe("html");
		expect(inferTempExtension("https://example.com/page", undefined)).toBe(
			"html",
		);
	});
});

describe("shouldPassUrlDirectly (WU-9, D10, D14)", () => {
	test("accepts canonical https YouTube watch and Bing search URLs only", () => {
		expect(
			shouldPassUrlDirectly("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
		).toBe(true);
		expect(
			shouldPassUrlDirectly("https://www.bing.com/search?q=markdown"),
		).toBe(true);
		expect(
			shouldPassUrlDirectly("http://www.youtube.com/watch?v=dQw4w9WgXcQ"),
		).toBe(false);
		expect(shouldPassUrlDirectly("https://youtu.be/dQw4w9WgXcQ")).toBe(false);
		expect(
			shouldPassUrlDirectly(
				"https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
			),
		).toBe(false);
		expect(
			shouldPassUrlDirectly("https://en.wikipedia.org/wiki/Markdown"),
		).toBe(false);
	});
});

describe("checkConvertedOutput (WU-12, D3, D8)", () => {
	test("rejects unconverted raw HTML regardless of case or leading whitespace", () => {
		for (const raw of [
			"<!DOCTYPE html><html></html>",
			"  \n<!doctype html><body>hi</body>",
			"\t<html lang='en'><body></body></html>",
		]) {
			expect(checkConvertedOutput(raw).ok).toBe(false);
		}
	});

	test("accepts Markdown, plain text, and empty strings", () => {
		expect(checkConvertedOutput("# Hello")).toEqual(ok("# Hello"));
		expect(checkConvertedOutput("")).toEqual(ok(""));
	});
});

describe("convertWebUrl Slice 03 routing & output validation (WU-8, WU-9, WU-12)", () => {
	test("passes Content-Type inferred extension to stageTempFile", async () => {
		let stagedExt = "";
		const cleanedUp: string[] = [];
		const result = await convertWebUrl(
			{
				tool: "webpage-to-markdown",
				url: WebUrl("https://example.com/download?id=1"),
			},
			{
				resolveHost: async () => ok([{ address: "93.184.216.34", family: 4 }]),
				fetchWebUrl: async (url) =>
					ok({
						status: 200,
						body: new TextEncoder().encode("%PDF-1.7"),
						finalUrl: url,
						contentType: "application/pdf; charset=binary",
					}),
				stageTempFile: async (_content, ext) => {
					stagedExt = ext;
					return ok({
						path: `/tmp/markdownify-1/file.${ext}`,
						cleanupDir: "/tmp/markdownify-1",
					});
				},
				cleanupTempFile: async (f) => {
					cleanedUp.push(f.cleanupDir);
				},
				convertWithMarkitdown: async () => ok("# PDF"),
			},
		);
		expect(result).toEqual(ok({ text: "# PDF" }));
		expect(stagedExt).toBe("pdf");
		expect(cleanedUp).toEqual(["/tmp/markdownify-1"]);
	});

	test("passes redirected canonical YouTube URL directly to markitdown without staging (WU-9)", async () => {
		let staged = false;
		let markitdownInput = "";
		const result = await convertWebUrl(
			{
				tool: "youtube-to-markdown",
				url: WebUrl("https://youtu.be/dQw4w9WgXcQ"),
			},
			{
				resolveHost: async () => ok([{ address: "93.184.216.34", family: 4 }]),
				fetchWebUrl: async (url) => {
					if (url === "https://youtu.be/dQw4w9WgXcQ") {
						return ok({
							status: 303,
							body: new Uint8Array(),
							finalUrl: url,
							location: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
						});
					}
					return ok({
						status: 200,
						body: new Uint8Array(),
						finalUrl: url,
					});
				},
				stageTempFile: async () => {
					staged = true;
					return ok({ path: "/tmp/x", cleanupDir: "/tmp" });
				},
				cleanupTempFile: async () => {},
				convertWithMarkitdown: async (input) => {
					markitdownInput = input;
					return ok("# Transcript");
				},
			},
		);
		expect(result).toEqual(ok({ text: "# Transcript" }));
		expect(staged).toBe(false);
		expect(markitdownInput).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
	});

	test("rejects unconverted raw HTML from markitdown and cleans up Temporary File (WU-12, I4)", async () => {
		const cleanedUp: string[] = [];
		const result = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/spa") },
			{
				resolveHost: async () => ok([{ address: "93.184.216.34", family: 4 }]),
				fetchWebUrl: async (url) =>
					ok({
						status: 200,
						body: new TextEncoder().encode("<!DOCTYPE html>"),
						finalUrl: url,
					}),
				stageTempFile: async () =>
					ok({
						path: "/tmp/markdownify-1/file.html",
						cleanupDir: "/tmp/markdownify-1",
					}),
				cleanupTempFile: async (f) => {
					cleanedUp.push(f.cleanupDir);
				},
				convertWithMarkitdown: async () =>
					ok("<!DOCTYPE html><html><body></body></html>"),
			},
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("raw HTML");
		}
		expect(cleanedUp).toEqual(["/tmp/markdownify-1"]);
	});
});

describe("parseWebLimits (WU-6, WU-13, D13)", () => {
	test("returns D13 defaults when env vars are unset", () => {
		expect(parseWebLimits({})).toEqual(
			ok({
				fetchTimeoutMs: 30_000,
				markitdownTimeoutMs: 60_000,
				maxDownloadBytes: 25 * 1024 * 1024,
				maxRedirects: 10,
			}),
		);
	});

	test("parses valid overrides including zero MD_MAX_REDIRECTS", () => {
		expect(
			parseWebLimits({
				MD_FETCH_TIMEOUT_MS: "5000",
				MD_MARKITDOWN_TIMEOUT_MS: "15000",
				MD_MAX_DOWNLOAD_BYTES: "1024",
				MD_MAX_REDIRECTS: "0",
			}),
		).toEqual(
			ok({
				fetchTimeoutMs: 5_000,
				markitdownTimeoutMs: 15_000,
				maxDownloadBytes: 1024,
				maxRedirects: 0,
			}),
		);
	});

	test("rejects invalid or non-positive values", () => {
		expect(parseWebLimits({ MD_FETCH_TIMEOUT_MS: "0" })).toEqual(
			err('Invalid MD_FETCH_TIMEOUT_MS "0": must be a positive integer'),
		);
		expect(parseWebLimits({ MD_MAX_DOWNLOAD_BYTES: "abc" })).toEqual(
			err('Invalid MD_MAX_DOWNLOAD_BYTES "abc": must be a positive integer'),
		);
		expect(parseWebLimits({ MD_MAX_REDIRECTS: "-1" })).toEqual(
			err('Invalid MD_MAX_REDIRECTS "-1": must be a non-negative integer'),
		);
	});
});

describe("convertWebUrl Slice 04 timeouts and size limits (WU-6, WU-13, D7, D13, I4)", () => {
	test("returns timeout error when fetch times out without staging", async () => {
		let staged = false;
		const result = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/slow") },
			{
				resolveHost: async () => ok([{ address: "93.184.216.34", family: 4 }]),
				fetchWebUrl: async () => err({ kind: "timeout", timeoutMs: 30_000 }),
				stageTempFile: async () => {
					staged = true;
					return ok({ path: "/tmp/x", cleanupDir: "/tmp" });
				},
				cleanupTempFile: async () => {},
				convertWithMarkitdown: async () => ok("# Never"),
			},
		);
		expect(result).toEqual(
			err("Fetch timed out after 30000ms for https://example.com/slow"),
		);
		expect(staged).toBe(false);
	});

	test("returns size-limit error on port too-large or body exceeding maxDownloadBytes without staging", async () => {
		let staged = false;
		const portRejection = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/big") },
			{
				resolveHost: async () => ok([{ address: "93.184.216.34", family: 4 }]),
				fetchWebUrl: async () => err({ kind: "too-large", maxBytes: 100 }),
				stageTempFile: async () => {
					staged = true;
					return ok({ path: "/tmp/x", cleanupDir: "/tmp" });
				},
				cleanupTempFile: async () => {},
				convertWithMarkitdown: async () => ok("# Never"),
			},
			{ maxDownloadBytes: 100 },
		);
		expect(portRejection).toEqual(
			err(
				"Download exceeded maximum size of 100 bytes for https://example.com/big",
			),
		);
		expect(staged).toBe(false);

		const defenseInDepth = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/big2") },
			{
				resolveHost: async () => ok([{ address: "93.184.216.34", family: 4 }]),
				fetchWebUrl: async (url) =>
					ok({
						status: 200,
						body: new Uint8Array(101),
						finalUrl: url,
					}),
				stageTempFile: async () => {
					staged = true;
					return ok({ path: "/tmp/x", cleanupDir: "/tmp" });
				},
				cleanupTempFile: async () => {},
				convertWithMarkitdown: async () => ok("# Never"),
			},
			{ maxDownloadBytes: 100 },
		);
		expect(defenseInDepth).toEqual(
			err(
				"Download exceeded maximum size of 100 bytes for https://example.com/big2",
			),
		);
		expect(staged).toBe(false);
	});

	test("cleans up Temporary File when markitdown times out (WU-13, I4)", async () => {
		const cleanedUp: string[] = [];
		const result = await convertWebUrl(
			{ tool: "webpage-to-markdown", url: WebUrl("https://example.com/heavy") },
			{
				resolveHost: async () => ok([{ address: "93.184.216.34", family: 4 }]),
				fetchWebUrl: async (url) =>
					ok({
						status: 200,
						body: new TextEncoder().encode("<h1>Heavy</h1>"),
						finalUrl: url,
					}),
				stageTempFile: async () =>
					ok({
						path: "/tmp/markdownify-1/file.html",
						cleanupDir: "/tmp/markdownify-1",
					}),
				cleanupTempFile: async (f) => {
					cleanedUp.push(f.cleanupDir);
				},
				convertWithMarkitdown: async () =>
					err({ kind: "timeout", timeoutMs: 60_000 }),
			},
		);
		expect(result).toEqual(err("Conversion timed out after 60000ms"));
		expect(cleanedUp).toEqual(["/tmp/markdownify-1"]);
	});
});
