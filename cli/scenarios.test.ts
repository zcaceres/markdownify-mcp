import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, passed, render, report, run } from "./scenario.ts";
import { createSession } from "./session.ts";

const folder = fileURLToPath(new URL("../scenarios/", import.meta.url));
const files = readdirSync(folder, { recursive: true, encoding: "utf8" })
	.filter((file) => file.endsWith(".txt") && !file.endsWith(".live.txt"))
	.sort();

/** Every scenario replays exactly as written. To see one run: `bun run harness run scenarios/<journey>/<file>`. */
describe("scenarios", () => {
	for (const file of files) {
		test(file, async () => {
			const text = readFileSync(join(folder, file), "utf8");
			const ran = await run(parse(text), createSession());
			if (!passed(ran)) {
				throw new Error(`Scenario mismatch in ${file}:\n${report(ran)}`);
			}
			expect(render(ran)).toBe(text);
		});
	}
});

describe("a scenario", () => {
	const scenario = [
		"# the clock",
		"> clock",
		"2026-01-05T09:00:00.000Z",
		"",
		"> clock advance 1d",
		"wrong",
		"",
	].join("\n");

	test("keeps comments and blank lines, and says what each command prints now", async () => {
		const ran = await run(parse(scenario), createSession());
		expect(render(ran)).toBe(
			[
				"# the clock",
				"> clock",
				"2026-01-05T09:00:00.000Z",
				"",
				"> clock advance 1d",
				"2026-01-06T09:00:00.000Z",
				"",
			].join("\n"),
		);
	});

	test("marks what a command printed instead of what was expected", async () => {
		const ran = await run(parse(scenario), createSession());
		expect(report(ran)).toContain(
			["> clock advance 1d", "- wrong", "+ 2026-01-06T09:00:00.000Z"].join(
				"\n",
			),
		);
	});

	test("convert command rejects unexpected trailing arguments", async () => {
		const session = createSession();
		const out = await session.exec(
			"convert webpage-to-markdown https://example.com extra-arg",
		);
		expect(out).toEqual([
			"error: usage: convert <tool> [url|filepath] [--branch=<ref>] [--compress]",
		]);
	});

	test("convert command accepts compact tool names including convert-git-repo (D51)", async () => {
		const session = createSession();
		await session.exec("repomix stub # Compact Repo");
		const out = await session.exec(
			"convert convert-git-repo octocat/Hello-World --compress",
		);
		expect(out).toEqual([
			"ok: convert-git-repo (path: none)",
			"| # Compact Repo",
		]);
	});
});
