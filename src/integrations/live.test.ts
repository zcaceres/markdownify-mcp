import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createSession } from "../../cli/session.js";
import { createLiveWorld } from "../../cli/world.js";
import { createLiveFilesystem } from "./filesystem/live.js";
import { createLiveMarkitdown } from "./markitdown/live.js";

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
