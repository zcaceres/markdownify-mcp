import path from "node:path";
import type { FileStat } from "../../local-file-conversion/nouns.js";
import type {
	ExpandHome,
	ResolveRealpath,
	StatFile,
} from "../../local-file-conversion/ports.js";
import type { ReadTextFile } from "../../markdown-retrieval/ports.js";
import { err, ok, type Result } from "../../shared/types.js";
import type { TemporaryFile } from "../../web-conversion/nouns.js";
import type {
	CleanupTempFile,
	StageTempFile,
} from "../../web-conversion/ports.js";

const MOCK_HOME_DIR = "/home/user";
const MAX_SYMLINK_DEPTH = 16;

type MockEntry = "file" | "directory" | "unreadable";

export type FilesystemMock = {
	readonly stageTempFile: StageTempFile;
	readonly cleanupTempFile: CleanupTempFile;
	readonly activeTempDirCount: () => number;
	readonly stagedCount: () => number;
	readonly expandHome: ExpandHome;
	readonly resolveRealpath: ResolveRealpath;
	readonly statFile: StatFile;
	readonly readTextFile: ReadTextFile;
	readonly putFile: (filePath: string, content?: string) => void;
	readonly mkdir: (dirPath: string) => void;
	readonly putUnreadable: (filePath: string) => void;
	readonly symlink: (linkPath: string, targetPath: string) => void;
};

export const createFilesystemMock = (): FilesystemMock => {
	let nextId = 1;
	let totalStaged = 0;
	const activeDirs = new Map<string, Uint8Array>();
	const entries = new Map<string, MockEntry>();
	const contents = new Map<string, string>();
	const symlinks = new Map<string, string>();

	const resolveRealpathSync = (targetPath: string): string => {
		let current = path.posix.resolve(targetPath);
		for (let depth = 0; depth < MAX_SYMLINK_DEPTH; depth++) {
			let probe = current;
			const suffix: string[] = [];
			let replaced = false;
			while (true) {
				const linkTarget = symlinks.get(probe);
				if (linkTarget !== undefined) {
					const resolvedTarget = path.posix.isAbsolute(linkTarget)
						? linkTarget
						: path.posix.resolve(path.posix.dirname(probe), linkTarget);
					current =
						suffix.length === 0
							? path.posix.resolve(resolvedTarget)
							: path.posix.resolve(resolvedTarget, ...suffix.slice().reverse());
					replaced = true;
					break;
				}
				const parent = path.posix.dirname(probe);
				if (parent === probe) break;
				suffix.push(path.posix.basename(probe));
				probe = parent;
			}
			if (!replaced) return current;
		}
		return current;
	};

	return {
		stageTempFile: async (
			content: Uint8Array,
			extension: string,
		): Promise<Result<TemporaryFile, string>> => {
			const id = nextId++;
			totalStaged++;
			const cleanupDir = `/tmp/markdownify-mock-${id}`;
			const filePath = `${cleanupDir}/markdown_output_${id}.${extension}`;
			activeDirs.set(cleanupDir, content);
			return ok({ path: filePath, cleanupDir });
		},
		cleanupTempFile: async (tempFile: TemporaryFile): Promise<void> => {
			activeDirs.delete(tempFile.cleanupDir);
		},
		activeTempDirCount: () => activeDirs.size,
		stagedCount: () => totalStaged,
		expandHome: (filePath: string): string => {
			if (filePath === "~") return MOCK_HOME_DIR;
			if (filePath.startsWith("~/")) {
				return `${MOCK_HOME_DIR}/${filePath.slice(2)}`;
			}
			return filePath;
		},
		resolveRealpath: async (targetPath: string): Promise<string> =>
			resolveRealpathSync(targetPath),
		statFile: async (resolvedPath: string): Promise<FileStat> => {
			const realPath = resolveRealpathSync(resolvedPath);
			const entry = entries.get(realPath);
			if (!entry) return { kind: "missing" };
			return { kind: entry };
		},
		readTextFile: async (
			resolvedPath: string,
		): Promise<Result<string, string>> => {
			const realPath = resolveRealpathSync(resolvedPath);
			const entry = entries.get(realPath);
			if (entry !== "file") {
				return err(`Cannot read "${realPath}"`);
			}
			return ok(contents.get(realPath) ?? "");
		},
		putFile: (filePath: string, content = "") => {
			const normalized = path.posix.resolve(filePath);
			entries.set(normalized, "file");
			contents.set(normalized, content);
		},
		mkdir: (dirPath: string) => {
			entries.set(path.posix.resolve(dirPath), "directory");
		},
		putUnreadable: (filePath: string) => {
			entries.set(path.posix.resolve(filePath), "unreadable");
		},
		symlink: (linkPath: string, targetPath: string) => {
			symlinks.set(path.posix.resolve(linkPath), targetPath);
		},
	};
};
