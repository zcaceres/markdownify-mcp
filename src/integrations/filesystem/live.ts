import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FileStat } from "../../local-file-conversion/nouns.js";
import type {
	ExpandHome,
	ResolveRealpath,
	StatFile,
} from "../../local-file-conversion/ports.js";
import { err, ok, type Result } from "../../shared/types.js";
import { expandHome as expandOsHome, realpathOrAncestor } from "../../utils.js";
import type { TemporaryFile } from "../../web-conversion/nouns.js";
import type {
	CleanupTempFile,
	StageTempFile,
} from "../../web-conversion/ports.js";

export type LiveFilesystem = {
	readonly stageTempFile: StageTempFile;
	readonly cleanupTempFile: CleanupTempFile;
	readonly activeTempDirCount: () => number;
	readonly stagedCount: () => number;
	readonly expandHome: ExpandHome;
	readonly resolveRealpath: ResolveRealpath;
	readonly statFile: StatFile;
};

export const statRealLocalFile = (resolvedPath: string): FileStat => {
	let stats: fs.Stats;
	try {
		stats = fs.statSync(resolvedPath);
	} catch {
		return { kind: "missing" };
	}
	if (stats.isDirectory()) {
		return { kind: "directory" };
	}
	try {
		fs.accessSync(resolvedPath, fs.constants.R_OK);
	} catch {
		return { kind: "unreadable" };
	}
	return { kind: "file" };
};

export const createLiveFilesystem = (): LiveFilesystem => {
	const activeDirs = new Set<string>();
	let totalStaged = 0;

	return {
		stageTempFile: async (
			content: Uint8Array,
			extension: string,
		): Promise<Result<TemporaryFile, string>> => {
			try {
				const cleanupDir = fs.mkdtempSync(
					path.join(os.tmpdir(), "markdownify-"),
				);
				const filePath = path.join(
					cleanupDir,
					`markdown_output_${randomUUID()}.${extension}`,
				);
				fs.writeFileSync(filePath, content, { flag: "wx" });
				activeDirs.add(cleanupDir);
				totalStaged++;
				return ok({ path: filePath, cleanupDir });
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Unknown filesystem error";
				return err(message);
			}
		},
		cleanupTempFile: async (tempFile: TemporaryFile): Promise<void> => {
			fs.rmSync(tempFile.cleanupDir, { recursive: true, force: true });
			activeDirs.delete(tempFile.cleanupDir);
		},
		activeTempDirCount: () => activeDirs.size,
		stagedCount: () => totalStaged,
		expandHome: expandOsHome,
		resolveRealpath: async (resolvedPath: string): Promise<string> =>
			realpathOrAncestor(resolvedPath),
		statFile: async (resolvedPath: string): Promise<FileStat> =>
			statRealLocalFile(resolvedPath),
	};
};
