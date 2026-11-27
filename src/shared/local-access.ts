import path from "node:path";
import { err, ok, type Result } from "./types.js";

/** Official CLI flag and env var name to opt out of HTTP fail-closed local file blocking (D9, D23). */
export const HTTP_UNRESTRICTED_CLI_FLAG = "--allow-unrestricted-paths";
export const HTTP_UNRESTRICTED_ENV_VAR = "MCP_ALLOW_UNRESTRICTED_PATHS";

export const HTTP_LOCAL_FILES_DISABLED_MESSAGE =
	"Local file tools are disabled in HTTP mode when MD_ALLOWED_PATHS is unset. Set MD_ALLOWED_PATHS, or pass --allow-unrestricted-paths / MCP_ALLOW_UNRESTRICTED_PATHS=true to opt out.";

export const EMPTY_ALLOWED_PATHS_MESSAGE =
	"MD_ALLOWED_PATHS is set but contains no valid directories. Specify at least one directory or unset MD_ALLOWED_PATHS.";

export type FileAccessPolicy =
	| { readonly kind: "unrestricted" }
	| {
			readonly kind: "allowed-paths";
			readonly directories: readonly string[];
	  }
	| { readonly kind: "disabled" };

export type FileStat =
	| { readonly kind: "missing" }
	| { readonly kind: "directory" }
	| { readonly kind: "not-a-file" }
	| { readonly kind: "unreadable" }
	| { readonly kind: "file" };

export type ExpandHome = (filePath: string) => string;

export type ResolveRealpath = (resolvedPath: string) => Promise<string>;

export type StatFile = (resolvedPath: string) => Promise<FileStat>;

/** Accepts POSIX absolute (/...), Windows drive (C:\ or C:/), Windows UNC (\\...), or ~ home paths (D18, D25). */
export const isAbsoluteOrHomePath = (value: string): boolean =>
	value.startsWith("/") ||
	value === "~" ||
	value.startsWith("~/") ||
	value.startsWith("~\\") ||
	/^[a-zA-Z]:[\\/]/.test(value) ||
	value.startsWith("\\\\");

const isWithinDirectory = (filePath: string, directory: string): boolean => {
	const rel = path.relative(path.resolve(directory), path.resolve(filePath));
	if (rel === "") return true;
	return (
		rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
	);
};

export const resolveFileAccessPolicy = (
	env: Readonly<Record<string, string | undefined>>,
	expandHome: ExpandHome,
	options: {
		readonly transport?: "stdio" | "http";
		readonly allowUnrestrictedPaths?: boolean;
		readonly delimiter?: string;
	} = {},
): Result<FileAccessPolicy, string> => {
	const delimiter = options.delimiter ?? path.delimiter;
	if (env.MD_ALLOWED_PATHS !== undefined) {
		const directories = env.MD_ALLOWED_PATHS.split(delimiter)
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((entry) => path.normalize(path.resolve(expandHome(entry))));
		if (directories.length === 0) {
			return err(EMPTY_ALLOWED_PATHS_MESSAGE);
		}
		return ok({ kind: "allowed-paths", directories });
	}

	const transport =
		options.transport ??
		(env.MCP_TRANSPORT?.trim().toLowerCase() === "http" ? "http" : "stdio");
	const unrestrictedOptOut =
		options.allowUnrestrictedPaths === true ||
		env[HTTP_UNRESTRICTED_ENV_VAR]?.trim().toLowerCase() === "true";

	if (transport === "http" && !unrestrictedOptOut) {
		return ok({ kind: "disabled" });
	}
	return ok({ kind: "unrestricted" });
};

export const checkFileAccess = async (
	rawPath: string,
	expandedPath: string,
	policy: FileAccessPolicy,
	resolveRealpath: ResolveRealpath,
	delimiter: string = path.delimiter,
): Promise<Result<string, string>> => {
	switch (policy.kind) {
		case "disabled":
			return err(HTTP_LOCAL_FILES_DISABLED_MESSAGE);
		case "unrestricted":
			return ok(expandedPath);
		case "allowed-paths": {
			const realTarget = await resolveRealpath(expandedPath);
			const realDirs = await Promise.all(
				policy.directories.map((dir) => resolveRealpath(dir)),
			);
			if (!realDirs.some((dir) => isWithinDirectory(realTarget, dir))) {
				return err(
					`Path "${rawPath}" is outside the allowed directories. Set MD_ALLOWED_PATHS to a ${delimiter}-separated list that includes a parent directory (currently allowed: ${realDirs.join(delimiter)}).`,
				);
			}
			return ok(realTarget);
		}
		default: {
			const exhaustive: never = policy;
			return exhaustive;
		}
	}
};

export const verifyReadableFile = (
	resolvedPath: string,
	stat: FileStat,
): Result<void, string> => {
	switch (stat.kind) {
		case "file":
			return ok(undefined);
		case "missing":
			return err(`File does not exist: ${resolvedPath}`);
		case "directory":
			return err(`Path is a directory, not a file: ${resolvedPath}`);
		case "not-a-file":
			return err(`Path is not a regular file: ${resolvedPath}`);
		case "unreadable":
			return err(`File is not readable: ${resolvedPath}`);
		default: {
			const exhaustive: never = stat;
			return exhaustive;
		}
	}
};
