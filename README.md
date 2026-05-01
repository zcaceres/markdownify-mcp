# Markdownify MCP Server

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
   bun install
   ```

   The `preinstall` step creates a Python virtual environment at `.venv` and installs `markitdown[all]`.

3. Build the project:
   ```
   bun run build
   ```
4. Start the server:
   ```
   bun start
   ```

## Development

- Use `bun run dev` to start the TypeScript compiler in watch mode
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
      ]
    }
  }
}
```

### Environment variables

All paths default to sensible values; override only when the defaults don't fit your install layout.

| Variable | Default | Purpose |
|---|---|---|
| `MARKITDOWN_PATH` | `<project>/.venv/bin/markitdown`, then `markitdown` on `PATH` | Absolute path to the `markitdown` executable. Set this when you've installed markitdown system-wide (e.g. `pipx install "markitdown[pdf]"`) instead of using the bundled venv. |
| `REPOMIX_PATH` | `<project>/node_modules/.bin/repomix`, then `repomix` on `PATH` | Absolute path to the `repomix` executable used by `git-repo-to-markdown`. |
| `MD_ALLOWED_PATHS` | unset (unrestricted) | Path-delimiter-separated list (`:` on POSIX, `;` on Windows) of directories the server is allowed to read. When set, all file-input tools (`pdf-to-markdown`, `get-markdown-file`, etc.) reject paths outside these directories. |
| `MD_SHARE_DIR` | unset | Deprecated alias for `MD_ALLOWED_PATHS` (single directory). Still honored for backward compatibility. |

## Usage with Docker

Build and run:
```sh
docker build -t markdownify-mcp .
docker run --rm -i \
  -v "$HOME/Documents:/data:ro" \
  -e MD_ALLOWED_PATHS=/data \
  markdownify-mcp
```

Notes for the Docker MCP catalog (`mcp/markdownify`):
- Mount any host directories you want the server to read into the container, then pass the **container** paths to the tools (e.g. `/data/foo.pdf`, not `/Users/you/Documents/foo.pdf`).
- Set `MD_ALLOWED_PATHS` to the colon-separated list of mounted directories so the server enforces a read boundary that matches the bind mount.
- The published Docker image installs `markitdown[pdf]` only — audio transcription and image OCR (`audio-to-markdown`, `image-to-markdown`) require the `[all]` extras and will fail in the slim image. Use the local install (`bun install`) for the full feature set.

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

  OPTIONAL: set `MD_ALLOWED_PATHS` to restrict every file-input tool to a list of directories, e.g. `MD_ALLOWED_PATHS=/data/in:/data/out bun start`.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
