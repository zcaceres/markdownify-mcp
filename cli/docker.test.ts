import { describe, expect, test } from "bun:test";
import {
	type DockerMcpClient,
	formatDockerReport,
	parseDockerArgs,
	runDockerChecks,
} from "./docker.ts";

const DEFAULT_COMPACT_TOOLS = [
	"convert-git-repo",
	"convert-local-file",
	"convert-web-url",
	"get-markdown-file",
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

describe("runDockerChecks (SC-9, D4, D11, D22, D34, D51, I2)", () => {
	test("passes when container exposes default 4 compact tools, converts PDF, blocks /etc/passwd, and returns D22 hint", async () => {
		const client: DockerMcpClient = {
			listTools: async () => ({ tools: DEFAULT_COMPACT_TOOLS }),
			callTool: async ({ name, arguments: args }) => {
				if (
					name === "convert-local-file" &&
					args?.filepath === "/data/test.pdf"
				) {
					return {
						isError: false,
						content: [{ type: "text", text: "Test PDF content" }],
					};
				}
				if (name === "convert-local-file" && args?.filepath === "/etc/passwd") {
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
					name === "convert-local-file" &&
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
			listTools: async () => ({ tools: [{ name: "convert-local-file" }] }),
			callTool: async ({ arguments: args }) => {
				if (args?.filepath === "/data/test.docx") {
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
