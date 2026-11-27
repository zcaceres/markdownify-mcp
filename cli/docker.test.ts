import { describe, expect, test } from "bun:test";
import {
	type DockerMcpClient,
	formatDockerReport,
	parseDockerArgs,
	runDockerChecks,
} from "./docker.ts";

const ALL_11_TOOLS = [
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
].map((name) => ({ name }));

describe("parseDockerArgs", () => {
	test("defaults to markdownify-mcp:harness and respects IMAGE env and CLI flags", () => {
		expect(parseDockerArgs([], {})).toEqual({
			image: "markdownify-mcp:harness",
			skipBuild: false,
		});
		expect(parseDockerArgs([], { IMAGE: "custom:tag" })).toEqual({
			image: "custom:tag",
			skipBuild: false,
		});
		expect(
			parseDockerArgs(["--no-build", "--image=override:v1"], {
				IMAGE: "custom:tag",
			}),
		).toEqual({
			image: "override:v1",
			skipBuild: true,
		});
	});

	test("rejects empty --image and unknown flags", () => {
		expect(() => parseDockerArgs(["--image="], {})).toThrow(
			"must not be empty",
		);
		expect(() => parseDockerArgs(["--bogus"], {})).toThrow(
			'Unknown docker harness argument "--bogus"',
		);
	});
});

describe("runDockerChecks (SC-9, D4, D11, D22, D34, I2)", () => {
	test("passes when container exposes all 11 tools, converts PDF, blocks /etc/passwd, and returns D22 hint", async () => {
		const client: DockerMcpClient = {
			listTools: async () => ({ tools: ALL_11_TOOLS }),
			callTool: async ({ name, arguments: args }) => {
				if (name === "pdf-to-markdown" && args?.filepath === "/data/test.pdf") {
					return {
						isError: false,
						content: [{ type: "text", text: "Test PDF content" }],
					};
				}
				if (name === "pdf-to-markdown" && args?.filepath === "/etc/passwd") {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: 'Error: Access denied: "/etc/passwd" is outside the allowed directories',
							},
						],
					};
				}
				if (
					name === "docx-to-markdown" &&
					args?.filepath === "/data/test.docx"
				) {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: "Error: Conversion failed: MissingDependencyException. This format requires markitdown[all] (full local install) rather than the slim Docker pdf profile.",
							},
						],
					};
				}
				throw new Error(`Unexpected call: ${name}`);
			},
		};

		const results = await runDockerChecks(client);
		expect(results).toHaveLength(4);
		expect(results.every((r) => r.ok)).toBe(true);
		expect(formatDockerReport(results)).toContain("PASS:");
	});

	test("reports failures cleanly when container violates Allowed Paths or omits D22 hint", async () => {
		const client: DockerMcpClient = {
			listTools: async () => ({ tools: [{ name: "pdf-to-markdown" }] }),
			callTool: async ({ name }) => {
				if (name === "docx-to-markdown") {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: "raw traceback mentioning pip install 'markitdown[all]' without D22 hint",
							},
						],
					};
				}
				return {
					isError: false,
					content: [{ type: "text", text: "unexpected" }],
				};
			},
		};

		const results = await runDockerChecks(client);
		expect(results.every((r) => !r.ok)).toBe(true);
		expect(formatDockerReport(results)).toContain("FAIL:");
	});
});
