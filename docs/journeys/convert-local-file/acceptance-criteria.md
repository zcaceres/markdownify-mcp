# Convert Local File: Acceptance Criteria

An **MCP Client** invokes `pdf-to-markdown`, `image-to-markdown`, `audio-to-markdown`, `docx-to-markdown`,
`xlsx-to-markdown`, or `pptx-to-markdown` with a **Local File** path, and receives a derived **Markdown Result** (text
only) or a structured MCP tool error (`isError: true`). Built so far as the MCP server and DD CLI harness
([plan](plan.md)).

Rules that hold whichever journey is involved, and the decisions (D#), questions (U#) and invariants (I#) cited here,
are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md). These criteria say what the **MCP Client** can do and see; they
cite rules rather than restate them. Each slice's [spec](specs/) names the criteria it covers.

Each criterion is one or more Gherkin scenarios tagged with its id (`@LF-1`) and the decisions, questions and
invariants it cites. Scenarios that share an id make up one criterion. A criterion that cites an open question (U#)
holds only for the prototype's stand-in until that question is decided.

## Steps

1. **Validate request & path shape.** The server validates the MCP Client's tool arguments and requires an absolute or `~`-prefixed file path.
2. **Enforce file-access policy & Allowed Paths.** The server enforces HTTP fail-closed file disabling and `Allowed Paths` containment after `~` expansion and `realpath` resolution before checking file existence.
3. **Verify target file.** The server verifies the resolved path exists, is a regular file, and is readable before spawning `markitdown`.
4. **Convert via `markitdown`.** The server runs `markitdown` via `execFile` within its timeout and buffer limits, normalizes empty output, preserves HTML-prefixed text, and adds an actionable hint on missing optional dependencies.
5. **Return Markdown Result.** The server returns the derived Markdown Result text (no path) or a structured MCP tool error.

## 1. Validate request & path shape

```gherkin
@LF-1 @D3 @D8
Scenario: Missing, empty, or invalid filepath argument is refused as a tool error
  Given an MCP Client calls a local file conversion tool with a missing, blank, or non-string filepath
  When the server validates the request
  Then it refuses the request with a structured MCP tool error (D8)

@LF-2 @D8 @D18
Scenario: Bare relative file path is refused while absolute and tilde-prefixed paths are accepted
  Given an MCP Client passes a relative path such as "report.pdf" or "./report.pdf"
  When the server validates the path shape
  Then it refuses the request without touching the filesystem (D18)
```

## 2. Enforce file-access policy & Allowed Paths

```gherkin
@LF-3 @D6 @D8 @D9 @D23
Scenario: Local file tools fail closed when file access is disabled in HTTP mode
  Given the server is configured with local file access disabled per D9 and without the D23 opt-out
  When an MCP Client calls any local file conversion tool
  Then the server refuses the request with a structured MCP tool error without touching the filesystem (D8, D9, D23)

@LF-4 @D6 @D21 @D23 @I2
Scenario: Allowed Paths permits files within configured directories and blocks escapes before checking existence
  Given Allowed Paths is configured via MD_ALLOWED_PATHS (D23)
  When an MCP Client requests a file inside an Allowed Path (including after ~ expansion)
  Then access is permitted (I2)

@LF-4 @D6 @D21 @D23 @I2
Scenario: Out-of-bounds paths, traversal, prefix siblings, and escaping symlinks are refused before existence checks
  Given Allowed Paths is configured to "/data"
  When an MCP Client requests "/etc/missing.pdf", "/data/../etc/passwd", "/data-evil/doc.pdf", or a symlink inside "/data" targeting outside "/data"
  Then the server refuses the request as outside Allowed Paths without revealing whether the target exists (D21, I2)

@LF-4 @D8 @D24
Scenario: Explicitly set empty or delimiter-only MD_ALLOWED_PATHS fails closed
  Given MD_ALLOWED_PATHS is set in the environment to an empty, whitespace-only, or delimiter-only value
  When an MCP Client calls a local file conversion tool
  Then the server refuses the request with a structured configuration error instead of falling back to unrestricted access (D8, D24)
```

## 3. Verify target file

```gherkin
@LF-5 @D8 @D17
Scenario: Missing file, directory, or unreadable file is rejected before spawning markitdown
  Given an allowed Local File path does not exist, points to a directory, or cannot be read
  When the server verifies the target file
  Then it refuses the request immediately with a clean domain error without spawning markitdown (D8, D17)
```

## 4. Convert via `markitdown`

```gherkin
@LF-6 @D3 @D5 @D19 @I3
Scenario: Readable Local File is converted via markitdown without a separate input file size cap
  Given a readable Local File at an allowed path
  When the MCP Client converts the Local File
  Then the server invokes markitdown via execFile and produces the derived Markdown Result (D19, I3)

@LF-7 @D4 @D8 @D16
Scenario: Empty or whitespace-only markitdown output returns an empty Markdown Result
  Given markitdown exits 0 with whitespace-only output (such as an image without LLM vision config, D4)
  When conversion completes
  Then the server returns an empty Markdown Result rather than failing (D16)

@LF-8 @D20
Scenario: Local File output beginning with DOCTYPE or html is preserved
  Given markitdown exits 0 with text beginning with "<!DOCTYPE html>" for a Local File
  When conversion completes
  Then the server returns the text as a Markdown Result instead of rejecting it as an unconverted web SPA (D20)

@LF-9 @D4 @D8 @D22
Scenario: Converter failures, missing binary, and MissingDependencyException return structured errors
  Given markitdown is missing (ENOENT), exits non-zero, or fails with MissingDependencyException
  When the MCP Client converts a Local File
  Then the server returns a structured MCP tool error, including a markitdown[all] vs slim Docker pdf hint on MissingDependencyException (D4, D8, D22)

@LF-10 @D7 @D13
Scenario: Converter exceeding MD_MARKITDOWN_TIMEOUT_MS is aborted and invalid MD_* config is refused
  Given markitdown runs longer than the configured or default MD_MARKITDOWN_TIMEOUT_MS (D7, D13) or MD_MARKITDOWN_TIMEOUT_MS is invalid
  When the MCP Client converts a Local File
  Then the server aborts or refuses the request with a structured error (D7, D13)
```

## 5. Return Markdown Result

```gherkin
@LF-11 @D3 @D5 @D8
Scenario: All six local file tools return derived Markdown Result text without an output path
  Given an MCP Client calls pdf-to-markdown, image-to-markdown, audio-to-markdown, docx-to-markdown, xlsx-to-markdown, or pptx-to-markdown on a valid Local File
  When conversion succeeds
  Then the server returns the derived Markdown Result text with no output path (D3, D5)

@LF-12 @D4 @D11 @I2 @I3
Scenario: Live harness converts real repository sample files and enforces live Allowed Paths and symlink checks
  Given the harness runs in live mode against src/sample-data/
  When the live verification suite converts real PDF, DOCX, XLSX, PPTX, and image files and tests Allowed Paths and symlink escapes
  Then valid files convert via the real markitdown CLI and escaping paths are refused (D4, D11, I2, I3)
```
