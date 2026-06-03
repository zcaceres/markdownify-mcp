import path from "path";
import os from "os";
import fs from "fs";
import { URL } from "node:url";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import is_ip_private from "private-ip";
import { isValidRemoteValue } from "repomix";

type ResolvedAddress = {
  address: string;
  family: number;
};

type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, "$1");
}

function ipv4FromMappedIpv6(address: string): string | null {
  const prefix = "::ffff:";
  const normalized = address.toLowerCase();
  if (!normalized.startsWith(prefix)) return null;

  const suffix = normalized.slice(prefix.length);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(suffix)) {
    return suffix;
  }

  const parts = suffix.split(":");
  if (parts.length !== 2) return null;

  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join(".");
}

function isPotentiallyDangerousIp(address: string): boolean {
  const normalized = normalizeHostname(address);
  if (!isIP(normalized)) return false;

  const mappedIpv4 = ipv4FromMappedIpv6(normalized);
  if (mappedIpv4) {
    return is_ip_private(mappedIpv4) === true;
  }

  return is_ip_private(normalized) === true;
}

function assertSafeUrlDestination(url: string, address: string): void {
  if (isPotentiallyDangerousIp(address)) {
    throw new Error(
      `Fetching ${url} is potentially dangerous, aborting.`,
    );
  }
}

async function resolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

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
  assertSafeUrlDestination(url, parsed.hostname);
}

export async function validateUrlDestination(
  url: string,
  resolver: HostResolver = resolveHostname,
): Promise<void> {
  validateUrl(url);

  const parsed = new URL(url);
  const hostname = normalizeHostname(parsed.hostname);
  if (isIP(hostname)) {
    return;
  }

  const addresses = await resolver(hostname);
  for (const { address } of addresses) {
    assertSafeUrlDestination(url, address);
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
