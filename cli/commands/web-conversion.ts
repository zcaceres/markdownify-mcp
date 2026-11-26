import { err, ok } from "../../src/shared/types.ts";
import {
	convertWebUrl,
	parseWebLimits,
	validateWebRequest,
} from "../../src/web-conversion/verbs.ts";
import type { Command } from "../command.ts";

export const convert: Command = {
	kind: "domain",
	usage:
		"convert <webpage-to-markdown|youtube-to-markdown|bing-search-to-markdown> [url]",
	summary: "convert a Web URL into a Markdown Result",
	run: async (args, world) => {
		if (args.length > 2) {
			return err(`usage: ${convert.usage}`);
		}
		const [tool, url] = args;
		const validated = validateWebRequest(tool ?? "", url);
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

		const header = `ok: ${validated.value.tool} (path: none)`;
		if (result.value.text === "") {
			return ok([header, "(empty)"]);
		}
		const bodyLines = result.value.text.split("\n").map((line) => `| ${line}`);
		return ok([header, ...bodyLines]);
	},
};
