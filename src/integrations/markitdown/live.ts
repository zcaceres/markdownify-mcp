import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { err, ok, type Result } from "../../shared/types.js";
import { resolveMarkitdownPath } from "../../utils.js";
import type {
	ConvertWithMarkitdown,
	MarkitdownError,
} from "../../web-conversion/ports.js";

const execFileAsync = promisify(execFile);

export type LiveMarkitdown = {
	readonly convert: ConvertWithMarkitdown;
	readonly lastInput: () => string | undefined;
};

export const createLiveMarkitdown = (projectRoot: string): LiveMarkitdown => {
	let recordedInput: string | undefined;

	return {
		lastInput: () => recordedInput,
		convert: async (
			inputPath: string,
			timeoutMs: number,
		): Promise<Result<string, MarkitdownError>> => {
			recordedInput = inputPath;
			const markitdownPath = resolveMarkitdownPath(projectRoot);
			try {
				const { stdout } = await execFileAsync(markitdownPath, [inputPath], {
					maxBuffer: 50 * 1024 * 1024,
					timeout: timeoutMs,
					env: { ...process.env, PYTHONUTF8: "1" },
				});
				return ok(stdout);
			} catch (error: unknown) {
				const procErr = error as NodeJS.ErrnoException & {
					killed?: boolean;
				};
				if (procErr?.code === "ENOENT") {
					return err({ kind: "missing" });
				}
				if (procErr?.killed || procErr?.code === "ETIMEDOUT") {
					return err({ kind: "timeout", timeoutMs });
				}
				const reason =
					error instanceof Error ? error.message : "Unknown markitdown error";
				return err({ kind: "failed", reason });
			}
		},
	};
};
