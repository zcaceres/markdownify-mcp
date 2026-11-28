import type { Toolset } from "../mcp-contract/nouns.js";
import type {
	CaseOutcome,
	E2eMcpTool,
	FormFactor,
	FormFactorDescriptor,
	VerificationReport,
} from "./nouns.js";

/** Pure lookup mapping any classic or compact tool onto the active Toolset (D51). */
export const mapToolToToolset = (
	tool: E2eMcpTool,
	toolset: Toolset,
): E2eMcpTool => {
	if (toolset === "classic") return tool;
	switch (tool) {
		case "youtube-to-markdown":
		case "bing-search-to-markdown":
		case "webpage-to-markdown":
		case "convert-web-url":
			return "convert-web-url";
		case "pdf-to-markdown":
		case "image-to-markdown":
		case "audio-to-markdown":
		case "docx-to-markdown":
		case "xlsx-to-markdown":
		case "pptx-to-markdown":
		case "convert-local-file":
			return "convert-local-file";
		case "git-repo-to-markdown":
		case "convert-git-repo":
			return "convert-git-repo";
		case "get-markdown-file":
			return "get-markdown-file";
		default: {
			const exhaustive: never = tool;
			return exhaustive;
		}
	}
};

/** Pure lookup describing a Form Factor's transport and Python dependency profile (D37, D44). */
export const describeFormFactor = (
	formFactor: FormFactor,
): FormFactorDescriptor => {
	switch (formFactor) {
		case "node-stdio":
		case "bun-stdio":
		case "npm-package":
			return { id: formFactor, transport: "stdio", profile: "full" };
		case "local-http":
			return { id: formFactor, transport: "http", profile: "full" };
		case "docker-stdio":
			return { id: formFactor, transport: "stdio", profile: "slim-pdf" };
		case "docker-http":
			return { id: formFactor, transport: "http", profile: "slim-pdf" };
		default: {
			const exhaustive: never = formFactor;
			return exhaustive;
		}
	}
};

/** Derived Verification Report (D39, D41, D46): counts and three-state exit code 0 / 1 / 2. */
export const verificationReport = (
	outcomes: readonly CaseOutcome[],
): VerificationReport => {
	let passed = 0;
	let failed = 0;
	let blocked = 0;

	for (const outcome of outcomes) {
		if (outcome.status === "PASS") passed++;
		else if (outcome.status === "FAIL") failed++;
		else blocked++;
	}

	const exitCode: 0 | 1 | 2 = failed > 0 ? 1 : blocked > 0 ? 2 : 0;

	return {
		total: outcomes.length,
		passed,
		failed,
		blocked,
		exitCode,
		outcomes,
	};
};

/** Pure renderer for human-readable or JSON Verification Report output (D39, D45, D46). */
export const formatVerificationReport = (
	report: VerificationReport,
	json: boolean,
	showPreview = false,
): string => {
	if (json) {
		return JSON.stringify(report, null, 2);
	}
	const header = `total: ${report.total} · pass: ${report.passed} · fail: ${report.failed} · blocked: ${report.blocked} · exit-code: ${report.exitCode}`;
	const rows: string[] = [];
	for (const o of report.outcomes) {
		rows.push(`  ${o.status} [${o.formFactor}] ${o.caseId}: ${o.detail}`);
		if ((showPreview || o.category === "ad-hoc") && o.outputPreview) {
			const lenLabel =
				o.outputLength !== undefined ? ` (${o.outputLength} chars)` : "";
			rows.push(`    preview${lenLabel}:`);
			for (const line of o.outputPreview.split("\n").slice(0, 6)) {
				rows.push(`    | ${line}`);
			}
		}
	}
	return [header, ...rows].join("\n");
};
