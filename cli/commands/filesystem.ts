import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

export const filesystem: Command = {
	kind: "world",
	usage: "filesystem temp-count | filesystem staged-count",
	summary: "inspect mock temporary file state",
	run: async ([sub, ...rest], world) => {
		if (rest.length > 0) return err(`usage: ${filesystem.usage}`);
		switch (sub) {
			case "temp-count":
				return ok([
					`active temp dirs: ${world.filesystem.activeTempDirCount()}`,
				]);
			case "staged-count":
				return ok([`staged count: ${world.filesystem.stagedCount()}`]);
			default:
				return err(`usage: ${filesystem.usage}`);
		}
	},
};
