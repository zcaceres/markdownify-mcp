import type { Result } from "../shared/types.js";
import type {
	FetchedResponse,
	ResolvedAddress,
	TemporaryFile,
	WebUrl,
} from "./nouns.js";

export type FetchError =
	| { readonly kind: "timeout"; readonly timeoutMs: number }
	| { readonly kind: "too-large"; readonly maxBytes: number }
	| { readonly kind: "network"; readonly reason: string };

export type MarkitdownError =
	| { readonly kind: "missing" }
	| { readonly kind: "timeout"; readonly timeoutMs: number }
	| { readonly kind: "failed"; readonly reason: string };

export type ResolveHost = (
	hostname: string,
) => Promise<Result<readonly ResolvedAddress[], string>>;

export type FetchWebUrl = (
	url: WebUrl,
	limits: { readonly timeoutMs: number; readonly maxBytes: number },
) => Promise<Result<FetchedResponse, FetchError>>;

export type StageTempFile = (
	content: Uint8Array,
	extension: string,
) => Promise<Result<TemporaryFile, string>>;

export type CleanupTempFile = (tempFile: TemporaryFile) => Promise<void>;

export type ConvertWithMarkitdown = (
	inputPath: string,
	timeoutMs: number,
) => Promise<Result<string, MarkitdownError>>;

export type WebConversionPorts = {
	readonly resolveHost: ResolveHost;
	readonly fetchWebUrl: FetchWebUrl;
	readonly stageTempFile: StageTempFile;
	readonly cleanupTempFile: CleanupTempFile;
	readonly convertWithMarkitdown: ConvertWithMarkitdown;
};
