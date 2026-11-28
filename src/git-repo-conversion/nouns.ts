import type { Brand } from "../shared/types.js";

export const GIT_REPO_TOOL = "git-repo-to-markdown" as const;

export const GIT_REPO_TOOLS = [
	"git-repo-to-markdown",
	"convert-git-repo",
] as const;

export const DEFAULT_REPOMIX_TIMEOUT_MS = 120_000;

export type GitRepoIdentifier = Brand<string, "GitRepoIdentifier">;

export const GitRepoIdentifier = (value: string): GitRepoIdentifier =>
	value as GitRepoIdentifier;

export type GitBranchName = Brand<string, "GitBranchName">;

export const GitBranchName = (value: string): GitBranchName =>
	value as GitBranchName;

export type GitRepoConversionRequest = {
	readonly repoUrl: GitRepoIdentifier;
	readonly branch?: GitBranchName;
	readonly compress: boolean;
};

export type GitRepoConversionLimits = {
	readonly repomixTimeoutMs: number;
};

export type GitRepoConversionOptions = {
	readonly repomixTimeoutMs?: number;
};

export type MarkdownResult = {
	readonly text: string;
};
