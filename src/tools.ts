import type { Tool } from "@modelcontextprotocol/server";

export const YouTubeToMarkdownTool: Tool = {
	name: "youtube-to-markdown",
	title: "YouTube to Markdown",
	description:
		"Convert a public YouTube video URL into Markdown containing video metadata and transcript when available. Use this for youtube.com or youtu.be video links instead of webpage-to-markdown. Private, loopback, or non-http(s) URLs are blocked, and videos without transcripts return metadata only.",
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description:
					"Public http(s) URL of the YouTube video (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)",
			},
		},
		required: ["url"],
	},
	annotations: {
		title: "YouTube to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: true,
	},
};

export const PDFToMarkdownTool: Tool = {
	name: "pdf-to-markdown",
	title: "PDF to Markdown",
	description:
		"Convert a local PDF file on disk into Markdown text. Use this for local filesystem PDFs rather than remote URLs (use webpage-to-markdown for hosted PDF URLs). Requires an absolute or ~/ path within MD_ALLOWED_PATHS when configured, and fails closed in HTTP mode unless MD_ALLOWED_PATHS is set.",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description:
					"Absolute path or ~/ home-relative path to the local PDF file to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "PDF to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
};

export const BingSearchResultToMarkdownTool: Tool = {
	name: "bing-search-to-markdown",
	title: "Bing Search to Markdown",
	description:
		"Convert a public Bing search results page URL into structured Markdown results. Use this specifically for bing.com/search URLs instead of webpage-to-markdown. Private or non-http(s) URLs are blocked, and upstream bot-protection challenges may prevent extraction.",
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description:
					"Public http(s) URL of the Bing search results page (e.g. https://www.bing.com/search?q=...)",
			},
		},
		required: ["url"],
	},
	annotations: {
		title: "Bing Search to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: true,
	},
};

export const WebpageToMarkdownTool: Tool = {
	name: "webpage-to-markdown",
	title: "Webpage to Markdown",
	description:
		"Fetch a public http(s) webpage or hosted document (HTML, PDF, DOCX, XLSX, PPTX, image, audio, JSON, CSV) and convert it into Markdown. Use youtube-to-markdown, bing-search-to-markdown, or git-repo-to-markdown for those specialized targets instead. Private/loopback hosts are blocked, non-2xx responses fail, and JavaScript-rendered SPAs that return raw unconverted HTML fail with an error.",
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description:
					"Public http(s) URL of the webpage or hosted document to fetch and convert",
			},
		},
		required: ["url"],
	},
	annotations: {
		title: "Webpage to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: true,
	},
};

export const ImageToMarkdownTool: Tool = {
	name: "image-to-markdown",
	title: "Image to Markdown",
	description:
		"Inspect a local image file on disk and return extracted metadata as Markdown. Use this for local image files rather than image URLs (use webpage-to-markdown for remote URLs). Without external vision model configuration this returns metadata only (which may be empty), requires an absolute or ~/ path, and is disabled in HTTP mode unless MD_ALLOWED_PATHS is set.",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description:
					"Absolute path or ~/ home-relative path to the local image file to inspect",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "Image to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
};

export const AudioToMarkdownTool: Tool = {
	name: "audio-to-markdown",
	title: "Audio to Markdown",
	description:
		"Convert a local audio file on disk into Markdown metadata and transcription when audio dependencies are installed. Use this for local audio files rather than remote URLs (use webpage-to-markdown for hosted audio). Requires the full local markitdown[all] profile (unsupported in the slim Docker pdf image), an absolute or ~/ path, and MD_ALLOWED_PATHS in HTTP mode.",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description:
					"Absolute path or ~/ home-relative path to the local audio file to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "Audio to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
};

export const DocxToMarkdownTool: Tool = {
	name: "docx-to-markdown",
	title: "DOCX to Markdown",
	description:
		"Convert a local Word (.docx) document on disk into Markdown text. Use this for local DOCX files rather than hosted URLs (use webpage-to-markdown for remote documents). Requires the full local markitdown[all] profile (returns a hint in the slim Docker pdf image), an absolute or ~/ path, and MD_ALLOWED_PATHS in HTTP mode.",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description:
					"Absolute path or ~/ home-relative path to the local DOCX file to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "DOCX to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
};

export const XlsxToMarkdownTool: Tool = {
	name: "xlsx-to-markdown",
	title: "XLSX to Markdown",
	description:
		"Convert a local Excel (.xlsx) spreadsheet on disk into Markdown tables. Use this for local XLSX files rather than hosted URLs (use webpage-to-markdown for remote spreadsheets). Requires the full local markitdown[all] profile (returns a hint in the slim Docker pdf image), an absolute or ~/ path, and MD_ALLOWED_PATHS in HTTP mode.",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description:
					"Absolute path or ~/ home-relative path to the local XLSX spreadsheet to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "XLSX to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
};

export const PptxToMarkdownTool: Tool = {
	name: "pptx-to-markdown",
	title: "PPTX to Markdown",
	description:
		"Convert a local PowerPoint (.pptx) presentation on disk into Markdown slides. Use this for local PPTX files rather than hosted URLs (use webpage-to-markdown for remote decks). Requires the full local markitdown[all] profile (returns a hint in the slim Docker pdf image), an absolute or ~/ path, and MD_ALLOWED_PATHS in HTTP mode.",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description:
					"Absolute path or ~/ home-relative path to the local PPTX presentation to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "PPTX to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
};

export const GitRepoToMarkdownTool: Tool = {
	name: "git-repo-to-markdown",
	title: "Git Repo to Markdown",
	description:
		"Clone and pack a public remote Git repository into a single Markdown document containing its directory tree and source files. Use this for public http(s) Git repository URLs or GitHub owner/repo shorthand instead of webpage-to-markdown. Embedded URL credentials, SSH/file schemes, and private/loopback hosts are rejected; set compress=true to reduce output size (~70%) via Tree-sitter.",
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description:
					"Public http(s) Git repository URL without embedded credentials, or GitHub shorthand (e.g. https://github.com/owner/repo or owner/repo)",
			},
			branch: {
				type: "string",
				description:
					"Optional branch name, tag, or commit SHA to pack (defaults to the repository default branch)",
			},
			compress: {
				type: "boolean",
				description:
					"Optional Tree-sitter compression flag to reduce output size by ~70% (default: false)",
			},
		},
		required: ["url"],
	},
	annotations: {
		title: "Git Repo to Markdown",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: true,
	},
};

export const GetMarkdownFileTool: Tool = {
	name: "get-markdown-file",
	title: "Get Markdown File",
	description:
		"Read an existing local Markdown file (.md or .markdown, case-insensitive) verbatim and return its resolved file path and UTF-8 text without running a converter. Use this only for existing local Markdown files instead of the format-conversion tools. Requires an absolute or ~/ path whose realpath target stays within MD_ALLOWED_PATHS, and is disabled in HTTP mode unless MD_ALLOWED_PATHS is configured.",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description:
					"Absolute path or ~/ home-relative path to an existing local .md or .markdown file",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "Get Markdown File",
		readOnlyHint: true,
		destructiveHint: false,
		idempotentHint: true,
		openWorldHint: false,
	},
};
