import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
	RepomixError,
	RepomixOutput,
	RunRepomix,
} from "../../git-repo-conversion/ports.js";
import { err, ok, type Result } from "../../shared/types.js";
import { resolveRepomixPath } from "../../utils.js";

const execFileAsync = promisify(execFile);

export type LiveRepomix = {
	readonly run: RunRepomix;
	readonly lastArgs: () => readonly string[] | undefined;
};

const getStringProp = (value: unknown, key: string): string | undefined => {
	if (typeof value !== "object" || value === null || !(key in value)) {
		return undefined;
	}
	const prop = Reflect.get(value, key);
	return typeof prop === "string" ? prop : undefined;
};

const getBooleanProp = (value: unknown, key: string): boolean => {
	if (typeof value !== "object" || value === null || !(key in value)) {
		return false;
	}
	return Reflect.get(value, key) === true;
};

export const createLiveRepomix = (projectRoot: string): LiveRepomix => {
	let recordedArgs: readonly string[] | undefined;

	return {
		lastArgs: () => recordedArgs,
		run: async (
			args: readonly string[],
			timeoutMs: number,
		): Promise<Result<RepomixOutput, RepomixError>> => {
			recordedArgs = [...args];
			const repomixPath = resolveRepomixPath(projectRoot);
			try {
				const { stdout, stderr } = await execFileAsync(repomixPath, [...args], {
					maxBuffer: 100 * 1024 * 1024, // 100 MB (D7)
					timeout: timeoutMs,
				});
				return ok({ stdout, stderr });
			} catch (error: unknown) {
				const code = getStringProp(error, "code");
				if (code === "ENOENT") {
					return err({ kind: "missing" });
				}
				if (getBooleanProp(error, "killed") || code === "ETIMEDOUT") {
					return err({ kind: "timeout", timeoutMs });
				}
				const stderr = getStringProp(error, "stderr")?.trim();
				const reason =
					stderr ||
					(error instanceof Error ? error.message : "Unknown repomix error");
				return err({ kind: "failed", reason });
			}
		},
	};
};
