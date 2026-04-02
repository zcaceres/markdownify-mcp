import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
	expandHome,
	inferExtensionFromUrl,
	isMarkdownFile,
	isUnconvertedHtml,
	isWithinDirectory,
	validateRepoUrl,
	validateUrl,
} from "./utils.js";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type MarkdownResult = {
	path?: string;
	text: string;
};

export class Markdownify {
	private static async _markitdown(
		filePath: string,
		projectRoot: string,
	): Promise<string> {
		const venvPath = path.join(projectRoot, ".venv");
		const markitdownPath = path.join(
			venvPath,
			process.platform === "win32" ? "Scripts" : "bin",
			`markitdown${process.platform === "win32" ? ".exe" : ""}`,
		);

		if (!fs.existsSync(markitdownPath)) {
			throw new Error(
				`markitdown executable not found at ${markitdownPath}. ` +
					`Ensure the Python virtual environment is set up by running: ` +
					`python3 -m venv .venv && .venv/bin/pip install "markitdown>=0.1.5" ` +
					`in the project root (${projectRoot}).`,
			);
		}

		// Use execFile to prevent command injection
		const { stdout, stderr } = await execFileAsync(markitdownPath, [filePath], {
			maxBuffer: 50 * 1024 * 1024, // 50 MB
		});

		if (stderr) {
			throw new Error(`Error executing command: ${stderr}`);
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
	): Promise<string> {
		let outputExtension = "md";
		if (suggestedExtension != null) {
			outputExtension = suggestedExtension;
		}

		const tempOutputPath = path.join(
			os.tmpdir(),
			`markdown_output_${Date.now()}.${outputExtension}`,
		);
		fs.writeFileSync(tempOutputPath, content);
		return tempOutputPath;
	}

	private static async safeFetch(
		url: string,
		maxRedirects = 10,
	): Promise<Response> {
		let currentUrl = url;
		for (let i = 0; i < maxRedirects; i++) {
			validateUrl(currentUrl);
			const response = await fetch(currentUrl, { redirect: "manual" });
			if (
				response.status >= 300 &&
				response.status < 400 &&
				response.headers.get("location")
			) {
				currentUrl = new URL(
					response.headers.get("location") as string,
					currentUrl,
				).toString();
				continue;
			}
			return response;
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
		try {
			let inputPath: string;
			let isTemporary = false;

			if (url) {
				const response = await Markdownify.safeFetch(url);
				const extension = inferExtensionFromUrl(url);

				const arrayBuffer = await response.arrayBuffer();
				const content = Buffer.from(arrayBuffer);

				inputPath = await Markdownify.saveToTempFile(content, extension);
				isTemporary = true;
			} else if (filePath) {
				inputPath = filePath;
			} else {
				throw new Error("Either filePath or url must be provided");
			}

			const text = await Markdownify._markitdown(inputPath, projectRoot);

			if (isTemporary) {
				fs.unlinkSync(inputPath);
			}

			return { text };
		} catch (e: unknown) {
			if (e instanceof Error) {
				throw new Error(`Error processing to Markdown: ${e.message}`);
			} else {
				throw new Error("Error processing to Markdown: Unknown error occurred");
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

		const repomixPath = path.join(
			__dirname,
			"..",
			"node_modules",
			".bin",
			"repomix",
		);

		if (!fs.existsSync(repomixPath)) {
			throw new Error("repomix executable not found");
		}

		const args = [
			"--remote",
			repoUrl,
			"--style",
			"markdown",
			"--stdout",
			"--quiet",
		];

		if (branch) {
			args.push("--remote-branch", branch);
		}

		if (compress) {
			args.push("--compress");
		}

		const { stdout, stderr } = await execFileAsync(repomixPath, args, {
			maxBuffer: 100 * 1024 * 1024, // 100 MB
		});

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

		if (process.env?.MD_SHARE_DIR) {
			const allowedShareDir = expandHome(process.env.MD_SHARE_DIR);
			if (!isWithinDirectory(resolvedPath, allowedShareDir)) {
				throw new Error(
					`Only files in ${path.normalize(path.resolve(allowedShareDir))} are allowed.`,
				);
			}
		}

		if (!fs.existsSync(filePath)) {
			throw new Error("File does not exist");
		}

		const text = await fs.promises.readFile(filePath, "utf-8");

		return {
			path: filePath,
			text: text,
		};
	}
}
