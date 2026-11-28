import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { promisify } from "node:util";
import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type {
	CaseOutcome,
	FormFactor,
} from "../../src/e2e-verification/nouns.ts";
import type { Toolset } from "../../src/mcp-contract/nouns.ts";
import {
	expandHome,
	realpathOrAncestor,
	resolveMarkitdownPath,
} from "../../src/utils.ts";

const execFileAsync = promisify(execFile);

export type ProvisionContext = {
	readonly projectRoot: string;
	readonly sampleDir: string;
	readonly dockerImage: string;
	readonly toolset: Toolset;
	readonly adHocFilePath?: string;
	readonly noBuild: boolean;
	readonly reuseVenv: boolean;
	readonly builtDockerImages: Set<string>;
};

export type ActiveFormFactor = {
	readonly formFactor: FormFactor;
	readonly sampleDirPath: string;
	readonly adHocTargetPath?: string;
	readonly client: Client;
	readonly runHttpGuardChecks?: () => Promise<CaseOutcome[]>;
	readonly close: () => Promise<void>;
};

export const resolveAdHocFile = (
	adHocFilePath?: string,
):
	| {
			readonly resolvedPath: string;
			readonly dir: string;
			readonly name: string;
	  }
	| undefined => {
	if (!adHocFilePath) return undefined;
	const resolvedPath = realpathOrAncestor(expandHome(adHocFilePath));
	return {
		resolvedPath,
		dir: dirname(resolvedPath),
		name: basename(resolvedPath),
	};
};

const buildLocalAllowedPaths = (
	sampleDir: string,
	extraDir?: string,
): string =>
	extraDir && extraDir !== sampleDir
		? [sampleDir, extraDir].join(delimiter)
		: sampleDir;

const getFreeLoopbackPort = (): Promise<number> =>
	new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.once("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const addr = srv.address();
			srv.close(() => {
				if (!addr || typeof addr === "string") {
					reject(new Error("Could not acquire ephemeral loopback port"));
				} else {
					resolve(addr.port);
				}
			});
		});
	});

const rawHttpRequest = (
	port: number,
	options: {
		method: string;
		path: string;
		headers?: Record<string, string>;
		body?: string;
	},
): Promise<{
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
}> =>
	new Promise((resolve, reject) => {
		const req = http.request(
			{
				host: "127.0.0.1",
				port,
				method: options.method,
				path: options.path,
				headers: options.headers,
			},
			(res) => {
				let data = "";
				res.on("data", (chunk) => {
					data += chunk;
				});
				res.on("end", () =>
					resolve({
						status: res.statusCode ?? 0,
						headers: res.headers,
						body: data,
					}),
				);
			},
		);
		req.on("error", reject);
		if (options.body) req.write(options.body);
		req.end();
	});

const waitForHttpMcpReady = async (
	port: number,
	timeoutMs: number,
	getStderr: () => string,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	const payload = JSON.stringify({
		jsonrpc: "2.0",
		id: 1,
		method: "tools/list",
		params: {},
	});

	while (Date.now() < deadline) {
		try {
			const res = await rawHttpRequest(port, {
				method: "POST",
				path: "/mcp",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
				},
				body: payload,
			});
			if (res.status === 200) return;
		} catch {
			// Server still starting
		}
		await new Promise((r) => setTimeout(r, 150));
	}
	throw new Error(
		`HTTP MCP server on 127.0.0.1:${port} did not become ready within ${timeoutMs}ms. stderr: ${getStderr().trim()}`,
	);
};

const runHttpSecurityProbes = async (
	formFactor: FormFactor,
	port: number,
	toolset: Toolset,
	verifyD9FailClosed: () => Promise<{ ok: boolean; detail: string }>,
): Promise<CaseOutcome[]> => {
	const outcomes: CaseOutcome[] = [];
	const payload = JSON.stringify({
		jsonrpc: "2.0",
		id: 99,
		method: "tools/list",
		params: {},
	});

	const t0 = Date.now();
	const notFound = await rawHttpRequest(port, {
		method: "GET",
		path: "/unknown",
	});
	const getMcp = await rawHttpRequest(port, { method: "GET", path: "/mcp" });
	const routingOk =
		notFound.status === 404 &&
		getMcp.status === 405 &&
		getMcp.headers.allow === "POST";
	outcomes.push({
		formFactor,
		caseId: "http-routing-404-405",
		category: "transport",
		tool: "http-guard",
		status: routingOk ? "PASS" : "FAIL",
		durationMs: Date.now() - t0,
		detail: routingOk
			? "verified 404 /unknown and 405 Allow: POST on GET /mcp (D33)"
			: `expected 404 & 405 Allow: POST, got ${notFound.status} and ${getMcp.status} (Allow=${String(getMcp.headers.allow)})`,
	});

	const t1 = Date.now();
	const badHost = await rawHttpRequest(port, {
		method: "POST",
		path: "/mcp",
		headers: {
			Host: "rebind.evil.com:3000",
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: payload,
	});
	const badOrigin = await rawHttpRequest(port, {
		method: "POST",
		path: "/mcp",
		headers: {
			Origin: "https://evil.com",
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: payload,
	});
	const guardsOk = badHost.status === 403 && badOrigin.status === 403;
	outcomes.push({
		formFactor,
		caseId: "http-host-origin-403",
		category: "transport",
		tool: "http-guard",
		status: guardsOk ? "PASS" : "FAIL",
		durationMs: Date.now() - t1,
		detail: guardsOk
			? "verified Host and Origin 403 guards (I5, D33)"
			: `expected 403 & 403, got Host=${badHost.status} Origin=${badOrigin.status}`,
	});

	const t2 = Date.now();
	const d9 = await verifyD9FailClosed();
	outcomes.push({
		formFactor,
		caseId: "http-d9-fail-closed",
		category: "transport",
		tool: toolset === "compact" ? "convert-local-file" : "pdf-to-markdown",
		status: d9.ok ? "PASS" : "FAIL",
		durationMs: Date.now() - t2,
		detail: d9.detail,
	});

	return outcomes;
};

const ensureDockerBuilt = async (ctx: ProvisionContext): Promise<void> => {
	if (ctx.noBuild || ctx.builtDockerImages.has(ctx.dockerImage)) {
		return;
	}
	try {
		await execFileAsync(
			"docker",
			["build", "-t", ctx.dockerImage, ctx.projectRoot],
			{ maxBuffer: 20 * 1024 * 1024 },
		);
		ctx.builtDockerImages.add(ctx.dockerImage);
	} catch (error) {
		const errObj = error as { stderr?: string; message?: string };
		const detail = errObj.stderr?.trim() || errObj.message || String(error);
		throw new Error(`Docker build failed: ${detail}`);
	}
};

const killChildCleanly = async (child: ChildProcess): Promise<void> => {
	if (child.exitCode !== null || child.killed) return;
	await new Promise<void>((resolve) => {
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			resolve();
		}, 3000);
		child.once("exit", () => {
			clearTimeout(timer);
			resolve();
		});
		child.kill("SIGTERM");
	});
};

const envRecord = (
	overrides: Record<string, string | undefined>,
): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries({ ...process.env, ...overrides })) {
		if (v !== undefined) out[k] = v;
	}
	return out;
};

const connectStdioFormFactor = async (
	formFactor: FormFactor,
	command: string,
	args: string[],
	env: Record<string, string>,
	sampleDirPath: string,
	extraClose?: () => Promise<void>,
	adHocTargetPath?: string,
): Promise<ActiveFormFactor> => {
	const transport = new StdioClientTransport({
		command,
		args,
		env,
		stderr: "pipe",
	});
	const client = new Client({
		name: `markdownify-e2e-${formFactor}`,
		version: "0.0.1",
	});
	try {
		await client.connect(transport);
	} catch (error) {
		await client.close().catch(() => {});
		if (extraClose) await extraClose().catch(() => {});
		throw error;
	}
	return {
		formFactor,
		sampleDirPath,
		...(adHocTargetPath !== undefined ? { adHocTargetPath } : {}),
		client,
		close: async () => {
			await client.close().catch(() => {});
			if (extraClose) await extraClose().catch(() => {});
		},
	};
};

export const provisionFormFactor = async (
	formFactor: FormFactor,
	ctx: ProvisionContext,
): Promise<ActiveFormFactor> => {
	const distEntry = join(ctx.projectRoot, "dist", "index.js");
	const adHoc = resolveAdHocFile(ctx.adHocFilePath);
	const localAllowedPaths = buildLocalAllowedPaths(ctx.sampleDir, adHoc?.dir);

	if (formFactor === "node-stdio" || formFactor === "bun-stdio") {
		await access(distEntry);
		const bin = formFactor === "node-stdio" ? "node" : "bun";
		return connectStdioFormFactor(
			formFactor,
			bin,
			[distEntry, `--toolset=${ctx.toolset}`],
			envRecord({ MD_ALLOWED_PATHS: localAllowedPaths }),
			ctx.sampleDir,
			undefined,
			adHoc?.resolvedPath,
		);
	}

	if (formFactor === "local-http") {
		await access(distEntry);
		const port = await getFreeLoopbackPort();
		const stderrChunks: string[] = [];
		const child = spawn(
			"bun",
			[
				distEntry,
				"--transport=http",
				"--host=127.0.0.1",
				`--port=${port}`,
				`--toolset=${ctx.toolset}`,
			],
			{
				env: envRecord({ MD_ALLOWED_PATHS: localAllowedPaths }),
				stdio: ["ignore", "ignore", "pipe"],
			},
		);
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderrChunks.push(chunk.toString());
		});

		try {
			await waitForHttpMcpReady(port, 15_000, () => stderrChunks.join(""));
		} catch (error) {
			await killChildCleanly(child);
			throw error;
		}

		const transport = new StreamableHTTPClientTransport(
			new URL(`http://127.0.0.1:${port}/mcp`),
		);
		const client = new Client({
			name: "markdownify-e2e-local-http",
			version: "0.0.1",
		});
		try {
			await client.connect(transport);
		} catch (error) {
			await client.close().catch(() => {});
			await killChildCleanly(child);
			throw error;
		}

		return {
			formFactor,
			sampleDirPath: ctx.sampleDir,
			...(adHoc ? { adHocTargetPath: adHoc.resolvedPath } : {}),
			client,
			runHttpGuardChecks: () =>
				runHttpSecurityProbes(formFactor, port, ctx.toolset, async () => {
					const d9Port = await getFreeLoopbackPort();
					const d9Stderr: string[] = [];
					const d9Env = envRecord({
						MD_ALLOWED_PATHS: undefined,
						MCP_ALLOW_UNRESTRICTED_PATHS: undefined,
					});
					const d9Child = spawn(
						"bun",
						[
							distEntry,
							"--transport=http",
							"--host=127.0.0.1",
							`--port=${d9Port}`,
							`--toolset=${ctx.toolset}`,
						],
						{ env: d9Env, stdio: ["ignore", "ignore", "pipe"] },
					);
					d9Child.stderr.on("data", (c: Buffer | string) =>
						d9Stderr.push(c.toString()),
					);
					const d9Client = new Client({
						name: "markdownify-e2e-d9-probe",
						version: "0.0.1",
					});
					try {
						await waitForHttpMcpReady(d9Port, 15_000, () => d9Stderr.join(""));
						await d9Client.connect(
							new StreamableHTTPClientTransport(
								new URL(`http://127.0.0.1:${d9Port}/mcp`),
							),
						);
						const res = await d9Client.callTool({
							name:
								ctx.toolset === "compact"
									? "convert-local-file"
									: "pdf-to-markdown",
							arguments: { filepath: join(ctx.sampleDir, "test.pdf") },
						});
						const text = JSON.stringify(res.content ?? []);
						const ok =
							res.isError === true &&
							text.includes("Local file tools are disabled in HTTP mode");
						return {
							ok,
							detail: ok
								? "verified D9 fail-closed refusal when MD_ALLOWED_PATHS is unset"
								: `expected D9 refusal, got isError=${String(res.isError)} text=${text}`,
						};
					} finally {
						await d9Client.close().catch(() => {});
						await killChildCleanly(d9Child);
					}
				}),
			close: async () => {
				await client.close().catch(() => {});
				await killChildCleanly(child);
			},
		};
	}

	if (formFactor === "docker-stdio") {
		await ensureDockerBuilt(ctx);
		const adHocMountArgs = adHoc ? ["-v", `${adHoc.dir}:/adhoc:ro`] : [];
		const dockerAllowedPaths = adHoc ? "/data:/adhoc" : "/data";
		return connectStdioFormFactor(
			formFactor,
			"docker",
			[
				"run",
				"--rm",
				"-i",
				"-v",
				`${ctx.sampleDir}:/data:ro`,
				...adHocMountArgs,
				"-e",
				`MD_ALLOWED_PATHS=${dockerAllowedPaths}`,
				"-e",
				`MCP_TOOLSET=${ctx.toolset}`,
				ctx.dockerImage,
			],
			envRecord({}),
			"/data",
			undefined,
			adHoc ? `/adhoc/${adHoc.name}` : undefined,
		);
	}

	if (formFactor === "docker-http") {
		await ensureDockerBuilt(ctx);
		const port = await getFreeLoopbackPort();
		const containerName = `markdownify-e2e-http-${randomUUID().slice(0, 8)}`;
		const stderrChunks: string[] = [];
		const adHocMountArgs = adHoc ? ["-v", `${adHoc.dir}:/adhoc:ro`] : [];
		const dockerAllowedPaths = adHoc ? "/data:/adhoc" : "/data";
		const child = spawn(
			"docker",
			[
				"run",
				"--rm",
				"--name",
				containerName,
				"-p",
				`127.0.0.1:${port}:3000`,
				"-v",
				`${ctx.sampleDir}:/data:ro`,
				...adHocMountArgs,
				"-e",
				`MD_ALLOWED_PATHS=${dockerAllowedPaths}`,
				"-e",
				`MCP_ALLOWED_HOSTS=127.0.0.1:${port},localhost:${port},127.0.0.1,localhost`,
				ctx.dockerImage,
				"--transport=http",
				"--host=0.0.0.0",
				"--port=3000",
				`--toolset=${ctx.toolset}`,
			],
			{ stdio: ["ignore", "ignore", "pipe"] },
		);
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderrChunks.push(chunk.toString());
		});

		const stopContainer = async () => {
			await execFileAsync("docker", ["rm", "-f", containerName]).catch(
				() => {},
			);
			await killChildCleanly(child);
		};

		try {
			await waitForHttpMcpReady(port, 20_000, () => stderrChunks.join(""));
		} catch (error) {
			await stopContainer();
			throw error;
		}

		const transport = new StreamableHTTPClientTransport(
			new URL(`http://127.0.0.1:${port}/mcp`),
		);
		const client = new Client({
			name: "markdownify-e2e-docker-http",
			version: "0.0.1",
		});
		try {
			await client.connect(transport);
		} catch (error) {
			await client.close().catch(() => {});
			await stopContainer();
			throw error;
		}

		return {
			formFactor,
			sampleDirPath: "/data",
			...(adHoc ? { adHocTargetPath: `/adhoc/${adHoc.name}` } : {}),
			client,
			runHttpGuardChecks: () =>
				runHttpSecurityProbes(formFactor, port, ctx.toolset, async () => {
					const d9Port = await getFreeLoopbackPort();
					const d9Name = `markdownify-e2e-d9-${randomUUID().slice(0, 8)}`;
					const d9Stderr: string[] = [];
					const d9Child = spawn(
						"docker",
						[
							"run",
							"--rm",
							"--name",
							d9Name,
							"-p",
							`127.0.0.1:${d9Port}:3000`,
							"-e",
							`MCP_ALLOWED_HOSTS=127.0.0.1:${d9Port},localhost:${d9Port},127.0.0.1,localhost`,
							ctx.dockerImage,
							"--transport=http",
							"--host=0.0.0.0",
							"--port=3000",
							`--toolset=${ctx.toolset}`,
						],
						{ stdio: ["ignore", "ignore", "pipe"] },
					);
					d9Child.stderr.on("data", (c: Buffer | string) =>
						d9Stderr.push(c.toString()),
					);
					const d9Client = new Client({
						name: "markdownify-e2e-docker-d9",
						version: "0.0.1",
					});
					try {
						await waitForHttpMcpReady(d9Port, 20_000, () => d9Stderr.join(""));
						await d9Client.connect(
							new StreamableHTTPClientTransport(
								new URL(`http://127.0.0.1:${d9Port}/mcp`),
							),
						);
						const res = await d9Client.callTool({
							name:
								ctx.toolset === "compact"
									? "convert-local-file"
									: "pdf-to-markdown",
							arguments: { filepath: "/data/test.pdf" },
						});
						const text = JSON.stringify(res.content ?? []);
						const ok =
							res.isError === true &&
							text.includes("Local file tools are disabled in HTTP mode");
						return {
							ok,
							detail: ok
								? "verified container D9 fail-closed refusal when MD_ALLOWED_PATHS is unset"
								: `expected D9 refusal, got isError=${String(res.isError)} text=${text}`,
						};
					} finally {
						await d9Client.close().catch(() => {});
						await execFileAsync("docker", ["rm", "-f", d9Name]).catch(() => {});
						await killChildCleanly(d9Child);
					}
				}),
			close: async () => {
				await client.close().catch(() => {});
				await stopContainer();
			},
		};
	}

	// npm-package Form Factor (D43): pack tarball, install into fresh temp dir, invoke bin over stdio
	await access(distEntry);
	const tempDir = await mkdtemp(join(tmpdir(), "markdownify-npm-e2e-"));
	try {
		await execFileAsync("npm", ["pack", "--pack-destination", tempDir], {
			cwd: ctx.projectRoot,
			maxBuffer: 20 * 1024 * 1024,
		});
		const entries = await readdir(tempDir);
		const tarball = entries.find((f) => f.endsWith(".tgz"));
		if (!tarball) {
			throw new Error("npm pack did not produce a .tgz tarball");
		}
		const tarballPath = join(tempDir, tarball);
		const installArgs = [
			"install",
			"--no-audit",
			"--no-fund",
			...(ctx.reuseVenv ? ["--ignore-scripts"] : []),
			tarballPath,
		];
		await execFileAsync("npm", installArgs, {
			cwd: tempDir,
			maxBuffer: 20 * 1024 * 1024,
		});
		const binName =
			process.platform === "win32"
				? "mcp-markdownify-server.cmd"
				: "mcp-markdownify-server";
		const binPath = join(tempDir, "node_modules", ".bin", binName);
		await access(binPath);

		const extraEnv: Record<string, string | undefined> = {
			MD_ALLOWED_PATHS: localAllowedPaths,
			MCP_TOOLSET: ctx.toolset,
			...(ctx.reuseVenv
				? { MARKITDOWN_PATH: resolveMarkitdownPath(ctx.projectRoot) }
				: {}),
		};

		return await connectStdioFormFactor(
			formFactor,
			binPath,
			[],
			envRecord(extraEnv),
			ctx.sampleDir,
			async () => {
				await rm(tempDir, { recursive: true, force: true }).catch(() => {});
			},
			adHoc?.resolvedPath,
		);
	} catch (error) {
		await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		throw error;
	}
};
