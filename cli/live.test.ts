import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parseLive, passedLive, reportLive, runLive } from "./live.ts";
import { createSession } from "./session.ts";

const projectRoot = path.resolve(import.meta.dir, "..");

describe("live assertion runner", () => {
	test("evaluates ok, contains, exact, not-empty, and error assertions", async () => {
		const suite = [
			"# live runner test on mock session",
			"> network stub https://example.com/a 200 <h1>Hello</h1>",
			"expect ok",
			"expect exact stubbed https://example.com/a -> 200",
			"",
			"> markitdown stub # Hello Live World",
			"expect ok",
			"",
			"> convert webpage-to-markdown https://example.com/a",
			"expect ok",
			"expect not-empty",
			"expect contains Hello Live World",
			"",
			"> convert webpage-to-markdown http://127.0.0.1/nope",
			"expect error potentially dangerous",
		].join("\n");

		const ran = await runLive(parseLive(suite), createSession());
		expect(passedLive(ran)).toBe(true);
	});

	test("expands {{VAR}} template variables in commands and assertions", async () => {
		const suite = [
			"> config set MD_ALLOWED_PATHS {{REPO_ROOT}}/data",
			"expect exact config MD_ALLOWED_PATHS = /workspace/demo/data",
		].join("\n");

		const ran = await runLive(
			parseLive(suite, { REPO_ROOT: "/workspace/demo" }),
			createSession(),
		);
		expect(passedLive(ran)).toBe(true);
	});

	test("reports failing assertions clearly", async () => {
		const suite = [
			"> convert webpage-to-markdown http://127.0.0.1/nope",
			"expect ok",
			"expect contains something-missing",
		].join("\n");

		const ran = await runLive(parseLive(suite), createSession());
		expect(passedLive(ran)).toBe(false);
		const output = reportLive(ran);
		expect(output).toContain("FAIL: expect ok");
		expect(output).toContain("FAIL: expect contains something-missing");
	});

	test("piped stdin into live harness REPL exits cleanly without ERR_USE_AFTER_CLOSE", async () => {
		const samplePdf = path.join(projectRoot, "src/sample-data/test.pdf");
		const proc = Bun.spawn(["bun", "cli/main.ts", "--live"], {
			cwd: projectRoot,
			stdin: new TextEncoder().encode(`convert pdf-to-markdown ${samplePdf}\n`),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		expect(exitCode).toBe(0);
		expect(stderr).not.toContain("ERR_USE_AFTER_CLOSE");
		expect(stdout).toContain("Test PDF content");
	}, 20_000);
});
