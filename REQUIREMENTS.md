# Markdownify MCP Requirements

What is true however Markdownify MCP is used: terminology, rules, invariants (I#), decisions (D#) and open questions (U#).
One numbering covers every journey; a new decision, question or invariant takes the next number, whichever journey
raised it. Everything here says what's true now; git keeps how it got there (`git log --grep D7`). Ids never move: a
number is never reused, a resolved question points to its decision under [Resolved questions](#resolved-questions),
and a withdrawn decision keeps its heading as one line.

What each journey's users can do and see is in its acceptance criteria, which cite these rules:

- **Convert Web URL:** MCP Client converts a Web URL (webpage, YouTube video, Bing search, or hosted document) into a Markdown Result ([acceptance criteria](docs/journeys/convert-web-url/acceptance-criteria.md)).
- **Convert Local File:** MCP Client converts a Local File (PDF, image, audio, DOCX, XLSX, PPTX) within Allowed Paths into a Markdown Result ([acceptance criteria](docs/journeys/convert-local-file/acceptance-criteria.md)).
- **Retrieve Markdown File:** MCP Client retrieves an existing local Markdown File (`.md` or `.markdown`, case-insensitive) within Allowed Paths and receives its resolved path and verbatim UTF-8 text as a Markdown Result ([acceptance criteria](docs/journeys/retrieve-markdown-file/acceptance-criteria.md)).
- **Convert Git Repository:** MCP Client converts a public remote Git Repository (`http(s)` URL or GitHub `owner/repo` shorthand, with optional branch/tag/commit and Tree-sitter compression) into a Markdown Result via `repomix` ([acceptance criteria](docs/journeys/convert-git-repo/acceptance-criteria.md)).
- **Serve & Configure Server:** Operator configures and runs Markdownify MCP over `stdio`, stateless Streamable HTTP, or slim Docker, and MCP Client discovers all 11 tools and invokes them under HTTP `Host`/`Origin` guards ([acceptance criteria](docs/journeys/serve-and-configure-server/acceptance-criteria.md)).

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
- **Allowed Paths:** the Operator-configured list of directories (`MD_ALLOWED_PATHS`) bounding filesystem reads after `~` expansion and realpath resolution (D5, D6, D23).
- **Server Configuration:** the Operator-supplied CLI flags and environment variables (`transport`, `host`, `port`, `allowedHosts`, `allowedOrigins`, `allowUnrestrictedPaths`, `MARKITDOWN_PATH`, `REPOMIX_PATH`, `MD_ALLOWED_PATHS`) parsed at startup (D2, D5, D6, D23).
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

- File conversion tools require an absolute or `~`-prefixed path, validate Allowed Paths before checking existence, verify the target exists and is a readable regular file, convert it via `markitdown` (without applying Web URL raw-HTML rejection or a separate input file byte cap), and return the derived Markdown Result text (D3, D4, D5, D17, D18, D19, D20).
- `get-markdown-file` requires an absolute or `~`-prefixed path, validates the `.md`/`.markdown` extension case-insensitively on both the requested path and the `realpath` target, checks Allowed Paths before existence, verifies the target is a readable regular file, and returns the resolved path and verbatim UTF-8 contents as a Markdown Result without a separate byte cap (D3, D5, D8, D17, D18, D19, D21, D25, D26, D27).
- Whenever Allowed Paths is active, Local File and Markdown File reads are validated against Allowed Paths after `~` expansion and `realpath` resolution (D6, I2).

### Web URL Conversion

- Web conversion tools validate the Web URL and every redirect hop against SSRF rules before fetching (D5, D14, I1).
- Non-2xx final HTTP responses fail conversion with a structured MCP tool error reporting the HTTP status code (D8, D12).
- Canonical `https://www.youtube.com/watch?v=...` and `https://www.bing.com/search?q=...` URLs pass directly to `markitdown` after redirect resolution and SSRF validation without downloading the response body (D10, D14).
- All other Web URLs download to a Temporary File whose extension is inferred from known `Content-Type` media types, then URL pathname, defaulting to `.html`, are converted by `markitdown`, and have their Temporary File deleted afterward regardless of outcome (D5, D10, D15, I4).
- Raw unconverted HTML returned by `markitdown` (such as JavaScript-rendered SPAs) is reported as a conversion failure, while empty or whitespace-only output on exit 0 returns an empty Markdown Result (D3, D8, D16).

### Git Repository Conversion

- `git-repo-to-markdown` validates the Git Repository identifier (public `http(s)` URL without embedded credentials, or GitHub `owner/repo` shorthand) and optional branch/tag/commit, validates DNS for `http(s)` URLs against SSRF rules, then invokes `repomix` within bounded timeout and stdout limits to produce a single non-empty Markdown Result with optional Tree-sitter compression (D3, D5, D7, D28, D29, D30, D31, I1, I3).

### Server Configuration & Transports

- The Operator serves Markdownify MCP over `stdio` (default) or stateless Streamable HTTP configured via CLI flags and environment variables (D1, D2, D5).
- In `stdio` mode, Allowed Paths defaults to unrestricted when `MD_ALLOWED_PATHS` is unset (D6, D23).
- In `http` mode, local file-input tools fail closed (`isError: true`) when `MD_ALLOWED_PATHS` is unset unless the Operator passes `--allow-unrestricted-paths` or `MCP_ALLOW_UNRESTRICTED_PATHS=true`, while Web URL and Git Repository tools remain available (D6, D9, D23).
- When `MD_ALLOWED_PATHS` is explicitly set in the environment but parses to zero directories (empty, whitespace-only, or delimiter-only), local file-input tools fail closed with a structured configuration error (D8, D24).

## Non-Functional Requirements

### Security

- Every Web URL, redirect hop, and `http(s)` Git Repository URL is blocked if it uses a non-`http(s)` scheme or resolves to a private, loopback, link-local, or reserved IP address (D1, D14, I1).
- Filesystem reads respect Allowed Paths containment after symlink resolution, and external CLIs are invoked via `execFile` with argument arrays rather than a shell (D6, I2, I3).
- Streamable HTTP defaults to loopback binding (`127.0.0.1`) and enforces `Host` and `Origin` header validation (HTTP 403 on violation) without built-in authentication (D1, I5).

### Reliability & Resource Bounds

- Web URL fetches enforce a 30s timeout (`MD_FETCH_TIMEOUT_MS`), 25 MB max download size (`MD_MAX_DOWNLOAD_BYTES`), and 10 max redirects (`MD_MAX_REDIRECTS`); `markitdown` enforces a 60s timeout (`MD_MARKITDOWN_TIMEOUT_MS`) and 50 MB stdout buffer; `repomix` enforces a 120s timeout (`MD_REPOMIX_TIMEOUT_MS`) and 100 MB stdout buffer (D7, D13, D28).
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

- **Decided (2026-11-26):** `MD_ALLOWED_PATHS` is the sole environment variable for configuring `Allowed Paths` (`D23`). In `stdio` mode, `Allowed Paths` defaults to unrestricted when `MD_ALLOWED_PATHS` is unset for local ergonomics. In `http` mode, networked servers fail closed unless `MD_ALLOWED_PATHS` or the explicit unrestricted opt-out (`D23`) is configured (see D9, D23, D24).

### D7. Bounded timeouts and URL download size limit

- **Decided (2026-11-26):** Enforce bounded timeouts on Web URL fetches, `markitdown` subprocesses, and `repomix` subprocesses, plus a maximum download size for fetched Web URLs, alongside subprocess stdout buffer limits (50 MB for `markitdown`, 100 MB for `repomix`). Concrete thresholds and env var overrides are settled in D13 and D28.

### D8. Uniform MCP tool error contract and case-insensitive Markdown extensions

- **Decided (2026-11-25):** Return structured MCP tool errors (`isError: true`) for all invalid tool inputs (including argument schema validation failures, formatted as a single concise human-readable line rather than raw Zod JSON dumps) as well as runtime/conversion failures. `get-markdown-file` accepts `.md` and `.markdown` extensions case-insensitively.

### D9. HTTP mode fails closed by disabling local file tools when Allowed Paths is unset

- **Decided (2026-11-26):** When started in `--transport=http` without `MD_ALLOWED_PATHS` and without the explicit unrestricted opt-out (`D23`), the HTTP server still starts and serves Web URL and Git Repository tools, while all local file-input tools (`pdf-to-markdown`, `image-to-markdown`, `audio-to-markdown`, `docx-to-markdown`, `xlsx-to-markdown`, `pptx-to-markdown`, `get-markdown-file`) fail closed with a structured MCP tool error (`isError: true`). Resolves U1; opt-out flag and env var are settled in D23.

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

### D17. Pre-validate local files before spawning `markitdown`

- **Decided (2026-11-26):** Before invoking `markitdown` on a Local File, verify the path exists, is a regular file (not a directory), and is readable, returning clean structured domain errors immediately instead of spawning Python and surfacing a traceback.

### D18. Require absolute or `~`-prefixed paths for local file tools

- **Decided (2026-11-26):** Local file conversion tools require an absolute path (POSIX `/...` or Windows drive/UNC path) or a `~`-prefixed home-relative path (`~/...`), rejecting bare relative paths like `foo.pdf` at validation time.

### D19. No separate local input file size cap

- **Decided (2026-11-26):** Local File conversions do not enforce a separate pre-check input file size limit, relying on `markitdown`'s 60-second timeout (`MD_MARKITDOWN_TIMEOUT_MS`) and 50 MB stdout buffer limit (D13) because local files are operator-controlled.

### D20. Unconverted HTML rejection applies to Web URLs only

- **Decided (2026-11-26):** Rejecting `markitdown` stdout that starts with `<!DOCTYPE` or `<html` applies only to Web URL conversions (to detect JS-rendered SPAs), not to Local File conversions.

### D21. Enforce Allowed Paths before checking file existence

- **Decided (2026-11-26):** Whenever Allowed Paths is active (I2), containment is checked before existence, regular-file, or readability checks so requests targeting paths outside Allowed Paths never disclose whether those paths exist on disk.

### D22. Actionable hint on `markitdown` missing optional dependency errors

- **Decided (2026-11-26):** When `markitdown` fails with a `MissingDependencyException` (such as audio or image extras missing in the slim Docker `pdf` image, D4), include an actionable hint explaining that the format requires the full `markitdown[all]` local install rather than the slim Docker `pdf` profile.

### D23. HTTP unrestricted opt-out and removal of `MD_SHARE_DIR`

- **Decided (2026-11-26):** Opting out of HTTP fail-closed local file blocking (`D9`) is supported via either the `--allow-unrestricted-paths` CLI flag or `MCP_ALLOW_UNRESTRICTED_PATHS=true`. The deprecated `MD_SHARE_DIR` fallback is removed; `MD_ALLOWED_PATHS` is the sole environment variable for configuring `Allowed Paths` (`D6`). Resolves U4.

### D24. Fail closed on empty or delimiter-only `MD_ALLOWED_PATHS`

- **Decided (2026-11-26):** Whenever `MD_ALLOWED_PATHS` is explicitly set in the environment (`!== undefined`) but parses to zero directory entries (e.g. `""`, whitespace-only, or delimiter-only such as `":"`), local file-input tools fail closed with a structured configuration error (`isError: true`) rather than falling back to unrestricted access.

### D25. `get-markdown-file` shares local-file path shape, pre-validation, and size-cap rules

- **Decided (2026-11-26):** `get-markdown-file` requires an absolute or `~`-prefixed path (same as D18), pre-validates that the target exists, is a regular file (not a directory or special file), and is readable before reading (same as D17), and enforces no separate local input byte cap (same as D19).

### D26. `get-markdown-file` validates Markdown extension on both requested path and `realpath` target

- **Decided (2026-11-26):** `get-markdown-file` requires a `.md` or `.markdown` extension (case-insensitively, D8) on both the requested path and the `realpath`-resolved target (checked after `Allowed Paths` containment, D21, I2), preventing a `.md` symlink from reading a non-Markdown file inside `Allowed Paths`.

### D27. `get-markdown-file` returns resolved `realpath` and verbatim UTF-8 text

- **Decided (2026-11-26):** `get-markdown-file` returns a derived `Markdown Result` (D5) whose `path` is the `realpath`-resolved file path and whose `text` preserves the exact UTF-8 contents verbatim (including empty or whitespace-only files, without D16 whitespace trimming).

### D28. Default `repomix` subprocess timeout and `MD_REPOMIX_TIMEOUT_MS` override

- **Decided (2026-11-26):** Enforce a 120-second (`120_000` ms) default timeout on `repomix` subprocesses (`git-repo-to-markdown`), configurable via `MD_REPOMIX_TIMEOUT_MS` (positive integer, matching D13 validation rules), alongside the existing 100 MB stdout buffer limit (D7). Resolves U2.

### D29. Reject embedded credentials in Git Repository URLs

- **Decided (2026-11-26):** Reject `http:`/`https:` Git Repository URLs containing embedded username or password credentials (e.g. `https://token@github.com/owner/repo`) at validation time so secrets cannot leak into subprocess arguments, logs, or error messages.

### D30. Empty or whitespace-only `repomix` output is an error

- **Decided (2026-11-26):** Unlike `markitdown` (D16), if `repomix` exits 0 with empty or whitespace-only stdout, fail conversion with a structured MCP tool error (`repomix produced no output...`) rather than returning an empty `Markdown Result`.

### D31. Uniform `repomix` error and timeout formatting

- **Decided (2026-11-26):** Format `repomix` missing binary (`ENOENT`), timeout (`Conversion timed out after <ms>ms`), and non-zero exit failures (`Conversion failed: <reason>`) as clean structured domain errors (D8) rather than surfacing raw `execFile` command strings.

### D32. Fail fast on unknown CLI flags

- **Decided (2026-11-26):** Startup CLI argument parsing rejects unknown flags or unexpected positional arguments (anything other than `--transport=<stdio|http>`, `--host=<host>`, `--port=<1..65535>`, and `--allow-unrestricted-paths`) with a clear error rather than silently ignoring typos.

### D33. Stateless Streamable HTTP routing and non-loopback `Host`/`Origin` defaults

- **Decided (2026-11-26):** Streamable HTTP serves `POST /mcp` and `POST /` exclusively (returning JSON-RPC HTTP 404 on unknown paths and HTTP 405 with `Allow: POST` on non-POST methods; no unauthenticated `/health` endpoint). When bound to a non-loopback host, any syntactically valid `Host` header is allowed unless `MCP_ALLOWED_HOSTS` is configured, browser `Origin` headers are rejected with HTTP 403 unless listed in `MCP_ALLOWED_ORIGINS` (I5), and startup logs a stderr warning recommending an authenticating reverse proxy.

### D34. Slim Docker container verification via `harness docker`

- **Decided (2026-11-26):** Verify the packaged slim Docker image (`Dockerfile`, D4, D11) via `bun run harness docker` using the MCP SDK `StdioClientTransport` against the built container (checking `pdf-to-markdown /data/test.pdf` succeeds, `MD_ALLOWED_PATHS=/data` blocks `/etc/passwd`, and a format requiring `markitdown[all]` surfaces the D22 slim-Docker hint), with `scripts/docker-smoke-test.sh` delegating to it.

## Undecided Questions

| #   | Question                                                                                                                    | Meanwhile                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| U5  | _(Convert Web URL)_ Should the server support custom authentication headers or cookies for paywalled or logged-in Web URLs? | Out of scope; send unauthenticated HTTP requests only |

### Resolved questions

Pointers only, so an old reference to a U# still leads somewhere. The decision says what was decided.

| #   | Resolved by |
| --- | ----------- |
| U1  | D9          |
| U2  | D28         |
| U3  | D14         |
| U4  | D23         |
