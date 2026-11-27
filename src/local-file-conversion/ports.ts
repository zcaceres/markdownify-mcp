import type {
	ExpandHome,
	ResolveRealpath,
	StatFile,
} from "../shared/local-access.js";
import type { Result } from "../shared/types.js";

export type {
	ExpandHome,
	ResolveRealpath,
	StatFile,
} from "../shared/local-access.js";

export type MarkitdownError =
	| { readonly kind: "missing" }
	| { readonly kind: "timeout"; readonly timeoutMs: number }
	| { readonly kind: "failed"; readonly reason: string };

export type ConvertWithMarkitdown = (
	inputPath: string,
	timeoutMs: number,
) => Promise<Result<string, MarkitdownError>>;

export type LocalFileConversionPorts = {
	readonly expandHome: ExpandHome;
	readonly resolveRealpath: ResolveRealpath;
	readonly statFile: StatFile;
	readonly convertWithMarkitdown: ConvertWithMarkitdown;
};
