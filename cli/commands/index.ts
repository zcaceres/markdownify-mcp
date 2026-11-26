import type { Command } from "../command.ts";
import { clock } from "./clock.ts";
import { config } from "./config.ts";
import { filesystem } from "./filesystem.ts";
import { markitdown } from "./markitdown.ts";
import { network } from "./network.ts";
import { convert } from "./web-conversion.ts";

/**
 * Every harness command, by the name you type. Domain commands live in `./<context>.ts`, and external system world
 * commands live in `./<system>.ts`. `help` and `reset` belong to the session.
 */
export const commands: Readonly<Record<string, Command>> = {
	clock,
	config,
	convert,
	filesystem,
	markitdown,
	network,
};
