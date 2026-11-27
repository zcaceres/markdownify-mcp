import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseLive, passedLive, runLive } from "../../cli/live.js";
import { createSession } from "../../cli/session.js";
import { createLiveWorld } from "../../cli/world.js";
import { createLiveFilesystem, statRealLocalFile } from "./filesystem/live.js";
import { createLiveMarkitdown } from "./markitdown/live.js";
import { createLiveRepomix } from "./repomix/live.js";

const projectRoot = path.resolve(import.meta.dir, "../..");
const sampleDataDir = path.join(projectRoot, "src/sample-data");
const conversionTimeout = 30_000;

describe("createLiveFilesystem (I4)", () => {
	test("stages a private temp file on disk and deletes its directory on cleanup", async () => {
		const liveFs = createLiveFilesystem();
		expect(liveFs.activeTempDirCount()).toBe(0);
		expect(liveFs.stagedCount()).toBe(0);

		const staged = await liveFs.stageTempFile(
			new TextEncoder().encode("<h1>Live</h1>"),
			"html",
		);
		expect(staged.ok).toBe(true);
		if (!staged.ok) return;

		expect(liveFs.activeTempDirCount()).toBe(1);
		expect(liveFs.stagedCount()).toBe(1);
		expect(fs.existsSync(staged.value.path)).toBe(true);
		expect(fs.readFileSync(staged.value.path, "utf8")).toBe("<h1>Live</h1>");

		await liveFs.cleanupTempFile(staged.value);
		expect(liveFs.activeTempDirCount()).toBe(0);
		expect(liveFs.stagedCount()).toBe(1);
		expect(fs.existsSync(staged.value.cleanupDir)).toBe(false);
	});
});

describe("createLiveMarkitdown with repo sample-data (I3, D16)", () => {
	test(
		"converts real PDF, DOCX, XLSX, PPTX, and image files from src/sample-data/",
		async () => {
			const liveMarkitdown = createLiveMarkitdown(projectRoot);
			const pdf = await liveMarkitdown.convert(
				path.join(sampleDataDir, "test.pdf"),
				60_000,
			);
			expect(pdf.ok).toBe(true);
			if (pdf.ok) expect(pdf.value).toContain("Test PDF content");
			expect(liveMarkitdown.lastInput()).toBe(
				path.join(sampleDataDir, "test.pdf"),
			);

			const docx = await liveMarkitdown.convert(
				path.join(sampleDataDir, "test.docx"),
				60_000,
			);
			expect(docx.ok).toBe(true);
			if (docx.ok) expect(docx.value).toContain("Test DOCX content");

			const xlsx = await liveMarkitdown.convert(
				path.join(sampleDataDir, "test.xlsx"),
				60_000,
			);
			expect(xlsx.ok).toBe(true);
			if (xlsx.ok) expect(xlsx.value).toContain("Test XLSX content");

			const pptx = await liveMarkitdown.convert(
				path.join(sampleDataDir, "test.pptx"),
				60_000,
			);
			expect(pptx.ok).toBe(true);
			if (pptx.ok) expect(pptx.value).toContain("Test PPTX content");

			const img = await liveMarkitdown.convert(
				path.join(sampleDataDir, "test.jpg"),
				60_000,
			);
			expect(img.ok).toBe(true);
			if (img.ok) expect(img.value.trim()).toBe("");
		},
		conversionTimeout,
	);

	test("returns missing error when MARKITDOWN_PATH points to a non-existent binary", async () => {
		const saved = process.env.MARKITDOWN_PATH;
		process.env.MARKITDOWN_PATH = "/nonexistent/markitdown-missing-bin";
		try {
			const liveMarkitdown = createLiveMarkitdown(projectRoot);
			const res = await liveMarkitdown.convert(
				path.join(sampleDataDir, "test.pdf"),
				5_000,
			);
			expect(res).toEqual({ ok: false, error: { kind: "missing" } });
		} finally {
			if (saved === undefined) delete process.env.MARKITDOWN_PATH;
			else process.env.MARKITDOWN_PATH = saved;
		}
	});
});

describe("live harness world guards", () => {
	test("refuses mock-only mutators in live mode while allowing inspection and SSRF checks", async () => {
		const session = createSession({ connect: createLiveWorld });
		expect(
			await session.exec("network stub https://example.com 200 ok"),
		).toEqual(["error: network stub is only available in mock mode"]);
		expect(await session.exec("markitdown stub hi")).toEqual([
			"error: markitdown stub is only available in mock mode",
		]);
		expect(await session.exec("clock advance 10s")).toEqual([
			"error: clock advance is only available in mock mode",
		]);
		expect(
			await session.exec("convert webpage-to-markdown http://127.0.0.1/secret"),
		).toEqual([
			"error: Fetching http://127.0.0.1/secret is potentially dangerous, aborting.",
		]);
		expect(await session.exec("network fetch-count")).toEqual([
			"fetch count: 0",
		]);
		expect(await session.exec("filesystem temp-count")).toEqual([
			"active temp dirs: 0",
		]);
	});
});

describe("live local file verification (LF-5, LF-12, D17, I2, I3)", () => {
	test("statRealLocalFile distinguishes missing, directory, not-a-file, unreadable (including EACCES), and file", () => {
		expect(statRealLocalFile(path.join(sampleDataDir, "test.pdf"))).toEqual({
			kind: "file",
		});
		expect(statRealLocalFile(sampleDataDir)).toEqual({ kind: "directory" });
		expect(
			statRealLocalFile(path.join(sampleDataDir, "definitely-missing.pdf")),
		).toEqual({ kind: "missing" });

		if (process.platform !== "win32") {
			expect(statRealLocalFile("/dev/null")).toEqual({ kind: "not-a-file" });
		}

		const isRoot =
			typeof process.getuid === "function" && process.getuid() === 0;
		if (process.platform !== "win32" && !isRoot) {
			const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdfy-stat-"));
			const lockedFile = path.join(tmp, "locked.pdf");
			const lockedDir = path.join(tmp, "locked-dir");
			const hiddenFile = path.join(lockedDir, "secret.pdf");
			try {
				fs.writeFileSync(lockedFile, "secret");
				fs.chmodSync(lockedFile, 0o000);
				expect(statRealLocalFile(lockedFile)).toEqual({ kind: "unreadable" });

				fs.mkdirSync(lockedDir);
				fs.writeFileSync(hiddenFile, "secret");
				fs.chmodSync(lockedDir, 0o000);
				expect(statRealLocalFile(hiddenFile)).toEqual({ kind: "unreadable" });
			} finally {
				fs.chmodSync(lockedDir, 0o700);
				fs.chmodSync(lockedFile, 0o600);
				fs.rmSync(tmp, { recursive: true, force: true });
			}
		}
	});

	test(
		"enforces live Allowed Paths on real symlinks (refuses escape, converts in-bounds link)",
		async () => {
			const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdfy-live-link-"));
			const allowedDir = path.join(tmp, "allowed");
			const localCopy = path.join(allowedDir, "copy.pdf");
			const inBoundsLink = path.join(allowedDir, "alias.pdf");
			const escapeLink = path.join(allowedDir, "escape.pdf");
			fs.mkdirSync(allowedDir);
			fs.copyFileSync(path.join(sampleDataDir, "test.pdf"), localCopy);
			fs.symlinkSync(localCopy, inBoundsLink);
			fs.symlinkSync(path.join(sampleDataDir, "test.pdf"), escapeLink);

			try {
				const session = createSession({ connect: createLiveWorld });
				await session.exec(`config set MD_ALLOWED_PATHS ${allowedDir}`);

				const escaped = await session.exec(
					`convert pdf-to-markdown ${escapeLink}`,
				);
				expect(escaped[0]).toContain("outside the allowed directories");

				const allowed = await session.exec(
					`convert pdf-to-markdown ${inBoundsLink}`,
				);
				expect(allowed[0]).toBe("ok: pdf-to-markdown (path: none)");
				expect(allowed.join("\n")).toContain("Test PDF content");
			} finally {
				fs.rmSync(tmp, { recursive: true, force: true });
			}
		},
		conversionTimeout,
	);

	test(
		"replays scenarios/live/convert-local-file.live.txt end-to-end against src/sample-data/",
		async () => {
			const suitePath = path.join(
				projectRoot,
				"scenarios/live/convert-local-file.live.txt",
			);
			const text = fs.readFileSync(suitePath, "utf8");
			const ran = await runLive(
				parseLive(text, { REPO_ROOT: projectRoot }),
				createSession({ connect: createLiveWorld }),
			);
			expect(passedLive(ran)).toBe(true);
		},
		conversionTimeout,
	);
});

describe("live markdown retrieval verification (RM-8, D8, D17, D25, D26, D27, I2)", () => {
	test("retrieves .MD/.markdown verbatim, returns realpath for in-bounds symlinks, and blocks escaping/.md->.txt symlinks and directories", async () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdfy-live-md-"));
		const allowedDir = path.join(tmp, "allowed");
		const outsideDir = path.join(tmp, "outside");
		const upperMd = path.join(allowedDir, "UPPER.MD");
		const wsMarkdown = path.join(allowedDir, "blank.Markdown");
		const dirNamedMd = path.join(allowedDir, "folder.md");
		const secretTxt = path.join(allowedDir, "secret.txt");
		const outsideMd = path.join(outsideDir, "secret.md");
		const inBoundsLink = path.join(allowedDir, "alias.md");
		const disguisedLink = path.join(allowedDir, "disguised.md");
		const escapeLink = path.join(allowedDir, "escape.md");

		fs.mkdirSync(allowedDir);
		fs.mkdirSync(outsideDir);
		fs.mkdirSync(dirNamedMd);
		fs.writeFileSync(upperMd, "# Upper\nLine 2");
		fs.writeFileSync(wsMarkdown, "  \n");
		fs.writeFileSync(secretTxt, "SECRET=1");
		fs.writeFileSync(outsideMd, "# Outside");
		fs.symlinkSync(upperMd, inBoundsLink);
		fs.symlinkSync(secretTxt, disguisedLink);
		fs.symlinkSync(outsideMd, escapeLink);

		try {
			const session = createSession({ connect: createLiveWorld });
			await session.exec(`config set MD_ALLOWED_PATHS ${allowedDir}`);

			const aliased = await session.exec(`retrieve ${inBoundsLink}`);
			expect(aliased).toEqual([
				`ok: get-markdown-file (path: ${fs.realpathSync.native(upperMd)})`,
				"| # Upper",
				"| Line 2",
			]);

			const blank = await session.exec(`retrieve ${wsMarkdown}`);
			expect(blank).toEqual([
				`ok: get-markdown-file (path: ${fs.realpathSync.native(wsMarkdown)})`,
				"|   ",
				"| ",
			]);

			const disguised = await session.exec(`retrieve ${disguisedLink}`);
			expect(disguised).toEqual([
				"error: Required file is not a Markdown file.",
			]);

			const escaped = await session.exec(`retrieve ${escapeLink}`);
			expect(escaped[0]).toContain("outside the allowed directories");

			const dirRes = await session.exec(`retrieve ${dirNamedMd}`);
			expect(dirRes[0]).toContain("Path is a directory, not a file:");
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	test("replays scenarios/live/retrieve-markdown-file.live.txt end-to-end", async () => {
		const suitePath = path.join(
			projectRoot,
			"scenarios/live/retrieve-markdown-file.live.txt",
		);
		const text = fs.readFileSync(suitePath, "utf8");
		const ran = await runLive(
			parseLive(text, { REPO_ROOT: projectRoot }),
			createSession({ connect: createLiveWorld }),
		);
		expect(passedLive(ran)).toBe(true);
	});
});

describe("createLiveRepomix offline checks (GR-9, D28, D29, D31, I1, I3)", () => {
	test("returns missing error when REPOMIX_PATH points to a non-existent binary", async () => {
		const saved = process.env.REPOMIX_PATH;
		process.env.REPOMIX_PATH = "/nonexistent/repomix-missing-bin";
		try {
			const liveRepomix = createLiveRepomix(projectRoot);
			const res = await liveRepomix.run(["--version"], 5_000);
			expect(res).toEqual({ ok: false, error: { kind: "missing" } });
			expect(liveRepomix.lastArgs()).toEqual(["--version"]);
		} finally {
			if (saved === undefined) delete process.env.REPOMIX_PATH;
			else process.env.REPOMIX_PATH = saved;
		}
	});

	test("aborts real repomix binary when timeoutMs is exceeded (D28)", async () => {
		const liveRepomix = createLiveRepomix(projectRoot);
		const res = await liveRepomix.run(["--version"], 1);
		expect(res).toEqual({
			ok: false,
			error: { kind: "timeout", timeoutMs: 1 },
		});
	});

	test("enforces live SSRF and embedded-credentials guards before invoking repomix", async () => {
		const session = createSession({ connect: createLiveWorld });
		expect(
			await session.exec(
				"convert git-repo-to-markdown http://127.0.0.1/owner/repo",
			),
		).toEqual([
			"error: Fetching http://127.0.0.1/owner/repo is potentially dangerous, aborting.",
		]);
		expect(
			await session.exec(
				"convert git-repo-to-markdown https://token@github.com/owner/repo",
			),
		).toEqual([
			"error: Repository URLs with embedded credentials are not allowed.",
		]);
		expect(await session.exec("repomix last-args")).toEqual([
			"last args: (none)",
		]);
	});
});
