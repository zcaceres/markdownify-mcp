import { expect, test, describe, beforeAll } from "bun:test";
import { Markdownify, MarkdownResult } from "./Markdownify";
import fs from "fs";
import path from "path";
import os from "os";

const sampleDataDir = path.join(__dirname, "sample-data");
const tempDir = os.tmpdir();

beforeAll(() => {
  // Ensure the sample data directory exists
  if (!fs.existsSync(sampleDataDir)) {
    throw new Error("Sample data directory not found");
  }
});

test("Markdownify.toMarkdown converts PDF file to Markdown", async () => {
  const pdfPath = path.join(sampleDataDir, "test.pdf");
  const result = await Markdownify.toMarkdown({ filePath: pdfPath });

  expect(result).toBeDefined();
  expect(result.text).toContain("Introduction");
});

test("Markdownify.toMarkdown converts DOCX file to Markdown", async () => {
  const docxPath = path.join(sampleDataDir, "test.docx");
  const result = await Markdownify.toMarkdown({ filePath: docxPath });

  expect(result).toBeDefined();
  expect(result.text).toContain("AutoGen");
});

test("Markdownify.toMarkdown converts XLSX file to Markdown", async () => {
  const xlsxPath = path.join(sampleDataDir, "test.xlsx");
  const result = await Markdownify.toMarkdown({ filePath: xlsxPath });

  expect(result).toBeDefined();
  expect(result.text).toContain("Alpha");
});

test("Markdownify.toMarkdown converts PPTX file to Markdown", async () => {
  const pptxPath = path.join(sampleDataDir, "test.pptx");
  const result = await Markdownify.toMarkdown({ filePath: pptxPath });

  expect(result).toBeDefined();
  expect(result.text).toContain("AutoGen");
});

test("Markdownify.toMarkdown converts image file to Markdown", async () => {
  const imagePath = path.join(sampleDataDir, "test.jpg");
  const result = await Markdownify.toMarkdown({ filePath: imagePath });

  expect(result).toBeDefined();
  // markitdown returns metadata for images (exif data if available)
  expect(typeof result.text).toBe("string");
});

test("Markdownify.toMarkdown throws error when neither filePath nor url is provided", async () => {
  await expect(Markdownify.toMarkdown({})).rejects.toThrow(
    "Either filePath or url must be provided",
  );
});

test("Markdownify.toMarkdown throws error for non-existent file", async () => {
  const nonExistentPath = path.join(sampleDataDir, "non_existent.pdf");
  await expect(
    Markdownify.toMarkdown({ filePath: nonExistentPath }),
  ).rejects.toThrow();
});

test("Markdownify.get retrieves existing Markdown file", async () => {
  const mdContent = "# Test Markdown\nThis is a test.";
  const tempFilePath = path.join(tempDir, "test_get.md");
  fs.writeFileSync(tempFilePath, mdContent);

  const result = await Markdownify.get({ filePath: tempFilePath });

  expect(result).toBeDefined();
  expect(result.path).toBe(tempFilePath);
  expect(result.text).toBe(mdContent);

  fs.unlinkSync(tempFilePath);
});

test("Markdownify.get throws error for non-existent file", async () => {
  const nonExistentPath = path.join(sampleDataDir, "non_existent.md");
  await expect(Markdownify.get({ filePath: nonExistentPath })).rejects.toThrow(
    "File does not exist",
  );
});

test("Markdownify.fromRepo converts a git repo to markdown via shorthand", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "octocat/Hello-World",
  });

  expect(result).toBeDefined();
  expect(result.text).toContain("File: README");
  expect(result.text).toContain("Hello World!");
}, 60_000);

test("Markdownify.fromRepo works with full GitHub URL", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "https://github.com/octocat/Hello-World",
  });

  expect(result).toBeDefined();
  expect(result.text).toContain("README");
}, 60_000);

test("Markdownify.fromRepo supports branch parameter", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "octocat/Hello-World",
    branch: "master",
  });

  expect(result).toBeDefined();
  expect(result.text).toContain("README");
}, 60_000);

test("Markdownify.fromRepo supports compress parameter", async () => {
  const normal = await Markdownify.fromRepo({
    repoUrl: "octocat/Hello-World",
  });
  const compressed = await Markdownify.fromRepo({
    repoUrl: "octocat/Hello-World",
    compress: true,
  });

  expect(compressed).toBeDefined();
  expect(compressed.text).toBeTruthy();
  // Compressed output should differ from normal (may be shorter or structured differently)
  expect(compressed.text).not.toEqual(normal.text);
}, 120_000);

test("Markdownify.fromRepo throws error for invalid repo", async () => {
  await expect(
    Markdownify.fromRepo({ repoUrl: "not-a-real-owner/not-a-real-repo-xyz" }),
  ).rejects.toThrow();
}, 30_000);

test("Markdownify.fromRepo rejects empty URL", async () => {
  await expect(
    Markdownify.fromRepo({ repoUrl: "" }),
  ).rejects.toThrow("Repository URL is required");
});

test("Markdownify.fromRepo rejects file:// URLs", async () => {
  await expect(
    Markdownify.fromRepo({ repoUrl: "file:///etc/passwd" }),
  ).rejects.toThrow("Only http: and https: repository URLs are allowed");
});

test("Markdownify.fromRepo rejects shell metacharacters in URL", async () => {
  await expect(
    Markdownify.fromRepo({ repoUrl: "owner/repo; rm -rf /" }),
  ).rejects.toThrow("Invalid repository URL or shorthand");
});

// Integration tests against diverse real repositories
test("Markdownify.fromRepo handles a TypeScript repo (sindresorhus/is)", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "sindresorhus/is",
  });

  expect(result).toBeDefined();
  expect(result.text.length).toBeGreaterThan(1000);
  expect(result.text).toContain("package.json");
  expect(result.text).toContain("tsconfig");
}, 120_000);

test("Markdownify.fromRepo handles a Python repo (pallets/click)", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "pallets/click",
  });

  expect(result).toBeDefined();
  expect(result.text.length).toBeGreaterThan(1000);
  expect(result.text).toContain(".py");
}, 120_000);

test("Markdownify.fromRepo handles a Rust repo (BurntSushi/ripgrep)", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "BurntSushi/ripgrep",
  });

  expect(result).toBeDefined();
  expect(result.text.length).toBeGreaterThan(5000);
  expect(result.text).toContain("Cargo.toml");
}, 120_000);

test("Markdownify.fromRepo handles a Go repo (junegunn/fzf)", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "junegunn/fzf",
  });

  expect(result).toBeDefined();
  expect(result.text.length).toBeGreaterThan(5000);
  expect(result.text).toContain("go.mod");
}, 120_000);

test("Markdownify.fromRepo handles full GitLab-style HTTPS URL", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "https://github.com/kelseyhightower/nocode",
  });

  expect(result).toBeDefined();
  expect(result.text).toContain("README");
}, 60_000);

test("Markdownify.fromRepo handles a specific tag via branch param", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "sindresorhus/is",
    branch: "v6.0.0",
  });

  expect(result).toBeDefined();
  expect(result.text).toContain("package.json");
}, 120_000);

test("Markdownify.fromRepo compress works on a multi-file repo", async () => {
  const result = await Markdownify.fromRepo({
    repoUrl: "sindresorhus/is",
    compress: true,
  });

  expect(result).toBeDefined();
  expect(result.text.length).toBeGreaterThan(500);
}, 120_000);

// ============================================================
// Regression tests for Python → TypeScript markitdown swap
// ============================================================

describe("output quality: file conversions produce real markdown", () => {
  test("PDF output contains markdown structure, not raw text dump", async () => {
    const pdfPath = path.join(sampleDataDir, "test.pdf");
    const result = await Markdownify.toMarkdown({ filePath: pdfPath });

    expect(result.text.length).toBeGreaterThan(100);
    // Should not be empty or whitespace-only
    expect(result.text.trim().length).toBeGreaterThan(0);
    // Should not contain raw HTML
    expect(result.text).not.toMatch(/^<!DOCTYPE/i);
    expect(result.text).not.toMatch(/^<html/i);
  });

  test("DOCX output contains markdown formatting", async () => {
    const docxPath = path.join(sampleDataDir, "test.docx");
    const result = await Markdownify.toMarkdown({ filePath: docxPath });

    expect(result.text.length).toBeGreaterThan(100);
    // Should contain markdown heading or bold markers
    expect(result.text).toMatch(/#{1,6}\s|(\*\*.*\*\*)/);
    // Should not be raw HTML
    expect(result.text).not.toMatch(/^<!DOCTYPE/i);
    expect(result.text).not.toMatch(/^<html/i);
  });

  test("XLSX output contains markdown table", async () => {
    const xlsxPath = path.join(sampleDataDir, "test.xlsx");
    const result = await Markdownify.toMarkdown({ filePath: xlsxPath });

    expect(result.text.length).toBeGreaterThan(50);
    // Should contain pipe-delimited table rows
    expect(result.text).toContain("|");
    expect(result.text).toContain("---");
  });

  test("PPTX output contains slide markers or headings", async () => {
    const pptxPath = path.join(sampleDataDir, "test.pptx");
    const result = await Markdownify.toMarkdown({ filePath: pptxPath });

    expect(result.text.length).toBeGreaterThan(100);
    // Should contain slide comments or headings
    expect(result.text).toMatch(/<!-- Slide|#{1,6}\s/);
  });
});

describe("URL-based conversions", () => {
  test("converts a webpage URL to markdown", async () => {
    const result = await Markdownify.toMarkdown({
      url: "https://example.com",
    });

    expect(result).toBeDefined();
    expect(result.text).toContain("Example Domain");
    // Output should be markdown, not raw HTML
    expect(result.text).not.toMatch(/^<!DOCTYPE/i);
    expect(result.text).not.toMatch(/^<html/i);
  }, 15_000);

  test("converts an HTML page and produces markdown headings", async () => {
    const result = await Markdownify.toMarkdown({
      url: "https://example.com",
    });

    // Should have converted <h1> to markdown heading
    expect(result.text).toMatch(/#{1,6}\s.*Example Domain/);
  }, 15_000);
});

describe("SSRF protection on URL path", () => {
  test("rejects private IP addresses", async () => {
    await expect(
      Markdownify.toMarkdown({ url: "http://192.168.1.1" }),
    ).rejects.toThrow("potentially dangerous");
  });

  test("rejects localhost", async () => {
    await expect(
      Markdownify.toMarkdown({ url: "http://127.0.0.1" }),
    ).rejects.toThrow("potentially dangerous");
  });

  test("rejects link-local metadata endpoint", async () => {
    await expect(
      Markdownify.toMarkdown({ url: "http://169.254.169.254/latest/meta-data/" }),
    ).rejects.toThrow("potentially dangerous");
  });

  test("rejects file:// scheme", async () => {
    await expect(
      Markdownify.toMarkdown({ url: "file:///etc/passwd" }),
    ).rejects.toThrow("Only http: and https: schemes are allowed");
  });

  test("rejects ftp:// scheme", async () => {
    await expect(
      Markdownify.toMarkdown({ url: "ftp://example.com/file" }),
    ).rejects.toThrow("Only http: and https: schemes are allowed");
  });
});

describe("error handling", () => {
  test("errors are wrapped with 'Error processing to Markdown' prefix", async () => {
    await expect(
      Markdownify.toMarkdown({ filePath: "/nonexistent/path/file.pdf" }),
    ).rejects.toThrow(/^Error processing to Markdown:/);
  });

  test("unsupported file extension produces a wrapped error", async () => {
    const tempFile = path.join(tempDir, "test_unsupported.xyz123");
    fs.writeFileSync(tempFile, "some random content");

    try {
      await expect(
        Markdownify.toMarkdown({ filePath: tempFile }),
      ).rejects.toThrow(/^Error processing to Markdown:/);
    } finally {
      fs.unlinkSync(tempFile);
    }
  });

  test("invalid URL produces a wrapped error", async () => {
    await expect(
      Markdownify.toMarkdown({ url: "not-a-url" }),
    ).rejects.toThrow(/^Error processing to Markdown:/);
  });
});

describe("HTML is converted, not passed through", () => {
  test("an HTML file on disk is converted to markdown", async () => {
    const tempHtml = path.join(tempDir, "test_html_conversion.html");
    fs.writeFileSync(
      tempHtml,
      `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Main Heading</h1>
  <p>This is a paragraph with <strong>bold text</strong> and <em>italic text</em>.</p>
  <ul>
    <li>Item one</li>
    <li>Item two</li>
  </ul>
</body>
</html>`,
    );

    try {
      const result = await Markdownify.toMarkdown({ filePath: tempHtml });

      // Should be converted to markdown, not returned as raw HTML
      expect(result.text).not.toContain("<!DOCTYPE");
      expect(result.text).not.toContain("<html");
      expect(result.text).not.toContain("<body");

      // Should contain markdown equivalents
      expect(result.text).toContain("Main Heading");
      expect(result.text).toMatch(/\*\*bold text\*\*/);
      expect(result.text).toMatch(/\*italic text\*/);
    } finally {
      fs.unlinkSync(tempHtml);
    }
  });
});
