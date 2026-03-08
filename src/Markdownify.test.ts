import { expect, test, mock, beforeAll, afterAll } from "bun:test";
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

afterAll(() => {
  // Clean up any temporary files created during tests
  const tempFiles = fs.readdirSync(tempDir);
  tempFiles.forEach((file) => {
    if (file.startsWith("markdown_output_")) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  });
});

test("Markdownify.toMarkdown converts PDF file to Markdown", async () => {
  const pdfPath = path.join(sampleDataDir, "test.pdf");
  const result = await Markdownify.toMarkdown({ filePath: pdfPath });

  expect(result).toBeDefined();
  expect(result.text).toContain("Test PDF content");
});

test("Markdownify.toMarkdown converts DOCX file to Markdown", async () => {
  const docxPath = path.join(sampleDataDir, "test.docx");
  const result = await Markdownify.toMarkdown({ filePath: docxPath });

  expect(result).toBeDefined();
  expect(result.text).toContain("Test DOCX content");
});

test("Markdownify.toMarkdown converts XLSX file to Markdown", async () => {
  const xlsxPath = path.join(sampleDataDir, "test.xlsx");
  const result = await Markdownify.toMarkdown({ filePath: xlsxPath });

  expect(result).toBeDefined();
  expect(result.text).toContain("Test XLSX content");
});

test("Markdownify.toMarkdown converts PPTX file to Markdown", async () => {
  const pptxPath = path.join(sampleDataDir, "test.pptx");
  const result = await Markdownify.toMarkdown({ filePath: pptxPath });

  expect(result).toBeDefined();
  expect(result.text).toContain("Test PPTX content");
});

test("Markdownify.toMarkdown converts image file to Markdown", async () => {
  const imagePath = path.join(sampleDataDir, "test.jpg");
  const result = await Markdownify.toMarkdown({ filePath: imagePath });

  expect(result).toBeDefined();
  // markitdown returns only whitespace for images without LLM vision config
  expect(result.text.trim()).toBe("");
});

test("Markdownify.toMarkdown converts URL content to Markdown", async () => {
  const testUrl = "https://example.com";
  const html = "<h1>Example Domain</h1>";
  const mockFetch = mock(() =>
    Promise.resolve({
      arrayBuffer: () =>
        Promise.resolve(new TextEncoder().encode(html).buffer),
    }),
  );
  global.fetch = mockFetch as any;

  const result = await Markdownify.toMarkdown({ url: testUrl });

  expect(result).toBeDefined();
  expect(result.text).toContain("# Example Domain");
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

test("Markdownify.toMarkdown throws error for non-existent file", async () => {
  const nonExistentPath = path.join(sampleDataDir, "non_existent.pdf");
  await expect(
    Markdownify.toMarkdown({ filePath: nonExistentPath }),
  ).rejects.toThrow();
});

test("Markdownify.toMarkdown throws error when neither filePath nor url is provided", async () => {
  await expect(Markdownify.toMarkdown({})).rejects.toThrow(
    "Either filePath or url must be provided",
  );
});

test("Markdownify.get throws error for non-existent file", async () => {
  const nonExistentPath = path.join(sampleDataDir, "non_existent.md");
  await expect(Markdownify.get({ filePath: nonExistentPath })).rejects.toThrow(
    "File does not exist",
  );
});

test("Markdownify.toMarkdown handles error from _markitdown method", async () => {
  const originalMarkitdown = Markdownify["_markitdown"];
  Markdownify["_markitdown"] = mock(() => {
    throw new Error("Mocked _markitdown error");
  });

  const pdfPath = path.join(sampleDataDir, "test.pdf");
  await expect(Markdownify.toMarkdown({ filePath: pdfPath })).rejects.toThrow(
    "Error processing to Markdown: Mocked _markitdown error",
  );

  Markdownify["_markitdown"] = originalMarkitdown;
});
