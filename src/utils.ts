import path from "path";
import os from "os";
import fs from "fs";
import { URL } from "node:url";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { isValidRemoteValue } from "repomix";

export type ResolvedAddress = {
  address: string;
  family: number;
};

export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

const PRIVATE_IP_BLOCKLIST = new BlockList();
// Non-public IPv4 ranges (IANA Special-Purpose Address Registry)
PRIVATE_IP_BLOCKLIST.addSubnet("0.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("100.64.0.0", 10, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("169.254.0.0", 16, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.0.0.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.0.2.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("198.18.0.0", 15, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("198.51.100.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("203.0.113.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("224.0.0.0", 4, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("240.0.0.0", 4, "ipv4");
// Non-public IPv6 ranges (BlockList also maps ::ffff:0:0/96 onto IPv4 rules)
PRIVATE_IP_BLOCKLIST.addSubnet("::", 128, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::1", 128, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::", 96, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("64:ff9b::", 96, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("64:ff9b:1::", 48, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("100::", 64, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("2001::", 32, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("2001:2::", 48, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("2001:db8::", 32, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("2002::", 16, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fc00::", 7, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fe80::", 10, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fec0::", 10, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("ff00::", 8, "ipv6");

function normalizeHostname(hostname: string): string {
  const unwrapped = hostname.replace(/^\[(.*)\]$/, "$1");
  const withoutZone = unwrapped.split("%")[0] ?? unwrapped;
  return withoutZone.replace(/\.+$/, "").toLowerCase();
}

export function isPrivateOrReservedIp(address: string): boolean {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family === 4) {
    return PRIVATE_IP_BLOCKLIST.check(normalized, "ipv4");
  }
  if (family === 6) {
    return PRIVATE_IP_BLOCKLIST.check(normalized, "ipv6");
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === "" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  );
}

async function defaultHostResolver(hostname: string): Promise<ResolvedAddress[]> {
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

function realpathOrAncestor(p: string): string {
  let current = path.resolve(p);
  const suffix: string[] = [];
  while (true) {
    try {
      const realCurrent = fs.realpathSync.native(current);
      return suffix.length === 0
        ? realCurrent
        : path.join(realCurrent, ...suffix.slice().reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(p);
      suffix.push(path.basename(current));
      current = parent;
    }
  }
}

export function assertPathAllowed(filePath: string): void {
  const allowed = getAllowedPaths();
  if (!allowed) return;
  const resolved = realpathOrAncestor(expandHome(filePath));
  const allowedReal = allowed.map(realpathOrAncestor);
  if (!allowedReal.some((dir) => isWithinDirectory(resolved, dir))) {
    throw new Error(
      `Path "${filePath}" is outside the allowed directories. ` +
        `Set MD_ALLOWED_PATHS to a ${path.delimiter}-separated list that includes a parent directory ` +
        `(currently allowed: ${allowedReal.join(path.delimiter)}).`,
    );
  }
}

export function validateUrl(url: string): void {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http: and https: schemes are allowed.");
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (isBlockedHostname(hostname) || isPrivateOrReservedIp(hostname)) {
    throw new Error(
      `Fetching ${url} is potentially dangerous, aborting.`,
    );
  }
}

export async function validateUrlDestination(
  url: string,
  resolver: HostResolver = defaultHostResolver,
): Promise<void> {
  validateUrl(url);

  const parsed = new URL(url);
  const hostname = normalizeHostname(parsed.hostname);
  if (isIP(hostname) !== 0) {
    return;
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new Error(`Could not resolve host "${hostname}" for ${url}.`);
  }

  if (!addresses || addresses.length === 0) {
    throw new Error(`Could not resolve host "${hostname}" for ${url}.`);
  }

  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error(
        `Fetching ${url} is potentially dangerous, aborting.`,
      );
    }
  }
}

export function validateRepoUrl(repoUrl: string): void {
  if (!repoUrl || !repoUrl.trim()) {
    throw new Error("Repository URL is required");
  }
  // Block non-http(s) explicit URLs, scp-style SSH shorthand, and private/reserved targets
  if (repoUrl.includes("://")) {
    const parsed = new URL(repoUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only http: and https: repository URLs are allowed.");
    }
    validateUrl(repoUrl);
  } else if (/^(?:[^/\s@]+@)?[^/\s@]+:/.test(repoUrl)) {
    throw new Error(
      `Repository shorthand "${repoUrl}" uses scp-style SSH syntax, which is not allowed. Use an http(s) URL (e.g. https://github.com/owner/repo).`,
    );
  }
  if (!isValidRemoteValue(repoUrl)) {
    throw new Error(
      `Invalid repository URL or shorthand: ${repoUrl}. Use a GitHub URL (https://github.com/owner/repo) or shorthand (owner/repo).`,
    );
  }
}

export function validateBranchName(branch: string): void {
  if (!branch || !branch.trim()) {
    throw new Error("Invalid branch name: must not be empty.");
  }
  if (
    branch.startsWith("-") ||
    branch.includes("..") ||
    branch.includes("@{") ||
    branch.endsWith(".lock") ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/@-]*$/.test(branch)
  ) {
    throw new Error(
      `Invalid branch name "${branch}". Branch names must not start with "-" or contain unsafe characters.`,
    );
  }
}

export function isUnconvertedHtml(output: string): boolean {
  const trimmed = output.trimStart();
  return trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html");
}

// A few of markitdown's converters key off the URL itself rather than the bytes:
// YouTubeConverter requires "https://www.youtube.com/watch?..." and
// BingSerpConverter requires "https://www.bing.com/search?q=...". Downloading those
// pages first and passing a temp .html file leaves stream_info.url unset so those
// converters never fire.
//
// Deliberately an allowlist rather than passing every URL through: markitdown fetches
// with requests' default User-Agent, which hosts like en.wikipedia.org and
// stackoverflow.com reject with 403 while accepting this server's fetch.
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
  try {
    const { pathname } = new URL(url);
    if (pathname.toLowerCase().endsWith(".pdf")) {
      return "pdf";
    }
  } catch {
    if (url.toLowerCase().endsWith(".pdf")) {
      return "pdf";
    }
  }
  return "html";
}

export function isMarkdownFile(filePath: string): boolean {
  const markdownExt = [".md", ".markdown"];
  return markdownExt.includes(path.extname(filePath));
}

export function isWithinDirectory(filePath: string, directory: string): boolean {
  const rel = path.relative(path.resolve(directory), path.resolve(filePath));
  if (rel === "") return true;
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
