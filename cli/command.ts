import type { Result } from "../src/shared/types.ts";
import type { World } from "./world.ts";

/**
 * A harness command.
 *
 * - A **domain** command is something a user does or sees, named as REQUIREMENTS.md → Terminology names it.
 * - A **world** command is something the outside world does, played by a mock: time passing, a remote host
 *   redirecting, a CLI failing.
 *
 * `run` returns the lines to print, or an error, which the session prints as `error: …`. Output has no blank lines and
 * no line starts with `#` or `>`, so a scenario can tell output from comments and commands.
 */
export type Command = {
	readonly kind: "domain" | "world";
	readonly usage: string;
	readonly summary: string;
	readonly run: (
		args: readonly string[],
		world: World,
	) => Promise<Result<readonly string[], string>>;
};
