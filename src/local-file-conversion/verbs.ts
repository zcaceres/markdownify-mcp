import path from "node:path";
import {
	checkFileAccess,
	isAbsoluteOrHomePath,
	verifyReadableFile,
} from "../shared/local-access.js";
import { err, ok, type Result } from "../shared/types.js";
import {
	DEFAULT_LOCAL_MARKITDOWN_TIMEOUT_MS,
	LOCAL_FILE_TOOLS,
	type LocalFileConversionLimits,
	type LocalFileConversionOptions,
	type LocalFileConversionRequest,
	LocalFilePath,
	type LocalFileTool,
	type MarkdownResult,
} from "./nouns.js";
import type {
	LocalFileConversionPorts,
	LocalMarkitdownError,
} from "./ports.js";
import { markdownResult } from "./queries.js";

export {
	checkFileAccess,
	EMPTY_ALLOWED_PATHS_MESSAGE,
	HTTP_LOCAL_FILES_DISABLED_MESSAGE,
	isAbsoluteOrHomePath,
	resolveFileAccessPolicy,
	verifyReadableFile,
} from "../shared/local-access.js";

const SLIM_DOCKER_HINT =
	"This format requires markitdown[all] (full local install) rather than the slim Docker pdf profile.";

const isLocalFileTool = (value: string): value is LocalFileTool =>
	(LOCAL_FILE_TOOLS as readonly string[]).includes(value);

export const parseLocalFileLimits = (
	env: Readonly<Record<string, string | undefined>>,
): Result<LocalFileConversionLimits, string> => {
	const raw = env.MD_MARKITDOWN_TIMEOUT_MS;
	if (raw === undefined || raw.trim() === "") {
		return ok({ markitdownTimeoutMs: DEFAULT_LOCAL_MARKITDOWN_TIMEOUT_MS });
	}
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) {
		return err(
			`Invalid MD_MARKITDOWN_TIMEOUT_MS "${raw}": must be a positive integer`,
		);
	}
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		return err(
			`Invalid MD_MARKITDOWN_TIMEOUT_MS "${raw}": must be a positive integer`,
		);
	}
	return ok({ markitdownTimeoutMs: parsed });
};

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
