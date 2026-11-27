import { lookup } from "node:dns/promises";
import fs from "node:fs";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import {
	validateGitBranch,
	validateRepoIdentifier,
} from "./git-repo-conversion/verbs.js";
import { isMarkdownExtension } from "./markdown-retrieval/verbs.js";
import { isPrivateOrReservedIp, normalizeHostname } from "./shared/ip.js";
import { EMPTY_ALLOWED_PATHS_MESSAGE } from "./shared/local-access.js";
import {
	checkConvertedOutput,
	inferTempExtension,
	shouldPassUrlDirectly,
} from "./web-conversion/verbs.js";

export { isPrivateOrReservedIp };

export type ResolvedAddress = {
	address: string;
	family: number;
};

export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

function isBlockedHostname(hostname: string): boolean {
	return (
		hostname === "" ||
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local") ||
		hostname.endsWith(".internal")
	);
}

async function defaultHostResolver(
	hostname: string,
): Promise<ResolvedAddress[]> {
	return lookup(hostname, { all: true, verbatim: true });
}

export function expandHome(filepath: string): string {
	if (
		filepath === "~" ||
		filepath.startsWith("~/") ||
		filepath.startsWith("~\\")
	) {
		return path.join(os.homedir(), filepath.slice(2));
	}
	return filepath;
}

export function resolveMarkitdownPath(projectRoot: string): string {
	if (process.env.MARKITDOWN_PATH) return process.env.MARKITDOWN_PATH;
	const isWin = process.platform === "win32";
	const venvBin = path.join(
		projectRoot,
		".venv",
		isWin ? "Scripts" : "bin",
		`markitdown${isWin ? ".exe" : ""}`,
	);
	if (fs.existsSync(venvBin)) return venvBin;
	return "markitdown";
}

export function resolveRepomixPath(projectRoot: string): string {
	if (process.env.REPOMIX_PATH) return process.env.REPOMIX_PATH;
	const local = path.join(projectRoot, "node_modules", ".bin", "repomix");
	if (fs.existsSync(local)) return local;
	return "repomix";
}

export function getAllowedPaths(): string[] | null {
	const raw = process.env.MD_ALLOWED_PATHS;
	if (raw === undefined) return null;
	const dirs = raw
		.split(path.delimiter)
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => path.normalize(path.resolve(expandHome(p))));
	if (dirs.length === 0) {
		throw new Error(EMPTY_ALLOWED_PATHS_MESSAGE);
	}
	return dirs;
}

export function realpathOrAncestor(p: string, depth = 0): string {
	if (depth > 40) return path.resolve(p);
	let current = path.resolve(p);
	const suffix: string[] = [];
	while (true) {
		try {
			const realCurrent = fs.realpathSync.native(current);
			return suffix.length === 0
				? realCurrent
				: path.join(realCurrent, ...suffix.slice().reverse());
		} catch {
			try {
				if (fs.lstatSync(current).isSymbolicLink()) {
					const resolvedTarget = path.resolve(
						path.dirname(current),
						fs.readlinkSync(current),
					);
					const next =
						suffix.length === 0
							? resolvedTarget
							: path.join(resolvedTarget, ...suffix.slice().reverse());
					return realpathOrAncestor(next, depth + 1);
				}
			} catch {
				// Not a symlink (missing or inaccessible); walk up to parent.
			}
			const parent = path.dirname(current);
			if (parent === current) return path.resolve(p);
			suffix.push(path.basename(current));
			current = parent;
		}
	}
}

export function assertPathAllowed(filePath: string): void {
	const allowed = getAllowedPaths();
	if (!allowed) return;
	const resolved = realpathOrAncestor(expandHome(filePath));
	const allowedReal = allowed.map(realpathOrAncestor);
	if (!allowedReal.some((dir) => isWithinDirectory(resolved, dir))) {
		throw new Error(
			`Path "${filePath}" is outside the allowed directories. ` +
				`Set MD_ALLOWED_PATHS to a ${path.delimiter}-separated list that includes a parent directory ` +
				`(currently allowed: ${allowedReal.join(path.delimiter)}).`,
		);
	}
}

export function validateUrl(url: string): void {
	const parsed = new URL(url);
	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error("Only http: and https: schemes are allowed.");
	}
	const hostname = normalizeHostname(parsed.hostname);
	if (isBlockedHostname(hostname) || isPrivateOrReservedIp(hostname)) {
		throw new Error(`Fetching ${url} is potentially dangerous, aborting.`);
	}
}

export async function validateUrlDestination(
	url: string,
	resolver: HostResolver = defaultHostResolver,
): Promise<void> {
	validateUrl(url);

	const parsed = new URL(url);
	const hostname = normalizeHostname(parsed.hostname);
	if (isIP(hostname) !== 0) {
		return;
	}

	let addresses: ResolvedAddress[];
	try {
		addresses = await resolver(hostname);
	} catch {
		throw new Error(`Could not resolve host "${hostname}" for ${url}.`);
	}

	if (!addresses || addresses.length === 0) {
		throw new Error(`Could not resolve host "${hostname}" for ${url}.`);
	}

	for (const { address } of addresses) {
		if (isPrivateOrReservedIp(address)) {
			throw new Error(`Fetching ${url} is potentially dangerous, aborting.`);
		}
	}
}

export function validateRepoUrl(repoUrl: string): void {
	const validated = validateRepoIdentifier(repoUrl);
	if (!validated.ok) {
		throw new Error(validated.error);
	}
}

export function validateBranchName(branch: string): void {
	const validated = validateGitBranch(branch);
	if (!validated.ok) {
		throw new Error(validated.error);
	}
}

export function isUnconvertedHtml(output: string): boolean {
	return !checkConvertedOutput(output).ok;
}

export function shouldPassUrlToMarkitdown(url: string): boolean {
	return shouldPassUrlDirectly(url);
}

export function inferExtensionFromUrl(
	url: string,
	contentType?: string | null,
): string {
	return inferTempExtension(url, contentType);
}

export function isMarkdownFile(filePath: string): boolean {
	return isMarkdownExtension(filePath);
}

export function isWithinDirectory(
	filePath: string,
	directory: string,
): boolean {
	const rel = path.relative(path.resolve(directory), path.resolve(filePath));
	if (rel === "") return true;
	return (
		rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
	);
}
