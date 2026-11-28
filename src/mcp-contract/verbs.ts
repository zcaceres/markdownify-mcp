import { z } from "zod";
import { err, ok, type Result } from "../shared/types.js";
import type { ValidatedToolArguments } from "./nouns.js";

const UrlOnlySchema = z.strictObject({
	url: z.string().optional(),
});

const FilepathOnlySchema = z.strictObject({
	filepath: z.string().optional(),
});

const GitRepoSchema = z.strictObject({
	url: z.string().optional(),
	branch: z.string().optional(),
	compress: z.boolean().optional(),
});

const TOOL_ARGUMENT_SCHEMAS: Readonly<
	Record<string, z.ZodType<ValidatedToolArguments>>
> = {
	"youtube-to-markdown": UrlOnlySchema,
	"bing-search-to-markdown": UrlOnlySchema,
	"webpage-to-markdown": UrlOnlySchema,
	"pdf-to-markdown": FilepathOnlySchema,
	"image-to-markdown": FilepathOnlySchema,
	"audio-to-markdown": FilepathOnlySchema,
	"docx-to-markdown": FilepathOnlySchema,
	"xlsx-to-markdown": FilepathOnlySchema,
	"pptx-to-markdown": FilepathOnlySchema,
	"get-markdown-file": FilepathOnlySchema,
	"git-repo-to-markdown": GitRepoSchema,
};

export const formatZodError = (error: z.ZodError): string => {
	const details = error.issues
		.map((issue) => {
			const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
			return `${field}${issue.message}`;
		})
		.join("; ");
	return `Invalid arguments: ${details}`;
};

/** Strictly validate tool call arguments per tool, rejecting unknown/cross-tool keys (D8, D52). */
export const validateToolArguments = (
	toolName: string,
	rawArgs: unknown,
): Result<ValidatedToolArguments, string> => {
	const schema = Object.hasOwn(TOOL_ARGUMENT_SCHEMAS, toolName)
		? TOOL_ARGUMENT_SCHEMAS[toolName]
		: undefined;
	if (!schema) {
		return err("Tool not found");
	}

	const input = rawArgs === undefined ? {} : rawArgs;
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return err("Invalid arguments: expected an object");
	}

	const parsed = schema.safeParse(input);
	if (!parsed.success) {
		return err(formatZodError(parsed.error));
	}

	return ok(parsed.data);
};
