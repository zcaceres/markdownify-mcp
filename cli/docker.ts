import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const execFileAsync = promisify(execFile);

const SLIM_DOCKER_HINT_SUBSTRING = "rather than the slim Docker pdf profile";

const EXPECTED_TOOL_NAMES = [
	"audio-to-markdown",
	"bing-search-to-markdown",
	"docx-to-markdown",
	"get-markdown-file",
	"git-repo-to-markdown",
	"image-to-markdown",
	"pdf-to-markdown",
	"pptx-to-markdown",
	"webpage-to-markdown",
	"xlsx-to-markdown",
	"youtube-to-markdown",
] as const;

export type DockerHarnessArgs = {
	readonly image: string;
	readonly skipBuild: boolean;
};

export type DockerCheckResult = {
	readonly name: string;
	readonly ok: boolean;
	readonly detail: string;
};

export type McpToolCallResult = {
	readonly isError?: boolean;
	readonly content?: ReadonlyArray<{
		readonly type: string;
		readonly text?: string;
	}>;
};

export type DockerMcpClient = {
	listTools(): Promise<{
		readonly tools: ReadonlyArray<{ readonly name: string }>;
	}>;
	callTool(params: {
		readonly name: string;
		readonly arguments?: Record<string, unknown>;
	}): Promise<McpToolCallResult>;
};

export const parseDockerArgs = (
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>> = process.env,
): DockerHarnessArgs => {
	let image = env.IMAGE?.trim() || "markdownify-mcp:harness";
	let skipBuild = false;

	for (const arg of args) {
		if (arg === "--no-build") {
			skipBuild = true;
		} else if (arg.startsWith("--image=")) {
			const value = arg.slice("--image=".length).trim();
			if (!value) {
				throw new Error("Invalid --image flag: image name must not be empty");
			}
			image = value;
		} else {
			throw new Error(
				`Unknown docker harness argument "${arg}". Supported flags: --no-build, --image=<tag>`,
			);
		}
	}

	return { image, skipBuild };
};

const extractText = (result: McpToolCallResult): string =>
	(result.content ?? [])
		.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text ?? "")
		.join("\n");

export const runDockerChecks = async (
	client: DockerMcpClient,
): Promise<DockerCheckResult[]> => {
	const results: DockerCheckResult[] = [];

	// 1. tools/list returns all 11 stable MCP tools (D3)
	const listed = await client.listTools();
	const actualNames = listed.tools.map((t) => t.name).sort();
	const expectedNames = [...EXPECTED_TOOL_NAMES].sort();
	const toolsMatch =
		actualNames.length === expectedNames.length &&
		actualNames.every((name, idx) => name === expectedNames[idx]);
	results.push({
		name: "tools/list exposes all 11 stable tools (D3)",
		ok: toolsMatch,
		detail: toolsMatch
			? `${actualNames.length} tools`
			: `expected ${expectedNames.join(", ")}, got ${actualNames.join(", ")}`,
	});

	// 2. pdf-to-markdown converts /data/test.pdf (D4, D11, D34)
	const pdfRes = await client.callTool({
		name: "pdf-to-markdown",
		arguments: { filepath: "/data/test.pdf" },
	});
	const pdfText = extractText(pdfRes);
	const pdfOk = pdfRes.isError !== true && pdfText.includes("Test PDF content");
	results.push({
		name: "pdf-to-markdown converts /data/test.pdf (D4, D11, D34)",
		ok: pdfOk,
		detail: pdfOk
			? "matched 'Test PDF content'"
			: `isError=${String(pdfRes.isError)} text=${JSON.stringify(pdfText)}`,
	});

	// 3. MD_ALLOWED_PATHS=/data blocks /etc/passwd (I2, D34)
	const blockedRes = await client.callTool({
		name: "pdf-to-markdown",
		arguments: { filepath: "/etc/passwd" },
	});
	const blockedText = extractText(blockedRes);
	const blockedOk =
		blockedRes.isError === true &&
		blockedText.includes("outside the allowed directories");
	results.push({
		name: "MD_ALLOWED_PATHS=/data blocks /etc/passwd (I2, D34)",
		ok: blockedOk,
		detail: blockedOk
			? blockedText
			: `isError=${String(blockedRes.isError)} text=${JSON.stringify(blockedText)}`,
	});

	// 4. [all]-only format surfaces D22 slim-Docker hint on real binary test.docx (D4, D22, D34, D42)
	const slimRes = await client.callTool({
		name: "docx-to-markdown",
		arguments: { filepath: "/data/test.docx" },
	});
	const slimText = extractText(slimRes);
	const slimOk =
		slimRes.isError === true &&
		slimText.includes("markitdown[all]") &&
		slimText.includes(SLIM_DOCKER_HINT_SUBSTRING);
	results.push({
		name: "docx-to-markdown surfaces D22 slim-Docker markitdown[all] hint (D4, D22, D34)",
		ok: slimOk,
		detail: slimOk
			? "matched D22 slim-Docker hint"
			: `isError=${String(slimRes.isError)} text=${JSON.stringify(slimText)}`,
	});

	return results;
};

export const formatDockerReport = (
	results: readonly DockerCheckResult[],
): string =>
	results
		.map((check) =>
			check.ok
				? `  PASS: ${check.name} (${check.detail})`
				: `  FAIL: ${check.name} (${check.detail})`,
		)
		.join("\n");

export const runDockerHarness = async (
	projectRoot: string,
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> => {
	const { image, skipBuild } = parseDockerArgs(args, env);
	const sampleDir = join(projectRoot, "src", "sample-data");

	await access(join(sampleDir, "test.pdf"));
	await access(join(sampleDir, "test.docx"));

	if (!skipBuild) {
		console.log(`── docker build -t ${image} .`);
		try {
			await execFileAsync("docker", ["build", "-t", image, projectRoot], {
				maxBuffer: 20 * 1024 * 1024,
			});
		} catch (error) {
			const errObj = error as { stderr?: string; message?: string };
			const detail = errObj.stderr?.trim() || errObj.message || String(error);
			throw new Error(`Docker build failed: ${detail}`);
		}
	}

	console.log(`── docker run (${image}) over MCP StdioClientTransport`);
	const stderrChunks: string[] = [];
	const transport = new StdioClientTransport({
		command: "docker",
		args: [
			"run",
			"--rm",
			"-i",
			"-v",
			`${sampleDir}:/data:ro`,
			"-e",
			"MD_ALLOWED_PATHS=/data",
			image,
		],
		stderr: "pipe",
	});
	if (transport.stderr) {
		transport.stderr.on("data", (chunk: Buffer | string) => {
			stderrChunks.push(chunk.toString());
		});
	}

	const client = new Client({
		name: "markdownify-docker-harness",
		version: "0.0.1",
	});

	try {
		await client.connect(transport);
		const results = await runDockerChecks({
			listTools: () => client.listTools(),
			callTool: async (params) => {
				const res = await client.callTool(params);
				return {
					isError: res.isError === true,
					content: Array.isArray(res.content)
						? (res.content as McpToolCallResult["content"])
						: [],
				};
			},
		});
		console.log(formatDockerReport(results));
		const allPassed = results.every((check) => check.ok);
		if (!allPassed && stderrChunks.length > 0) {
			console.error(`── container stderr:\n${stderrChunks.join("").trim()}`);
		}
		console.log(
			allPassed
				? `── ${results.length}/${results.length} docker checks passed`
				: `── docker checks failed`,
		);
		return allPassed;
	} finally {
		await client.close().catch(() => {});
	}
};
