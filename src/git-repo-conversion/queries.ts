import type { MarkdownResult } from "./nouns.js";

/** Derived Markdown Result for git-repo-to-markdown (D5): text only, no path. */
export const markdownResult = (text: string): MarkdownResult => ({
	text,
});
