import { ok, type Result } from "../../shared/types.js";
import type { TemporaryFile } from "../../web-conversion/nouns.js";
import type {
	CleanupTempFile,
	StageTempFile,
} from "../../web-conversion/ports.js";

export type FilesystemMock = {
	readonly stageTempFile: StageTempFile;
	readonly cleanupTempFile: CleanupTempFile;
	readonly activeTempDirCount: () => number;
	readonly stagedCount: () => number;
};

export const createFilesystemMock = (): FilesystemMock => {
	let nextId = 1;
	let totalStaged = 0;
	const activeDirs = new Map<string, Uint8Array>();

	return {
		stageTempFile: async (
			content: Uint8Array,
			extension: string,
		): Promise<Result<TemporaryFile, string>> => {
			const id = nextId++;
			totalStaged++;
			const cleanupDir = `/tmp/markdownify-mock-${id}`;
			const path = `${cleanupDir}/markdown_output_${id}.${extension}`;
			activeDirs.set(cleanupDir, content);
			return ok({ path, cleanupDir });
		},
		cleanupTempFile: async (tempFile: TemporaryFile): Promise<void> => {
			activeDirs.delete(tempFile.cleanupDir);
		},
		activeTempDirCount: () => activeDirs.size,
		stagedCount: () => totalStaged,
	};
};
