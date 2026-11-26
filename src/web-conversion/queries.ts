import type { MarkdownResult } from "./nouns.js";

/** Derived Markdown Result (D5, D16): text only, normalizing whitespace-only exit-0 output to "". */
export const markdownResult = (text: string): MarkdownResult => ({
	text: text.trim() === "" ? "" : text,
});
