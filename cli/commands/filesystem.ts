import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

export const filesystem: Command = {
	kind: "world",
	usage:
		"filesystem temp-count | filesystem staged-count | filesystem put <path> [content...] | filesystem mkdir <path> | filesystem unreadable <path> | filesystem symlink <link> <target>",
	summary: "inspect temporary file state or stage mock local files",
	run: async ([sub, target, ...extra], world) => {
		if (sub === "temp-count" || sub === "staged-count") {
			if (target !== undefined) return err(`usage: ${filesystem.usage}`);
			return sub === "temp-count"
				? ok([`active temp dirs: ${world.filesystem.activeTempDirCount()}`])
				: ok([`staged count: ${world.filesystem.stagedCount()}`]);
		}
		if (world.mode === "live") {
			if (!sub) return err(`usage: ${filesystem.usage}`);
			return err(`filesystem ${sub} is only available in mock mode`);
		}
		if (sub === "symlink") {
			const [linkTarget] = extra;
			if (!target || !linkTarget || extra.length !== 1) {
				return err(`usage: ${filesystem.usage}`);
			}
			world.filesystem.symlink(target, linkTarget);
			return ok([`created symlink ${target} -> ${linkTarget}`]);
		}
		if (sub === "put") {
			if (!target) {
				return err(`usage: ${filesystem.usage}`);
			}
			const content =
				extra.length > 0 ? extra.join(" ").replace(/\\n/g, "\n") : "";
			world.filesystem.putFile(target, content);
			return ok([`created file ${target}`]);
		}
		if (!target || extra.length > 0) {
			return err(`usage: ${filesystem.usage}`);
		}
		switch (sub) {
			case "mkdir":
				world.filesystem.mkdir(target);
				return ok([`created dir ${target}`]);
			case "unreadable":
				world.filesystem.putUnreadable(target);
				return ok([`created unreadable file ${target}`]);
			default:
				return err(`usage: ${filesystem.usage}`);
		}
	},
};
