import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	AdHocProbe,
	CaseExecutionOutput,
	CaseOutcome,
	FormFactor,
	VerificationCase,
} from "../../src/e2e-verification/nouns.ts";
import {
	formatVerificationReport,
	mapToolToToolset,
	verificationReport,
} from "../../src/e2e-verification/queries.ts";
import {
	classifyCaseOutcome,
	parseE2eOptions,
	parseVerificationCorpus,
	selectVerificationCases,
} from "../../src/e2e-verification/verbs.ts";
import type { Toolset } from "../../src/mcp-contract/nouns.ts";
import {
	auditToolCatalog,
	expectedOpenWorldByToolset,
} from "../../src/mcp-contract/queries.ts";
import { toolsForToolset } from "../../src/tools.ts";
import { type ActiveFormFactor, provisionFormFactor } from "./drivers.ts";

const DEFAULT_CASE_TIMEOUT_MS = 45_000;

const expandCaseArgs = (
	args: Readonly<Record<string, string | boolean>>,
	sampleDirPath: string,
): Record<string, string | boolean> => {
	const out: Record<string, string | boolean> = {};
	for (const [key, value] of Object.entries(args)) {
		out[key] =
			typeof value === "string"
				? value.replaceAll("{{SAMPLE_DIR}}", sampleDirPath)
				: value;
	}
	return out;
};

const adHocToCase = (probe: AdHocProbe): VerificationCase => {
	const args: Record<string, string | boolean> = {};
	if (probe.url !== undefined) args.url = probe.url;
	if (probe.filePath !== undefined) args.filepath = probe.filePath;
	if (probe.branch !== undefined) args.branch = probe.branch;
	if (probe.compress) args.compress = true;

	return {
		id: `ad-hoc:${probe.tool}`,
		category: probe.filePath !== undefined ? "local-binary" : "static-web",
		tool: probe.tool,
		args,
		timeoutMs: 90_000,
		expectByProfile: {
			full: { kind: "ok", allowEmpty: probe.tool === "image-to-markdown" },
			"slim-pdf": {
				kind: "ok",
				allowEmpty: probe.tool === "image-to-markdown",
			},
		},
		blockedPatterns: ["not a bot", "429", "Too Many Requests", "captcha"],
	};
};

const executeCaseWithTimeout = async (
	active: ActiveFormFactor,
	testCase: VerificationCase,
	toolset: Toolset,
): Promise<CaseExecutionOutput> => {
	const timeoutMs = testCase.timeoutMs ?? DEFAULT_CASE_TIMEOUT_MS;
	const started = Date.now();
	const expandedArgs = expandCaseArgs(testCase.args, active.sampleDirPath);
	if (
		testCase.id.startsWith("ad-hoc:") &&
		typeof expandedArgs.filepath === "string" &&
		active.adHocTargetPath !== undefined
	) {
		expandedArgs.filepath = active.adHocTargetPath;
	}
	const invokedTool = mapToolToToolset(testCase.tool, toolset);

	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const callPromise = active.client.callTool({
			name: invokedTool,
			arguments: expandedArgs,
		});
		const timeoutPromise = new Promise<"TIMEOUT">((resolve) => {
			timer = setTimeout(() => resolve("TIMEOUT"), timeoutMs);
		});

		const raced = await Promise.race([callPromise, timeoutPromise]);
		if (raced === "TIMEOUT") {
			return {
				isError: true,
				text: "",
				hasOutputPath: false,
				durationMs: Date.now() - started,
				timedOut: true,
			};
		}

		const content = Array.isArray(raced.content)
			? (raced.content as Array<{ type?: string; text?: string }>)
			: [];
		const textParts = content
			.filter((c) => c.type === "text" && typeof c.text === "string")
			.map((c) => c.text ?? "");
		const hasOutputPath = textParts.some((t) => t.startsWith("Output file: "));
		const bodyText = textParts
			.filter((t) => !t.startsWith("Output file: "))
			.join("\n");

		const isError = raced.isError === true;
		const structured = raced.structuredContent;
		if (isError) {
			if (structured !== undefined) {
				return {
					isError: true,
					text: bodyText,
					hasOutputPath,
					durationMs: Date.now() - started,
					transportError:
						"Contract violation (D49): isError response must omit structuredContent",
				};
			}
		} else {
			const record =
				typeof structured === "object" &&
				structured !== null &&
				!Array.isArray(structured)
					? (structured as Record<string, unknown>)
					: undefined;
			const hasValidMarkdown =
				record !== undefined &&
				typeof record.markdown === "string" &&
				record.markdown === bodyText;
			const hasValidPath =
				testCase.tool !== "get-markdown-file" ||
				(record !== undefined &&
					typeof record.path === "string" &&
					record.path.length > 0);
			if (!hasValidMarkdown || !hasValidPath) {
				return {
					isError: true,
					text: bodyText,
					hasOutputPath,
					durationMs: Date.now() - started,
					transportError:
						"Contract violation (D49): missing or mismatched structuredContent payload",
				};
			}
		}

		return {
			isError,
			text: bodyText,
			hasOutputPath,
			durationMs: Date.now() - started,
		};
	} catch (error) {
		return {
			isError: true,
			text: "",
			hasOutputPath: false,
			durationMs: Date.now() - started,
			transportError: error instanceof Error ? error.message : String(error),
		};
	} finally {
		if (timer) clearTimeout(timer);
	}
};

const checkToolsAndContracts = async (
	active: ActiveFormFactor,
	toolset: Toolset,
): Promise<CaseOutcome[]> => {
	const started = Date.now();
	const expected = toolsForToolset(toolset)
		.map((t) => t.name)
		.sort();
	const caseId = toolset === "compact" ? "tools-list-4" : "tools-list-11";
	try {
		const listed = await active.client.listTools();
		const actual = listed.tools.map((t) => t.name).sort();
		const listOk =
			actual.length === expected.length &&
			actual.every((name, idx) => name === expected[idx]);

		const outcomes: CaseOutcome[] = [
			{
				formFactor: active.formFactor,
				caseId,
				category: "contract",
				tool: "tools/list",
				status: listOk ? "PASS" : "FAIL",
				durationMs: Date.now() - started,
				detail: listOk
					? toolset === "compact"
						? "exposes all 4 compact MCP tools (D51)"
						: "exposes all 11 classic MCP tools (D3)"
					: `expected ${expected.join(", ")}, got ${actual.join(", ")}`,
			},
		];

		const audit = auditToolCatalog(
			listed.tools,
			expectedOpenWorldByToolset(toolset),
		);
		const serverInfo = active.client.getServerVersion();
		const instructions = active.client.getInstructions() ?? "";
		const metaIssues: string[] = [];
		if (!serverInfo?.title) metaIssues.push("missing serverInfo.title (D48)");
		if (!serverInfo?.description)
			metaIssues.push("missing serverInfo.description (D48)");
		if (!serverInfo?.websiteUrl)
			metaIssues.push("missing serverInfo.websiteUrl (D48)");
		if (!instructions.trim())
			metaIssues.push("missing server instructions (D48)");

		const allIssues = [
			...metaIssues,
			...audit.issues.map((i) => `${i.tool}: ${i.message}`),
		];
		outcomes.push({
			formFactor: active.formFactor,
			caseId: "mcp-contract-audit",
			category: "contract",
			tool: "tools/list",
			status: allIssues.length === 0 ? "PASS" : "FAIL",
			durationMs: Date.now() - started,
			detail:
				allIssues.length === 0
					? "verified D47-D49 & D52 metadata, annotations, outputSchema, and Gemini-safe schemas"
					: allIssues.slice(0, 3).join("; "),
		});

		return outcomes;
	} catch (error) {
		return [
			{
				formFactor: active.formFactor,
				caseId,
				category: "contract",
				tool: "tools/list",
				status: "FAIL",
				durationMs: Date.now() - started,
				detail: `Transport error: ${error instanceof Error ? error.message : String(error)}`,
			},
		];
	}
};

export const runE2eHarness = async (
	projectRoot: string,
	argv: readonly string[],
	env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<0 | 1 | 2> => {
	const parsedOpts = parseE2eOptions(argv);
	if (!parsedOpts.ok) {
		console.error(parsedOpts.error);
		return 1;
	}
	const options = parsedOpts.value;

	let cases: readonly VerificationCase[];
	if (options.adHoc) {
		cases = [adHocToCase(options.adHoc)];
	} else {
		const manifestPath = join(projectRoot, "corpus", "manifest.json");
		const rawJson = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
		const parsedCorpus = parseVerificationCorpus(rawJson);
		if (!parsedCorpus.ok) {
			console.error(parsedCorpus.error);
			return 1;
		}
		const selected = selectVerificationCases(parsedCorpus.value, options);
		if (!selected.ok) {
			console.error(selected.error);
			return 1;
		}
		cases = selected.value;
	}

	const sampleDir = join(projectRoot, "src", "sample-data");
	const dockerImage = env.IMAGE?.trim() || "markdownify-mcp:harness";
	const builtDockerImages = new Set<string>();
	const outcomes: CaseOutcome[] = [];

	const runForm = async (formFactor: FormFactor) => {
		if (!options.json) {
			console.log(`── form-factor: ${formFactor}`);
		}
		let active: ActiveFormFactor;
		try {
			active = await provisionFormFactor(formFactor, {
				projectRoot,
				sampleDir,
				dockerImage,
				toolset: options.toolset,
				...(options.adHoc?.filePath !== undefined
					? { adHocFilePath: options.adHoc.filePath }
					: {}),
				noBuild: options.noBuild,
				reuseVenv: options.reuseVenv,
				builtDockerImages,
			});
		} catch (error) {
			outcomes.push({
				formFactor,
				caseId: "provision",
				category: "transport",
				tool: "transport",
				status: "FAIL",
				durationMs: 0,
				detail: error instanceof Error ? error.message : String(error),
			});
			return;
		}

		try {
			// Always verify expected toolset and cross-provider MCP contracts on tools/list (D3, D51, VF-4, MC-8)
			outcomes.push(...(await checkToolsAndContracts(active, options.toolset)));

			// Run HTTP transport/security guards on HTTP Form Factors (VF-4, D9, D33, I5)
			if (!options.adHoc && active.runHttpGuardChecks) {
				outcomes.push(...(await active.runHttpGuardChecks()));
			}

			for (const testCase of cases) {
				const execOut = await executeCaseWithTimeout(
					active,
					testCase,
					options.toolset,
				);
				const mappedCase =
					options.toolset === "compact"
						? { ...testCase, tool: mapToolToToolset(testCase.tool, "compact") }
						: testCase;
				const outcome = classifyCaseOutcome(formFactor, mappedCase, execOut);
				outcomes.push(
					options.adHoc ? { ...outcome, category: "ad-hoc" } : outcome,
				);
			}
		} finally {
			await active.close();
		}
	};

	for (const formFactor of options.formFactors) {
		await runForm(formFactor);
	}

	const report = verificationReport(outcomes);
	console.log(
		formatVerificationReport(
			report,
			options.json,
			options.preview || Boolean(options.adHoc),
		),
	);
	return report.exitCode;
};
