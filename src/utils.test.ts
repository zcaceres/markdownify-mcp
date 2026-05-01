import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import {
  expandHome,
  validateUrl,
  validateRepoUrl,
  isUnconvertedHtml,
  inferExtensionFromUrl,
  isMarkdownFile,
  isWithinDirectory,
  resolveMarkitdownPath,
  resolveRepomixPath,
  getAllowedPaths,
  assertPathAllowed,
} from "./utils";
import fs from "fs";
import os from "os";
import path from "path";

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

  test("throws on invalid URLs", () => {
    expect(() => validateUrl("not-a-url")).toThrow();
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

  test("returns html for non-pdf URLs", () => {
    expect(inferExtensionFromUrl("https://example.com/page")).toBe("html");
  });

  test("returns html for .html URLs", () => {
    expect(inferExtensionFromUrl("https://example.com/page.html")).toBe("html");
  });
});

describe("isMarkdownFile", () => {
  test("accepts .md files", () => {
    expect(isMarkdownFile("/path/to/file.md")).toBe(true);
  });

  test("accepts .markdown files", () => {
    expect(isMarkdownFile("/path/to/file.markdown")).toBe(true);
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
    expect(isWithinDirectory("/home/user/docs/file.md", "/home/user/docs")).toBe(
      true,
    );
  });

  test("returns true for file in subdirectory", () => {
    expect(
      isWithinDirectory("/home/user/docs/sub/file.md", "/home/user/docs"),
    ).toBe(true);
  });

  test("returns false for file outside directory", () => {
    expect(isWithinDirectory("/home/user/other/file.md", "/home/user/docs")).toBe(
      false,
    );
  });

  test("returns false for path traversal attempt", () => {
    expect(
      isWithinDirectory("/home/user/docs/../other/file.md", "/home/user/docs"),
    ).toBe(false);
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
    const expected = path.join(
      binDir,
      `markitdown${isWin ? ".exe" : ""}`,
    );
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

  test("falls back to MD_SHARE_DIR for backward compatibility", () => {
    process.env.MD_SHARE_DIR = "/tmp/legacy";
    expect(getAllowedPaths()).toEqual([path.resolve("/tmp/legacy")]);
  });

  test("MD_ALLOWED_PATHS takes precedence over MD_SHARE_DIR", () => {
    process.env.MD_ALLOWED_PATHS = "/tmp/new";
    process.env.MD_SHARE_DIR = "/tmp/legacy";
    expect(getAllowedPaths()).toEqual([path.resolve("/tmp/new")]);
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
    expect(() =>
      assertPathAllowed("/tmp/allowed/sub/file.pdf"),
    ).not.toThrow();
  });

  test("assertPathAllowed rejects files outside allowed dirs", () => {
    process.env.MD_ALLOWED_PATHS = "/tmp/allowed";
    expect(() => assertPathAllowed("/etc/passwd")).toThrow(
      "outside the allowed directories",
    );
  });

  test("assertPathAllowed rejects path traversal escapes", () => {
    process.env.MD_ALLOWED_PATHS = "/tmp/allowed";
    expect(() =>
      assertPathAllowed("/tmp/allowed/../etc/passwd"),
    ).toThrow("outside the allowed directories");
  });
});
