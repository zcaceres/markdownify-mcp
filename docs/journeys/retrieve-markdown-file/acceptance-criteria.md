# Retrieve Markdown File: Acceptance Criteria

An **MCP Client** invokes `get-markdown-file` with a local **Markdown File** path and receives a derived **Markdown
Result** (`path` and verbatim UTF-8 `text`) or a structured MCP tool error (`isError: true`). Built as the MCP server
and DD CLI harness ([plan](plan.md)).

Rules that hold whichever journey is involved, and the decisions (D#), questions (U#) and invariants (I#) cited here,
are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md). These criteria say what the **MCP Client** can do and see; they
cite rules rather than restate them. Each slice's [spec](specs/) names the criteria it covers.

Each criterion is one or more Gherkin scenarios tagged with its id (`@RM-1`) and the decisions, questions and
invariants it cites. Scenarios that share an id make up one criterion.

## Steps

1. **Validate request, path shape, and Markdown extension.** The server validates the MCP Client's tool arguments, requires an absolute or `~`-prefixed file path, and requires a `.md` or `.markdown` extension case-insensitively.
2. **Enforce file-access policy, Allowed Paths, and target extension.** The server enforces HTTP fail-closed disabling, `D24` empty `MD_ALLOWED_PATHS` refusal, and `Allowed Paths` containment after `~` expansion and `realpath` resolution before checking file existence, then verifies the `realpath` target also has a Markdown extension.
3. **Verify target file and read verbatim.** The server verifies the resolved target exists, is a regular file, and is readable, then reads its UTF-8 contents verbatim without a separate input byte cap.
4. **Return Markdown Result.** The server returns the derived Markdown Result (`path` set to the resolved `realpath` and verbatim `text`) or a structured MCP tool error.

## 1. Validate request, path shape, and Markdown extension

```gherkin
@RM-1 @D3 @D8 @D18 @D25
Scenario: Missing, blank, non-string, or bare relative filepath is refused without touching the filesystem
  Given an MCP Client calls get-markdown-file with a missing, blank, non-string, or bare relative filepath (such as "README.md" or "./notes.md")
  When the server validates the request
  Then it refuses the request with a structured MCP tool error without touching the filesystem (D8, D18, D25)

@RM-2 @D8 @D26
Scenario: Non-Markdown file extension is refused while .md and .markdown are accepted case-insensitively
  Given an MCP Client passes a path ending in ".txt", ".pdf", or no extension
  When the server validates the Markdown File extension
  Then it refuses the request with a structured MCP tool error (D8, D26)

@RM-2 @D8 @D26
Scenario: Uppercase and mixed-case Markdown extensions are accepted
  Given an MCP Client passes a path ending in ".md", ".MD", ".markdown", or ".Markdown"
  When the server validates the Markdown File extension
  Then extension validation succeeds (D8, D26)
```

## 2. Enforce file-access policy, Allowed Paths, and target extension

```gherkin
@RM-3 @D6 @D8 @D9 @D23
Scenario: get-markdown-file fails closed in HTTP mode when Allowed Paths is unset
  Given the server runs in HTTP mode with MD_ALLOWED_PATHS unset and without the D23 unrestricted opt-out
  When an MCP Client calls get-markdown-file
  Then the server refuses the request with a structured MCP tool error without touching the filesystem (D8, D9, D23)

@RM-4 @D6 @D8 @D21 @D23 @D24 @D26 @I2
Scenario: Allowed Paths permits in-bounds Markdown Files and rejects escapes before existence checks
  Given Allowed Paths is configured via MD_ALLOWED_PATHS (D23)
  When an MCP Client requests an out-of-bounds missing file, a ".." traversal, a prefix-sibling directory, or a symlink escaping Allowed Paths
  Then the server refuses the request as outside Allowed Paths without revealing whether the target exists (D21, I2)

@RM-4 @D8 @D24
Scenario: Explicitly set empty or delimiter-only MD_ALLOWED_PATHS fails closed
  Given MD_ALLOWED_PATHS is explicitly set to an empty, whitespace-only, or delimiter-only value
  When an MCP Client calls get-markdown-file
  Then the server refuses the request with a structured configuration error instead of falling back to unrestricted access (D8, D24)

@RM-4 @D8 @D26 @I2
Scenario: Symlink named *.md pointing to a non-Markdown target inside Allowed Paths is refused
  Given a symlink "/data/alias.md" inside Allowed Paths pointing to "/data/secret.txt"
  When an MCP Client calls get-markdown-file on "/data/alias.md"
  Then the server refuses the request because the realpath target is not a Markdown File (D8, D26)
```

## 3. Verify target file and read verbatim

```gherkin
@RM-5 @D8 @D17 @D25
Scenario: Missing file, directory named *.md, non-regular file, or unreadable Markdown File is refused
  Given an allowed Markdown File path does not exist, points to a directory, points to a non-regular file, or is unreadable
  When the server verifies the target file
  Then it refuses the request with a clean domain error before reading (D8, D17, D25)
```

## 4. Return Markdown Result

```gherkin
@RM-6 @D3 @D5 @D19 @D27
Scenario: Readable Markdown File returns resolved realpath and verbatim UTF-8 contents
  Given a readable Markdown File (or in-bounds symlink to a Markdown File) at an allowed path
  When the MCP Client retrieves the Markdown File
  Then the server reads it directly without a separate byte cap and returns a derived Markdown Result with path set to the realpath and verbatim text (D5, D19, D27)

@RM-7 @D5 @D27
Scenario: Empty or whitespace-only Markdown File preserves its exact contents verbatim
  Given a readable Markdown File containing "" or whitespace-only characters
  When the MCP Client retrieves the Markdown File
  Then the server succeeds and returns the exact verbatim contents without trimming (D5, D27)

@RM-8 @D8 @D11 @D26 @D27 @I2
Scenario: Live harness retrieves real Markdown Files and enforces live Allowed Paths and symlink rules
  Given the harness runs in live mode against the host filesystem
  When the live verification suite retrieves real .md, .MD, and .markdown files and tests Allowed Paths, escaping symlinks, and .md-to-non-Markdown symlinks
  Then valid files return their realpath and verbatim contents and invalid targets are refused (D8, D11, D26, D27, I2)
```
