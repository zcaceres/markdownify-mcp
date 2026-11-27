import { isIP } from "node:net";
import { isValidRemoteValue } from "repomix";
import { isPrivateOrReservedIp, normalizeHostname } from "../shared/ip.js";
import { err, ok, type Result } from "../shared/types.js";
import {
	DEFAULT_REPOMIX_TIMEOUT_MS,
	GitBranchName,
	type GitRepoConversionLimits,
	type GitRepoConversionOptions,
	type GitRepoConversionRequest,
	GitRepoIdentifier,
	type MarkdownResult,
} from "./nouns.js";
import type {
	GitRepoConversionPorts,
	RepomixError,
	ResolveHost,
} from "./ports.js";
import { markdownResult } from "./queries.js";

const isBlockedHostname = (hostname: string): boolean =>
	hostname === "" ||
	hostname === "localhost" ||
	hostname.endsWith(".localhost") ||
	hostname.endsWith(".local") ||
	hostname.endsWith(".internal");

export const validateRepoIdentifier = (
	repoUrl: unknown,
): Result<GitRepoIdentifier, string> => {
	if (typeof repoUrl !== "string" || repoUrl.trim() === "") {
		return err("Repository URL is required");
	}
	const trimmed = repoUrl.trim();
	if (trimmed.includes("://")) {
		let parsed: URL;
		try {
			parsed = new URL(trimmed);
		} catch {
			return err(
				`Invalid repository URL or shorthand: ${trimmed}. Use a GitHub URL (https://github.com/owner/repo) or shorthand (owner/repo).`,
			);
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return err("Only http: and https: repository URLs are allowed.");
		}
		if (parsed.username !== "" || parsed.password !== "") {
			return err("Repository URLs with embedded credentials are not allowed.");
		}
		const hostname = normalizeHostname(parsed.hostname);
		if (isBlockedHostname(hostname) || isPrivateOrReservedIp(hostname)) {
			return err(`Fetching ${trimmed} is potentially dangerous, aborting.`);
		}
	} else if (/^(?:[^/\s@]+@)?[^/\s@]+:/.test(trimmed)) {
		return err(
			`Repository shorthand "${trimmed}" uses scp-style SSH syntax, which is not allowed. Use an http(s) URL (e.g. https://github.com/owner/repo).`,
		);
	}

	if (!isValidRemoteValue(trimmed)) {
		return err(
			`Invalid repository URL or shorthand: ${trimmed}. Use a GitHub URL (https://github.com/owner/repo) or shorthand (owner/repo).`,
		);
	}
	return ok(GitRepoIdentifier(trimmed));
};

export const validateGitBranch = (
	branch: unknown,
): Result<GitBranchName, string> => {
	if (typeof branch !== "string" || branch.trim() === "") {
		return err("Invalid branch name: must not be empty.");
	}
	if (
		branch.startsWith("-") ||
		branch.includes("..") ||
		branch.includes("@{") ||
		branch.endsWith(".lock") ||
		!/^[a-zA-Z0-9][a-zA-Z0-9._/@-]*$/.test(branch)
	) {
		return err(
			`Invalid branch name "${branch}". Branch names must not start with "-" or contain unsafe characters.`,
		);
	}
	return ok(GitBranchName(branch));
};

export const validateGitRepoRequest = (
	url: unknown,
	branch?: unknown,
	compress?: unknown,
): Result<GitRepoConversionRequest, string> => {
	const validatedRepo = validateRepoIdentifier(url);
	if (!validatedRepo.ok) {
		return validatedRepo;
	}

	let validatedBranch: GitBranchName | undefined;
	if (branch !== undefined) {
		const checkedBranch = validateGitBranch(branch);
		if (!checkedBranch.ok) {
			return checkedBranch;
		}
		validatedBranch = checkedBranch.value;
	}

	if (compress !== undefined && typeof compress !== "boolean") {
		return err("Invalid compress option: must be a boolean");
	}

	return ok({
		repoUrl: validatedRepo.value,
		branch: validatedBranch,
		compress: compress === true,
	});
};

export const buildRepomixArgs = (
	request: GitRepoConversionRequest,
): readonly string[] => {
	const args = [
		"--remote",
		request.repoUrl,
		"--style",
		"markdown",
		"--stdout",
		"--quiet",
	];
	if (request.branch !== undefined) {
		args.push("--remote-branch", request.branch);
	}
	if (request.compress) {
		args.push("--compress");
	}
	return args;
};

export const checkRepomixOutput = (
	stdout: string,
	stderr: string,
): Result<string, string> => {
	if (stdout.trim() === "") {
		const detail = stderr.trim();
		return err(
			detail
				? `repomix produced no output: ${detail}`
				: "repomix produced no output",
		);
	}
	return ok(stdout);
};

export const formatRepomixError = (error: RepomixError): string => {
	switch (error.kind) {
		case "missing":
			return "repomix executable not found";
		case "timeout":
			return `Conversion timed out after ${error.timeoutMs}ms`;
		case "failed":
			return `Conversion failed: ${error.reason}`;
		default: {
			const exhaustive: never = error;
			return exhaustive;
		}
	}
};

export const parseGitRepoLimits = (
	env: Readonly<Record<string, string | undefined>>,
): Result<GitRepoConversionLimits, string> => {
	const raw = env.MD_REPOMIX_TIMEOUT_MS;
	if (raw === undefined || raw.trim() === "") {
		return ok({ repomixTimeoutMs: DEFAULT_REPOMIX_TIMEOUT_MS });
	}
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) {
		return err(
			`Invalid MD_REPOMIX_TIMEOUT_MS "${raw}": must be a positive integer`,
		);
	}
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isSafeInteger(parsed) || parsed < 1) {
		return err(
			`Invalid MD_REPOMIX_TIMEOUT_MS "${raw}": must be a positive integer`,
		);
	}
	return ok({ repomixTimeoutMs: parsed });
};

export const validateRepoDestination = async (
	repoUrl: GitRepoIdentifier,
	resolveHost: ResolveHost,
): Promise<Result<void, string>> => {
	if (!repoUrl.includes("://")) {
		return ok(undefined);
	}
	const parsed = new URL(repoUrl);
	const hostname = normalizeHostname(parsed.hostname);
	if (isIP(hostname) !== 0) {
		if (isPrivateOrReservedIp(hostname)) {
			return err(`Fetching ${repoUrl} is potentially dangerous, aborting.`);
		}
		return ok(undefined);
	}

	const resolved = await resolveHost(hostname);
	if (!resolved.ok || resolved.value.length === 0) {
		return err(`Could not resolve host "${hostname}" for ${repoUrl}.`);
	}
	for (const { address } of resolved.value) {
		if (isPrivateOrReservedIp(address)) {
			return err(`Fetching ${repoUrl} is potentially dangerous, aborting.`);
		}
	}
	return ok(undefined);
};

export const convertGitRepo = async (
	request: GitRepoConversionRequest,
	ports: GitRepoConversionPorts,
	options: GitRepoConversionOptions = {},
): Promise<Result<MarkdownResult, string>> => {
	const timeoutMs = options.repomixTimeoutMs ?? DEFAULT_REPOMIX_TIMEOUT_MS;
	const destination = await validateRepoDestination(
		request.repoUrl,
		ports.resolveHost,
	);
	if (!destination.ok) {
		return destination;
	}

	const args = buildRepomixArgs(request);
	const output = await ports.runRepomix(args, timeoutMs);
	if (!output.ok) {
		return err(formatRepomixError(output.error));
	}

	const checked = checkRepomixOutput(output.value.stdout, output.value.stderr);
	if (!checked.ok) {
		return checked;
	}

	return ok(markdownResult(checked.value));
};
