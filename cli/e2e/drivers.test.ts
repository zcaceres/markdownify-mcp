import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { resolveAdHocFile } from "./drivers.ts";

describe("resolveAdHocFile (VF-11, D45, I2)", () => {
	test("resolves cross-directory symlinks to their real target directory and basename", () => {
		const root = mkdtempSync(join(tmpdir(), "markdownify-adhoc-test-"));
		try {
			const targetDir = join(root, "real-docs");
			const linkDir = join(root, "links");
			const targetFile = join(targetDir, "notes.md");
			const linkFile = join(linkDir, "alias.md");

			mkdirSync(targetDir, { recursive: true });
			mkdirSync(linkDir, { recursive: true });
			writeFileSync(targetFile, "# Notes\n");
			symlinkSync(targetFile, linkFile);

			const resolved = resolveAdHocFile(linkFile);
			const expectedReal = realpathSync.native(targetFile);
			expect(resolved).toEqual({
				resolvedPath: expectedReal,
				dir: dirname(expectedReal),
				name: basename(expectedReal),
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns undefined when adHocFilePath is omitted and does not throw for missing paths", () => {
		expect(resolveAdHocFile(undefined)).toBeUndefined();
		const missing = resolveAdHocFile(
			"/tmp/markdownify-nonexistent-file-check.pdf",
		);
		expect(missing?.name).toBe("markdownify-nonexistent-file-check.pdf");
	});
});
