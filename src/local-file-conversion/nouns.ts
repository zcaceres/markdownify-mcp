import type { FileAccessPolicy } from "../shared/local-access.js";
import type { Brand } from "../shared/types.js";

export {
	type FileAccessPolicy,
	type FileStat,
	HTTP_UNRESTRICTED_CLI_FLAG,
	HTTP_UNRESTRICTED_ENV_VAR,
} from "../shared/local-access.js";

export const LOCAL_FILE_TOOLS = [
	"pdf-to-markdown",
	"image-to-markdown",
	"audio-to-markdown",
	"docx-to-markdown",
	"xlsx-to-markdown",
	"pptx-to-markdown",
	"convert-local-file",
] as const;

export type LocalFileTool = (typeof LOCAL_FILE_TOOLS)[number];

export type LocalFilePath = Brand<string, "LocalFilePath">;

export const LocalFilePath = (value: string): LocalFilePath =>
	value as LocalFilePath;

export const DEFAULT_LOCAL_MARKITDOWN_TIMEOUT_MS = 60_000;

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

export type MarkdownResult = {
	readonly text: string;
};
