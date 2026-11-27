import type { Brand } from "../shared/types.js";

export const LOCAL_FILE_TOOLS = [
	"pdf-to-markdown",
	"image-to-markdown",
	"audio-to-markdown",
	"docx-to-markdown",
	"xlsx-to-markdown",
	"pptx-to-markdown",
] as const;

export type LocalFileTool = (typeof LOCAL_FILE_TOOLS)[number];

export type LocalFilePath = Brand<string, "LocalFilePath">;

export const LocalFilePath = (value: string): LocalFilePath =>
	value as LocalFilePath;

export const DEFAULT_LOCAL_MARKITDOWN_TIMEOUT_MS = 60_000;

/** Official CLI flag and env var name to opt out of HTTP fail-closed local file blocking (D9, D23). */
export const HTTP_UNRESTRICTED_CLI_FLAG = "--allow-unrestricted-paths";
export const HTTP_UNRESTRICTED_ENV_VAR = "MCP_ALLOW_UNRESTRICTED_PATHS";

export type FileAccessPolicy =
	| { readonly kind: "unrestricted" }
	| {
			readonly kind: "allowed-paths";
			readonly directories: readonly string[];
	  }
	| { readonly kind: "disabled" };

export type LocalFileConversionLimits = {
	readonly markitdownTimeoutMs: number;
};

export type LocalFileConversionOptions = {
	readonly accessPolicy?: FileAccessPolicy;
	readonly markitdownTimeoutMs?: number;
	readonly pathDelimiter?: string;
};

export type LocalFileConversionRequest = {
	readonly tool: LocalFileTool;
	readonly filePath: LocalFilePath;
};

export type FileStat =
	| { readonly kind: "missing" }
	| { readonly kind: "directory" }
	| { readonly kind: "not-a-file" }
	| { readonly kind: "unreadable" }
	| { readonly kind: "file" };

export type MarkdownResult = {
	readonly text: string;
};
