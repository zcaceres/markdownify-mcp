import path from "node:path";
import { err, ok, type Result } from "../shared/types.js";
import {
	DEFAULT_LOCAL_MARKITDOWN_TIMEOUT_MS,
	type FileAccessPolicy,
	type FileStat,
	HTTP_UNRESTRICTED_ENV_VAR,
	LOCAL_FILE_TOOLS,
	type LocalFileConversionOptions,
	type LocalFileConversionRequest,
	LocalFilePath,
	type LocalFileTool,
	type MarkdownResult,
} from "./nouns.js";
import type {
	ExpandHome,
	LocalFileConversionPorts,
	LocalMarkitdownError,
	ResolveRealpath,
} from "./ports.js";
import { markdownResult } from "./queries.js";

const SLIM_DOCKER_HINT =
	"This format requires markitdown[all] (full local install) rather than the slim Docker pdf profile.";

export const HTTP_LOCAL_FILES_DISABLED_MESSAGE =
	"Local file tools are disabled in HTTP mode when MD_ALLOWED_PATHS is unset. Set MD_ALLOWED_PATHS, or pass --allow-unrestricted-paths / MCP_ALLOW_UNRESTRICTED_PATHS=true to opt out.";

export const EMPTY_ALLOWED_PATHS_MESSAGE =
	"MD_ALLOWED_PATHS is set but contains no valid directories. Specify at least one directory or unset MD_ALLOWED_PATHS.";

const isLocalFileTool = (value: string): value is LocalFileTool =>
	(LOCAL_FILE_TOOLS as readonly string[]).includes(value);

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

/** Accepts POSIX absolute (/...), Windows drive (C:\ or C:/), Windows UNC (\\...), or ~ home paths (D18). */
export const isAbsoluteOrHomePath = (value: string): boolean =>
	value.startsWith("/") ||
	value === "~" ||
	value.startsWith("~/") ||
	value.startsWith("~\\") ||
	/^[a-zA-Z]:[\\/]/.test(value) ||
	value.startsWith("\\\\");

export const validateLocalFileRequest = (
	tool: string,
	filePath: unknown,
): Result<LocalFileConversionRequest, string> => {
	if (!isLocalFileTool(tool)) {
		return err(`Unknown local file tool "${tool}"`);
	}
	if (typeof filePath !== "string" || filePath.trim() === "") {
		return err("File path is required for this tool");
	}
	const trimmed = filePath.trim();
	if (!isAbsoluteOrHomePath(trimmed)) {
		return err(
			`File path "${trimmed}" must be an absolute path or start with ~/`,
		);
	}
	return ok({ tool, filePath: LocalFilePath(trimmed) });
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
		case "unreadable":
			return err(`File is not readable: ${resolvedPath}`);
		default: {
			const exhaustive: never = stat;
			return exhaustive;
		}
	}
};

export const formatMarkitdownError = (error: LocalMarkitdownError): string => {
	switch (error.kind) {
		case "missing":
			return "markitdown executable not found";
		case "timeout":
			return `Conversion timed out after ${error.timeoutMs}ms`;
		case "failed":
			if (error.reason.includes("MissingDependencyException")) {
				return `Conversion failed: ${error.reason}. ${SLIM_DOCKER_HINT}`;
			}
			return `Conversion failed: ${error.reason}`;
		default: {
			const exhaustive: never = error;
			return exhaustive;
		}
	}
};

export const convertLocalFile = async (
	request: LocalFileConversionRequest,
	ports: LocalFileConversionPorts,
	options: LocalFileConversionOptions = {},
): Promise<Result<MarkdownResult, string>> => {
	const timeoutMs =
		options.markitdownTimeoutMs ?? DEFAULT_LOCAL_MARKITDOWN_TIMEOUT_MS;
	const accessPolicy = options.accessPolicy ?? { kind: "unrestricted" };
	const delimiter = options.pathDelimiter ?? path.delimiter;
	const expandedPath = path.resolve(ports.expandHome(request.filePath));

	// Enforce Allowed Paths and HTTP fail-closed policy before existence/stat checks (D9, D21, I2).
	const access = await checkFileAccess(
		request.filePath,
		expandedPath,
		accessPolicy,
		ports.resolveRealpath,
		delimiter,
	);
	if (!access.ok) {
		return access;
	}

	const targetPath = access.value;
	const stat = await ports.statFile(targetPath);
	const verified = verifyReadableFile(targetPath, stat);
	if (!verified.ok) {
		return verified;
	}

	const converted = await ports.convertWithMarkitdown(targetPath, timeoutMs);
	if (!converted.ok) {
		return err(formatMarkitdownError(converted.error));
	}

	return ok(markdownResult(converted.value));
};
