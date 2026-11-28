import type { Toolset } from "../mcp-contract/nouns.js";

export const FORM_FACTORS = [
	"node-stdio",
	"bun-stdio",
	"local-http",
	"docker-stdio",
	"docker-http",
	"npm-package",
] as const;

export type FormFactor = (typeof FORM_FACTORS)[number];

export type PythonProfile = "full" | "slim-pdf";

export type FormFactorDescriptor = {
	readonly id: FormFactor;
	readonly transport: "stdio" | "http";
	readonly profile: PythonProfile;
};

export const VERIFICATION_CATEGORIES = [
	"static-web",
	"spa-html",
	"hosted-binary",
	"youtube-bing",
	"git-repo",
	"local-binary",
] as const;

export type VerificationCategory = (typeof VERIFICATION_CATEGORIES)[number];

export const CLASSIC_MCP_TOOLS = [
	"youtube-to-markdown",
	"pdf-to-markdown",
	"bing-search-to-markdown",
	"webpage-to-markdown",
	"image-to-markdown",
	"audio-to-markdown",
	"docx-to-markdown",
	"xlsx-to-markdown",
	"pptx-to-markdown",
	"git-repo-to-markdown",
	"get-markdown-file",
] as const;

export type ClassicMcpTool = (typeof CLASSIC_MCP_TOOLS)[number];

export const COMPACT_MCP_TOOLS = [
	"convert-web-url",
	"convert-local-file",
	"convert-git-repo",
	"get-markdown-file",
] as const;

export type CompactMcpTool = (typeof COMPACT_MCP_TOOLS)[number];

export type E2eMcpTool = ClassicMcpTool | CompactMcpTool;

export type CaseExpectation =
	| {
			readonly kind: "ok";
			readonly contains?: readonly string[];
			readonly notContains?: readonly string[];
			readonly requirePath?: boolean;
			readonly allowEmpty?: boolean;
	  }
	| {
			readonly kind: "error";
			readonly contains?: readonly string[];
	  };

export type VerificationCase = {
	readonly id: string;
	readonly category: VerificationCategory;
	readonly tool: E2eMcpTool;
	readonly args: Readonly<Record<string, string | boolean>>;
	readonly timeoutMs?: number;
	readonly expectByProfile: {
		readonly full: CaseExpectation;
		readonly "slim-pdf": CaseExpectation;
	};
	readonly blockedPatterns?: readonly string[];
};

export type VerificationCorpus = {
	readonly version: number;
	readonly cases: readonly VerificationCase[];
};

export type AdHocProbe = {
	readonly tool: E2eMcpTool;
	readonly url?: string;
	readonly filePath?: string;
	readonly branch?: string;
	readonly compress?: boolean;
};

export type E2eOptions = {
	readonly formFactors: readonly FormFactor[];
	readonly categories: readonly VerificationCategory[];
	readonly caseIds: readonly string[];
	readonly toolset: Toolset;
	readonly adHoc?: AdHocProbe;
	readonly json: boolean;
	readonly preview: boolean;
	readonly noBuild: boolean;
	readonly reuseVenv: boolean;
};

export type OutcomeStatus = "PASS" | "FAIL" | "BLOCKED";

export type CaseExecutionOutput = {
	readonly isError: boolean;
	readonly text: string;
	readonly hasOutputPath: boolean;
	readonly durationMs: number;
	readonly timedOut?: boolean;
	readonly transportError?: string;
};

export type CaseOutcome = {
	readonly formFactor: FormFactor;
	readonly caseId: string;
	readonly category: VerificationCategory | "ad-hoc" | "contract" | "transport";
	readonly tool: string;
	readonly status: OutcomeStatus;
	readonly durationMs: number;
	readonly detail: string;
	readonly outputLength?: number;
	readonly outputPreview?: string;
};

export type VerificationReport = {
	readonly total: number;
	readonly passed: number;
	readonly failed: number;
	readonly blocked: number;
	readonly exitCode: 0 | 1 | 2;
	readonly outcomes: readonly CaseOutcome[];
};
