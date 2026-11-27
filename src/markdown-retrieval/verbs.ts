import path from "node:path";
import {
	checkFileAccess,
	isAbsoluteOrHomePath,
	verifyReadableFile,
} from "../shared/local-access.js";
import { err, ok, type Result } from "../shared/types.js";
import {
	MarkdownFilePath,
	type MarkdownFileResult,
	type MarkdownRetrievalOptions,
	type MarkdownRetrievalRequest,
} from "./nouns.js";
import type { MarkdownRetrievalPorts } from "./ports.js";
import { markdownFileResult } from "./queries.js";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export const NOT_MARKDOWN_FILE_ERROR = "Required file is not a Markdown file.";

/** Case-insensitive .md / .markdown extension check (D8, D26). */
export const isMarkdownExtension = (filePath: string): boolean =>
	MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());

export const validateMarkdownRetrievalRequest = (
	filePath: unknown,
): Result<MarkdownRetrievalRequest, string> => {
	if (typeof filePath !== "string" || filePath.trim() === "") {
		return err("File path is required for this tool");
	}
	const trimmed = filePath.trim();
	if (!isAbsoluteOrHomePath(trimmed)) {
		return err(
			`File path "${trimmed}" must be an absolute path or start with ~/`,
		);
	}
	if (!isMarkdownExtension(trimmed)) {
		return err(NOT_MARKDOWN_FILE_ERROR);
	}
	return ok({ filePath: MarkdownFilePath(trimmed) });
};

export const retrieveMarkdownFile = async (
	request: MarkdownRetrievalRequest,
	ports: MarkdownRetrievalPorts,
	options: MarkdownRetrievalOptions = {},
): Promise<Result<MarkdownFileResult, string>> => {
	const accessPolicy = options.accessPolicy ?? { kind: "unrestricted" };
	const delimiter = options.pathDelimiter ?? path.delimiter;
	const expandedPath = path.resolve(ports.expandHome(request.filePath));

	// Enforce HTTP fail-closed policy and Allowed Paths containment before existence checks (D9, D21, I2).
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

	const realTarget =
		accessPolicy.kind === "allowed-paths"
			? access.value
			: await ports.resolveRealpath(access.value);

	// Validate Markdown extension on the realpath target too (D26).
	if (!isMarkdownExtension(realTarget)) {
		return err(NOT_MARKDOWN_FILE_ERROR);
	}

	const stat = await ports.statFile(realTarget);
	const verified = verifyReadableFile(realTarget, stat);
	if (!verified.ok) {
		return verified;
	}

	const content = await ports.readTextFile(realTarget);
	if (!content.ok) {
		return err(`Failed to read file: ${content.error}`);
	}

	return ok(markdownFileResult(realTarget, content.value));
};
