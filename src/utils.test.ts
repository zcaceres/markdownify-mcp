import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	assertPathAllowed,
	expandHome,
	getAllowedPaths,
	inferExtensionFromUrl,
	isMarkdownFile,
	isPrivateOrReservedIp,
	isUnconvertedHtml,
	isWithinDirectory,
	resolveMarkitdownPath,
	resolveRepomixPath,
	shouldPassUrlToMarkitdown,
	validateBranchName,
	validateRepoUrl,
	validateUrl,
	validateUrlDestination,
} from "./utils";

describe("expandHome", () => {
	test("expands ~/path to home directory", () => {
		const result = expandHome("~/documents");
		expect(result).toBe(path.join(os.homedir(), "documents"));
	});

	test("expands lone ~ to home directory", () => {
		const result = expandHome("~");
		expect(result).toBe(os.homedir());
	});

	test("does not expand paths without tilde", () => {
		expect(expandHome("/usr/local")).toBe("/usr/local");
	});

	test("does not expand tilde in the middle of a path", () => {
		expect(expandHome("/usr/~/local")).toBe("/usr/~/local");
	});
});

describe("validateUrl", () => {
	test("accepts http URLs", () => {
		expect(() => validateUrl("http://example.com")).not.toThrow();
	});

	test("accepts https URLs", () => {
		expect(() => validateUrl("https://example.com")).not.toThrow();
	});

	test("rejects ftp URLs", () => {
		expect(() => validateUrl("ftp://example.com")).toThrow(
			"Only http: and https: schemes are allowed.",
		);
	});

	test("rejects file URLs", () => {
		expect(() => validateUrl("file:///etc/passwd")).toThrow(
			"Only http: and https: schemes are allowed.",
		);
	});

	test("rejects private IP addresses", () => {
		expect(() => validateUrl("http://192.168.1.1")).toThrow(
			"potentially dangerous",
		);
	});

	test("rejects localhost", () => {
		expect(() => validateUrl("http://127.0.0.1")).toThrow(
			"potentially dangerous",
		);
	});

	test("rejects link-local addresses", () => {
		expect(() => validateUrl("http://169.254.169.254")).toThrow(
			"potentially dangerous",
		);
	});

	test("rejects localhost and internal hostnames", () => {
		for (const url of [
			"http://localhost/admin",
			"http://localhost.:8080/admin",
			"http://sub.localhost/admin",
			"http://LOCALHOST./",
			"http://metadata.google.internal/computeMetadata/v1/",
			"http://host.docker.internal/",
			"http://printer.local/",
		]) {
			expect(() => validateUrl(url)).toThrow("potentially dangerous");
		}
	});

	test("rejects bracketed IPv6, hex IPv4-mapped IPv6, multicast, and NAT64", () => {
		for (const url of [
			"http://[::1]:8080/metadata",
			"http://[::]/",
			"http://[fc00::1]/",
			"http://[fe80::1]/",
			"http://[::ffff:127.0.0.1]/",
			"http://[::ffff:7f00:1]/",
			"http://[::ffff:a9fe:a9fe]/latest/meta-data/",
			"http://[0:0:0:0:0:ffff:7f00:1]/",
			"http://[64:ff9b::127.0.0.1]/",
			"http://[64:ff9b::7f00:1]/",
			"http://0.0.0.0/",
			"http://100.64.0.1/",
			"http://224.0.0.1/",
		]) {
			expect(() => validateUrl(url)).toThrow("potentially dangerous");
		}
	});

	test("accepts public IPv4 and IPv6 literals", () => {
		expect(() => validateUrl("https://93.184.216.34/doc")).not.toThrow();
		expect(() =>
			validateUrl("https://[2606:2800:220:1:248:1893:25c8:1946]/"),
		).not.toThrow();
	});

	test("throws on invalid URLs", () => {
		expect(() => validateUrl("not-a-url")).toThrow();
	});
});

describe("isPrivateOrReservedIp", () => {
	test("classifies private and public IPs accurately", () => {
		expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
		expect(isPrivateOrReservedIp("::ffff:7f00:1")).toBe(true);
		expect(isPrivateOrReservedIp("fe80::1%eth0")).toBe(true);
		expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false);
		expect(isPrivateOrReservedIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(
			false,
		);
	});
});

describe("validateUrlDestination", () => {
	test("accepts hostnames resolving to public addresses", async () => {
		await expect(
			validateUrlDestination("https://public.example", async () => [
				{ address: "93.184.216.34", family: 4 },
			]),
		).resolves.toBeUndefined();
	});

	test("rejects hostnames resolving to private, loopback, or metadata IPs", async () => {
		for (const addr of [
			{ address: "127.0.0.1", family: 4 },
			{ address: "10.0.0.10", family: 4 },
			{ address: "169.254.169.254", family: 4 },
			{ address: "::1", family: 6 },
			{ address: "::ffff:7f00:1", family: 6 },
		]) {
			await expect(
				validateUrlDestination("https://rebind.example", async () => [addr]),
			).rejects.toThrow("potentially dangerous");
		}
	});

	test("rejects when any resolved address in a multi-record response is private", async () => {
		await expect(
			validateUrlDestination("https://dual.example", async () => [
				{ address: "93.184.216.34", family: 4 },
				{ address: "::1", family: 6 },
			]),
		).rejects.toThrow("potentially dangerous");
	});

	test("fails closed when DNS resolution throws or returns no addresses", async () => {
		await expect(
			validateUrlDestination("https://missing.example", async () => {
				throw new Error("ENOTFOUND");
			}),
		).rejects.toThrow("Could not resolve host");
		await expect(
			validateUrlDestination("https://empty.example", async () => []),
		).rejects.toThrow("Could not resolve host");
	});
});

describe("isUnconvertedHtml", () => {
	test("detects DOCTYPE html", () => {
		expect(isUnconvertedHtml("<!DOCTYPE html><html>...</html>")).toBe(true);
	});

	test("detects html tag", () => {
		expect(isUnconvertedHtml("<html lang='en'>...</html>")).toBe(true);
	});

	test("detects html with leading whitespace", () => {
		expect(isUnconvertedHtml("  \n<!DOCTYPE html>")).toBe(true);
	});

	test("returns false for markdown content", () => {
		expect(isUnconvertedHtml("# Hello World\n\nSome text")).toBe(false);
	});

	test("returns false for empty string", () => {
		expect(isUnconvertedHtml("")).toBe(false);
	});

	test("returns false for plain text", () => {
		expect(isUnconvertedHtml("Just some plain text")).toBe(false);
	});
});

describe("inferExtensionFromUrl", () => {
	test("returns pdf for .pdf URLs", () => {
		expect(inferExtensionFromUrl("https://example.com/doc.pdf")).toBe("pdf");
	});

	test("returns pdf for .pdf URLs with query string or fragment", () => {
		expect(
			inferExtensionFromUrl("https://example.com/doc.pdf?utm_source=x"),
		).toBe("pdf");
		expect(inferExtensionFromUrl("https://example.com/doc.pdf#page=2")).toBe(
			"pdf",
		);
		expect(
			inferExtensionFromUrl("https://example.com/DOC.PDF?v=2#section"),
		).toBe("pdf");
	});

	test("returns html for non-pdf URLs", () => {
		expect(inferExtensionFromUrl("https://example.com/page")).toBe("html");
	});

	test("returns html for .html URLs", () => {
		expect(inferExtensionFromUrl("https://example.com/page.html")).toBe("html");
	});
});

describe("shouldPassUrlToMarkitdown", () => {
	test("accepts a canonical YouTube watch URL", () => {
		expect(
			shouldPassUrlToMarkitdown("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
		).toBe(true);
	});

	test("accepts a YouTube watch URL with extra query params", () => {
		expect(
			shouldPassUrlToMarkitdown(
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
			),
		).toBe(true);
	});

	test("rejects a YouTube watch URL with no video id", () => {
		expect(shouldPassUrlToMarkitdown("https://www.youtube.com/watch")).toBe(
			false,
		);
	});

	test("rejects non-watch YouTube paths", () => {
		expect(
			shouldPassUrlToMarkitdown("https://www.youtube.com/@somechannel"),
		).toBe(false);
	});

	test("rejects unresolved youtu.be short links", () => {
		expect(shouldPassUrlToMarkitdown("https://youtu.be/dQw4w9WgXcQ")).toBe(
			false,
		);
	});

	test("accepts a Bing SERP URL", () => {
		expect(
			shouldPassUrlToMarkitdown("https://www.bing.com/search?q=markitdown"),
		).toBe(true);
	});

	test("rejects a Bing URL that is not a search", () => {
		expect(shouldPassUrlToMarkitdown("https://www.bing.com/images")).toBe(
			false,
		);
	});

	test("rejects Wikipedia despite markitdown having a converter for it", () => {
		expect(
			shouldPassUrlToMarkitdown("https://en.wikipedia.org/wiki/Markdown"),
		).toBe(false);
	});

	test("rejects arbitrary hosts and non-https URLs", () => {
		expect(shouldPassUrlToMarkitdown("https://example.com/page")).toBe(false);
		expect(
			shouldPassUrlToMarkitdown("http://www.youtube.com/watch?v=dQw4w9WgXcQ"),
		).toBe(false);
	});

	test("rejects lookalike hosts that merely contain an allowed domain", () => {
		expect(
			shouldPassUrlToMarkitdown(
				"https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
			),
		).toBe(false);
		expect(
			shouldPassUrlToMarkitdown(
				"https://evil-www.youtube.com/watch?v=dQw4w9WgXcQ",
			),
		).toBe(false);
	});

	test("returns false for malformed URLs", () => {
		expect(shouldPassUrlToMarkitdown("not a url")).toBe(false);
	});
});

describe("isMarkdownFile", () => {
	test("accepts .md files", () => {
		expect(isMarkdownFile("/path/to/file.md")).toBe(true);
	});

	test("accepts .markdown files", () => {
		expect(isMarkdownFile("/path/to/file.markdown")).toBe(true);
	});

	test("accepts .md and .markdown case-insensitively (D8)", () => {
		expect(isMarkdownFile("/path/to/README.MD")).toBe(true);
		expect(isMarkdownFile("/path/to/Guide.Markdown")).toBe(true);
		expect(isMarkdownFile("/path/to/NOTES.MARKDOWN")).toBe(true);
	});

	test("rejects .txt files", () => {
		expect(isMarkdownFile("/path/to/file.txt")).toBe(false);
	});

	test("rejects .pdf files", () => {
		expect(isMarkdownFile("/path/to/file.pdf")).toBe(false);
	});

	test("rejects files without extension", () => {
		expect(isMarkdownFile("/path/to/file")).toBe(false);
	});
});

describe("isWithinDirectory", () => {
	test("returns true for file inside directory", () => {
		expect(
			isWithinDirectory("/home/user/docs/file.md", "/home/user/docs"),
		).toBe(true);
	});

	test("returns true for file in subdirectory", () => {
		expect(
			isWithinDirectory("/home/user/docs/sub/file.md", "/home/user/docs"),
		).toBe(true);
	});

	test("returns false for file outside directory", () => {
		expect(
			isWithinDirectory("/home/user/other/file.md", "/home/user/docs"),
		).toBe(false);
	});

	test("returns false for path traversal attempt", () => {
		expect(
			isWithinDirectory("/home/user/docs/../other/file.md", "/home/user/docs"),
		).toBe(false);
	});

	test("returns false for sibling directory with shared prefix", () => {
		expect(
			isWithinDirectory("/home/user/docs-evil/file.md", "/home/user/docs"),
		).toBe(false);
	});

	test("returns true for the directory itself and root directory", () => {
		expect(isWithinDirectory("/home/user/docs", "/home/user/docs")).toBe(true);
		expect(isWithinDirectory("/etc/passwd", "/")).toBe(true);
	});

	test("returns true for filenames starting with double dots inside directory", () => {
		expect(
			isWithinDirectory("/home/user/docs/..notes.md", "/home/user/docs"),
		).toBe(true);
	});
});

describe("validateRepoUrl", () => {
	test("accepts GitHub shorthand", () => {
		expect(() => validateRepoUrl("octocat/Hello-World")).not.toThrow();
	});

	test("accepts full GitHub URL", () => {
		expect(() =>
			validateRepoUrl("https://github.com/octocat/Hello-World"),
		).not.toThrow();
	});

	test("rejects empty string", () => {
		expect(() => validateRepoUrl("")).toThrow("Repository URL is required");
	});

	test("rejects whitespace-only string", () => {
		expect(() => validateRepoUrl("   ")).toThrow("Repository URL is required");
	});

	test("rejects shell metacharacters", () => {
		expect(() => validateRepoUrl("owner/repo; rm -rf /")).toThrow(
			"Invalid repository URL or shorthand",
		);
	});

	test("rejects flag injection", () => {
		expect(() => validateRepoUrl("--help")).toThrow(
			"Invalid repository URL or shorthand",
		);
	});

	test("rejects file:// URLs", () => {
		expect(() => validateRepoUrl("file:///etc/passwd")).toThrow(
			"Only http: and https: repository URLs are allowed",
		);
	});

	test("rejects ssh:// URLs", () => {
		expect(() => validateRepoUrl("ssh://git@github.com/owner/repo")).toThrow(
			"Only http: and https: repository URLs are allowed",
		);
	});

	test("rejects scp-style SSH shorthand with or without user", () => {
		for (const repo of [
			"git@github.com:owner/repo.git",
			"git@192.168.1.5:owner/repo.git",
			"internal-host:owner/repo.git",
			"github.com:octocat/Hello-World",
		]) {
			expect(() => validateRepoUrl(repo)).toThrow("scp-style SSH syntax");
		}
	});

	test("rejects private IP and localhost repository URLs", () => {
		for (const repo of [
			"http://127.0.0.1/owner/repo",
			"http://169.254.169.254/owner/repo",
			"http://[::1]/owner/repo",
			"http://localhost/owner/repo",
		]) {
			expect(() => validateRepoUrl(repo)).toThrow("potentially dangerous");
		}
	});
});

describe("validateBranchName", () => {
	test("accepts valid branch names, tags, and commit SHAs", () => {
		for (const branch of [
			"main",
			"master",
			"v6.0.0",
			"feat/my-branch_1",
			"release/2026.11",
			"024f97c",
		]) {
			expect(() => validateBranchName(branch)).not.toThrow();
		}
	});

	test("rejects leading hyphens and unsafe ref syntax", () => {
		for (const branch of [
			"",
			"   ",
			"--upload-pack=id",
			"--config=evil.json",
			"-u",
			"main..other",
			"main@{0}",
			"branch.lock",
			"main; rm -rf /",
			"branch with space",
		]) {
			expect(() => validateBranchName(branch)).toThrow("Invalid branch name");
		}
	});
});

describe("resolveMarkitdownPath", () => {
	const savedEnv = process.env.MARKITDOWN_PATH;

	afterEach(() => {
		if (savedEnv === undefined) delete process.env.MARKITDOWN_PATH;
		else process.env.MARKITDOWN_PATH = savedEnv;
	});

	test("honors MARKITDOWN_PATH env var", () => {
		process.env.MARKITDOWN_PATH = "/opt/markitdown/bin/markitdown";
		expect(resolveMarkitdownPath("/anywhere")).toBe(
			"/opt/markitdown/bin/markitdown",
		);
	});

	test("falls back to PATH lookup when no venv exists", () => {
		delete process.env.MARKITDOWN_PATH;
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdfy-"));
		try {
			expect(resolveMarkitdownPath(tmp)).toBe("markitdown");
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("uses project venv when present", () => {
		delete process.env.MARKITDOWN_PATH;
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdfy-"));
		const isWin = process.platform === "win32";
		const binDir = path.join(tmp, ".venv", isWin ? "Scripts" : "bin");
		fs.mkdirSync(binDir, { recursive: true });
		const expected = path.join(binDir, `markitdown${isWin ? ".exe" : ""}`);
		fs.writeFileSync(expected, "");
		try {
			expect(resolveMarkitdownPath(tmp)).toBe(expected);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});

describe("resolveRepomixPath", () => {
	const savedEnv = process.env.REPOMIX_PATH;

	afterEach(() => {
		if (savedEnv === undefined) delete process.env.REPOMIX_PATH;
		else process.env.REPOMIX_PATH = savedEnv;
	});

	test("honors REPOMIX_PATH env var", () => {
		process.env.REPOMIX_PATH = "/opt/repomix/bin/repomix";
		expect(resolveRepomixPath("/anywhere")).toBe("/opt/repomix/bin/repomix");
	});

	test("falls back to PATH lookup when bundled not present", () => {
		delete process.env.REPOMIX_PATH;
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdfy-"));
		try {
			expect(resolveRepomixPath(tmp)).toBe("repomix");
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});

describe("getAllowedPaths / assertPathAllowed", () => {
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

	test("returns null when no env var set (unrestricted)", () => {
		expect(getAllowedPaths()).toBeNull();
	});

	test("parses MD_ALLOWED_PATHS as delimiter-separated list", () => {
		process.env.MD_ALLOWED_PATHS = ["/tmp/a", "/tmp/b"].join(path.delimiter);
		const allowed = getAllowedPaths();
		expect(allowed).toEqual(["/tmp/a", "/tmp/b"].map((p) => path.resolve(p)));
	});

	test("ignores removed MD_SHARE_DIR env var (D23)", () => {
		process.env.MD_SHARE_DIR = "/tmp/legacy";
		expect(getAllowedPaths()).toBeNull();
	});

	test("throws when MD_ALLOWED_PATHS is explicitly set to empty or delimiter-only value (D24)", () => {
		process.env.MD_ALLOWED_PATHS = "";
		expect(() => getAllowedPaths()).toThrow(
			"MD_ALLOWED_PATHS is set but contains no valid directories",
		);
		process.env.MD_ALLOWED_PATHS = `${path.delimiter}   ${path.delimiter}`;
		expect(() => assertPathAllowed("/tmp/file.pdf")).toThrow(
			"MD_ALLOWED_PATHS is set but contains no valid directories",
		);
	});

	test("expands ~ in allowed paths", () => {
		process.env.MD_ALLOWED_PATHS = "~/docs";
		expect(getAllowedPaths()).toEqual([path.join(os.homedir(), "docs")]);
	});

	test("ignores empty entries", () => {
		process.env.MD_ALLOWED_PATHS = `/tmp/a${path.delimiter}${path.delimiter}/tmp/b`;
		expect(getAllowedPaths()?.length).toBe(2);
	});

	test("assertPathAllowed is no-op when unrestricted", () => {
		expect(() => assertPathAllowed("/etc/passwd")).not.toThrow();
	});

	test("assertPathAllowed permits files inside an allowed dir", () => {
		process.env.MD_ALLOWED_PATHS = "/tmp/allowed";
		expect(() => assertPathAllowed("/tmp/allowed/sub/file.pdf")).not.toThrow();
	});

	test("assertPathAllowed rejects files outside allowed dirs", () => {
		process.env.MD_ALLOWED_PATHS = "/tmp/allowed";
		expect(() => assertPathAllowed("/etc/passwd")).toThrow(
			"outside the allowed directories",
		);
	});

	test("assertPathAllowed rejects path traversal escapes", () => {
		process.env.MD_ALLOWED_PATHS = "/tmp/allowed";
		expect(() => assertPathAllowed("/tmp/allowed/../etc/passwd")).toThrow(
			"outside the allowed directories",
		);
	});

	test("assertPathAllowed rejects sibling directory with shared prefix", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdfy-prefix-"));
		try {
			const allowed = path.join(tmp, "share");
			const evilSibling = path.join(tmp, "share-evil");
			fs.mkdirSync(allowed);
			fs.mkdirSync(evilSibling);
			const secret = path.join(evilSibling, "secret.txt");
			fs.writeFileSync(secret, "top secret");
			process.env.MD_ALLOWED_PATHS = allowed;
			expect(() => assertPathAllowed(secret)).toThrow(
				"outside the allowed directories",
			);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("assertPathAllowed rejects symlink inside allowed dir that escapes", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdfy-symlink-"));
		try {
			const allowed = path.join(tmp, "allowed");
			const outside = path.join(tmp, "outside");
			fs.mkdirSync(allowed);
			fs.mkdirSync(outside);
			const secret = path.join(outside, "secret.txt");
			fs.writeFileSync(secret, "top secret");
			const link = path.join(allowed, "link.txt");
			fs.symlinkSync(secret, link);
			process.env.MD_ALLOWED_PATHS = allowed;
			expect(() => assertPathAllowed(link)).toThrow(
				"outside the allowed directories",
			);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("assertPathAllowed permits regular file inside allowed dir after realpath", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdfy-happy-"));
		try {
			const allowed = path.join(tmp, "allowed");
			fs.mkdirSync(allowed);
			const file = path.join(allowed, "doc.pdf");
			fs.writeFileSync(file, "%PDF-1.4");
			process.env.MD_ALLOWED_PATHS = allowed;
			expect(() => assertPathAllowed(file)).not.toThrow();
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
