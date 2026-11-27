import type {
	ExpandHome,
	ResolveRealpath,
	StatFile,
} from "../shared/local-access.js";
import type { Result } from "../shared/types.js";

export type ReadTextFile = (
	resolvedPath: string,
) => Promise<Result<string, string>>;

export type MarkdownRetrievalPorts = {
	readonly expandHome: ExpandHome;
	readonly resolveRealpath: ResolveRealpath;
	readonly statFile: StatFile;
	readonly readTextFile: ReadTextFile;
};
