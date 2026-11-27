import type {
	RepomixError,
	RepomixOutput,
	RunRepomix,
} from "../../git-repo-conversion/ports.js";
import { err, ok, type Result } from "../../shared/types.js";
import type { ClockMock } from "../clock/mock.js";

type RepomixMode =
	| { readonly kind: "ok"; readonly stdout: string }
	| { readonly kind: "empty" }
	| { readonly kind: "failed"; readonly reason: string }
	| { readonly kind: "missing" };

export type RepomixMock = {
	readonly run: RunRepomix;
	readonly stub: (text: string) => void;
	readonly setEmpty: () => void;
	readonly setFail: (reason: string) => void;
	readonly setMissing: () => void;
	readonly setSlow: (durationMs: number) => void;
	readonly lastArgs: () => readonly string[] | undefined;
};

export const createRepomixMock = (clock?: ClockMock): RepomixMock => {
	let mode: RepomixMode = { kind: "ok", stdout: "" };
	let recordedArgs: readonly string[] | undefined;
	let delayMs = 0;

	return {
		stub: (text) => {
			mode = { kind: "ok", stdout: text };
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
		lastArgs: () => recordedArgs,
		run: async (
			args: readonly string[],
			timeoutMs: number,
		): Promise<Result<RepomixOutput, RepomixError>> => {
			recordedArgs = [...args];
			if (delayMs > timeoutMs) {
				clock?.advance({ ms: timeoutMs });
				return err({ kind: "timeout", timeoutMs });
			}
			if (delayMs > 0) {
				clock?.advance({ ms: delayMs });
			}
			switch (mode.kind) {
				case "ok":
					return ok({ stdout: mode.stdout, stderr: "" });
				case "empty":
					return ok({ stdout: "   \n  ", stderr: "" });
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
