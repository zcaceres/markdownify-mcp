import { parseDuration } from "../../src/integrations/clock/mock.ts";
import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

export const clock: Command = {
	kind: "world",
	usage: "clock | clock advance <10s|30m|3h|14d> | clock set <ISO time>",
	summary: "the world's time; in mock mode it moves only when you move it",
	run: async ([sub, value], world) => {
		if (sub === undefined) {
			return ok([world.clock.now().toISOString()]);
		}
		if (world.mode === "live") {
			return err(`clock ${sub} is only available in mock mode`);
		}
		switch (sub) {
			case "advance": {
				const duration = parseDuration(value ?? "");
				if (!duration.ok) return err(duration.error);
				return ok([world.clock.advance(duration.value).toISOString()]);
			}
			case "set": {
				const to = new Date(value ?? "");
				if (Number.isNaN(to.getTime())) {
					return err(`not a time: "${value ?? ""}"`);
				}
				return ok([world.clock.set(to).toISOString()]);
			}
			default:
				return err(`usage: ${clock.usage}`);
		}
	},
};
