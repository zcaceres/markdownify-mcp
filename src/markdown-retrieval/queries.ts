import type { MarkdownFileResult } from "./nouns.js";

/** Derived Markdown Result for get-markdown-file (D5, D27): resolved realpath and verbatim UTF-8 text. */
export const markdownFileResult = (
	filePath: string,
	text: string,
): MarkdownFileResult => ({
	path: filePath,
	text,
});
