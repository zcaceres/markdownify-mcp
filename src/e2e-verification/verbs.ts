import { z } from "zod";
import type { Toolset } from "../mcp-contract/nouns.js";
import { err, ok, type Result } from "../shared/types.js";
import {
	type AdHocProbe,
	type CaseExecutionOutput,
	type CaseOutcome,
	CLASSIC_MCP_TOOLS,
	type ClassicMcpTool,
	COMPACT_MCP_TOOLS,
	type CompactMcpTool,
	type E2eMcpTool,
	type E2eOptions,
	FORM_FACTORS,
	type FormFactor,
	VERIFICATION_CATEGORIES,
	type VerificationCase,
	type VerificationCategory,
	type VerificationCorpus,
} from "./nouns.js";
import { describeFormFactor } from "./queries.js";

const SUPPORTED_E2E_FLAGS =
	"--form=, --all, --category=, --case=, --toolset=, --tool=, --url=, --file=, --branch=, --compress, --json, --preview, --no-build, --reuse-venv";

const MAX_OUTPUT_PREVIEW_CHARS = 300;

const isFormFactor = (value: string): value is FormFactor =>
	(FORM_FACTORS as readonly string[]).includes(value);

const isVerificationCategory = (value: string): value is VerificationCategory =>
	(VERIFICATION_CATEGORIES as readonly string[]).includes(value);

const isClassicMcpTool = (value: string): value is ClassicMcpTool =>
	(CLASSIC_MCP_TOOLS as readonly string[]).includes(value);

const isCompactMcpTool = (value: string): value is CompactMcpTool =>
	(COMPACT_MCP_TOOLS as readonly string[]).includes(value);

const splitCsv = (raw: string): string[] =>
	raw
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);

export const parseE2eOptions = (
	argv: readonly string[],
): Result<E2eOptions, string> => {
	let allForms = false;
	const formFactors: FormFactor[] = [];
	const categories: VerificationCategory[] = [];
	const caseIds: string[] = [];
	let toolset: Toolset = "compact";
	let toolRaw: string | undefined;
	let urlRaw: string | undefined;
	let fileRaw: string | undefined;
	let branchRaw: string | undefined;
	let compress = false;
	let json = false;
	let preview = false;
	let noBuild = false;
	let reuseVenv = false;

	for (const arg of argv) {
		if (arg === "--all") {
			allForms = true;
		} else if (arg === "--json") {
			json = true;
		} else if (arg === "--preview") {
			preview = true;
		} else if (arg === "--no-build") {
			noBuild = true;
		} else if (arg === "--reuse-venv") {
			reuseVenv = true;
		} else if (arg === "--compress") {
			compress = true;
		} else if (arg.startsWith("--form=")) {
			const items = splitCsv(arg.slice("--form=".length));
			if (items.length === 0) {
				return err('Invalid flag "--form=": value must not be empty');
			}
			for (const item of items) {
				if (!isFormFactor(item)) {
					return err(
						`Unknown Form Factor "${item}". Supported values: ${FORM_FACTORS.join(", ")}`,
					);
				}
				if (!formFactors.includes(item)) formFactors.push(item);
			}
		} else if (arg.startsWith("--category=")) {
			const items = splitCsv(arg.slice("--category=".length));
			if (items.length === 0) {
				return err('Invalid flag "--category=": value must not be empty');
			}
			for (const item of items) {
				if (!isVerificationCategory(item)) {
					return err(
						`Unknown category "${item}". Supported values: ${VERIFICATION_CATEGORIES.join(", ")}`,
					);
				}
				if (!categories.includes(item)) categories.push(item);
			}
		} else if (arg.startsWith("--case=")) {
			const items = splitCsv(arg.slice("--case=".length));
			if (items.length === 0) {
				return err('Invalid flag "--case=": value must not be empty');
			}
			for (const item of items) {
				if (!caseIds.includes(item)) caseIds.push(item);
			}
		} else if (arg.startsWith("--toolset=")) {
			const value = arg.slice("--toolset=".length).trim().toLowerCase();
			if (value !== "classic" && value !== "compact") {
				return err(
					`Unknown toolset "${value}". Supported values: classic, compact`,
				);
			}
			toolset = value;
		} else if (arg.startsWith("--tool=")) {
			const value = arg.slice("--tool=".length).trim();
			if (!value) {
				return err('Invalid flag "--tool=": value must not be empty');
			}
			toolRaw = value;
		} else if (arg.startsWith("--url=")) {
			const value = arg.slice("--url=".length).trim();
			if (!value) {
				return err('Invalid flag "--url=": value must not be empty');
			}
			urlRaw = value;
		} else if (arg.startsWith("--file=")) {
			const value = arg.slice("--file=".length).trim();
			if (!value) {
				return err('Invalid flag "--file=": value must not be empty');
			}
			fileRaw = value;
		} else if (arg.startsWith("--branch=")) {
			const value = arg.slice("--branch=".length).trim();
			if (!value) {
				return err('Invalid flag "--branch=": value must not be empty');
			}
			branchRaw = value;
		} else {
			return err(
				`Unknown e2e argument "${arg}". Supported flags: ${SUPPORTED_E2E_FLAGS}`,
			);
		}
	}

	if (urlRaw !== undefined && fileRaw !== undefined) {
		return err("Cannot specify both --url and --file for an ad-hoc probe");
	}

	let adHoc: AdHocProbe | undefined;
	if (urlRaw !== undefined || fileRaw !== undefined || toolRaw !== undefined) {
		if (!toolRaw) {
			return err("Ad-hoc probe requires --tool=<name>");
		}
		const validTool =
			toolset === "compact"
				? isCompactMcpTool(toolRaw)
				: isClassicMcpTool(toolRaw);
		if (!validTool) {
			return err(`Unknown tool "${toolRaw}"`);
		}
		if (urlRaw === undefined && fileRaw === undefined) {
			return err("Ad-hoc probe requires --url=<url> or --file=<path>");
		}
		adHoc = {
			tool: toolRaw as E2eMcpTool,
			...(urlRaw !== undefined ? { url: urlRaw } : {}),
			...(fileRaw !== undefined ? { filePath: fileRaw } : {}),
			...(branchRaw !== undefined ? { branch: branchRaw } : {}),
			...(compress ? { compress: true } : {}),
		};
	}

	const resolvedForms: readonly FormFactor[] = allForms
		? [...FORM_FACTORS]
		: formFactors.length > 0
			? formFactors
			: ["node-stdio"];

	return ok({
		formFactors: resolvedForms,
		categories,
		caseIds,
		toolset,
		...(adHoc !== undefined ? { adHoc } : {}),
		json,
		preview,
		noBuild,
		reuseVenv,
	});
};

const CaseExpectationSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("ok"),
		contains: z.array(z.string().min(1)).optional(),
		notContains: z.array(z.string().min(1)).optional(),
		requirePath: z.boolean().optional(),
		allowEmpty: z.boolean().optional(),
	}),
	z.object({
		kind: z.literal("error"),
		contains: z.array(z.string().min(1)).optional(),
	}),
]);

const VerificationCaseSchema = z.object({
	id: z.string().trim().min(1),
	category: z.enum(VERIFICATION_CATEGORIES),
	tool: z
		.string()
		.superRefine((val, ctx) => {
			if (!isClassicMcpTool(val)) {
				ctx.addIssue({
					code: "custom",
					message: `Unknown tool "${val}"`,
				});
			}
		})
		.transform((val) => val as ClassicMcpTool),
	args: z.record(z.string(), z.union([z.string(), z.boolean()])),
	timeoutMs: z.number().int().positive().optional(),
	expectByProfile: z.object({
		full: CaseExpectationSchema,
		"slim-pdf": CaseExpectationSchema,
	}),
	blockedPatterns: z.array(z.string().min(1)).optional(),
});

const VerificationCorpusSchema = z.object({
	version: z.number().int().positive(),
	cases: z.array(VerificationCaseSchema).min(1),
});

export const parseVerificationCorpus = (
	raw: unknown,
): Result<VerificationCorpus, string> => {
	const parsed = VerificationCorpusSchema.safeParse(raw);
	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => {
				const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
				return `${field}${issue.message}`;
			})
			.join("; ");
		return err(`Invalid Verification Corpus: ${details}`);
	}

	const seenIds = new Set<string>();
	for (const testCase of parsed.data.cases) {
		if (seenIds.has(testCase.id)) {
			return err(`Duplicate Verification Case id "${testCase.id}"`);
		}
		seenIds.add(testCase.id);
	}

	return ok(parsed.data);
};

export const selectVerificationCases = (
	corpus: VerificationCorpus,
	options: E2eOptions,
): Result<readonly VerificationCase[], string> => {
	const byId = new Map(corpus.cases.map((c) => [c.id, c]));
	for (const id of options.caseIds) {
		if (!byId.has(id)) {
			return err(`Unknown Verification Case "${id}"`);
		}
	}

	const selected = corpus.cases.filter((c) => {
		const catMatch =
			options.categories.length === 0 ||
			options.categories.includes(c.category);
		const idMatch =
			options.caseIds.length === 0 || options.caseIds.includes(c.id);
		return catMatch && idMatch;
	});

	if (selected.length === 0) {
		return err("No Verification Cases matched the requested filters");
	}
	return ok(selected);
};

const findBlockedPattern = (
	text: string,
	patterns?: readonly string[],
): string | undefined => {
	if (!patterns || patterns.length === 0) return undefined;
	const lower = text.toLowerCase();
	return patterns.find((pattern) => lower.includes(pattern.toLowerCase()));
};

export const classifyCaseOutcome = (
	formFactor: FormFactor,
	testCase: VerificationCase,
	output: CaseExecutionOutput,
): CaseOutcome => {
	const normalizedPreview = output.text
		.replace(/\r/g, "")
		.slice(0, MAX_OUTPUT_PREVIEW_CHARS);
	const base = {
		formFactor,
		caseId: testCase.id,
		category: testCase.category,
		tool: testCase.tool,
		durationMs: output.durationMs,
		...(output.text.length > 0
			? {
					outputLength: output.text.length,
					outputPreview: normalizedPreview,
				}
			: {}),
	} as const;

	if (output.timedOut) {
		return {
			...base,
			status: "FAIL",
			detail:
				output.durationMs > 0
					? `Case timed out after ${output.durationMs}ms`
					: "Case timed out",
		};
	}

	if (output.transportError) {
		return {
			...base,
			status: "FAIL",
			detail: `Transport error: ${output.transportError}`,
		};
	}

	const { profile } = describeFormFactor(formFactor);
	const expected = testCase.expectByProfile[profile];

	if (expected.kind === "ok") {
		if (output.isError) {
			const matchedPattern = findBlockedPattern(
				output.text,
				testCase.blockedPatterns,
			);
			if (matchedPattern) {
				return {
					...base,
					status: "BLOCKED",
					detail: `matched upstream blocked pattern "${matchedPattern}"`,
				};
			}
			return {
				...base,
				status: "FAIL",
				detail: `expected ok, got error: ${output.text.slice(0, 200)}`,
			};
		}

		if (!expected.allowEmpty && output.text.trim() === "") {
			const matchedPattern = findBlockedPattern(
				output.text,
				testCase.blockedPatterns,
			);
			if (matchedPattern) {
				return {
					...base,
					status: "BLOCKED",
					detail: `matched upstream blocked pattern "${matchedPattern}"`,
				};
			}
			return {
				...base,
				status: "FAIL",
				detail: "expected non-empty Markdown output, got empty text",
			};
		}

		if (expected.requirePath && !output.hasOutputPath) {
			return {
				...base,
				status: "FAIL",
				detail: "expected Output file path in response, got none",
			};
		}

		for (const needle of expected.contains ?? []) {
			if (!output.text.includes(needle)) {
				const matchedPattern = findBlockedPattern(
					output.text,
					testCase.blockedPatterns,
				);
				if (matchedPattern) {
					return {
						...base,
						status: "BLOCKED",
						detail: `matched upstream blocked pattern "${matchedPattern}"`,
					};
				}
				return {
					...base,
					status: "FAIL",
					detail: `output did not contain expected substring "${needle}"`,
				};
			}
		}

		for (const forbidden of expected.notContains ?? []) {
			if (output.text.includes(forbidden)) {
				return {
					...base,
					status: "FAIL",
					detail: `output unexpectedly contained "${forbidden}"`,
				};
			}
		}

		return {
			...base,
			status: "PASS",
			detail: `matched expected ${profile} profile output`,
		};
	}

	if (!output.isError) {
		return {
			...base,
			status: "FAIL",
			detail: `expected error response, got isError: false`,
		};
	}

	for (const needle of expected.contains ?? []) {
		if (!output.text.includes(needle)) {
			const matchedPattern = findBlockedPattern(
				output.text,
				testCase.blockedPatterns,
			);
			if (matchedPattern) {
				return {
					...base,
					status: "BLOCKED",
					detail: `matched upstream blocked pattern "${matchedPattern}"`,
				};
			}
			return {
				...base,
				status: "FAIL",
				detail: `error did not contain expected substring "${needle}" (got: ${output.text.slice(0, 200)})`,
			};
		}
	}

	return {
		...base,
		status: "PASS",
		detail: `matched expected ${profile} profile error`,
	};
};
