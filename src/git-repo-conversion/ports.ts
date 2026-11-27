import type { Result } from "../shared/types.js";

export type ResolvedRepoAddress = {
	readonly address: string;
	readonly family: number;
};

export type ResolveRepoHost = (
	hostname: string,
) => Promise<Result<readonly ResolvedRepoAddress[], string>>;

export type RepomixOutput = {
	readonly stdout: string;
	readonly stderr: string;
};

export type RepomixError =
	| { readonly kind: "missing" }
	| { readonly kind: "timeout"; readonly timeoutMs: number }
	| { readonly kind: "failed"; readonly reason: string };

export type RunRepomix = (
	args: readonly string[],
	timeoutMs: number,
) => Promise<Result<RepomixOutput, RepomixError>>;

export type GitRepoConversionPorts = {
	readonly resolveHost: ResolveRepoHost;
	readonly runRepomix: RunRepomix;
};
