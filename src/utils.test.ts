import { expect, test, describe } from "bun:test";
import {
  expandHome,
  validateUrl,
  isUnconvertedHtml,
  inferExtensionFromUrl,
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
