import { expect, test, describe } from "bun:test";
import * as tools from "./tools";

// Collect all tools exported from tools.ts
const allTools = Object.values(tools).filter(
  (t): t is (typeof tools)[keyof typeof tools] =>
    typeof t === "object" && t !== null && "name" in t && "inputSchema" in t,
);

describe("Tool Definitions", () => {
  describe("Schema Completeness", () => {
    test("all 11 tools are exported", () => {
      expect(allTools.length).toBe(11);
    });

    test("every tool has a unique name", () => {
      const names = allTools.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    test("every tool has a description", () => {
      for (const tool of allTools) {
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe("string");
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });

    test("every tool has an inputSchema of type object", () => {
      for (const tool of allTools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    test("every tool has annotations", () => {
      for (const tool of allTools) {
        expect(tool.annotations).toBeDefined();
        expect(tool.annotations.title).toBeDefined();
        expect(tool.annotations.readOnlyHint).toBe(true);
      }
    });
  });

  describe("Input Schema Consistency", () => {
    test("file-based tools require filepath", () => {
      const fileTools = [
        "pdf-to-markdown",
        "docx-to-markdown",
        "xlsx-to-markdown",
        "pptx-to-markdown",
        "image-to-markdown",
        "audio-to-markdown",
      ];
      for (const name of fileTools) {
        const tool = allTools.find((t) => t.name === name);
        expect(tool).toBeDefined();
        expect(tool!.inputSchema.required).toContain("filepath");
        expect(tool!.inputSchema.properties.filepath).toBeDefined();
        expect(tool!.inputSchema.properties.filepath.type).toBe("string");
      }
    });

    test("url-based tools require url", () => {
      const urlTools = [
        "webpage-to-markdown",
        "youtube-to-markdown",
        "bing-search-to-markdown",
        "git-repo-to-markdown",
      ];
      for (const name of urlTools) {
        const tool = allTools.find((t) => t.name === name);
        expect(tool).toBeDefined();
        expect(tool!.inputSchema.required).toContain("url");
        expect(tool!.inputSchema.properties.url).toBeDefined();
        expect(tool!.inputSchema.properties.url.type).toBe("string");
      }
    });

    test("file-based tools have NO url property", () => {
      const fileToolNames = [
        "pdf-to-markdown",
        "docx-to-markdown",
        "xlsx-to-markdown",
        "pptx-to-markdown",
        "image-to-markdown",
        "audio-to-markdown",
        "get-markdown-file",
      ];
      for (const name of fileToolNames) {
        const tool = allTools.find((t) => t.name === name);
        expect(tool).toBeDefined();
        // File tools should NOT have a url property in their schema
        const hasUrl = "url" in tool!.inputSchema.properties;
        expect(hasUrl).toBe(false);
      }
    });

    test("url-based tools have NO filepath property", () => {
      const urlToolNames = [
        "webpage-to-markdown",
        "youtube-to-markdown",
        "bing-search-to-markdown",
      ];
      for (const name of urlToolNames) {
        const tool = allTools.find((t) => t.name === name);
        expect(tool).toBeDefined();
        const hasFilepath = "filepath" in tool!.inputSchema.properties;
        expect(hasFilepath).toBe(false);
      }
    });
  });

  describe("Tool Name Conventions", () => {
    test("all tool names follow kebab-case convention", () => {
      const kebabPattern = /^[a-z]+(-[a-z]+)*$/;
      for (const tool of allTools) {
        expect(tool.name).toMatch(kebabPattern);
      }
    });

    test("all tool names end with '-to-markdown' or are 'get-markdown-file'", () => {
      for (const tool of allTools) {
        const valid =
          tool.name.endsWith("-to-markdown") ||
          tool.name === "get-markdown-file";
        expect(valid).toBe(true);
      }
    });
  });

  describe("Git Repo Tool Specifics", () => {
    test("git-repo-to-markdown has optional branch and compress", () => {
      const tool = allTools.find(
        (t) => t.name === "git-repo-to-markdown",
      );
      expect(tool).toBeDefined();
      const required = tool!.inputSchema.required ?? [];
      expect(required).not.toContain("branch");
      expect(required).not.toContain("compress");
      expect(tool!.inputSchema.properties.branch).toBeDefined();
      expect(tool!.inputSchema.properties.compress).toBeDefined();
      expect(tool!.inputSchema.properties.compress.type).toBe("boolean");
    });

    test("git-repo-to-markdown has openWorldHint annotation", () => {
      const tool = allTools.find(
        (t) => t.name === "git-repo-to-markdown",
      );
      expect(tool).toBeDefined();
      expect(tool!.annotations.openWorldHint).toBe(true);
    });
  });

  describe("Get Markdown File Specifics", () => {
    test("get-markdown-file requires filepath", () => {
      const tool = allTools.find(
        (t) => t.name === "get-markdown-file",
      );
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain("filepath");
    });

    test("get-markdown-file is NOT openWorldHint", () => {
      const tool = allTools.find(
        (t) => t.name === "get-markdown-file",
      );
      expect(tool).toBeDefined();
      expect(tool!.annotations.openWorldHint).toBeUndefined();
    });
  });
});
