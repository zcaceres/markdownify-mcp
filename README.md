[![AgentAudit: Safe](https://img.shields.io/badge/AgentAudit-Safe-green?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAxTDMgNXY2YzAgNS41NSAzLjg0IDEwLjc0IDkgMTIgNS4xNi0xLjI2IDktNi40NSA5LTEyVjVsLTktNHoiLz48L3N2Zz4=)](https://www.agentaudit.dev/audit/markdownify-mcp)

# Markdownify MCP Server

> Help! I need someone with a Windows computer to help me add support for Markdownify-MCP on Windows. PRs exist but I cannot test them. Post [here](https://github.com/zcaceres/markdownify-mcp/issues/18) if interested.

![markdownify mcp logo](logo.jpg)

Markdownify is a Model Context Protocol (MCP) server that converts various file types and web content to Markdown format. It provides a set of tools to transform PDFs, images, audio files, web pages, and more into easily readable and shareable Markdown text.

<a href="https://glama.ai/mcp/servers/bn5q4b0ett"><img width="380" height="200" src="https://glama.ai/mcp/servers/bn5q4b0ett/badge" alt="Markdownify Server MCP server" /></a>

## Features

- Convert multiple file types to Markdown:
  - PDF
  - Images
  - Audio (with transcription)
  - DOCX
  - XLSX
  - PPTX
- Convert web content to Markdown:
  - YouTube video transcripts
  - Bing search results
  - General web pages
- Retrieve existing Markdown files

## Getting Started

1. Clone this repository
2. Install dependencies:
   ```
   pnpm install
   ```

Note: this will also install `uv` and related Python depdencies.

3. Build the project:
   ```
   pnpm run build
   ```
4. Start the server:
   ```
   pnpm start
   ```

## Development

- Use `pnpm run dev` to start the TypeScript compiler in watch mode
- Modify `src/server.ts` to customize server behavior
- Add or modify tools in `src/tools.ts`

## Usage with Desktop App

To integrate this server with a desktop app, add the following to your app's server configuration:

```js
{
  "mcpServers": {
    "markdownify": {
      "command": "node",
      "args": [
        "{ABSOLUTE PATH TO FILE HERE}/dist/index.js"
      ],
      "env": {
        // By default, the server will use the default install location of `uv`
        "UV_PATH": "/path/to/uv"
      }
    }
  }
}
```

## Available Tools

- `youtube-to-markdown`: Convert YouTube videos to Markdown
- `pdf-to-markdown`: Convert PDF files to Markdown
- `bing-search-to-markdown`: Convert Bing search results to Markdown
- `webpage-to-markdown`: Convert web pages to Markdown
- `image-to-markdown`: Convert images to Markdown with metadata
- `audio-to-markdown`: Convert audio files to Markdown with transcription
- `docx-to-markdown`: Convert DOCX files to Markdown
- `xlsx-to-markdown`: Convert XLSX files to Markdown
- `pptx-to-markdown`: Convert PPTX files to Markdown
- `get-markdown-file`: Retrieve an existing Markdown file. File extension must end with: *.md, *.markdown.
  
  OPTIONAL: set `MD_SHARE_DIR` env var to restrict the directory from which files can be retrieved, e.g. `MD_SHARE_DIR=[SOME_PATH] pnpm run start` 

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
