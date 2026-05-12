import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Markdownify } from "./Markdownify";

const sampleDataDir = path.join(__dirname, "sample-data");

describe("Markdownify Extended", () => {
	const savedAllowed = process.env.MD_ALLOWED_PATHS;
	const savedShare = process.env.MD_SHARE_DIR;

	beforeEach(() => {
		delete process.env.MD_ALLOWED_PATHS;
		delete process.env.MD_SHARE_DIR;
	});

	afterEach(() => {
		if (savedAllowed === undefined) delete process.env.MD_ALLOWED_PATHS;
		else process.env.MD_ALLOWED_PATHS = savedAllowed;
		if (savedShare === undefined) delete process.env.MD_SHARE_DIR;
		else process.env.MD_SHARE_DIR = savedShare;
	});

	describe("toMarkdown edge cases", () => {
		test("handles whitespace-only url gracefully", async () => {
			await expect(Markdownify.toMarkdown({ url: "   " })).rejects.toThrow();
		});

		test("handles extremely long url without crashing", async () => {
			const longUrl = `https://example.com/${"a".repeat(10000)}`;
			// The URL passes validation (no length check) but fetch will be called.
			// Mock fetch to avoid real network request.
			const mockFetch = mock(() =>
				Promise.resolve({
					arrayBuffer: () =>
						Promise.resolve(new TextEncoder().encode("<h1>Long</h1>").buffer),
				} as any),
			);
			global.fetch = mockFetch as any;

			try {
				// Currently succeeds (no URL length limit) — this is a documented risk.
				// A DoS attacker could send extremely long URLs.
				await Markdownify.toMarkdown({ url: longUrl });
				// If we reach here, the function didn't crash — that's the minimum bar.
			} catch (e) {
				// Also acceptable if it rejects gracefully
				expect(e).toBeInstanceOf(Error);
			}
		}, 15_000);

		test("toMarkdown with both filePath and url uses url", async () => {
			// When url is provided, it takes precedence over filePath
			const html = "<h1>URL content</h1>";
			const mockFetch = mock(() =>
				Promise.resolve({
					arrayBuffer: () =>
						Promise.resolve(new TextEncoder().encode(html).buffer),
				}),
			);
			global.fetch = mockFetch as any;

			const pdfPath = path.join(sampleDataDir, "test.pdf");
			const result = await Markdownify.toMarkdown({
				filePath: pdfPath,
				url: "https://example.com/page",
			});

			// Should use URL, not filePath
			expect(result.text).toContain("# URL content");
		}, 15_000);
	});

	describe("safeFetch redirect handling", () => {
		test("handles redirect and follows to final URL", async () => {
			let callCount = 0;
			const htmlContent = "<h1>Final Destination</h1>";

			const mockFetch = mock((_url: string, _init?: any) => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve({
						status: 302,
						headers: {
							get: (name: string) => (name === "location" ? "/final" : null),
						},
					} as any);
				}
				return Promise.resolve({
					status: 200,
					arrayBuffer: () =>
						Promise.resolve(new TextEncoder().encode(htmlContent).buffer),
				} as any);
			});
			global.fetch = mockFetch as any;

			const result = await Markdownify.toMarkdown({
				url: "https://example.com/start",
			});

			expect(result.text).toContain("# Final Destination");
			expect(callCount).toBe(2);
		}, 15_000);

		test("rejects redirect loop (too many redirects)", async () => {
			const mockFetch = mock(() =>
				Promise.resolve({
					status: 302,
					headers: { get: (_name: string) => "/same" },
				} as any),
			);
			global.fetch = mockFetch as any;

			await expect(
				Markdownify.toMarkdown({ url: "https://example.com/loop" }),
			).rejects.toThrow("Too many redirects");
		});
	});

	describe("get() method — extended", () => {
		test("get resolves ~ home directory paths", async () => {
			const mdContent = "# Test Home";
			const tmpFile = path.join(
				os.homedir(),
				`markdownify_test_${Date.now()}.md`,
			);
			fs.writeFileSync(tmpFile, mdContent);

			try {
				const result = await Markdownify.get({
					filePath: `~/${path.basename(tmpFile)}`,
				});
				expect(result.text).toBe(mdContent);
				expect(result.path).toBe(path.resolve(tmpFile));
			} finally {
				if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
			}
		});

		test("get rejects non-markdown files with clear error", async () => {
			const tmpFile = path.join(os.tmpdir(), `test_${Date.now()}.txt`);
			fs.writeFileSync(tmpFile, "plain text");

			try {
				await expect(Markdownify.get({ filePath: tmpFile })).rejects.toThrow(
					"Required file is not a Markdown file.",
				);
			} finally {
				if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
			}
		});

		test("get returns resolved path not raw input", async () => {
			const mdContent = "# Resolved Test";
			const tmpFile = path.join(os.tmpdir(), `resolved_${Date.now()}.md`);
			fs.writeFileSync(tmpFile, mdContent);

			try {
				// Pass relative path
				const relativePath = path.relative(process.cwd(), tmpFile);
				const result = await Markdownify.get({ filePath: relativePath });
				// Result path should be absolute (resolved)
				expect(path.isAbsolute(result.path!)).toBe(true);
				expect(result.text).toBe(mdContent);
			} finally {
				if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
			}
		});

		test("get respects MD_ALLOWED_PATHS restriction", async () => {
			process.env.MD_ALLOWED_PATHS = "/tmp/allowed";

			const tmpFile = path.join(os.tmpdir(), `restricted_${Date.now()}.md`);
			fs.writeFileSync(tmpFile, "# restricted");

			try {
				// File is in /tmp but MD_ALLOWED_PATHS only allows /tmp/allowed
				// On Windows, os.tmpdir() may not start with /tmp
				const shouldThrow = !path
					.resolve(os.tmpdir())
					.startsWith(path.resolve("/tmp/allowed"));
				if (shouldThrow) {
					await expect(Markdownify.get({ filePath: tmpFile })).rejects.toThrow(
						"outside the allowed directories",
					);
				} else {
					// File happens to be in allowed path
					const result = await Markdownify.get({ filePath: tmpFile });
					expect(result.text).toBe("# restricted");
				}
			} finally {
				if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
			}
		});
	});

	describe("fromRepo edge cases", () => {
		test("fromRepo rejects flag injection via --help", async () => {
			await expect(Markdownify.fromRepo({ repoUrl: "--help" })).rejects.toThrow(
				"Invalid repository URL or shorthand",
			);
		});

		test("fromRepo rejects pipe injection", async () => {
			await expect(
				Markdownify.fromRepo({ repoUrl: "owner/repo | cat /etc/passwd" }),
			).rejects.toThrow("Invalid repository URL or shorthand");
		});

		test("fromRepo rejects backtick injection", async () => {
			await expect(
				Markdownify.fromRepo({ repoUrl: "owner/repo`id`" }),
			).rejects.toThrow("Invalid repository URL or shorthand");
		});

		test("fromRepo rejects dollar sign injection", async () => {
			await expect(
				Markdownify.fromRepo({ repoUrl: "owner/repo$(whoami)" }),
			).rejects.toThrow("Invalid repository URL or shorthand");
		});
	});

	describe("Error message quality", () => {
		test("toMarkdown error wraps original error message", async () => {
			await expect(Markdownify.toMarkdown({})).rejects.toThrow(
				"Error processing to Markdown: Either filePath or url must be provided",
			);
		});

		test("get error message clearly states file doesn't exist", async () => {
			await expect(
				Markdownify.get({ filePath: "/nonexistent/path.md" }),
			).rejects.toThrow("File does not exist");
		});

		test("get error message is clear about non-markdown files", async () => {
			// Test with a file that exists but isn't markdown
			const pdfPath = path.join(sampleDataDir, "test.pdf");
			await expect(Markdownify.get({ filePath: pdfPath })).rejects.toThrow(
				"Required file is not a Markdown file.",
			);
		});
	});
});
