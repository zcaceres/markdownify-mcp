import type { Session } from "./session.ts";

/**
 * A scenario is a journey told as harness commands, with what each one prints:
 *
 *   # Why the next steps matter, citing the criterion, D#, U# or I# they show
 *   > clock advance 30m
 *   2026-01-05T09:30:00.000Z
 *
 * A line starting `> ` is a command. The lines after it, up to the next blank line, comment or command, are what it
 * printed. Running a scenario replays every command in a fresh session; it passes when every command prints what the
 * scenario says it prints.
 */
export type Step =
	| { readonly kind: "text"; readonly line: string }
	| {
			readonly kind: "command";
			readonly command: string;
			readonly expected: readonly string[];
	  };

export type Ran =
	| { readonly kind: "text"; readonly line: string }
	| {
			readonly kind: "command";
			readonly command: string;
			readonly expected: readonly string[];
			readonly actual: readonly string[];
	  };

const isOutput = (line: string) =>
	line.trim() !== "" && !line.startsWith("#") && !line.startsWith(">");

export const parse = (text: string): Step[] => {
	const lines = text.split("\n");
	const steps: Step[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		i++;
		if (!line.startsWith("> ")) {
			steps.push({ kind: "text", line });
			continue;
		}
		const expected: string[] = [];
		while (i < lines.length && isOutput(lines[i] ?? "")) {
			expected.push(lines[i++] ?? "");
		}
		steps.push({ kind: "command", command: line.slice(2), expected });
	}
	return steps;
};

export const run = async (
	steps: readonly Step[],
	session: Session,
): Promise<Ran[]> => {
	const ran: Ran[] = [];
	for (const step of steps) {
		if (step.kind === "text") {
			ran.push(step);
			continue;
		}
		const actual = await session.exec(step.command);
		const unreadable = actual.find((line) => !isOutput(line));
		if (unreadable !== undefined) {
			throw new Error(
				`"${step.command}" printed a line a scenario can't hold (blank, or starting # or >): "${unreadable}"`,
			);
		}
		ran.push({ ...step, actual });
	}
	return ran;
};

const matches = (step: Ran) =>
	step.kind === "text" ||
	(step.expected.length === step.actual.length &&
		step.expected.every((line, i) => line === step.actual[i]));

export const passed = (ran: readonly Ran[]): boolean => ran.every(matches);

/** The scenario as it ran: what every command prints now. Writing this back accepts the new behavior. */
export const render = (ran: readonly Ran[]): string =>
	ran
		.flatMap((step) =>
			step.kind === "text"
				? [step.line]
				: [`> ${step.command}`, ...step.actual],
		)
		.join("\n");

/** The scenario as it ran, with `- expected` / `+ actual` under each command that printed something else. */
export const report = (ran: readonly Ran[]): string =>
	ran
		.flatMap((step) => {
			if (step.kind === "text") return [step.line];
			if (matches(step)) return [`> ${step.command}`, ...step.actual];
			return [
				`> ${step.command}`,
				...step.expected.map((line) => `- ${line}`),
				...step.actual.map((line) => `+ ${line}`),
			];
		})
		.join("\n");
