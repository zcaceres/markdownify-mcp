import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { err, ok } from "../shared/types.js";
import {
	type CaseOutcome,
	VERIFICATION_CATEGORIES,
	type VerificationCase,
} from "./nouns.js";
import { formatVerificationReport, verificationReport } from "./queries.js";
import {
	classifyCaseOutcome,
	describeFormFactor,
	mapToolToToolset,
	parseE2eOptions,
	parseVerificationCorpus,
	selectVerificationCases,
} from "./verbs.js";

describe("describeFormFactor (VF-1, D37, D44)", () => {
	test("maps all six Form Factors to their transport and Python profile", () => {
		expect(describeFormFactor("node-stdio")).toEqual({
			id: "node-stdio",
			transport: "stdio",
			profile: "full",
		});
		expect(describeFormFactor("bun-stdio")).toEqual({
			id: "bun-stdio",
			transport: "stdio",
			profile: "full",
		});
		expect(describeFormFactor("npm-package")).toEqual({
			id: "npm-package",
			transport: "stdio",
			profile: "full",
		});
		expect(describeFormFactor("local-http")).toEqual({
			id: "local-http",
			transport: "http",
			profile: "full",
		});
		expect(describeFormFactor("docker-stdio")).toEqual({
			id: "docker-stdio",
			transport: "stdio",
			profile: "slim-pdf",
		});
		expect(describeFormFactor("docker-http")).toEqual({
			id: "docker-http",
			transport: "http",
			profile: "slim-pdf",
		});
	});
});

describe("parseE2eOptions (VF-1, D37, D43, D45)", () => {
	test("defaults to node-stdio and parses --all, filters, toolset, and ad-hoc probes", () => {
		expect(parseE2eOptions([])).toEqual(
			ok({
				formFactors: ["node-stdio"],
				categories: [],
				caseIds: [],
				toolset: "classic",
				json: false,
				preview: false,
				noBuild: false,
				reuseVenv: false,
			}),
		);

		expect(
			parseE2eOptions([
				"--all",
				"--category=static-web,git-repo",
				"--toolset=COMPACT",
				"--json",
				"--preview",
				"--no-build",
				"--reuse-venv",
			]),
		).toEqual(
			ok({
				formFactors: [
					"node-stdio",
					"bun-stdio",
					"local-http",
					"docker-stdio",
					"docker-http",
					"npm-package",
				],
				categories: ["static-web", "git-repo"],
				caseIds: [],
				toolset: "compact",
				json: true,
				preview: true,
				noBuild: true,
				reuseVenv: true,
			}),
		);

		expect(
			parseE2eOptions([
				"--form=local-http,docker-http",
				"--tool=git-repo-to-markdown",
				"--url=octocat/Hello-World",
				"--branch=master",
				"--compress",
			]),
		).toEqual(
			ok({
				formFactors: ["local-http", "docker-http"],
				categories: [],
				caseIds: [],
				toolset: "classic",
				adHoc: {
					tool: "git-repo-to-markdown",
					url: "octocat/Hello-World",
					branch: "master",
					compress: true,
				},
				json: false,
				preview: false,
				noBuild: false,
				reuseVenv: false,
			}),
		);

		expect(
			parseE2eOptions([
				"--toolset=compact",
				"--tool=convert-web-url",
				"--url=https://example.com",
			]),
		).toMatchObject({
			ok: true,
			value: {
				toolset: "compact",
				adHoc: { tool: "convert-web-url", url: "https://example.com" },
			},
		});

		expect(parseE2eOptions(["--toolset=bogus"])).toEqual(
			err('Unknown toolset "bogus". Supported values: classic, compact'),
		);

		expect(mapToolToToolset("pdf-to-markdown", "compact")).toBe(
			"convert-local-file",
		);
		expect(mapToolToToolset("youtube-to-markdown", "compact")).toBe(
			"convert-web-url",
		);
		expect(mapToolToToolset("git-repo-to-markdown", "compact")).toBe(
			"convert-git-repo",
		);
		expect(mapToolToToolset("get-markdown-file", "compact")).toBe(
			"get-markdown-file",
		);
		expect(mapToolToToolset("pdf-to-markdown", "classic")).toBe(
			"pdf-to-markdown",
		);
	});

	test("rejects unknown flags, invalid Form Factors/categories, conflicting --url/--file, and missing --tool", () => {
		expect(parseE2eOptions(["--bogus"]).ok).toBe(false);
		expect(parseE2eOptions(["--form=wasm-stdio"])).toEqual(
			err(
				'Unknown Form Factor "wasm-stdio". Supported values: node-stdio, bun-stdio, local-http, docker-stdio, docker-http, npm-package',
			),
		);
		expect(parseE2eOptions(["--category=unknown-cat"])).toEqual(
			err(
				'Unknown category "unknown-cat". Supported values: static-web, spa-html, hosted-binary, youtube-bing, git-repo, local-binary',
			),
		);
		expect(
			parseE2eOptions([
				"--url=https://example.com",
				"--file=/tmp/a.pdf",
				"--tool=pdf-to-markdown",
			]),
		).toEqual(err("Cannot specify both --url and --file for an ad-hoc probe"));
		expect(parseE2eOptions(["--url=https://example.com"])).toEqual(
			err("Ad-hoc probe requires --tool=<name>"),
		);
		expect(
			parseE2eOptions(["--tool=not-a-tool", "--url=https://example.com"]),
		).toEqual(err('Unknown tool "not-a-tool"'));
	});
});

describe("parseVerificationCorpus & selectVerificationCases (VF-2, D3, D38, D44)", () => {
	const validRaw = {
		version: 1,
		cases: [
			{
				id: "wiki-md",
				category: "static-web",
				tool: "webpage-to-markdown",
				args: { url: "https://en.wikipedia.org/wiki/Markdown" },
				expectByProfile: {
					full: { kind: "ok", contains: ["Markdown"] },
					"slim-pdf": { kind: "ok", contains: ["Markdown"] },
				},
			},
			{
				id: "local-docx",
				category: "local-binary",
				tool: "docx-to-markdown",
				args: { filepath: "{{SAMPLE_DIR}}/test.docx" },
				expectByProfile: {
					full: { kind: "ok", contains: ["Test DOCX"] },
					"slim-pdf": {
						kind: "error",
						contains: [
							"markitdown[all]",
							"rather than the slim Docker pdf profile",
						],
					},
				},
			},
		],
	};

	test("validates corpus manifests and rejects unknown tools or duplicate ids", () => {
		const parsed = parseVerificationCorpus(validRaw);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.value.cases).toHaveLength(2);
		}

		const badTool = parseVerificationCorpus({
			version: 1,
			cases: [
				{
					...validRaw.cases[0],
					tool: "not-a-tool",
				},
			],
		});
		expect(badTool).toEqual(
			err(
				'Invalid Verification Corpus: cases.0.tool: Unknown tool "not-a-tool"',
			),
		);

		const dup = parseVerificationCorpus({
			version: 1,
			cases: [validRaw.cases[0], validRaw.cases[0]],
		});
		expect(dup).toEqual(err('Duplicate Verification Case id "wiki-md"'));
	});

	test("filters cases by category and case id, rejecting unknown case ids or empty matches", () => {
		const parsed = parseVerificationCorpus(validRaw);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const opts = parseE2eOptions(["--category=local-binary"]);
		expect(opts.ok).toBe(true);
		if (!opts.ok) return;
		const filtered = selectVerificationCases(parsed.value, opts.value);
		expect(filtered.ok).toBe(true);
		if (filtered.ok) {
			expect(filtered.value.map((c) => c.id)).toEqual(["local-docx"]);
		}

		const badIdOpts = parseE2eOptions(["--case=missing-id"]);
		expect(badIdOpts.ok).toBe(true);
		if (!badIdOpts.ok) return;
		expect(selectVerificationCases(parsed.value, badIdOpts.value)).toEqual(
			err('Unknown Verification Case "missing-id"'),
		);
	});

	test("ships a valid repo corpus/manifest.json covering all six verification categories (VF-2, D38)", () => {
		const raw = JSON.parse(
			readFileSync(
				resolve(import.meta.dir, "../../corpus/manifest.json"),
				"utf8",
			),
		);
		const parsed = parseVerificationCorpus(raw);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const categories = new Set(parsed.value.cases.map((c) => c.category));
		for (const expectedCategory of VERIFICATION_CATEGORIES) {
			expect(categories.has(expectedCategory)).toBe(true);
		}
	});
});

describe("classifyCaseOutcome & verificationReport (VF-5, VF-6, D22, D39, D41, D44)", () => {
	const docxCase: VerificationCase = {
		id: "docx-binary",
		category: "local-binary",
		tool: "docx-to-markdown",
		args: { filepath: "{{SAMPLE_DIR}}/test.docx" },
		expectByProfile: {
			full: { kind: "ok", contains: ["Test DOCX"] },
			"slim-pdf": {
				kind: "error",
				contains: [
					"markitdown[all]",
					"rather than the slim Docker pdf profile",
				],
			},
		},
	};

	const ytCase: VerificationCase = {
		id: "youtube-watch",
		category: "youtube-bing",
		tool: "youtube-to-markdown",
		args: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
		expectByProfile: {
			full: { kind: "ok" },
			"slim-pdf": { kind: "ok" },
		},
		blockedPatterns: ["not a bot", "429"],
	};

	test("evaluates full vs slim-pdf expectations, upstream BLOCKED patterns, and timeouts", () => {
		const fullPass = classifyCaseOutcome("node-stdio", docxCase, {
			isError: false,
			text: "# Test DOCX content",
			hasOutputPath: false,
			durationMs: 25,
		});
		expect(fullPass.status).toBe("PASS");
		expect(fullPass.outputLength).toBe(19);
		expect(fullPass.outputPreview).toBe("# Test DOCX content");

		const slimPass = classifyCaseOutcome("docker-stdio", docxCase, {
			isError: true,
			text: "Error: MissingDependencyException. This format requires markitdown[all] (full local install) rather than the slim Docker pdf profile.",
			hasOutputPath: false,
			durationMs: 30,
		});
		expect(slimPass.status).toBe("PASS");

		const blocked = classifyCaseOutcome("local-http", ytCase, {
			isError: true,
			text: "Error: HTTP 429 Too Many Requests - Sign in to confirm you're not a bot",
			hasOutputPath: false,
			durationMs: 120,
		});
		expect(blocked.status).toBe("BLOCKED");

		const timedOut = classifyCaseOutcome("docker-http", docxCase, {
			isError: true,
			text: "",
			hasOutputPath: false,
			durationMs: 5000,
			timedOut: true,
		});
		expect(timedOut.status).toBe("FAIL");
	});

	test("computes three-state exit codes (0, 1, 2) and formats text & JSON reports", () => {
		const passOutcome: CaseOutcome = {
			formFactor: "node-stdio",
			caseId: "docx-binary",
			category: "local-binary",
			tool: "docx-to-markdown",
			status: "PASS",
			durationMs: 25,
			detail: "matched expected full profile output",
			outputLength: 19,
			outputPreview: "# Test DOCX content",
		};
		const blockedOutcome: CaseOutcome = {
			formFactor: "local-http",
			caseId: "youtube-watch",
			category: "youtube-bing",
			tool: "youtube-to-markdown",
			status: "BLOCKED",
			durationMs: 120,
			detail: 'matched upstream blocked pattern "not a bot"',
		};
		const failOutcome: CaseOutcome = {
			formFactor: "docker-http",
			caseId: "static-html",
			category: "static-web",
			tool: "webpage-to-markdown",
			status: "FAIL",
			durationMs: 5000,
			detail: "Case timed out",
		};

		const r0 = verificationReport([passOutcome]);
		expect(r0.exitCode).toBe(0);

		const r2 = verificationReport([passOutcome, blockedOutcome]);
		expect(r2.exitCode).toBe(2);

		const r1 = verificationReport([passOutcome, blockedOutcome, failOutcome]);
		expect(r1.exitCode).toBe(1);

		const text = formatVerificationReport(r1, false);
		expect(text).toContain(
			"total: 3 · pass: 1 · fail: 1 · blocked: 1 · exit-code: 1",
		);
		expect(text).not.toContain("preview (19 chars):");
		const withPreview = formatVerificationReport(r1, false, true);
		expect(withPreview).toContain("preview (19 chars):");
		expect(withPreview).toContain("    | # Test DOCX content");
		const json = JSON.parse(formatVerificationReport(r1, true));
		expect(json.exitCode).toBe(1);
		expect(json.blocked).toBe(1);
		expect(json.outcomes[0].outputPreview).toBe("# Test DOCX content");
	});
});
