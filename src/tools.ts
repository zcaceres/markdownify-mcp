import { ToolSchema } from "@modelcontextprotocol/sdk/types.js";

export const YouTubeToMarkdownTool = ToolSchema.parse({
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
});

export const PDFToMarkdownTool = ToolSchema.parse({
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
});

export const BingSearchResultToMarkdownTool = ToolSchema.parse({
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
});

export const WebpageToMarkdownTool = ToolSchema.parse({
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
});

export const ImageToMarkdownTool = ToolSchema.parse({
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
});

export const AudioToMarkdownTool = ToolSchema.parse({
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
});

export const DocxToMarkdownTool = ToolSchema.parse({
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
});

export const XlsxToMarkdownTool = ToolSchema.parse({
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
});

export const PptxToMarkdownTool = ToolSchema.parse({
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
});

export const GetMarkdownFileTool = ToolSchema.parse({
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
});
