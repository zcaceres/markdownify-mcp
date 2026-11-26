# Markdownify MCP Requirements

What is true however Markdownify MCP is used: terminology, rules, invariants (I#), decisions (D#) and open questions (U#).
One numbering covers every journey; a new decision, question or invariant takes the next number, whichever journey
raised it. Everything here says what's true now; git keeps how it got there (`git log --grep D7`). Ids never move: a
number is never reused, a resolved question points to its decision under [Resolved questions](#resolved-questions),
and a withdrawn decision keeps its heading as one line.

What each journey's users can do and see is in its acceptance criteria, which cite these rules:

- **Convert Web URL:** MCP Client converts a Web URL (webpage, YouTube video, Bing search, or hosted document) into a Markdown Result ([acceptance criteria](docs/journeys/convert-web-url/acceptance-criteria.md)).

## Sources

Where the context came from: briefs, documents, designs, tickets, code, people. Re-read them before deciding
something they cover.

- [README.md](README.md): project overview, setup, transport/Docker usage, environment variables, and tool list (read 2026-11-25).
- [src/](src/): current TypeScript implementation (`index.ts`, `server.ts`, `tools.ts`, `Markdownify.ts`, `http.ts`, `utils.ts`) and tests (read 2026-11-25).
- [package.json](package.json), [pyproject.toml](pyproject.toml), [Dockerfile](Dockerfile), [preinstall.js](preinstall.js), [scripts/docker-smoke-test.sh](scripts/docker-smoke-test.sh): runtime, packaging, Python dependency profiles, and container setup (read 2026-11-25).

## Terminology

The vocabulary. Documents, code and harness commands use these words and no others; a new word, or a change to one,
is a decision. Each entry cites the decisions behind it. An entry marked _(proposed)_ was inferred, not confirmed. A
noun marked _(derived)_ is computed from others, never stored, and its entry says how.

### Actors

- **MCP Client:** an AI agent, desktop app, or MCP-compatible caller that discovers and invokes tools over stdio or Streamable HTTP (D1, D2).
- **Operator:** a developer, user, or container orchestrator that installs dependencies, configures flags/environment variables, and runs the server (D1, D2).

### Nouns

- **Local File:** a non-Markdown file on the host filesystem (PDF, image, audio, DOCX, XLSX, PPTX) targeted by path for conversion (D3, D5).
- **Web URL:** an `http:` or `https:` URL (webpage, YouTube video, Bing search results, or hosted document) targeted for conversion (D3, D5).
- **Git Repository:** a remote Git repository identified by an `http(s)` URL or GitHub `owner/repo` shorthand, optionally qualified by branch/tag/commit and compression flag (D3, D5).
- **Markdown File:** an existing local `.md` or `.markdown` file (case-insensitive) read directly without conversion (D3, D5, D8).
- **Markdown Result** _(derived)_: the Markdown `text` (and resolved `path` when retrieving a Markdown File) produced on demand by converting a source or retrieving a Markdown File; never persisted by the server (D1, D5).
- **Allowed Paths:** the Operator-configured list of directories (`MD_ALLOWED_PATHS`, with deprecated `MD_SHARE_DIR` fallback) bounding filesystem reads after `~` expansion and realpath resolution (D5, D6).
- **Server Configuration:** the Operator-supplied CLI flags and environment variables (`transport`, `host`, `port`, `allowedHosts`, `allowedOrigins`, `MARKITDOWN_PATH`, `REPOMIX_PATH`, `MD_ALLOWED_PATHS`) parsed at startup (D2, D5, D6).
- **Temporary File:** a transient file written in a private random temp directory during Web URL download and deleted after conversion completes or fails (D5).

### Verbs

- **convert:** transform a Local File, Web URL, or Git Repository into a Markdown Result via `markitdown` or `repomix` (D3, D5).
- **retrieve:** read an existing Markdown File directly and return its path and contents as a Markdown Result (D3, D5).
- **validate:** check external inputs, paths, URLs, redirect targets, repository identifiers, branch names, and HTTP headers at the system boundary before acting (D5, D6, D8).
- **serve:** run the MCP server over `stdio` or stateless Streamable HTTP according to Server Configuration (D1, D5, D6).

## External Systems

Everything outside the system that it talks to, time included. Each is mocked in `src/integrations/<system>/` for the
harness. When an external system computes a value for us, its rule for it is recorded here, as that system's, not as a
D#.

| System                        | What we need from it                                                                                                                       | Source                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `markitdown` CLI              | Convert local files, downloaded temp files, and allowlisted YouTube/Bing URLs to Markdown (`all` profile locally, `pdf` profile in Docker) | [src/Markdownify.ts](src/Markdownify.ts), D4                           |
| `repomix` CLI                 | Clone and pack a remote Git Repository into a single Markdown document (optional branch/tag/commit and Tree-sitter compression)            | [src/Markdownify.ts](src/Markdownify.ts), D3                           |
| DNS & Remote HTTP/HTTPS Hosts | Resolve hostnames for SSRF validation and fetch Web URL content (with manual redirect traversal)                                           | [src/utils.ts](src/utils.ts), [src/Markdownify.ts](src/Markdownify.ts) |
| Local Filesystem              | Read Local Files and Markdown Files, resolve symlinks (`realpath`), and create/clean up Temporary Files                                    | [src/utils.ts](src/utils.ts), [src/Markdownify.ts](src/Markdownify.ts) |
| `uv` / Python runtime         | Provision the locked `.venv` containing `markitdown` during install/setup                                                                  | [preinstall.js](preinstall.js), [pyproject.toml](pyproject.toml)       |
| Clock                         | Enforce fetch and subprocess timeouts                                                                                                      | D7                                                                     |

## Functional Requirements

### MCP Tool Surface & Error Contract

- The server exposes the 11 stable MCP tools (`youtube-to-markdown`, `pdf-to-markdown`, `bing-search-to-markdown`, `webpage-to-markdown`, `image-to-markdown`, `audio-to-markdown`, `docx-to-markdown`, `xlsx-to-markdown`, `pptx-to-markdown`, `git-repo-to-markdown`, `get-markdown-file`) and keeps project documentation in sync with them (D3).
- Every tool validates its inputs at the boundary and returns a structured MCP tool error (`isError: true`) for invalid arguments, policy rejections, or runtime conversion failures (D8).

### Local File & Markdown Retrieval

- File conversion tools convert a Local File via `markitdown` and return the derived Markdown Result text (D3, D4, D5).
- `get-markdown-file` retrieves an existing local Markdown File (`.md` or `.markdown`, case-insensitively) and returns its resolved path and contents as a Markdown Result (D3, D5, D8).
- Whenever Allowed Paths is active, Local File and Markdown File reads are validated against Allowed Paths after `~` expansion and `realpath` resolution (D6, I2).

### Web URL Conversion

- Web conversion tools validate the Web URL and every redirect hop against SSRF rules before fetching (D5, D14, I1).
- Non-2xx final HTTP responses fail conversion with a structured MCP tool error reporting the HTTP status code (D8, D12).
- Canonical `https://www.youtube.com/watch?v=...` and `https://www.bing.com/search?q=...` URLs pass directly to `markitdown` after redirect resolution and SSRF validation without downloading the response body (D10, D14).
- All other Web URLs download to a Temporary File whose extension is inferred from known `Content-Type` media types, then URL pathname, defaulting to `.html`, are converted by `markitdown`, and have their Temporary File deleted afterward regardless of outcome (D5, D10, D15, I4).
- Raw unconverted HTML returned by `markitdown` (such as JavaScript-rendered SPAs) is reported as a conversion failure, while empty or whitespace-only output on exit 0 returns an empty Markdown Result (D3, D8, D16).

### Git Repository Conversion

- `git-repo-to-markdown` validates the Git Repository identifier (public `http(s)` URL or GitHub `owner/repo` shorthand) and optional branch/tag/commit, then invokes `repomix` to produce a single Markdown Result with optional Tree-sitter compression (D3, D5, I1, I3).

### Server Configuration & Transports

- The Operator serves Markdownify MCP over `stdio` (default) or stateless Streamable HTTP configured via CLI flags and environment variables (D1, D2, D5).
- In `stdio` mode, Allowed Paths defaults to unrestricted (with deprecated `MD_SHARE_DIR` honored as fallback when `MD_ALLOWED_PATHS` is unset) (D6, U4).
- In `http` mode, local file-input tools fail closed (`isError: true`) when Allowed Paths is unset unless the Operator passes an explicit unrestricted opt-out, while Web URL and Git Repository tools remain available (D6, D9, U4).

## Non-Functional Requirements

### Security

- Every Web URL, redirect hop, and `http(s)` Git Repository URL is blocked if it uses a non-`http(s)` scheme or resolves to a private, loopback, link-local, or reserved IP address (D1, D14, I1).
- Filesystem reads respect Allowed Paths containment after symlink resolution, and external CLIs are invoked via `execFile` with argument arrays rather than a shell (D6, I2, I3).
- Streamable HTTP defaults to loopback binding (`127.0.0.1`) and enforces `Host` and `Origin` header validation (HTTP 403 on violation) without built-in authentication (D1, I5).

### Reliability & Resource Bounds

- Web URL fetches enforce a 30s timeout (`MD_FETCH_TIMEOUT_MS`), 25 MB max download size (`MD_MAX_DOWNLOAD_BYTES`), and 10 max redirects (`MD_MAX_REDIRECTS`); `markitdown` enforces a 60s timeout (`MD_MARKITDOWN_TIMEOUT_MS`) and 50 MB stdout buffer; `repomix` enforces a 100 MB stdout buffer and bounded timeout (D7, D13, U2).
- The server holds no persistent state across requests and cleans up every Temporary File on completion or error (D1, I4).

### Platforms, Packaging & Capabilities

- Markdownify MCP supports macOS, Linux, and Windows on Bun / Node.js >= 22 with Python 3.11–3.14 provisioned via `uv` (`markitdown[all]`), and a slim Debian-based Docker image (`oven/bun:debian`) provisioned with `markitdown[pdf]` (D4, D11).
- Converter capability limits (such as `image-to-markdown` without LLM vision config and Docker's slim `pdf` profile) are explicitly documented rather than silently hidden (D4).

## Invariants

Statements that must always be true, however the system is used, in whatever order things happen, and whatever data
the outside world sends.

**Status:** _Decided_ invariants follow from a decision or requirement (the source column), or were confirmed
directly. _Proposed_ ones were inferred while building and need confirming. _Placeholder_ ones describe a stand-in
for an undecided rule and will change with it.

| #   | Invariant                                                                                                                                                                                | Source | Status  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| I1  | Every Web URL, every redirect hop, and every `http(s)` Git Repository URL is validated as public `http:`/`https:` and must resolve exclusively to public IP addresses before fetching.   | D1, D5 | Decided |
| I2  | Whenever Allowed Paths is active, every Local File and Markdown File read resolves (after `~` expansion and `realpath`) inside an Allowed Path — no `..` or symlink escape is permitted. | D5, D6 | Decided |
| I3  | External CLIs (`markitdown`, `repomix`) are always invoked via `execFile` with explicit argument arrays and validated repository/branch inputs, never through a shell.                   | D1, D5 | Decided |
| I4  | Every Temporary File created during Web URL conversion is written in a private random temp directory and deleted on both success and failure.                                            | D5     | Decided |
| I5  | Streamable HTTP rejects invalid `Host` headers (DNS-rebinding protection) and disallowed browser `Origin` headers with HTTP 403.                                                         | D1, D5 | Decided |

## Not Yet in Scope

- Multi-tenant hosting, built-in HTTP authentication, and rate limiting — operators place HTTP mode behind an authenticating reverse proxy when exposing beyond loopback (D1).
- Built-in LLM vision/OCR integration or API key management for image description (D4).
- Full `markitdown[all]` dependency profile in the slim Docker image (D4).

## Decision Log

### D1. Single-operator stateless MCP server scope

- **Decided (2026-11-25):** Markdownify MCP is a single-operator, stateless MCP server focused on reliable, security-hardened conversion of local files, web URLs, and Git repositories to Markdown (and reading existing Markdown files) across local, Docker, and HTTP deployments. Multi-tenant hosting, built-in HTTP authentication, and rate limiting are out of scope; operators place HTTP mode behind an authenticating reverse proxy when exposing beyond loopback.

### D2. System actors

- **Decided (2026-11-25):** The system explicitly models two actors: **MCP Client** (discovers and invokes tools over stdio or Streamable HTTP) and **Operator** (installs dependencies, configures flags and environment variables, and runs the server).

### D3. Stable 11-tool MCP surface

- **Decided (2026-11-25):** Preserve all 11 existing MCP tool names (`youtube-to-markdown`, `pdf-to-markdown`, `bing-search-to-markdown`, `webpage-to-markdown`, `image-to-markdown`, `audio-to-markdown`, `docx-to-markdown`, `xlsx-to-markdown`, `pptx-to-markdown`, `git-repo-to-markdown`, `get-markdown-file`) as the stable public MCP contract, keeping README and other docs in sync (including `git-repo-to-markdown`). Specialized file and web tools continue delegating to the converter without adding per-tool extension or domain restrictions beyond security and routing rules.

### D4. Converter capability boundaries and slim Docker profile

- **Decided (2026-11-25):** Delegate conversion to `markitdown` without integrating built-in LLM vision API keys, and explicitly document/surface capability limits (such as image conversion without vision config). Keep the Docker image on the slim `pdf` Python dependency profile (`markitdown[pdf]`) while local installs use the locked `all` profile (`markitdown[all]`).

### D5. Domain vocabulary

- **Decided (2026-11-25):** Adopt the canonical Nouns (`Local File`, `Web URL`, `Git Repository`, `Markdown File`, `Markdown Result` _(derived)_, `Allowed Paths`, `Server Configuration`, `Temporary File`) and Verbs (`convert`, `retrieve`, `validate`, `serve`) across docs, code, and tests.

### D6. File-access boundary defaults (`MD_ALLOWED_PATHS`)

- **Decided (2026-11-25):** In `stdio` mode, `Allowed Paths` remains optional (unrestricted when unset) for local ergonomics and backward compatibility, with `MD_SHARE_DIR` honored as a deprecated fallback when `MD_ALLOWED_PATHS` is unset. In `http` mode, networked servers fail closed unless `MD_ALLOWED_PATHS` or an explicit unrestricted opt-out is configured (see D9, U4).

### D7. Bounded timeouts and URL download size limit

- **Decided (2026-11-25):** Enforce bounded timeouts on Web URL fetches, `markitdown` subprocesses, and `repomix` subprocesses, plus a maximum download size for fetched Web URLs, alongside subprocess stdout buffer limits (currently 50 MB for `markitdown`, 100 MB for `repomix`). Exact default thresholds and overrides are tracked in U2.

### D8. Uniform MCP tool error contract and case-insensitive Markdown extensions

- **Decided (2026-11-25):** Return structured MCP tool errors (`isError: true`) for all invalid tool inputs (including argument schema validation failures, formatted as a single concise human-readable line rather than raw Zod JSON dumps) as well as runtime/conversion failures. `get-markdown-file` accepts `.md` and `.markdown` extensions case-insensitively.

### D9. HTTP mode fails closed by disabling local file tools when Allowed Paths is unset

- **Decided (2026-11-25):** When started in `--transport=http` without `MD_ALLOWED_PATHS` (or `MD_SHARE_DIR`) and without an explicit opt-out, the HTTP server still starts and serves Web URL and Git Repository tools, while all local file-input tools (`pdf-to-markdown`, `image-to-markdown`, `audio-to-markdown`, `docx-to-markdown`, `xlsx-to-markdown`, `pptx-to-markdown`, `get-markdown-file`) fail closed with a structured MCP tool error (`isError: true`). Resolves U1; exact opt-out flag/env name is tracked in U4.

### D10. Web URL format inference via `Content-Type` and pathname

- **Decided (2026-11-25):** For non-allowlisted Web URLs downloaded to a Temporary File, infer the file extension from the HTTP `Content-Type` header with URL pathname fallback (supporting PDF, Office documents, images, audio, and HTML). Canonical `https://www.youtube.com/watch?v=...` and `https://www.bing.com/search?q=...` URLs continue to pass through directly to `markitdown` after redirect resolution and SSRF validation.

### D11. Supported platforms and runtime profiles

- **Decided (2026-11-25):** Target macOS, Linux, and Windows using Bun and Node.js >= 22 with Python 3.11–3.14 locked via `uv` (`all` profile locally), plus a Debian-based Docker image (`oven/bun:debian`) using the locked slim `pdf` profile.

### D12. Non-2xx HTTP responses fail conversion

- **Decided (2026-11-25):** When fetching a Web URL, if the final HTTP response status is outside `200–299`, fail conversion with a structured MCP tool error (`isError: true`) reporting the HTTP status code instead of converting the remote error page body.

### D13. Default timeouts, URL download size limit, and redirect cap

- **Decided (2026-11-25):** Enforce concrete defaults for Web URL conversion and `markitdown`: 30-second Web URL fetch timeout (`MD_FETCH_TIMEOUT_MS`), 25 MB maximum Web URL download size (`MD_MAX_DOWNLOAD_BYTES`, aborting before buffering unbounded bodies), maximum 10 redirect hops (`MD_MAX_REDIRECTS`), and 60-second `markitdown` subprocess timeout (`MD_MARKITDOWN_TIMEOUT_MS`, alongside the existing 50 MB stdout buffer limit).

### D14. Pre-fetch per-hop DNS validation and canonical YouTube/Bing pass-through

- **Decided (2026-11-25):** Validate DNS on every redirect hop before calling `fetch` without custom outbound socket IP pinning (accepting standard `fetch` DNS TOCTOU for this single-operator server). Canonical `https://www.youtube.com/watch?v=...` and `https://www.bing.com/search?q=...` URLs continue passing directly to `markitdown` after redirect resolution and SSRF validation (cancelling the fetch body without downloading it). Resolves U3.

### D15. Content-Type and pathname extension fallback rules

- **Decided (2026-11-25):** For downloaded Web URLs, infer the Temporary File extension from known `Content-Type` media types first (HTML, PDF, DOCX/XLSX/PPTX, common image and audio formats, plain text, Markdown, XML, JSON, CSV), fall back to a recognized URL pathname extension, and default to `.html` when neither identifies a known type.

### D16. Empty converter output is not an error

- **Decided (2026-11-25):** When `markitdown` exits 0 with empty or whitespace-only output (such as an image URL without LLM vision config or a blank page), return an empty Markdown Result rather than failing. Only fail on unconverted HTML, non-zero exit, timeout, or missing binary.

## Undecided Questions

| #   | Question                                                                                                                                                                                       | Meanwhile                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| U2  | _(Convert Git Repository)_ What is the default timeout duration and env var override for `repomix` subprocesses?                                                                               | Keep existing 100 MB stdout buffer and no extra timeout until settled in Convert Git Repository                         |
| U4  | _(Serve & Configure Server)_ What are the exact CLI flag and environment variable names to opt out of HTTP fail-closed file blocking, and what is the deprecation timeline for `MD_SHARE_DIR`? | Assume `--allow-unrestricted-paths` / `MCP_ALLOW_UNRESTRICTED_PATHS` and continue honoring `MD_SHARE_DIR` until settled |
| U5  | _(Convert Web URL)_ Should the server support custom authentication headers or cookies for paywalled or logged-in Web URLs?                                                                    | Out of scope; send unauthenticated HTTP requests only                                                                   |

### Resolved questions

Pointers only, so an old reference to a U# still leads somewhere. The decision says what was decided.

| #   | Resolved by |
| --- | ----------- |
| U1  | D9          |
| U3  | D14         |
