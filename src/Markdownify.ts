import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
	assertPathAllowed,
	expandHome,
	inferExtensionFromUrl,
	isMarkdownFile,
	isUnconvertedHtml,
	resolveMarkitdownPath,
	resolveRepomixPath,
	shouldPassUrlToMarkitdown,
	validateBranchName,
	validateRepoUrl,
	validateUrlDestination,
} from "./utils.js";
import { markdownResult } from "./web-conversion/queries.js";
import { checkHttpStatus, parseWebLimits } from "./web-conversion/verbs.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type MarkdownResult = {
	path?: string;
	text: string;
};

type TemporaryFile = {
	path: string;
	cleanupDir: string;
};

export class Markdownify {
	private static _validateUrlDestination = validateUrlDestination;

	private static async _markitdown(
		filePath: string,
		projectRoot: string,
		timeoutMs?: number,
	): Promise<string> {
		const markitdownPath = resolveMarkitdownPath(projectRoot);

		let stdout: string;
		try {
			// execFile resolves bare command names against PATH (POSIX execvp / Windows search).
			// Non-zero exit codes reject; stderr alone does not (markitdown emits non-fatal
			// warnings from onnxruntime/pydub/etc. on a successful run).
			({ stdout } = await execFileAsync(markitdownPath, [filePath], {
				maxBuffer: 50 * 1024 * 1024, // 50 MB
				...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
			}));
		} catch (e: unknown) {
			const err = e as NodeJS.ErrnoException & {
				killed?: boolean;
				signal?: string | null;
			};
			if (err?.code === "ENOENT") {
				throw new Error(
					`markitdown executable not found (looked up "${markitdownPath}"). ` +
						`Set MARKITDOWN_PATH to its absolute location, install it on PATH (e.g. \`pipx install "markitdown[pdf]"\`), ` +
						`or run setup in the project root (${projectRoot}): ` +
						`node preinstall.js (requires uv on PATH).`,
				);
			}
			if (
				timeoutMs !== undefined &&
				(err?.killed || err?.code === "ETIMEDOUT")
			) {
				throw new Error(`Conversion timed out after ${timeoutMs}ms`);
			}
			throw e;
		}

		if (isUnconvertedHtml(stdout)) {
			throw new Error(
				"Conversion failed: the page returned raw HTML that could not be converted to Markdown. " +
					"This typically happens with JavaScript-rendered pages (SPAs) that require a browser to load content.",
			);
		}

		return stdout;
	}

	private static async saveToTempFile(
		content: string | Buffer,
		suggestedExtension?: string | null,
	): Promise<TemporaryFile> {
		let outputExtension = "md";
		if (suggestedExtension != null) {
			outputExtension = suggestedExtension;
		}

		const tempOutputDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "markdownify-"),
		);
		const tempOutputPath = path.join(
			tempOutputDir,
			`markdown_output_${randomUUID()}.${outputExtension}`,
		);
		fs.writeFileSync(tempOutputPath, content, { flag: "wx" });
		return { path: tempOutputPath, cleanupDir: tempOutputDir };
	}

	private static cleanupTempFile(tempFile: TemporaryFile): void {
		fs.rmSync(tempFile.cleanupDir, { recursive: true, force: true });
	}

	private static async readResponseBytesWithLimit(
		response: Response,
		maxBytes: number,
		url: string,
	): Promise<Buffer> {
		const rawLength = response.headers?.get("content-length");
		if (rawLength && /^\d+$/.test(rawLength.trim())) {
			const declared = Number.parseInt(rawLength.trim(), 10);
			if (declared > maxBytes) {
				await response.body?.cancel().catch(() => {});
				throw new Error(
					`Download exceeded maximum size of ${maxBytes} bytes for ${url}`,
				);
			}
		}

		if (response.body && typeof response.body.getReader === "function") {
			const reader = response.body.getReader();
			const chunks: Uint8Array[] = [];
			let total = 0;
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (!value) continue;
					total += value.byteLength;
					if (total > maxBytes) {
						await reader.cancel().catch(() => {});
						throw new Error(
							`Download exceeded maximum size of ${maxBytes} bytes for ${url}`,
						);
					}
					chunks.push(value);
				}
			} finally {
				reader.releaseLock();
			}
			return Buffer.concat(chunks);
		}

		const arrayBuffer = await response.arrayBuffer();
		if (arrayBuffer.byteLength > maxBytes) {
			throw new Error(
				`Download exceeded maximum size of ${maxBytes} bytes for ${url}`,
			);
		}
		return Buffer.from(arrayBuffer);
	}

	// Walks the redirect chain, validating every hop against the SSRF rules, and returns
	// the final response alongside the resolved URL. Short links (e.g. youtu.be) resolve
	// to their canonical form before the markitdown URL-routing allowlist check runs.
	private static async safeFetch(
		url: string,
		maxRedirects = 10,
		fetchTimeoutMs = 30_000,
	): Promise<{ response: Response; finalUrl: string }> {
		let currentUrl = url;
		for (let i = 0; i <= maxRedirects; i++) {
			await Markdownify._validateUrlDestination(currentUrl);
			const signal = AbortSignal.timeout(fetchTimeoutMs);
			let response: Response;
			try {
				response = await fetch(currentUrl, { redirect: "manual", signal });
			} catch (e: unknown) {
				if (
					signal.aborted ||
					(e instanceof Error &&
						(e.name === "TimeoutError" || e.name === "AbortError"))
				) {
					throw new Error(
						`Fetch timed out after ${fetchTimeoutMs}ms for ${currentUrl}`,
					);
				}
				throw e;
			}
			const location = response.headers?.get("location");
			if (response.status >= 300 && response.status < 400 && location) {
				await response.body?.cancel().catch(() => {});
				currentUrl = new URL(location, currentUrl).toString();
				continue;
			}
			return { response, finalUrl: currentUrl };
		}
		throw new Error("Too many redirects");
	}

	static async toMarkdown({
		filePath,
		url,
		projectRoot = path.resolve(__dirname, ".."),
	}: {
		filePath?: string;
		url?: string;
		projectRoot?: string;
	}): Promise<MarkdownResult> {
		let temporaryFile: TemporaryFile | null = null;
		try {
			const limitsResult = parseWebLimits(process.env);
			if (!limitsResult.ok) {
				throw new Error(limitsResult.error);
			}
			const limits = limitsResult.value;
			let inputPath: string;

			if (url) {
				const { response, finalUrl } = await Markdownify.safeFetch(
					url,
					limits.maxRedirects,
					limits.fetchTimeoutMs,
				);
				const statusCheck = checkHttpStatus(response.status, finalUrl);
				if (!statusCheck.ok) {
					await response.body?.cancel().catch(() => {});
					throw new Error(statusCheck.error);
				}

				if (shouldPassUrlToMarkitdown(finalUrl)) {
					await response.body?.cancel().catch(() => {});
					inputPath = finalUrl;
				} else {
					const extension = inferExtensionFromUrl(
						finalUrl,
						response.headers?.get("content-type"),
					);

					const content = await Markdownify.readResponseBytesWithLimit(
						response,
						limits.maxDownloadBytes,
						finalUrl,
					);

					temporaryFile = await Markdownify.saveToTempFile(content, extension);
					inputPath = temporaryFile.path;
				}
			} else if (filePath) {
				const expanded = path.resolve(expandHome(filePath));
				assertPathAllowed(expanded);
				inputPath = expanded;
			} else {
				throw new Error("Either filePath or url must be provided");
			}

			const text = await Markdownify._markitdown(
				inputPath,
				projectRoot,
				limits.markitdownTimeoutMs,
			);

			return markdownResult(text);
		} catch (e: unknown) {
			if (e instanceof Error) {
				throw new Error(`Error processing to Markdown: ${e.message}`);
			} else {
				throw new Error("Error processing to Markdown: Unknown error occurred");
			}
		} finally {
			if (temporaryFile) {
				Markdownify.cleanupTempFile(temporaryFile);
			}
		}
	}

	static async fromRepo({
		repoUrl,
		branch,
		compress,
	}: {
		repoUrl: string;
		branch?: string;
		compress?: boolean;
	}): Promise<MarkdownResult> {
		validateRepoUrl(repoUrl);
		if (repoUrl.includes("://")) {
			await validateUrlDestination(repoUrl);
		}

		const projectRoot = path.resolve(__dirname, "..");
		const repomixPath = resolveRepomixPath(projectRoot);

		const args = [
			"--remote",
			repoUrl,
			"--style",
			"markdown",
			"--stdout",
			"--quiet",
		];

		if (branch !== undefined) {
			validateBranchName(branch);
			args.push("--remote-branch", branch);
		}

		if (compress) {
			args.push("--compress");
		}

		let stdout: string;
		let stderr: string;
		try {
			({ stdout, stderr } = await execFileAsync(repomixPath, args, {
				maxBuffer: 100 * 1024 * 1024, // 100 MB
			}));
		} catch (e: unknown) {
			const err = e as NodeJS.ErrnoException;
			if (err?.code === "ENOENT") {
				throw new Error(
					`repomix executable not found (looked up "${repomixPath}"). ` +
						`Set REPOMIX_PATH or install it on PATH (\`bun add -g repomix\`).`,
				);
			}
			throw e;
		}

		if (!stdout) {
			throw new Error(
				`repomix produced no output${stderr ? `: ${stderr}` : ""}`,
			);
		}

		return { text: stdout };
	}

	static async get({
		filePath,
	}: {
		filePath: string;
	}): Promise<MarkdownResult> {
		const resolvedPath = path.resolve(expandHome(filePath));
		if (!isMarkdownFile(resolvedPath)) {
			throw new Error("Required file is not a Markdown file.");
		}

		assertPathAllowed(resolvedPath);

		if (!fs.existsSync(resolvedPath)) {
			throw new Error("File does not exist");
		}

		const text = await fs.promises.readFile(resolvedPath, "utf-8");

		return {
			path: resolvedPath,
			text: text,
		};
	}
}
