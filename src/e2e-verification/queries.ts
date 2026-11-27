import type { CaseOutcome, VerificationReport } from "./nouns.js";

/** Derived Verification Report (D39, D41, D46): counts and three-state exit code 0 / 1 / 2. */
export const verificationReport = (
	outcomes: readonly CaseOutcome[],
): VerificationReport => {
	let passed = 0;
	let failed = 0;
	let blocked = 0;

	for (const outcome of outcomes) {
		if (outcome.status === "PASS") passed++;
		else if (outcome.status === "FAIL") failed++;
		else blocked++;
	}

	const exitCode: 0 | 1 | 2 = failed > 0 ? 1 : blocked > 0 ? 2 : 0;

	return {
		total: outcomes.length,
		passed,
		failed,
		blocked,
		exitCode,
		outcomes,
	};
};

/** Pure renderer for human-readable or JSON Verification Report output (D39, D45, D46). */
export const formatVerificationReport = (
	report: VerificationReport,
	json: boolean,
	showPreview = false,
): string => {
	if (json) {
		return JSON.stringify(report, null, 2);
	}
	const header = `total: ${report.total} · pass: ${report.passed} · fail: ${report.failed} · blocked: ${report.blocked} · exit-code: ${report.exitCode}`;
	const rows: string[] = [];
	for (const o of report.outcomes) {
		rows.push(`  ${o.status} [${o.formFactor}] ${o.caseId}: ${o.detail}`);
		if ((showPreview || o.category === "ad-hoc") && o.outputPreview) {
			const lenLabel =
				o.outputLength !== undefined ? ` (${o.outputLength} chars)` : "";
			rows.push(`    preview${lenLabel}:`);
			for (const line of o.outputPreview.split("\n").slice(0, 6)) {
				rows.push(`    | ${line}`);
			}
		}
	}
	return [header, ...rows].join("\n");
};
