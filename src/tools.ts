import type { Tool } from "@modelcontextprotocol/server";

export const YouTubeToMarkdownTool: Tool = {
	name: "youtube-to-markdown",
	description:
		"Convert a YouTube video to markdown, including transcript if available",
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description: "URL of the YouTube video",
			},
		},
		required: ["url"],
	},
	annotations: {
		title: "YouTube to Markdown",
		readOnlyHint: true,
		openWorldHint: true,
	},
};

export const PDFToMarkdownTool: Tool = {
	name: "pdf-to-markdown",
	description: "Convert a PDF file to markdown",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description: "Absolute path of the PDF file to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "PDF to Markdown",
		readOnlyHint: true,
	},
};

export const BingSearchResultToMarkdownTool: Tool = {
	name: "bing-search-to-markdown",
	description: "Convert a Bing search results page to markdown",
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description: "URL of the Bing search results page",
			},
		},
		required: ["url"],
	},
	annotations: {
		title: "Bing Search to Markdown",
		readOnlyHint: true,
		openWorldHint: true,
	},
};

export const WebpageToMarkdownTool: Tool = {
	name: "webpage-to-markdown",
	description: "Convert a webpage to markdown",
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description: "URL of the webpage to convert",
			},
		},
		required: ["url"],
	},
	annotations: {
		title: "Webpage to Markdown",
		readOnlyHint: true,
		openWorldHint: true,
	},
};

export const ImageToMarkdownTool: Tool = {
	name: "image-to-markdown",
	description:
		"Convert an image to markdown, including metadata and description",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description: "Absolute path of the image file to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "Image to Markdown",
		readOnlyHint: true,
	},
};

export const AudioToMarkdownTool: Tool = {
	name: "audio-to-markdown",
	description:
		"Convert an audio file to markdown, including transcription if possible",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description: "Absolute path of the audio file to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "Audio to Markdown",
		readOnlyHint: true,
	},
};

export const DocxToMarkdownTool: Tool = {
	name: "docx-to-markdown",
	description: "Convert a DOCX file to markdown",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description: "Absolute path of the DOCX file to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "DOCX to Markdown",
		readOnlyHint: true,
	},
};

export const XlsxToMarkdownTool: Tool = {
	name: "xlsx-to-markdown",
	description: "Convert an XLSX file to markdown",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description: "Absolute path of the XLSX file to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "XLSX to Markdown",
		readOnlyHint: true,
	},
};

export const PptxToMarkdownTool: Tool = {
	name: "pptx-to-markdown",
	description: "Convert a PPTX file to markdown",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description: "Absolute path of the PPTX file to convert",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "PPTX to Markdown",
		readOnlyHint: true,
	},
};

export const GitRepoToMarkdownTool: Tool = {
	name: "git-repo-to-markdown",
	description:
		"Convert a git repository into a single markdown document containing the file tree and source code. Supports GitHub URLs and shorthand (e.g. 'owner/repo').",
	inputSchema: {
		type: "object",
		properties: {
			url: {
				type: "string",
				description:
					"Git repository URL or GitHub shorthand (e.g. 'https://github.com/owner/repo' or 'owner/repo')",
			},
			branch: {
				type: "string",
				description:
					"Branch, tag, or commit to use (default: repo default branch)",
			},
			compress: {
				type: "boolean",
				description:
					"Use Tree-sitter compression to reduce output size (~70% reduction). Default: false",
			},
		},
		required: ["url"],
	},
	annotations: {
		title: "Git Repo to Markdown",
		readOnlyHint: true,
		openWorldHint: true,
	},
};

export const GetMarkdownFileTool: Tool = {
	name: "get-markdown-file",
	description: "Get a markdown file by absolute file path",
	inputSchema: {
		type: "object",
		properties: {
			filepath: {
				type: "string",
				description: "Absolute path to file of markdown'd text",
			},
		},
		required: ["filepath"],
	},
	annotations: {
		title: "Get Markdown File",
		readOnlyHint: true,
	},
};
