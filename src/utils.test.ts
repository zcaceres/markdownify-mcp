import { expect, test, describe } from "bun:test";
import {
  expandHome,
  validateUrl,
  validateRepoUrl,
  isMarkdownFile,
  isWithinDirectory,
} from "./utils";
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
