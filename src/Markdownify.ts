import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const VENV_DIR = '.venv';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type MarkdownResult = {
  path: string;
  text: string;
};

export class Markdownify {
  private static getVenvPythonPath(projectRoot: string): string {
    const isWindows = process.platform === 'win32';
    const venvPath = path.join(projectRoot, VENV_DIR);
    const pythonExecutable = isWindows ? 'python.exe' : 'python';
    return path.join(venvPath, isWindows ? 'Scripts' : 'bin', pythonExecutable);
  }

  private static async ensureVenvExists(projectRoot: string): Promise<void> {
    const venvPath = path.join(projectRoot, VENV_DIR);
    const pythonPath = this.getVenvPythonPath(projectRoot);

    if (!fs.existsSync(pythonPath)) {
      // Create virtual environment if it doesn't exist
      const isWindows = process.platform === 'win32';
      const uvCommand = isWindows ? 'uv' : '~/.local/bin/uv';
      await execAsync(`${uvCommand} venv ${venvPath}`);
    }
  }

  private static async runInVenv(command: string, projectRoot: string): Promise<string> {
    const venvPath = path.join(projectRoot, VENV_DIR);
    const isWindows = process.platform === 'win32';
    const venvPythonPath = this.getVenvPythonPath(projectRoot);
    
    // Check if virtual environment exists
    await this.ensureVenvExists(projectRoot);

    // Run command using the virtual environment's Python
    const { stdout, stderr } = await execAsync(
      `"${venvPythonPath}" -m ${command}`,
      { cwd: projectRoot }
    );

    if (stderr) {
      throw new Error(`Error executing command: ${stderr}`);
    }

    return stdout;
  }

  private static async _markitdown(
    filePath: string,
    projectRoot: string,
    uvPath: string,
  ): Promise<string> {
    try {
      // Run markitdown command in the virtual environment
      return await this.runInVenv(
        `markitdown "${filePath}"`,
        projectRoot
      );
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error running markitdown: ${error.message}`);
      }
      throw error;
    }
  }

  private static async saveToTempFile(content: string): Promise<string> {
    const tempOutputPath = path.join(
      os.tmpdir(),
      `markdown_output_${Date.now()}.md`,
    );
    fs.writeFileSync(tempOutputPath, content);
    return tempOutputPath;
  }

  static async toMarkdown({
    filePath,
    url,
    projectRoot = path.resolve(__dirname, ".."),
    uvPath = process.platform === 'win32' ? 'uv' : '~/.local/bin/uv',
  }: {
    filePath?: string;
    url?: string;
    projectRoot?: string;
    uvPath?: string;
  }): Promise<MarkdownResult> {
    try {
      let inputPath: string;
      let isTemporary = false;

      if (url) {
        const response = await fetch(url);
        const content = await response.text();
        inputPath = await this.saveToTempFile(content);
        isTemporary = true;
      } else if (filePath) {
        inputPath = filePath;
      } else {
        throw new Error("Either filePath or url must be provided");
      }

      const text = await this._markitdown(inputPath, projectRoot, uvPath);
      const outputPath = await this.saveToTempFile(text);

      if (isTemporary) {
        fs.unlinkSync(inputPath);
      }

      return { path: outputPath, text };
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(`Error processing to Markdown: ${e.message}`);
      } else {
        throw new Error("Error processing to Markdown: Unknown error occurred");
      }
    }
  }

  static async get({
    filePath,
  }: {
    filePath: string;
  }): Promise<MarkdownResult> {
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
