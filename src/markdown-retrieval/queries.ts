import type { MarkdownResult } from "./nouns.js";

/** Derived Markdown Result for get-markdown-file (D5, D27): resolved realpath and verbatim UTF-8 text. */
export const markdownResult = (
	filePath: string,
	text: string,
): MarkdownResult => ({
	path: filePath,
	text,
});
