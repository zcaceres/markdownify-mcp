import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.js";

describe("MCP server boundary (WU-1, D8)", () => {
	async function withClient<T>(
		run: (client: Client) => Promise<T>,
	): Promise<T> {
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		const server = createServer();
		const client = new Client({ name: "test-client", version: "0.0.1" });
		await server.connect(serverTransport);
		await client.connect(clientTransport);
		try {
			return await run(client);
		} finally {
			await client.close();
			await server.close();
		}
	}

	function firstText(res: Awaited<ReturnType<Client["callTool"]>>): string {
		const content = res.content as Array<{ type: string; text?: string }>;
		return content[0]?.text ?? "";
	}

	test("returns concise single-line isError: true when tool arguments fail schema validation (D8)", async () => {
		await withClient(async (client) => {
			const res = await client.callTool({
				name: "webpage-to-markdown",
				arguments: { url: 12345 as unknown as string },
			});
			expect(res.isError).toBe(true);
			const text = firstText(res);
			expect(text).toContain("Error: Invalid arguments: url:");
			expect(text).not.toContain("\n");
		});
	});

	test("returns structured isError: true when tool arguments are omitted", async () => {
		await withClient(async (client) => {
			const res = await client.callTool({
				name: "webpage-to-markdown",
			});
			expect(res.isError).toBe(true);
			expect(firstText(res)).toBe("Error: URL is required for this tool");
		});
	});

	test("routes web tool calls through validateWebRequest for whitespace and malformed URLs (WU-1, D8)", async () => {
		await withClient(async (client) => {
			const blank = await client.callTool({
				name: "webpage-to-markdown",
				arguments: { url: "   " },
			});
			expect(blank.isError).toBe(true);
			expect(firstText(blank)).toBe("Error: URL is required for this tool");

			const bad = await client.callTool({
				name: "webpage-to-markdown",
				arguments: { url: "not-a-url" },
			});
			expect(bad.isError).toBe(true);
			expect(firstText(bad)).toBe('Error: Invalid URL "not-a-url"');
		});
	});
});
