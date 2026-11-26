import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

export const config: Command = {
	kind: "world",
	usage: "config set <VAR> <value> | config clear <VAR>",
	summary:
		"override Server Configuration environment variables for this session",
	run: async ([sub, name, value, ...extra], world) => {
		switch (sub) {
			case "set": {
				if (!name || value === undefined || extra.length > 0) {
					return err(`usage: ${config.usage}`);
				}
				world.env[name] = value;
				return ok([`config ${name} = ${value}`]);
			}
			case "clear": {
				if (!name || value !== undefined) {
					return err(`usage: ${config.usage}`);
				}
				delete world.env[name];
				return ok([`config cleared ${name}`]);
			}
			default:
				return err(`usage: ${config.usage}`);
		}
	},
};
