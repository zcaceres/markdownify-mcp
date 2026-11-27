import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseLive, passedLive, reportLive, runLive } from "./live.ts";
import { parse, passed, render, report, run } from "./scenario.ts";
import { createSession } from "./session.ts";
import { createLiveWorld, createWorld } from "./world.ts";

const projectRoot = resolve(import.meta.dir, "..");
const [mode, ...rest] = process.argv.slice(2);

/** A file, or every matching file under a folder. */
const findFiles = async (
	targetPath: string,
	predicate: (entry: string) => boolean,
): Promise<string[]> => {
	if (!(await stat(targetPath)).isDirectory()) return [targetPath];
	const entries = await readdir(targetPath, { recursive: true });
	return entries
		.filter(predicate)
		.sort()
		.map((entry) => join(targetPath, entry));
};

const isMockScenario = (entry: string): boolean =>
	entry.endsWith(".txt") && !entry.endsWith(".live.txt");

const isLiveSuite = (entry: string): boolean => entry.endsWith(".live.txt");

if (mode === "run") {
	const write = rest.includes("--write");
	const paths = rest.filter((arg) => arg !== "--write");
	if (paths.length === 0) {
		console.error("usage: harness run <scenario file or folder>... [--write]");
		process.exit(2);
	}
	const files = (
		await Promise.all(paths.map((p) => findFiles(p, isMockScenario)))
	).flat();
	const failed: string[] = [];
	for (const file of files) {
		const ran = await run(parse(await readFile(file, "utf8")), createSession());
		console.log(`── ${file}`);
		console.log(report(ran));
		if (passed(ran)) continue;
		if (write) {
			await writeFile(file, render(ran));
			console.log(`── wrote what it prints now to ${file}`);
		} else {
			failed.push(file);
		}
	}
	console.log(
		failed.length === 0
			? `── ${files.length} passed`
			: `── failed: ${failed.join(", ")}`,
	);
	process.exit(failed.length === 0 ? 0 : 1);
} else if (mode === "live") {
	if (rest.length === 0) {
		console.error("usage: harness live <live suite file or folder>...");
		process.exit(2);
	}
	const files = (
		await Promise.all(rest.map((p) => findFiles(p, isLiveSuite)))
	).flat();
	const failed: string[] = [];
	for (const file of files) {
		const ran = await runLive(
			parseLive(await readFile(file, "utf8"), { REPO_ROOT: projectRoot }),
			createSession({ connect: createLiveWorld }),
		);
		console.log(`── ${file} (live)`);
		console.log(reportLive(ran));
		if (!passedLive(ran)) {
			failed.push(file);
		}
	}
	console.log(
		failed.length === 0
			? `── ${files.length} live suite(s) passed`
			: `── failed: ${failed.join(", ")}`,
	);
	process.exit(failed.length === 0 ? 0 : 1);
} else if (mode === "exec") {
	const isLive = rest[0] === "--live";
	const commandParts = isLive ? rest.slice(1) : rest;
	const line = commandParts.join(" ").trim();
	if (!line) {
		console.error("usage: harness exec [--live] <command...>");
		process.exit(2);
	}
	const session = createSession({
		connect: isLive ? createLiveWorld : createWorld,
	});
	const output = await session.exec(line);
	for (const out of output) console.log(out);
	const hadError = (output[0] ?? "").startsWith("error: ");
	process.exit(hadError ? 1 : 0);
} else {
	const isLive = mode === "--live";
	console.log(
		isLive
			? "The harness (LIVE mode): using real DNS, HTTP, filesystem, and markitdown CLI. Type help for commands."
			: "The harness: every external system is mocked in memory and resets on exit. Type help for commands.",
	);
	const session = createSession({
		connect: isLive ? createLiveWorld : createWorld,
	});
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: isLive ? "live> " : "> ",
	});
	let closed = false;
	rl.on("close", () => {
		closed = true;
	});
	rl.prompt();
	for await (const line of rl) {
		if (line.trim() === "exit") break;
		for (const out of await session.exec(line)) console.log(out);
		if (!closed) rl.prompt();
	}
	if (!closed) rl.close();
}
