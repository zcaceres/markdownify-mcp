import type { Result } from "../shared/types.js";
import type { FileStat } from "./nouns.js";

export type LocalMarkitdownError =
	| { readonly kind: "missing" }
	| { readonly kind: "timeout"; readonly timeoutMs: number }
	| { readonly kind: "failed"; readonly reason: string };

export type ExpandHome = (filePath: string) => string;

export type ResolveRealpath = (resolvedPath: string) => Promise<string>;

export type StatFile = (resolvedPath: string) => Promise<FileStat>;

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
