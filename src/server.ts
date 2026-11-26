import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	type CallToolRequest,
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Markdownify, type MarkdownResult } from "./Markdownify.js";
import * as tools from "./tools.js";
import { validateWebRequest } from "./web-conversion/verbs.js";

const RequestPayloadSchema = z.object({
	filepath: z.string().optional(),
	url: z.string().optional(),
	branch: z.string().optional(),
	compress: z.boolean().optional(),
});

function formatZodError(error: z.ZodError): string {
	const details = error.issues
		.map((issue) => {
			const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
			return `${field}${issue.message}`;
		})
		.join("; ");
	return `Invalid arguments: ${details}`;
}

export function createServer() {
	const server = new Server(
		{
			name: "mcp-markdownify-server",
			version: "1.2.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: Object.values(tools),
		};
	});

	server.setRequestHandler(
		CallToolRequestSchema,
		async (request: CallToolRequest) => {
			const { name, arguments: args } = request.params;

			try {
				const validatedArgs = RequestPayloadSchema.parse(args ?? {});
				let result: MarkdownResult;
				switch (name) {
					case tools.YouTubeToMarkdownTool.name:
					case tools.BingSearchResultToMarkdownTool.name:
					case tools.WebpageToMarkdownTool.name: {
						const validatedWeb = validateWebRequest(name, validatedArgs.url);
						if (!validatedWeb.ok) {
							throw new Error(validatedWeb.error);
						}
						result = await Markdownify.toMarkdown({
							url: validatedWeb.value.url,
						});
						break;
					}

					case tools.PDFToMarkdownTool.name:
					case tools.ImageToMarkdownTool.name:
					case tools.AudioToMarkdownTool.name:
					case tools.DocxToMarkdownTool.name:
					case tools.XlsxToMarkdownTool.name:
					case tools.PptxToMarkdownTool.name:
						if (!validatedArgs.filepath) {
							throw new Error("File path is required for this tool");
						}
						result = await Markdownify.toMarkdown({
							filePath: validatedArgs.filepath,
						});
						break;

					case tools.GitRepoToMarkdownTool.name:
						if (!validatedArgs.url) {
							throw new Error("URL is required for this tool");
						}
						result = await Markdownify.fromRepo({
							repoUrl: validatedArgs.url,
							branch: validatedArgs.branch,
							compress: validatedArgs.compress,
						});
						break;

					case tools.GetMarkdownFileTool.name:
						if (!validatedArgs.filepath) {
							throw new Error("File path is required for this tool");
						}
						result = await Markdownify.get({
							filePath: validatedArgs.filepath,
						});
						break;

					default:
						throw new Error("Tool not found");
				}

				return {
					content: [
						...(result.path
							? [{ type: "text" as const, text: `Output file: ${result.path}` }]
							: []),
						{ type: "text", text: result.text },
					],
					isError: false,
				};
			} catch (e) {
				if (e instanceof z.ZodError) {
					return {
						content: [{ type: "text", text: `Error: ${formatZodError(e)}` }],
						isError: true,
					};
				}
				if (e instanceof Error) {
					return {
						content: [{ type: "text", text: `Error: ${e.message}` }],
						isError: true,
					};
				} else {
					console.error(e);
					return {
						content: [{ type: "text", text: `Error: Unknown error occurred` }],
						isError: true,
					};
				}
			}
		},
	);

	return server;
}
