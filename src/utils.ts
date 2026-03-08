import path from "path";
import os from "os";
import { URL } from "node:url";
import is_ip_private from "private-ip";

export function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export function validateUrl(url: string): void {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http: and https: schemes are allowed.");
  }
  if (is_ip_private(parsed.hostname)) {
    throw new Error(
      `Fetching ${url} is potentially dangerous, aborting.`,
    );
  }
}

export function isUnconvertedHtml(output: string): boolean {
  const trimmed = output.trimStart();
  return trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html");
}

export function inferExtensionFromUrl(url: string): string {
  if (url.endsWith(".pdf")) {
    return "pdf";
  }
  return "html";
}

export function isMarkdownFile(filePath: string): boolean {
  const markdownExt = [".md", ".markdown"];
  return markdownExt.includes(path.extname(filePath));
}

export function isWithinDirectory(filePath: string, directory: string): boolean {
  const normPath = path.normalize(path.resolve(filePath));
  const normDir = path.normalize(path.resolve(directory));
  return normPath.startsWith(normDir);
}
