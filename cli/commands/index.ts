import type { Command } from "../command.ts";
import { clock } from "./clock.ts";
import { config } from "./config.ts";
import { e2e } from "./e2e-verification.ts";
import { filesystem } from "./filesystem.ts";
import { retrieve } from "./markdown-retrieval.ts";
import { markitdown } from "./markitdown.ts";
import { mcp } from "./mcp-contract.ts";
import { network } from "./network.ts";
import { repomix } from "./repomix.ts";
import { serve } from "./server-config.ts";
import { convert } from "./web-conversion.ts";

/**
 * Every harness command, by the name you type. Domain commands live in `./<context>.ts`, and external system world
 * commands live in `./<system>.ts`. `help` and `reset` belong to the session.
 */
export const commands: Readonly<Record<string, Command>> = {
	clock,
	config,
	convert,
	e2e,
	filesystem,
	markitdown,
	mcp,
	network,
	repomix,
	retrieve,
	serve,
};
