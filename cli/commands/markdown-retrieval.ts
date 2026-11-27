import {
	retrieveMarkdownFile,
	validateMarkdownRetrievalRequest,
} from "../../src/markdown-retrieval/verbs.ts";
import { resolveFileAccessPolicy } from "../../src/shared/local-access.ts";
import { err, ok } from "../../src/shared/types.ts";
import type { Command } from "../command.ts";

const formatOutput = (
	resolvedPath: string,
	text: string,
): readonly string[] => {
	const header = `ok: get-markdown-file (path: ${resolvedPath})`;
	if (text === "") {
		return [header, "(empty)"];
	}
	const bodyLines = text.split("\n").map((line) => `| ${line}`);
	return [header, ...bodyLines];
};

export const retrieve: Command = {
	kind: "domain",
	usage: "retrieve [filepath]",
	summary: "retrieve an existing local Markdown File into a Markdown Result",
	run: async (args, world) => {
		if (args.length > 1) {
			return err(`usage: ${retrieve.usage}`);
		}
		const [target] = args;
		const validated = validateMarkdownRetrievalRequest(target);
		if (!validated.ok) return err(validated.error);

		const delimiter = world.mode === "mock" ? ":" : undefined;
		const policyResult = resolveFileAccessPolicy(
			world.env,
			world.filesystem.expandHome,
			{ delimiter },
		);
		if (!policyResult.ok) return err(policyResult.error);

		const result = await retrieveMarkdownFile(
			validated.value,
			{
				expandHome: world.filesystem.expandHome,
				resolveRealpath: world.filesystem.resolveRealpath,
				statFile: world.filesystem.statFile,
				readTextFile: world.filesystem.readTextFile,
			},
			{ accessPolicy: policyResult.value, pathDelimiter: delimiter },
		);
		if (!result.ok) return err(result.error);
		return ok(formatOutput(result.value.path, result.value.text));
	},
};
