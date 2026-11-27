import { isIP } from "node:net";
import { isPrivateOrReservedIp, normalizeHostname } from "../shared/ip.js";
import { err, ok, type Result } from "../shared/types.js";
import {
	DEFAULT_FETCH_TIMEOUT_MS,
	DEFAULT_MARKITDOWN_TIMEOUT_MS,
	DEFAULT_MAX_DOWNLOAD_BYTES,
	DEFAULT_MAX_REDIRECTS,
	type FetchedResponse,
	type MarkdownResult,
	WEB_URL_TOOLS,
	type WebConversionLimits,
	type WebConversionOptions,
	type WebConversionRequest,
	WebUrl,
	type WebUrlTool,
} from "./nouns.js";
import type { ResolveHost, WebConversionPorts } from "./ports.js";
import { markdownResult } from "./queries.js";

const UNCONVERTED_HTML_ERROR =
	"Conversion failed: the page returned raw HTML that could not be converted to Markdown. " +
	"This typically happens with JavaScript-rendered pages (SPAs) that require a browser to load content.";

const SLIM_DOCKER_HINT =
	"This format requires markitdown[all] (full local install) rather than the slim Docker pdf profile.";

const CONTENT_TYPE_TO_EXTENSION: Readonly<Record<string, string>> = {
	"text/html": "html",
	"application/xhtml+xml": "html",
	"application/pdf": "pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"docx",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		"pptx",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/tiff": "tiff",
	"image/bmp": "bmp",
	"audio/mpeg": "mp3",
	"audio/wav": "wav",
	"audio/x-wav": "wav",
	"audio/mp4": "m4a",
	"audio/x-m4a": "m4a",
	"audio/ogg": "ogg",
	"audio/flac": "flac",
	"text/plain": "txt",
	"text/markdown": "md",
	"text/csv": "csv",
	"application/json": "json",
	"text/json": "json",
	"application/xml": "xml",
	"text/xml": "xml",
};

const PATHNAME_EXTENSION_MAP: Readonly<Record<string, string>> = {
	html: "html",
	htm: "html",
	pdf: "pdf",
	docx: "docx",
	xlsx: "xlsx",
	pptx: "pptx",
	jpg: "jpg",
	jpeg: "jpg",
	png: "png",
	gif: "gif",
	webp: "webp",
	tiff: "tiff",
	bmp: "bmp",
	mp3: "mp3",
	wav: "wav",
	m4a: "m4a",
	ogg: "ogg",
	flac: "flac",
	txt: "txt",
	md: "md",
	markdown: "md",
	csv: "csv",
	json: "json",
	xml: "xml",
};

const isWebUrlTool = (value: string): value is WebUrlTool =>
	(WEB_URL_TOOLS as readonly string[]).includes(value);

const isBlockedHostname = (hostname: string): boolean =>
	hostname === "" ||
	hostname === "localhost" ||
	hostname.endsWith(".localhost") ||
	hostname.endsWith(".local") ||
	hostname.endsWith(".internal");

const parseIntEnv = (
	env: Readonly<Record<string, string | undefined>>,
	name: string,
	defaultValue: number,
	min: 0 | 1,
): Result<number, string> => {
	const raw = env[name];
	if (raw === undefined || raw.trim() === "") {
		return ok(defaultValue);
	}
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) {
		const label = min === 1 ? "positive integer" : "non-negative integer";
		return err(`Invalid ${name} "${raw}": must be a ${label}`);
	}
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isSafeInteger(parsed) || parsed < min) {
		const label = min === 1 ? "positive integer" : "non-negative integer";
		return err(`Invalid ${name} "${raw}": must be a ${label}`);
	}
	return ok(parsed);
};

/** Parse MD_* timeout, download size, and redirect limit overrides (D7, D13). */
export const parseWebLimits = (
	env: Readonly<Record<string, string | undefined>>,
): Result<WebConversionLimits, string> => {
	const fetchTimeoutMs = parseIntEnv(
		env,
		"MD_FETCH_TIMEOUT_MS",
		DEFAULT_FETCH_TIMEOUT_MS,
		1,
	);
	if (!fetchTimeoutMs.ok) return fetchTimeoutMs;

	const markitdownTimeoutMs = parseIntEnv(
		env,
		"MD_MARKITDOWN_TIMEOUT_MS",
		DEFAULT_MARKITDOWN_TIMEOUT_MS,
		1,
	);
	if (!markitdownTimeoutMs.ok) return markitdownTimeoutMs;

	const maxDownloadBytes = parseIntEnv(
		env,
		"MD_MAX_DOWNLOAD_BYTES",
		DEFAULT_MAX_DOWNLOAD_BYTES,
		1,
	);
	if (!maxDownloadBytes.ok) return maxDownloadBytes;

	const maxRedirects = parseIntEnv(
		env,
		"MD_MAX_REDIRECTS",
		DEFAULT_MAX_REDIRECTS,
		0,
	);
	if (!maxRedirects.ok) return maxRedirects;

	return ok({
		fetchTimeoutMs: fetchTimeoutMs.value,
		markitdownTimeoutMs: markitdownTimeoutMs.value,
		maxDownloadBytes: maxDownloadBytes.value,
		maxRedirects: maxRedirects.value,
	});
};

export const validateWebRequest = (
	tool: string,
	url: unknown,
): Result<WebConversionRequest, string> => {
	if (!isWebUrlTool(tool)) {
		return err(`Unknown web tool "${tool}"`);
	}
	if (typeof url !== "string" || url.trim() === "") {
		return err("URL is required for this tool");
	}
	const trimmed = url.trim();
	try {
		new URL(trimmed);
	} catch {
		return err(`Invalid URL "${trimmed}"`);
	}
	return ok({ tool, url: WebUrl(trimmed) });
};

export const validateWebUrl = async (
	url: string,
	resolveHost: ResolveHost,
): Promise<Result<WebUrl, string>> => {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return err(`Invalid URL "${url}"`);
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return err("Only http: and https: schemes are allowed.");
	}

	const hostname = normalizeHostname(parsed.hostname);
	if (isBlockedHostname(hostname) || isPrivateOrReservedIp(hostname)) {
		return err(`Fetching ${url} is potentially dangerous, aborting.`);
	}

	if (isIP(hostname) !== 0) {
		return ok(WebUrl(url));
	}

	const resolved = await resolveHost(hostname);
	if (!resolved.ok || resolved.value.length === 0) {
		return err(`Could not resolve host "${hostname}" for ${url}.`);
	}

	for (const { address } of resolved.value) {
		if (isPrivateOrReservedIp(address)) {
			return err(`Fetching ${url} is potentially dangerous, aborting.`);
		}
	}

	return ok(WebUrl(url));
};

export const checkHttpStatus = (
	status: number,
	url: string,
): Result<void, string> => {
	if (status >= 200 && status < 300) {
		return ok(undefined);
	}
	return err(`HTTP ${status} fetching ${url}`);
};

/** Infer Temporary File extension from Content-Type, then URL pathname, defaulting to "html" (D10, D15). */
export const inferTempExtension = (
	url: string,
	contentType?: string | null,
): string => {
	if (contentType) {
		const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
		const fromType = CONTENT_TYPE_TO_EXTENSION[mediaType];
		if (fromType) {
			return fromType;
		}
	}

	let pathname = url;
	try {
		pathname = new URL(url).pathname;
	} catch {
		// Fall back to raw URL string when malformed
	}
	const lastSegment = pathname.split("/").pop() ?? "";
	const dotIndex = lastSegment.lastIndexOf(".");
	if (dotIndex > 0 && dotIndex < lastSegment.length - 1) {
		const rawExt = lastSegment.slice(dotIndex + 1).toLowerCase();
		const fromPath = PATHNAME_EXTENSION_MAP[rawExt];
		if (fromPath) {
			return fromPath;
		}
	}

	return "html";
};

/** Allowlist for URLs passed directly to markitdown after redirect resolution and SSRF validation (D10, D14). */
export const shouldPassUrlDirectly = (url: string): boolean => {
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
};

/** Reject unconverted raw HTML output from markitdown (WU-12, D3, D8). */
export const checkConvertedOutput = (
	stdout: string,
): Result<string, string> => {
	const trimmed = stdout.trimStart().toLowerCase();
	if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html")) {
		return err(UNCONVERTED_HTML_ERROR);
	}
	return ok(stdout);
};

export const convertWebUrl = async (
	request: WebConversionRequest,
	ports: WebConversionPorts,
	options: WebConversionOptions = {},
): Promise<Result<MarkdownResult, string>> => {
	const fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
	const markitdownTimeoutMs =
		options.markitdownTimeoutMs ?? DEFAULT_MARKITDOWN_TIMEOUT_MS;
	const maxDownloadBytes =
		options.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
	const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

	let currentUrl: string = request.url;
	let finalResponse: FetchedResponse | undefined;

	for (let hop = 0; hop <= maxRedirects; hop++) {
		const validated = await validateWebUrl(currentUrl, ports.resolveHost);
		if (!validated.ok) {
			return validated;
		}

		const fetched = await ports.fetchWebUrl(validated.value, {
			timeoutMs: fetchTimeoutMs,
			maxBytes: maxDownloadBytes,
		});
		if (!fetched.ok) {
			switch (fetched.error.kind) {
				case "timeout":
					return err(
						`Fetch timed out after ${fetched.error.timeoutMs}ms for ${currentUrl}`,
					);
				case "too-large":
					return err(
						`Download exceeded maximum size of ${fetched.error.maxBytes} bytes for ${currentUrl}`,
					);
				case "network":
					return err(
						`Network error fetching ${currentUrl}: ${fetched.error.reason}`,
					);
				default: {
					const exhaustive: never = fetched.error;
					return exhaustive;
				}
			}
		}

		const { status, location } = fetched.value;
		if (status >= 300 && status < 400 && location) {
			try {
				currentUrl = new URL(location, currentUrl).toString();
			} catch {
				return err(`Invalid redirect location "${location}"`);
			}
			continue;
		}

		finalResponse = fetched.value;
		break;
	}

	if (!finalResponse) {
		return err("Too many redirects");
	}

	const statusCheck = checkHttpStatus(
		finalResponse.status,
		finalResponse.finalUrl,
	);
	if (!statusCheck.ok) {
		return statusCheck;
	}

	const runMarkitdown = async (
		inputPath: string,
	): Promise<Result<MarkdownResult, string>> => {
		const converted = await ports.convertWithMarkitdown(
			inputPath,
			markitdownTimeoutMs,
		);
		if (!converted.ok) {
			switch (converted.error.kind) {
				case "missing":
					return err("markitdown executable not found");
				case "timeout":
					return err(
						`Conversion timed out after ${converted.error.timeoutMs}ms`,
					);
				case "failed":
					if (converted.error.reason.includes("MissingDependencyException")) {
						return err(
							`Conversion failed: ${converted.error.reason}. ${SLIM_DOCKER_HINT}`,
						);
					}
					return err(`Conversion failed: ${converted.error.reason}`);
				default: {
					const exhaustive: never = converted.error;
					return exhaustive;
				}
			}
		}
		const outputCheck = checkConvertedOutput(converted.value);
		if (!outputCheck.ok) {
			return outputCheck;
		}
		return ok(markdownResult(outputCheck.value));
	};

	if (shouldPassUrlDirectly(finalResponse.finalUrl)) {
		return runMarkitdown(finalResponse.finalUrl);
	}

	if (finalResponse.body.byteLength > maxDownloadBytes) {
		return err(
			`Download exceeded maximum size of ${maxDownloadBytes} bytes for ${finalResponse.finalUrl}`,
		);
	}

	const extension = inferTempExtension(
		finalResponse.finalUrl,
		finalResponse.contentType,
	);
	const staged = await ports.stageTempFile(finalResponse.body, extension);
	if (!staged.ok) {
		return err(`Failed to stage temporary file: ${staged.error}`);
	}

	try {
		return await runMarkitdown(staged.value.path);
	} finally {
		await ports.cleanupTempFile(staged.value);
	}
};
