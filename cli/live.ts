import type { Session } from "./session.ts";

export type LiveAssertion =
	| { readonly kind: "ok"; readonly raw: string }
	| {
			readonly kind: "error";
			readonly substring?: string;
			readonly raw: string;
	  }
	| {
			readonly kind: "contains";
			readonly substring: string;
			readonly raw: string;
	  }
	| { readonly kind: "exact"; readonly line: string; readonly raw: string }
	| { readonly kind: "not-empty"; readonly raw: string };

export type LiveStep =
	| { readonly kind: "text"; readonly line: string }
	| {
			readonly kind: "command";
			readonly command: string;
			readonly assertions: readonly LiveAssertion[];
	  };

export type CheckedAssertion = {
	readonly assertion: LiveAssertion;
	readonly ok: boolean;
	readonly detail?: string;
};

export type LiveRan =
	| { readonly kind: "text"; readonly line: string }
	| {
			readonly kind: "command";
			readonly command: string;
			readonly actual: readonly string[];
			readonly checks: readonly CheckedAssertion[];
	  };

const parseAssertion = (line: string): LiveAssertion => {
	if (line === "expect ok") {
		return { kind: "ok", raw: line };
	}
	if (line === "expect not-empty") {
		return { kind: "not-empty", raw: line };
	}
	if (line === "expect error") {
		return { kind: "error", raw: line };
	}
	if (line.startsWith("expect error ")) {
		return {
			kind: "error",
			substring: line.slice("expect error ".length),
			raw: line,
		};
	}
	if (line.startsWith("expect contains ")) {
		return {
			kind: "contains",
			substring: line.slice("expect contains ".length),
			raw: line,
		};
	}
	if (line.startsWith("expect exact ")) {
		return {
			kind: "exact",
			line: line.slice("expect exact ".length),
			raw: line,
		};
	}
	throw new Error(`Unknown live assertion directive: "${line}"`);
};

const expandLiveVars = (
	text: string,
	vars?: Readonly<Record<string, string>>,
): string => {
	if (!vars) return text;
	return text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, name: string) => {
		const replacement = vars[name];
		return replacement !== undefined ? replacement : match;
	});
};

export const parseLive = (
	text: string,
	vars?: Readonly<Record<string, string>>,
): LiveStep[] => {
	const lines = expandLiveVars(text, vars).split("\n");
	const steps: LiveStep[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		i++;
		if (!line.startsWith("> ")) {
			steps.push({ kind: "text", line });
			continue;
		}
		const assertions: LiveAssertion[] = [];
		while (i < lines.length && (lines[i] ?? "").startsWith("expect ")) {
			assertions.push(parseAssertion((lines[i] ?? "").trim()));
			i++;
		}
		steps.push({ kind: "command", command: line.slice(2), assertions });
	}
	return steps;
};

const evaluateAssertion = (
	assertion: LiveAssertion,
	actual: readonly string[],
): CheckedAssertion => {
	const first = actual[0] ?? "";
	const joined = actual.join("\n");
	const isErr = first.startsWith("error: ");

	switch (assertion.kind) {
		case "ok":
			return isErr
				? { assertion, ok: false, detail: `got ${first}` }
				: { assertion, ok: true };
		case "error": {
			if (!isErr) {
				return {
					assertion,
					ok: false,
					detail: `expected error, got "${first}"`,
				};
			}
			if (assertion.substring && !joined.includes(assertion.substring)) {
				return {
					assertion,
					ok: false,
					detail: `error did not contain "${assertion.substring}"`,
				};
			}
			return { assertion, ok: true };
		}
		case "contains":
			return joined.includes(assertion.substring)
				? { assertion, ok: true }
				: {
						assertion,
						ok: false,
						detail: `output did not contain "${assertion.substring}"`,
					};
		case "exact":
			return actual.includes(assertion.line)
				? { assertion, ok: true }
				: {
						assertion,
						ok: false,
						detail: `expected exact line "${assertion.line}"`,
					};
		case "not-empty": {
			const hasContent =
				actual.length > 0 &&
				!isErr &&
				!actual.includes("(empty)") &&
				actual.some(
					(line) => line.startsWith("| ") && line.slice(2).trim() !== "",
				);
			return hasContent
				? { assertion, ok: true }
				: { assertion, ok: false, detail: "output was empty" };
		}
		default: {
			const exhaustive: never = assertion;
			return exhaustive;
		}
	}
};

export const runLive = async (
	steps: readonly LiveStep[],
	session: Session,
): Promise<LiveRan[]> => {
	const ran: LiveRan[] = [];
	for (const step of steps) {
		if (step.kind === "text") {
			ran.push(step);
			continue;
		}
		const actual = await session.exec(step.command);
		const checks = step.assertions.map((assertion) =>
			evaluateAssertion(assertion, actual),
		);
		ran.push({ kind: "command", command: step.command, actual, checks });
	}
	return ran;
};

export const passedLive = (ran: readonly LiveRan[]): boolean =>
	ran.every(
		(step) => step.kind === "text" || step.checks.every((check) => check.ok),
	);

export const reportLive = (ran: readonly LiveRan[]): string =>
	ran
		.flatMap((step) => {
			if (step.kind === "text") return [step.line];
			const stepPassed = step.checks.every((check) => check.ok);
			const checkLines = step.checks.map((check) =>
				check.ok
					? `  PASS: ${check.assertion.raw}`
					: `  FAIL: ${check.assertion.raw} (${check.detail ?? "mismatch"})`,
			);
			const preview = stepPassed
				? step.actual.slice(0, 4).map((line) => `  out: ${line}`)
				: step.actual.map((line) => `  out: ${line}`);
			const ellipsis =
				stepPassed && step.actual.length > 4
					? [`  out: ... (${step.actual.length - 4} more lines)`]
					: [];
			return [`> ${step.command}`, ...checkLines, ...preview, ...ellipsis];
		})
		.join("\n");
