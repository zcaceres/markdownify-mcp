import path from "path";
import os from "os";
import fs from "fs";
import { URL } from "node:url";
import is_ip_private from "private-ip";
import { isValidRemoteValue } from "repomix";

export function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export function resolveMarkitdownPath(projectRoot: string): string {
  if (process.env.MARKITDOWN_PATH) return process.env.MARKITDOWN_PATH;
  const isWin = process.platform === "win32";
  const venvBin = path.join(
    projectRoot,
    ".venv",
    isWin ? "Scripts" : "bin",
    `markitdown${isWin ? ".exe" : ""}`,
  );
  if (fs.existsSync(venvBin)) return venvBin;
  return "markitdown";
}

export function resolveRepomixPath(projectRoot: string): string {
  if (process.env.REPOMIX_PATH) return process.env.REPOMIX_PATH;
  const local = path.join(projectRoot, "node_modules", ".bin", "repomix");
  if (fs.existsSync(local)) return local;
  return "repomix";
}

export function getAllowedPaths(): string[] | null {
  const raw = process.env.MD_ALLOWED_PATHS ?? process.env.MD_SHARE_DIR;
  if (!raw) return null;
  const dirs = raw
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.normalize(path.resolve(expandHome(p))));
  return dirs.length > 0 ? dirs : null;
}

export function assertPathAllowed(filePath: string): void {
  const allowed = getAllowedPaths();
  if (!allowed) return;
  const resolved = path.normalize(path.resolve(expandHome(filePath)));
  if (!allowed.some((dir) => isWithinDirectory(resolved, dir))) {
    throw new Error(
      `Path "${filePath}" is outside the allowed directories. ` +
        `Set MD_ALLOWED_PATHS to a ${path.delimiter}-separated list that includes a parent directory ` +
        `(currently allowed: ${allowed.join(path.delimiter)}).`,
    );
  }
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

export function validateRepoUrl(repoUrl: string): void {
  if (!repoUrl || !repoUrl.trim()) {
    throw new Error("Repository URL is required");
  }
  if (!isValidRemoteValue(repoUrl)) {
    throw new Error(
      `Invalid repository URL or shorthand: ${repoUrl}. Use a GitHub URL (https://github.com/owner/repo) or shorthand (owner/repo).`,
    );
  }
  // Block non-http(s) explicit URLs (e.g. file://, ssh:// for SSRF prevention)
  if (repoUrl.includes("://")) {
    const parsed = new URL(repoUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only http: and https: repository URLs are allowed.");
    }
  }
}

export function isUnconvertedHtml(output: string): boolean {
  const trimmed = output.trimStart();
  return trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html");
}

// A few of markitdown's converters key off the URL itself rather than the bytes:
// YouTubeConverter requires a URL starting "https://www.youtube.com/watch?" and
// BingSerpConverter requires "https://www.bing.com/search?q=". Downloading those pages
// first and handing markitdown a temp .html file leaves stream_info.url unset, so
// accepts() returns false and the generic HTML converter runs instead. That is why
// youtube-to-markdown returns the page footer and bing-search-to-markdown returns
// localized SERP chrome. Those hosts have to reach markitdown as URL strings.
//
// Deliberately an allowlist rather than "pass every URL through": markitdown fetches
// with requests' default User-Agent, which some hosts reject outright. en.wikipedia.org
// and stackoverflow.com both answer 403 to markitdown while answering 200 to this
// server's own fetch. Wikipedia is the sharp case, since markitdown ships a
// WikipediaConverter that can never run on a live fetch, so routing every URL through
// markitdown would trade working output for a hard 403 on those hosts.
export function shouldPassUrlToMarkitdown(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "www.youtube.com") {
    return parsed.pathname === "/watch" && parsed.searchParams.has("v");
  }
  if (host === "www.bing.com") {
    return parsed.pathname === "/search" && parsed.searchParams.has("q");
  }
  return false;
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
