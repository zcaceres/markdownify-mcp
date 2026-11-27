import type { CacheHint } from "@modelcontextprotocol/server";

export type Toolset = "classic" | "compact";

export type ServerMetadata = {
	readonly name: string;
	readonly title: string;
	readonly version: string;
	readonly description: string;
	readonly websiteUrl: string;
};

export type ServerCacheHints = {
	readonly "tools/list": CacheHint;
	readonly "server/discover": CacheHint;
};

export type ToolContractIssue = {
	readonly tool: string;
	readonly message: string;
};

export type ToolContractAudit = {
	readonly ok: boolean;
	readonly toolCount: number;
	readonly issues: readonly ToolContractIssue[];
};

export type ValidatedToolArguments = {
	readonly url?: string;
	readonly filepath?: string;
	readonly branch?: string;
	readonly compress?: boolean;
};
