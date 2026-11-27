import type { FileAccessPolicy } from "../shared/local-access.js";
import type { Brand } from "../shared/types.js";

export type MarkdownFilePath = Brand<string, "MarkdownFilePath">;

export const MarkdownFilePath = (value: string): MarkdownFilePath =>
	value as MarkdownFilePath;

export type MarkdownRetrievalRequest = {
	readonly filePath: MarkdownFilePath;
};

export type MarkdownRetrievalOptions = {
	readonly accessPolicy?: FileAccessPolicy;
	readonly pathDelimiter?: string;
};

export type MarkdownFileResult = {
	readonly path: string;
	readonly text: string;
};
