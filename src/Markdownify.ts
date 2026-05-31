import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  expandHome,
  validateUrl,
  validateRepoUrl,
  isUnconvertedHtml,
  isMarkdownFile,
  resolveMarkitdownPath,
  resolveRepomixPath,
  assertPathAllowed,
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
    input: string,
    projectRoot: string,
  ): Promise<string> {
    const markitdownPath = resolveMarkitdownPath(projectRoot);

    let stdout: string;
    try {
      // execFile resolves bare command names against PATH (POSIX execvp / Windows search).
      // Non-zero exit codes reject; stderr alone does not (markitdown emits non-fatal
      // warnings from onnxruntime/pydub/etc. on a successful run).
      ({ stdout } = await execFileAsync(markitdownPath, [input], {
        maxBuffer: 50 * 1024 * 1024, // 50 MB
      }));
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") {
        throw new Error(
          `markitdown executable not found (looked up "${markitdownPath}"). ` +
            `Set MARKITDOWN_PATH to its absolute location, install it on PATH (e.g. \`pipx install "markitdown[pdf]"\`), ` +
            `or run setup in the project root (${projectRoot}): ` +
            `python3 -m venv .venv && .venv/bin/pip install "markitdown[pdf]>=0.1.5".`,
        );
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

  // Walks the redirect chain validating each hop against SSRF rules, returning
  // the final resolved URL. Hands no body back — markitdown does its own fetch
  // on the resolved URL so its URL-aware routing (YouTube transcript API, Bing,
  // generic webpage) can fire instead of seeing a downloaded blob.
  private static async resolveValidatedUrl(
    url: string,
    maxRedirects = 10,
  ): Promise<string> {
    let currentUrl = url;
    for (let i = 0; i < maxRedirects; i++) {
      validateUrl(currentUrl);
      const response = await fetch(currentUrl, { redirect: "manual" });
      response.body?.cancel().catch(() => {});
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        currentUrl = new URL(
          response.headers.get("location")!,
          currentUrl,
        ).toString();
        continue;
      }
      return currentUrl;
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

      if (url) {
        // Hand markitdown the URL string (post-redirect-validation) so its
        // URL-aware routing — YouTube transcript API, Bing search, generic
        // webpage — can fire. Downloading first and passing a temp .html file
        // forces markitdown into its generic HTML→Markdown path and silently
        // breaks all three tools (e.g. YouTube returns the page footer).
        inputPath = await this.resolveValidatedUrl(url);
      } else if (filePath) {
        const expanded = expandHome(filePath);
        assertPathAllowed(expanded);
        inputPath = expanded;
      } else {
        throw new Error("Either filePath or url must be provided");
      }

      const text = await this._markitdown(inputPath, projectRoot);

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

    if (branch) {
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
