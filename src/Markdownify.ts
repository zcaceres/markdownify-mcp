import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import {
  expandHome,
  validateUrl,
  validateRepoUrl,
  isUnconvertedHtml,
  inferExtensionFromUrl,
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
    filePath: string,
    projectRoot: string,
  ): Promise<string> {
    const markitdownPath = resolveMarkitdownPath(projectRoot);

    let stdout: string;
    let stderr: string;
    try {
      // execFile resolves bare command names against PATH (POSIX execvp / Windows search)
      ({ stdout, stderr } = await execFileAsync(markitdownPath, [filePath], {
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
          response.headers.get("location")!,
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
        const response = await this.safeFetch(url);
        const extension = inferExtensionFromUrl(url);

        const arrayBuffer = await response.arrayBuffer();
        const content = Buffer.from(arrayBuffer);

        inputPath = await this.saveToTempFile(content, extension);
        isTemporary = true;
      } else if (filePath) {
        const expanded = expandHome(filePath);
        assertPathAllowed(expanded);
        inputPath = expanded;
      } else {
        throw new Error("Either filePath or url must be provided");
      }

      const text = await this._markitdown(inputPath, projectRoot);

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
