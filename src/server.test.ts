import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server";

const sampleDataDir = path.join(__dirname, "sample-data");

function createTestPair() {
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const server = createServer();
	return { server, clientTransport, serverTransport };
}

// Helper: send a JSON-RPC request and wait for the response
async function rpcCall(
	transport: InMemoryTransport,
	method: string,
	params?: Record<string, unknown>,
	id = 1,
): Promise<JSONRPCMessage> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("RPC timeout")), 15000);
		transport.onmessage = (msg: JSONRPCMessage) => {
			if ("id" in msg && msg.id === id) {
				clearTimeout(timeout);
				resolve(msg);
			}
		};
		transport.send({
			jsonrpc: "2.0",
			id,
			method,
			params: params ?? {},
		} as JSONRPCMessage);
	});
}

describe("MCP Server", () => {
	let clientTransport: InMemoryTransport;
	let serverTransport: InMemoryTransport;
	let server: ReturnType<typeof createServer>;

	beforeAll(async () => {
		const pair = createTestPair();
		clientTransport = pair.clientTransport;
		serverTransport = pair.serverTransport;
		server = pair.server;

		await server.connect(serverTransport);

		// Initialize the server
		await rpcCall(clientTransport, "initialize", {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "test", version: "1.0.0" },
		});

		// Send initialized notification
		await clientTransport.send({
			jsonrpc: "2.0",
			method: "notifications/initialized",
		} as JSONRPCMessage);
	});

	afterAll(async () => {
		await server.close();
		await clientTransport.close();
	});

	describe("ListTools", () => {
		test("returns all 11 tools", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/list",
				undefined,
				100,
			);

			expect(response).toBeDefined();
			const result = (response as any).result;
			expect(result.tools).toBeDefined();
			expect(result.tools.length).toBe(11);
		});

		test("each tool has required fields", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/list",
				undefined,
				101,
			);
			const tools = (response as any).result.tools;

			for (const tool of tools) {
				expect(tool.name).toBeDefined();
				expect(typeof tool.name).toBe("string");
				expect(tool.description).toBeDefined();
				expect(tool.inputSchema).toBeDefined();
				expect(tool.inputSchema.type).toBe("object");
			}
		});

		test("all expected tool names are present", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/list",
				undefined,
				102,
			);
			const names: string[] = (response as any).result.tools.map(
				(t: any) => t.name,
			);

			expect(names).toContain("pdf-to-markdown");
			expect(names).toContain("docx-to-markdown");
			expect(names).toContain("xlsx-to-markdown");
			expect(names).toContain("pptx-to-markdown");
			expect(names).toContain("image-to-markdown");
			expect(names).toContain("audio-to-markdown");
			expect(names).toContain("webpage-to-markdown");
			expect(names).toContain("youtube-to-markdown");
			expect(names).toContain("bing-search-to-markdown");
			expect(names).toContain("git-repo-to-markdown");
			expect(names).toContain("get-markdown-file");
		});
	});

	describe("Tool Call Routing — File Tools", () => {
		const testFilePath = path.join(sampleDataDir, "test.pdf");

		test("pdf-to-markdown routes correctly and returns result", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "pdf-to-markdown",
					arguments: { filepath: testFilePath },
				},
				200,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(false);
			expect(result.content).toBeDefined();
			const textContent = result.content.find((c: any) => c.type === "text");
			expect(textContent.text).toContain("Test PDF content");
		}, 15_000);

		test("file tools reject missing filepath", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "docx-to-markdown",
					arguments: {},
				},
				201,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("File path is required");
		});

		test("file tools return error for non-existent file", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "pdf-to-markdown",
					arguments: { filepath: "/nonexistent/file.pdf" },
				},
				202,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
		});
	});

	describe("Tool Call Routing — URL Tools", () => {
		test("webpage-to-markdown requires url argument", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "webpage-to-markdown",
					arguments: {},
				},
				203,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("URL is required");
		});

		test("url tools reject dangerous URLs", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "webpage-to-markdown",
					arguments: { url: "file:///etc/passwd" },
				},
				204,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
		});
	});

	describe("Tool Call Routing — Git Repo Tool", () => {
		test("git-repo-to-markdown requires url argument", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "git-repo-to-markdown",
					arguments: {},
				},
				205,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("URL is required");
		});

		test("git-repo-to-markdown rejects empty url", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "git-repo-to-markdown",
					arguments: { url: "" },
				},
				206,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
			// Server layer catches empty url before the tool handler
			expect(result.content[0].text).toContain("URL is required");
		});

		test("git-repo-to-markdown rejects injection attempt", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "git-repo-to-markdown",
					arguments: { url: "owner/repo; rm -rf /" },
				},
				207,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
		});
	});

	describe("Tool Call Routing — Get Markdown File", () => {
		test("get-markdown-file requires filepath argument", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "get-markdown-file",
					arguments: {},
				},
				208,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("File path is required");
		});

		test("get-markdown-file rejects non-markdown files", async () => {
			const pdfPath = path.join(sampleDataDir, "test.pdf");
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "get-markdown-file",
					arguments: { filepath: pdfPath },
				},
				209,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("not a Markdown file");
		});
	});

	describe("Error Handling", () => {
		test("returns error for unknown tool", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "nonexistent-tool",
					arguments: {},
				},
				210,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("Tool not found");
		});

		test("error response has proper MCP format", async () => {
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "get-markdown-file",
					arguments: {},
				},
				211,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(true);
			expect(Array.isArray(result.content)).toBe(true);
			expect(result.content.length).toBeGreaterThan(0);
			expect(result.content[0].type).toBe("text");
			expect(typeof result.content[0].text).toBe("string");
		});
	});

	describe("Response Format", () => {
		test("successful file conversion returns proper MCP content format", async () => {
			const pdfPath = path.join(sampleDataDir, "test.pdf");
			const response = await rpcCall(
				clientTransport,
				"tools/call",
				{
					name: "pdf-to-markdown",
					arguments: { filepath: pdfPath },
				},
				212,
			);

			const result = (response as any).result;
			expect(result.isError).toBe(false);
			expect(Array.isArray(result.content)).toBe(true);

			const textItems = result.content.filter((c: any) => c.type === "text");
			expect(textItems.length).toBeGreaterThan(0);
		}, 15_000);

		test("get-markdown-file returns path info in response", async () => {
			const mdContent = "# Test\nContent";
			const tempFile = path.join(os.tmpdir(), `server_test_${Date.now()}.md`);
			fs.writeFileSync(tempFile, mdContent);

			try {
				const response = await rpcCall(
					clientTransport,
					"tools/call",
					{
						name: "get-markdown-file",
						arguments: { filepath: tempFile },
					},
					213,
				);

				const result = (response as any).result;
				expect(result.isError).toBe(false);
				// Should contain path info and file content
				const texts = result.content
					.filter((c: any) => c.type === "text")
					.map((c: any) => c.text);
				expect(texts.some((t: string) => t.includes("Output file:"))).toBe(
					true,
				);
				expect(texts.some((t: string) => t.includes("Test"))).toBe(true);
			} finally {
				if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
			}
		});
	});
});
