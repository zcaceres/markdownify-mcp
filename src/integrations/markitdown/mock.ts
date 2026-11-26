import { err, ok, type Result } from "../../shared/types.js";
import type {
	ConvertWithMarkitdown,
	MarkitdownError,
} from "../../web-conversion/ports.js";
import type { ClockMock } from "../clock/mock.js";

type MarkitdownMode =
	| { readonly kind: "ok"; readonly text: string }
	| { readonly kind: "empty" }
	| { readonly kind: "failed"; readonly reason: string }
	| { readonly kind: "missing" };

export type MarkitdownMock = {
	readonly convert: ConvertWithMarkitdown;
	readonly stub: (text: string) => void;
	readonly setEmpty: () => void;
	readonly setFail: (reason: string) => void;
	readonly setMissing: () => void;
	readonly setSlow: (durationMs: number) => void;
	readonly lastInput: () => string | undefined;
};

export const createMarkitdownMock = (clock?: ClockMock): MarkitdownMock => {
	let mode: MarkitdownMode = { kind: "ok", text: "" };
	let recordedInput: string | undefined;
	let delayMs = 0;

	return {
		stub: (text) => {
			mode = { kind: "ok", text };
		},
		setEmpty: () => {
			mode = { kind: "empty" };
		},
		setFail: (reason) => {
			mode = { kind: "failed", reason };
		},
		setMissing: () => {
			mode = { kind: "missing" };
		},
		setSlow: (ms) => {
			delayMs = ms;
		},
		lastInput: () => recordedInput,
		convert: async (
			inputPath: string,
			timeoutMs: number,
		): Promise<Result<string, MarkitdownError>> => {
			recordedInput = inputPath;
			if (delayMs > timeoutMs) {
				clock?.advance({ ms: timeoutMs });
				return err({ kind: "timeout", timeoutMs });
			}
			if (delayMs > 0) {
				clock?.advance({ ms: delayMs });
			}
			switch (mode.kind) {
				case "ok":
					return ok(mode.text);
				case "empty":
					return ok("   \n  ");
				case "failed":
					return err({ kind: "failed", reason: mode.reason });
				case "missing":
					return err({ kind: "missing" });
				default: {
					const exhaustive: never = mode;
					return exhaustive;
				}
			}
		},
	};
};
