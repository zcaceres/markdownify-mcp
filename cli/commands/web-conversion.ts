import { LOCAL_FILE_TOOLS } from "../../src/local-file-conversion/nouns.ts";
import {
	convertLocalFile,
	resolveFileAccessPolicy,
	validateLocalFileRequest,
} from "../../src/local-file-conversion/verbs.ts";
import { err, ok } from "../../src/shared/types.ts";
import { WEB_URL_TOOLS } from "../../src/web-conversion/nouns.ts";
import {
	convertWebUrl,
	parseWebLimits,
	validateWebRequest,
} from "../../src/web-conversion/verbs.ts";
import type { Command } from "../command.ts";

const formatOutput = (tool: string, text: string): readonly string[] => {
	const header = `ok: ${tool} (path: none)`;
	if (text === "") {
		return [header, "(empty)"];
	}
	const bodyLines = text.split("\n").map((line) => `| ${line}`);
	return [header, ...bodyLines];
};

export const convert: Command = {
	kind: "domain",
	usage: "convert <tool> [url|filepath]",
	summary: "convert a Web URL or Local File into a Markdown Result",
	run: async (args, world) => {
		if (args.length > 2) {
			return err(`usage: ${convert.usage}`);
		}
		const [tool = "", target] = args;

		if ((LOCAL_FILE_TOOLS as readonly string[]).includes(tool)) {
			const validated = validateLocalFileRequest(tool, target);
			if (!validated.ok) return err(validated.error);

			const delimiter = world.mode === "mock" ? ":" : undefined;
			const policyResult = resolveFileAccessPolicy(
				world.env,
				world.filesystem.expandHome,
				{ delimiter },
			);
			if (!policyResult.ok) return err(policyResult.error);

			const result = await convertLocalFile(
				validated.value,
				{
					expandHome: world.filesystem.expandHome,
					resolveRealpath: world.filesystem.resolveRealpath,
					statFile: world.filesystem.statFile,
					convertWithMarkitdown: world.markitdown.convert,
				},
				{ accessPolicy: policyResult.value, pathDelimiter: delimiter },
			);
			if (!result.ok) return err(result.error);
			return ok(formatOutput(validated.value.tool, result.value.text));
		}

		if ((WEB_URL_TOOLS as readonly string[]).includes(tool)) {
			const validated = validateWebRequest(tool, target);
			if (!validated.ok) return err(validated.error);

			const limits = parseWebLimits(world.env);
			if (!limits.ok) return err(limits.error);

			const result = await convertWebUrl(
				validated.value,
				{
					resolveHost: world.network.resolveHost,
					fetchWebUrl: world.network.fetchWebUrl,
					stageTempFile: world.filesystem.stageTempFile,
					cleanupTempFile: world.filesystem.cleanupTempFile,
					convertWithMarkitdown: world.markitdown.convert,
				},
				limits.value,
			);
			if (!result.ok) return err(result.error);
			return ok(formatOutput(validated.value.tool, result.value.text));
		}

		return err(`Unknown conversion tool "${tool}"`);
	},
};
