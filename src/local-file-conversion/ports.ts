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

export type LocalMarkitdownError =
	| { readonly kind: "missing" }
	| { readonly kind: "timeout"; readonly timeoutMs: number }
	| { readonly kind: "failed"; readonly reason: string };

export type ConvertLocalWithMarkitdown = (
	inputPath: string,
	timeoutMs: number,
) => Promise<Result<string, LocalMarkitdownError>>;

export type LocalFileConversionPorts = {
	readonly expandHome: ExpandHome;
	readonly resolveRealpath: ResolveRealpath;
	readonly statFile: StatFile;
	readonly convertWithMarkitdown: ConvertLocalWithMarkitdown;
};
