import { describe, expect, test } from "bun:test";
import { err, ok } from "../shared/types.js";
import { GitBranchName, GitRepoIdentifier } from "./nouns.js";
import type { GitRepoConversionPorts } from "./ports.js";
import { markdownResult } from "./queries.js";
import {
	buildRepomixArgs,
	checkRepomixOutput,
	convertGitRepo,
	formatRepomixError,
	parseGitRepoLimits,
	validateGitRepoRequest,
	validateRepoDestination,
} from "./verbs.js";

describe("validateGitRepoRequest (GR-1, GR-2, GR-3, D3, D8, D29, I1, I3)", () => {
	test("accepts valid GitHub shorthand and public https URL with optional branch and compress", () => {
		expect(validateGitRepoRequest("octocat/Hello-World")).toEqual(
			ok({
				repoUrl: GitRepoIdentifier("octocat/Hello-World"),
				branch: undefined,
				compress: false,
			}),
		);
		expect(
			validateGitRepoRequest(
				"https://github.com/octocat/Hello-World",
				"feat/v1.2_a",
				true,
			),
		).toEqual(
			ok({
				repoUrl: GitRepoIdentifier("https://github.com/octocat/Hello-World"),
				branch: GitBranchName("feat/v1.2_a"),
				compress: true,
			}),
		);
	});

	test("rejects missing, blank, or non-string url and invalid compress", () => {
		expect(validateGitRepoRequest(undefined)).toEqual(
			err("Repository URL is required"),
		);
		expect(validateGitRepoRequest("   ")).toEqual(
			err("Repository URL is required"),
		);
		expect(validateGitRepoRequest(42)).toEqual(
			err("Repository URL is required"),
		);
		expect(
			validateGitRepoRequest("octocat/Hello-World", undefined, "yes"),
		).toEqual(err("Invalid compress option: must be a boolean"));
	});

	test("rejects non-http(s) schemes, scp-SSH, embedded credentials (D29), localhost/private IPs, and injection", () => {
		expect(validateGitRepoRequest("file:///etc/passwd")).toEqual(
			err("Only http: and https: repository URLs are allowed."),
		);
		expect(validateGitRepoRequest("ssh://git@github.com/owner/repo")).toEqual(
			err("Only http: and https: repository URLs are allowed."),
		);
		expect(validateGitRepoRequest("git@github.com:owner/repo.git")).toEqual(
			err(
				'Repository shorthand "git@github.com:owner/repo.git" uses scp-style SSH syntax, which is not allowed. Use an http(s) URL (e.g. https://github.com/owner/repo).',
			),
		);
		expect(
			validateGitRepoRequest("https://token@github.com/owner/repo"),
		).toEqual(
			err("Repository URLs with embedded credentials are not allowed."),
		);
		expect(
			validateGitRepoRequest("https://user:pass@github.com/owner/repo"),
		).toEqual(
			err("Repository URLs with embedded credentials are not allowed."),
		);
		expect(validateGitRepoRequest("http://127.0.0.1/owner/repo")).toEqual(
			err(
				"Fetching http://127.0.0.1/owner/repo is potentially dangerous, aborting.",
			),
		);
		expect(validateGitRepoRequest("http://localhost/owner/repo")).toEqual(
			err(
				"Fetching http://localhost/owner/repo is potentially dangerous, aborting.",
			),
		);
		expect(validateGitRepoRequest("--help")).toEqual(
			err(
				"Invalid repository URL or shorthand: --help. Use a GitHub URL (https://github.com/owner/repo) or shorthand (owner/repo).",
			),
		);
		expect(validateGitRepoRequest("owner/repo; rm -rf /")).toEqual(
			err(
				"Invalid repository URL or shorthand: owner/repo; rm -rf /. Use a GitHub URL (https://github.com/owner/repo) or shorthand (owner/repo).",
			),
		);
	});

	test("rejects blank, leading-hyphen, and unsafe branch names (GR-3, I3)", () => {
		expect(validateGitRepoRequest("octocat/Hello-World", "")).toEqual(
			err("Invalid branch name: must not be empty."),
		);
		expect(validateGitRepoRequest("octocat/Hello-World", "   ")).toEqual(
			err("Invalid branch name: must not be empty."),
		);
		for (const bad of [
			"--upload-pack=id",
			"-u",
			"main..other",
			"main@{0}",
			"branch.lock",
			"branch with space",
		]) {
			expect(validateGitRepoRequest("octocat/Hello-World", bad)).toEqual(
				err(
					`Invalid branch name "${bad}". Branch names must not start with "-" or contain unsafe characters.`,
				),
			);
		}
	});
});

describe("buildRepomixArgs, checkRepomixOutput, formatRepomixError (GR-5, GR-6, D30, D31, I3)", () => {
	test("builds explicit execFile argument arrays with optional branch and compress", () => {
		expect(
			buildRepomixArgs({
				repoUrl: GitRepoIdentifier("octocat/Hello-World"),
				compress: false,
			}),
		).toEqual([
			"--remote",
			"octocat/Hello-World",
			"--style",
			"markdown",
			"--stdout",
			"--quiet",
		]);
		expect(
			buildRepomixArgs({
				repoUrl: GitRepoIdentifier("https://github.com/octocat/Hello-World"),
				branch: GitBranchName("main"),
				compress: true,
			}),
		).toEqual([
			"--remote",
			"https://github.com/octocat/Hello-World",
			"--style",
			"markdown",
			"--stdout",
			"--quiet",
			"--remote-branch",
			"main",
			"--compress",
		]);
	});

	test("rejects empty and whitespace-only repomix stdout (D30)", () => {
		expect(checkRepomixOutput("", "")).toEqual(
			err("repomix produced no output"),
		);
		expect(checkRepomixOutput("  \n\t ", "fatal: not found")).toEqual(
			err("repomix produced no output: fatal: not found"),
		);
		expect(checkRepomixOutput("# Repo", "")).toEqual(ok("# Repo"));
	});

	test("formats missing, timeout, and failed repomix errors cleanly (D31)", () => {
		expect(formatRepomixError({ kind: "missing" })).toBe(
			"repomix executable not found",
		);
		expect(formatRepomixError({ kind: "timeout", timeoutMs: 120_000 })).toBe(
			"Conversion timed out after 120000ms",
		);
		expect(
			formatRepomixError({ kind: "failed", reason: "Repository not found" }),
		).toBe("Conversion failed: Repository not found");
	});
});

describe("convertGitRepo (GR-4..GR-7, D5, D28, D30, D31, I1)", () => {
	const makePorts = (
		overrides: Partial<GitRepoConversionPorts> = {},
	): { ports: GitRepoConversionPorts; seenArgs: readonly string[][] } => {
		const seenArgs: string[][] = [];
		const ports: GitRepoConversionPorts = {
			resolveHost: async () => ok([{ address: "93.184.216.34", family: 4 }]),
			runRepomix: async (args) => {
				seenArgs.push([...args]);
				return ok({ stdout: "# Packed Repo", stderr: "" });
			},
			...overrides,
		};
		return { ports, seenArgs };
	};

	test("runs repomix and returns derived Markdown Result with no path", async () => {
		const ctx = makePorts();
		const res = await convertGitRepo(
			{
				repoUrl: GitRepoIdentifier("octocat/Hello-World"),
				branch: GitBranchName("master"),
				compress: true,
			},
			ctx.ports,
		);
		expect(res).toEqual(ok(markdownResult("# Packed Repo")));
		expect(ctx.seenArgs).toEqual([
			[
				"--remote",
				"octocat/Hello-World",
				"--style",
				"markdown",
				"--stdout",
				"--quiet",
				"--remote-branch",
				"master",
				"--compress",
			],
		]);
	});

	test("rejects empty stdout and propagates formatted repomix errors", async () => {
		const empty = await convertGitRepo(
			{ repoUrl: GitRepoIdentifier("octocat/Hello-World"), compress: false },
			makePorts({
				runRepomix: async () => ok({ stdout: "   \n", stderr: "" }),
			}).ports,
		);
		expect(empty).toEqual(err("repomix produced no output"));

		const missing = await convertGitRepo(
			{ repoUrl: GitRepoIdentifier("octocat/Hello-World"), compress: false },
			makePorts({
				runRepomix: async () => err({ kind: "missing" }),
			}).ports,
		);
		expect(missing).toEqual(err("repomix executable not found"));
	});

	test("blocks DNS SSRF and unresolvable hosts before invoking repomix (GR-4, I1)", async () => {
		const privateCtx = makePorts({
			resolveHost: async () => ok([{ address: "10.0.0.5", family: 4 }]),
		});
		const blocked = await convertGitRepo(
			{
				repoUrl: GitRepoIdentifier("https://internal-git.example/owner/repo"),
				compress: false,
			},
			privateCtx.ports,
		);
		expect(blocked).toEqual(
			err(
				"Fetching https://internal-git.example/owner/repo is potentially dangerous, aborting.",
			),
		);
		expect(privateCtx.seenArgs).toEqual([]);

		const dnsFailCtx = makePorts({
			resolveHost: async () => err("ENOTFOUND"),
		});
		const failed = await convertGitRepo(
			{
				repoUrl: GitRepoIdentifier("https://missing-git.example/owner/repo"),
				compress: false,
			},
			dnsFailCtx.ports,
		);
		expect(failed).toEqual(
			err(
				'Could not resolve host "missing-git.example" for https://missing-git.example/owner/repo.',
			),
		);
		expect(dnsFailCtx.seenArgs).toEqual([]);
	});

	test("skips DNS lookup for shorthand repos and passes custom repomixTimeoutMs (GR-4, GR-7, D28)", async () => {
		let dnsCalled = false;
		let seenTimeout: number | undefined;
		const res = await convertGitRepo(
			{ repoUrl: GitRepoIdentifier("octocat/Hello-World"), compress: false },
			makePorts({
				resolveHost: async () => {
					dnsCalled = true;
					return ok([{ address: "127.0.0.1", family: 4 }]);
				},
				runRepomix: async (_args, timeoutMs) => {
					seenTimeout = timeoutMs;
					return err({ kind: "timeout", timeoutMs });
				},
			}).ports,
			{ repomixTimeoutMs: 5_000 },
		);
		expect(dnsCalled).toBe(false);
		expect(seenTimeout).toBe(5_000);
		expect(res).toEqual(err("Conversion timed out after 5000ms"));
	});
});

describe("validateRepoDestination & parseGitRepoLimits (GR-4, GR-7, D7, D28, I1)", () => {
	test("validates explicit http(s) URL DNS and skips GitHub shorthands", async () => {
		expect(
			await validateRepoDestination(
				GitRepoIdentifier("octocat/Hello-World"),
				async () => err("should not run"),
			),
		).toEqual(ok(undefined));
		expect(
			await validateRepoDestination(
				GitRepoIdentifier("https://github.com/octocat/Hello-World"),
				async () => ok([{ address: "140.82.121.4", family: 4 }]),
			),
		).toEqual(ok(undefined));
	});

	test("defaults MD_REPOMIX_TIMEOUT_MS to 120_000ms and rejects invalid values", () => {
		expect(parseGitRepoLimits({})).toEqual(ok({ repomixTimeoutMs: 120_000 }));
		expect(parseGitRepoLimits({ MD_REPOMIX_TIMEOUT_MS: "  " })).toEqual(
			ok({ repomixTimeoutMs: 120_000 }),
		);
		expect(parseGitRepoLimits({ MD_REPOMIX_TIMEOUT_MS: " 5000 " })).toEqual(
			ok({ repomixTimeoutMs: 5_000 }),
		);
		for (const bad of ["0", "-10", "slow", "1.5", "99999999999999999999"]) {
			expect(parseGitRepoLimits({ MD_REPOMIX_TIMEOUT_MS: bad })).toEqual(
				err(
					`Invalid MD_REPOMIX_TIMEOUT_MS "${bad}": must be a positive integer`,
				),
			);
		}
	});
});
