import {
	FORM_FACTORS,
	type FormFactor,
	type VerificationCase,
} from "../../src/e2e-verification/nouns.ts";
import {
	formatVerificationReport,
	verificationReport,
} from "../../src/e2e-verification/queries.ts";
import {
	classifyCaseOutcome,
	parseE2eOptions,
	parseVerificationCorpus,
} from "../../src/e2e-verification/verbs.ts";
import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

const SAMPLE_CASES: Readonly<Record<string, VerificationCase>> = {
	"docx-binary": {
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
	},
	"youtube-watch": {
		id: "youtube-watch",
		category: "youtube-bing",
		tool: "youtube-to-markdown",
		args: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
		expectByProfile: {
			full: { kind: "ok" },
			"slim-pdf": { kind: "ok" },
		},
		blockedPatterns: ["not a bot", "429", "captcha"],
	},
	"static-html": {
		id: "static-html",
		category: "static-web",
		tool: "webpage-to-markdown",
		args: { url: "https://example.com" },
		expectByProfile: {
			full: { kind: "ok", contains: ["Example"] },
			"slim-pdf": { kind: "ok", contains: ["Example"] },
		},
	},
};

const isFormFactor = (value: string): value is FormFactor =>
	(FORM_FACTORS as readonly string[]).includes(value);

export const e2e: Command = {
	kind: "domain",
	usage:
		"e2e parse [flags...] | e2e validate-manifest <json> | e2e evaluate <form> <sampleCase> <ok|error|timeout> [text...] | e2e report [--json]",
	summary:
		"parse E2E options, validate Verification Corpus manifests, classify outcomes, and render Verification Reports",
	run: async ([sub, ...rest], world) => {
		if (sub === "parse") {
			const parsed = parseE2eOptions(rest);
			if (!parsed.ok) return err(parsed.error);
			const opts = parsed.value;
			const adHocLine = opts.adHoc
				? [
						opts.adHoc.tool,
						opts.adHoc.url ? `url=${opts.adHoc.url}` : undefined,
						opts.adHoc.filePath ? `file=${opts.adHoc.filePath}` : undefined,
						opts.adHoc.branch ? `branch=${opts.adHoc.branch}` : undefined,
						opts.adHoc.compress ? "compress=true" : undefined,
					]
						.filter(Boolean)
						.join(" ")
				: "(none)";
			return ok([
				`form-factors: ${opts.formFactors.join(", ")}`,
				`categories: ${opts.categories.length > 0 ? opts.categories.join(", ") : "(all)"}`,
				`cases: ${opts.caseIds.length > 0 ? opts.caseIds.join(", ") : "(all)"}`,
				`ad-hoc: ${adHocLine}`,
				`flags: toolset=${opts.toolset} json=${opts.json} preview=${opts.preview} no-build=${opts.noBuild} reuse-venv=${opts.reuseVenv}`,
			]);
		}

		if (sub === "validate-manifest") {
			const rawJson = rest.join(" ").trim();
			if (!rawJson) return err("usage: e2e validate-manifest <json>");
			let parsedJson: unknown;
			try {
				parsedJson = JSON.parse(rawJson);
			} catch (e) {
				return err(
					`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
				);
			}
			const corpus = parseVerificationCorpus(parsedJson);
			if (!corpus.ok) return err(corpus.error);
			return ok([
				`ok: corpus v${corpus.value.version} (${corpus.value.cases.length} cases)`,
			]);
		}

		if (sub === "evaluate") {
			const [formRaw, caseId, mode, ...textParts] = rest;
			if (!formRaw || !caseId || !mode) {
				return err(
					"usage: e2e evaluate <form> <sampleCase> <ok|error|timeout> [text...]",
				);
			}
			if (!isFormFactor(formRaw)) {
				return err(
					`Unknown Form Factor "${formRaw}". Supported values: ${FORM_FACTORS.join(", ")}`,
				);
			}
			const sampleCase = SAMPLE_CASES[caseId];
			if (!sampleCase) {
				return err(`Unknown sample case "${caseId}"`);
			}
			const text = textParts.join(" ");
			const outcome = classifyCaseOutcome(formRaw, sampleCase, {
				isError: mode === "error" || mode === "timeout",
				text,
				hasOutputPath: false,
				durationMs: 0,
				timedOut: mode === "timeout",
			});
			world.e2eOutcomes.push(outcome);
			return ok([
				`${outcome.status} (${outcome.formFactor}/${outcome.caseId}): ${outcome.detail}`,
			]);
		}

		if (sub === "report") {
			const json = rest.includes("--json");
			const preview = rest.includes("--preview");
			const report = verificationReport(world.e2eOutcomes);
			return ok(formatVerificationReport(report, json, preview).split("\n"));
		}

		return err(`usage: ${e2e.usage}`);
	},
};
