import { GIT_REPO_TOOLS } from "../../src/git-repo-conversion/nouns.ts";
import {
	convertGitRepo,
	parseGitRepoLimits,
	validateGitRepoRequest,
} from "../../src/git-repo-conversion/verbs.ts";
import { LOCAL_FILE_TOOLS } from "../../src/local-file-conversion/nouns.ts";
import {
	convertLocalFile,
	parseLocalFileLimits,
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
	usage: "convert <tool> [url|filepath] [--branch=<ref>] [--compress]",
	summary:
		"convert a Web URL, Local File, or Git Repository into a Markdown Result",
	run: async (args, world) => {
		const [tool = "", target, ...rest] = args;

		if ((GIT_REPO_TOOLS as readonly string[]).includes(tool)) {
			let branch: string | undefined;
			let compress = false;
			for (const flag of rest) {
				if (flag.startsWith("--branch=")) {
					branch = flag.slice("--branch=".length);
				} else if (flag === "--compress") {
					compress = true;
				} else {
					return err(`usage: ${convert.usage}`);
				}
			}
			const validated = validateGitRepoRequest(target, branch, compress);
			if (!validated.ok) return err(validated.error);

			const limitsResult = parseGitRepoLimits(world.env);
			if (!limitsResult.ok) return err(limitsResult.error);

			const result = await convertGitRepo(
				validated.value,
				{
					resolveHost: world.network.resolveHost,
					runRepomix: world.repomix.run,
				},
				{ repomixTimeoutMs: limitsResult.value.repomixTimeoutMs },
			);
			if (!result.ok) return err(result.error);
			return ok(formatOutput(tool, result.value.text));
		}

		if (args.length > 2) {
			return err(`usage: ${convert.usage}`);
		}

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

			const limitsResult = parseLocalFileLimits(world.env);
			if (!limitsResult.ok) return err(limitsResult.error);

			const result = await convertLocalFile(
				validated.value,
				{
					expandHome: world.filesystem.expandHome,
					resolveRealpath: world.filesystem.resolveRealpath,
					statFile: world.filesystem.statFile,
					convertWithMarkitdown: world.markitdown.convert,
				},
				{
					accessPolicy: policyResult.value,
					markitdownTimeoutMs: limitsResult.value.markitdownTimeoutMs,
					pathDelimiter: delimiter,
				},
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
