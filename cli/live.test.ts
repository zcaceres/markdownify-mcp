import { describe, expect, test } from "bun:test";
import { parseLive, passedLive, reportLive, runLive } from "./live.ts";
import { createSession } from "./session.ts";

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
});
