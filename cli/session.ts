import type { Command } from "./command.ts";
import { commands as allCommands } from "./commands/index.ts";
import { createWorld, type World } from "./world.ts";

/**
 * A harness session: one world, and the commands you run against it. Domain code keeps no state; everything lives in
 * the world's mocks, so `reset` starts the session over.
 */
export type Session = { exec: (line: string) => Promise<string[]> };

export const createSession = ({
	connect = createWorld,
	commands = allCommands,
}: {
	connect?: () => World;
	commands?: Readonly<Record<string, Command>>;
} = {}): Session => {
	let world = connect();

	return {
		exec: async (line) => {
			const [name, ...args] = line.trim().split(/\s+/);
			if (!name || name.startsWith("#")) return [];
			if (name === "help") return help(commands);
			if (name === "reset") {
				world = connect();
				return ["the world is back to its fixtures"];
			}
			const command = Object.hasOwn(commands, name)
				? commands[name]
				: undefined;
			if (!command) return [`error: unknown command "${name}"; try help`];
			const result = await command.run(args, world);
			return result.ok ? [...result.value] : [`error: ${result.error}`];
		},
	};
};

const help = (commands: Readonly<Record<string, Command>>): string[] => {
	const section = (title: string, kind: Command["kind"]) => {
		const lines = Object.values(commands)
			.filter((command) => command.kind === kind)
			.flatMap((command) => [`  ${command.usage}`, `      ${command.summary}`]);
		return [title, ...(lines.length > 0 ? lines : ["  (none yet)"])];
	};
	return [
		...section("What users do:", "domain"),
		...section("What the world does:", "world"),
		"The harness:",
		"  help",
		"      this list",
		"  reset",
		"      the world back to its fixtures",
	];
};
