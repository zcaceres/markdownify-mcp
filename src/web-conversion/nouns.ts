import type { Brand } from "../shared/types.js";

export const WEB_URL_TOOLS = [
	"webpage-to-markdown",
	"youtube-to-markdown",
	"bing-search-to-markdown",
	"convert-web-url",
] as const;

export type WebUrlTool = (typeof WEB_URL_TOOLS)[number];

export type WebUrl = Brand<string, "WebUrl">;

export const WebUrl = (value: string): WebUrl => value as WebUrl;

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const DEFAULT_MARKITDOWN_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_REDIRECTS = 10;

export type ResolvedAddress = {
	readonly address: string;
	readonly family: number;
};

export type WebConversionRequest = {
	readonly tool: WebUrlTool;
	readonly url: WebUrl;
};

export type WebConversionLimits = {
	readonly fetchTimeoutMs: number;
	readonly markitdownTimeoutMs: number;
	readonly maxDownloadBytes: number;
	readonly maxRedirects: number;
};

export type WebConversionOptions = Partial<WebConversionLimits>;

export type FetchedResponse = {
	readonly status: number;
	readonly body: Uint8Array;
	readonly finalUrl: string;
	readonly location?: string;
	readonly contentType?: string;
};

export type TemporaryFile = {
	readonly path: string;
	readonly cleanupDir: string;
};

export type MarkdownResult = {
	readonly text: string;
};
