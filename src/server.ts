import { type CallToolRequest, Server } from "@modelcontextprotocol/server";
import { validateGitRepoRequest } from "./git-repo-conversion/verbs.js";
import {
	HTTP_LOCAL_FILES_DISABLED_MESSAGE,
	resolveFileAccessPolicy,
	validateLocalFileRequest,
} from "./local-file-conversion/verbs.js";
import { Markdownify, type MarkdownResult } from "./Markdownify.js";
import { validateMarkdownRetrievalRequest } from "./markdown-retrieval/verbs.js";
import {
	serverCacheHints,
	serverInstructions,
	serverMetadata,
} from "./mcp-contract/queries.js";
import {
	formatStructuredToolResult,
	validateToolArguments,
} from "./mcp-contract/verbs.js";
import * as tools from "./tools.js";
import { expandHome } from "./utils.js";
import { validateWebRequest } from "./web-conversion/verbs.js";

export type CreateServerOptions = {
	readonly transport?: "stdio" | "http";
	readonly allowUnrestrictedPaths?: boolean;
};

export function createServer(options: CreateServerOptions = {}) {
	const transport = options.transport ?? "stdio";
	const server = new Server(serverMetadata(), {
		capabilities: {
			tools: {},
		},
		instructions: serverInstructions(),
		cacheHints: serverCacheHints(),
	});

	const assertLocalFileAccessEnabled = () => {
		const policy = resolveFileAccessPolicy(process.env, expandHome, {
			transport,
			allowUnrestrictedPaths: options.allowUnrestrictedPaths,
		});
		if (!policy.ok) {
			throw new Error(policy.error);
		}
		if (policy.value.kind === "disabled") {
			throw new Error(HTTP_LOCAL_FILES_DISABLED_MESSAGE);
		}
	};

	server.setRequestHandler("tools/list", async () => {
		return {
			tools: [...tools.CLASSIC_TOOLS],
		};
	});

	server.setRequestHandler("tools/call", async (request: CallToolRequest) => {
		const { name, arguments: args } = request.params;

		try {
			const validatedResult = validateToolArguments(name, args);
			if (!validatedResult.ok) {
				throw new Error(validatedResult.error);
			}
			const validatedArgs = validatedResult.value;
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
				case tools.PptxToMarkdownTool.name: {
					const validatedFile = validateLocalFileRequest(
						name,
						validatedArgs.filepath,
					);
					if (!validatedFile.ok) {
						throw new Error(validatedFile.error);
					}
					assertLocalFileAccessEnabled();
					result = await Markdownify.toMarkdown({
						filePath: validatedFile.value.filePath,
					});
					break;
				}

				case tools.GitRepoToMarkdownTool.name: {
					const validatedRepo = validateGitRepoRequest(
						validatedArgs.url,
						validatedArgs.branch,
						validatedArgs.compress,
					);
					if (!validatedRepo.ok) {
						throw new Error(validatedRepo.error);
					}
					result = await Markdownify.fromRepo({
						repoUrl: validatedRepo.value.repoUrl,
						branch: validatedRepo.value.branch,
						compress: validatedRepo.value.compress,
					});
					break;
				}

				case tools.GetMarkdownFileTool.name: {
					const validatedMd = validateMarkdownRetrievalRequest(
						validatedArgs.filepath,
					);
					if (!validatedMd.ok) {
						throw new Error(validatedMd.error);
					}
					assertLocalFileAccessEnabled();
					result = await Markdownify.get({
						filePath: validatedMd.value.filePath,
					});
					break;
				}

				default:
					throw new Error("Tool not found");
			}

			return formatStructuredToolResult(result);
		} catch (e) {
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
	});

	return server;
}
