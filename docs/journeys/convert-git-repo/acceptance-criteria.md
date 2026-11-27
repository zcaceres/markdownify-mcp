# Convert Git Repository: Acceptance Criteria

An **MCP Client** invokes `git-repo-to-markdown` with `{ url, branch?, compress? }` and receives a derived **Markdown
Result** (text only, no path) or a structured MCP tool error (`isError: true`). Built as the MCP server and DD CLI
harness ([plan](plan.md)).

Rules that hold whichever journey is involved, and the decisions (D#), questions (U#) and invariants (I#) cited here,
are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md). These criteria say what the **MCP Client** can do and see; they
cite rules rather than restate them. Each slice's [spec](specs/) names the criteria it covers.

Each criterion is one or more Gherkin scenarios tagged with its id (`@GR-1`) and the decisions, questions and
invariants it cites. Scenarios that share an id make up one criterion.

## Steps

1. **Validate request, repository identifier, and branch.** The server validates the MCP Client's arguments, requires a public `http(s)` URL (without embedded credentials) or GitHub `owner/repo` shorthand, and validates optional branch/tag/commit syntax.
2. **Validate destination (SSRF).** For explicit `http(s)` repository URLs, the server resolves DNS and blocks localhost, `.local`/`.internal`, private/reserved IPs, or unresolvable hosts before invoking `repomix`.
3. **Invoke `repomix` within resource bounds.** The server runs `repomix` via `execFile` with explicit argument arrays within `MD_REPOMIX_TIMEOUT_MS` (120s default) and the 100 MB stdout buffer limit.
4. **Return Markdown Result.** The server rejects empty or whitespace-only `repomix` stdout, formats missing-binary/timeout/non-zero failures cleanly, and returns the derived Markdown Result text (no path) or a structured MCP tool error.

## 1. Validate request, repository identifier, and branch

```gherkin
@GR-1 @D3 @D8
Scenario: Missing, blank, or invalid git-repo-to-markdown arguments are refused
  Given an MCP Client calls git-repo-to-markdown with a missing, blank, or non-string url, or non-string branch / non-boolean compress
  When the server validates the request
  Then it refuses the request with a structured MCP tool error without invoking repomix (D8)

@GR-2 @D8 @D29 @I1 @I3
Scenario: Valid public http(s) URLs and GitHub owner/repo shorthands are accepted while unsafe schemes, credentials, and injection are refused
  Given an MCP Client passes a file:// or ssh:// URL, scp-style SSH shorthand (git@host:owner/repo), an http(s) URL with embedded credentials (D29), shell metacharacters, or a flag like "--help"
  When the server validates the Git Repository identifier
  Then it refuses the request before DNS resolution or repomix invocation (D8, D29, I1, I3)

@GR-3 @D8 @I3
Scenario: Unsafe branch, tag, or commit ref syntax is refused while valid refs are accepted
  Given an MCP Client passes a branch that is blank, starts with "-", contains "..", "@{", whitespace, or ends with ".lock"
  When the server validates the branch name
  Then it refuses the request before invoking repomix (D8, I3)
```

## 2. Validate destination (SSRF)

```gherkin
@GR-4 @D8 @I1
Scenario: Explicit http(s) repository URLs targeting localhost, private IPs, or DNS resolving to private IPs are refused
  Given an MCP Client passes an explicit http(s) Git Repository URL pointing to localhost, a private/reserved IP, a hostname resolving to a private/reserved IP, or an unresolvable host
  When the server validates the destination
  Then it refuses the request before invoking repomix (D8, I1)
```

## 3. Invoke `repomix` within resource bounds

```gherkin
@GR-5 @D3 @D5 @I3
Scenario: Valid Git Repository converts via repomix with explicit argument array and optional branch/compress flags
  Given a valid Git Repository URL or GitHub shorthand, optionally with branch and compress
  When the MCP Client converts the Git Repository
  Then the server invokes repomix via execFile with "--remote", "--style", "markdown", "--stdout", "--quiet" (plus "--remote-branch" and "--compress" only when requested) and returns the derived Markdown Result text with no output path (D3, D5, I3)

@GR-7 @D7 @D8 @D28 @D31
Scenario: repomix exceeding MD_REPOMIX_TIMEOUT_MS is aborted and invalid timeout overrides are refused
  Given repomix runs longer than MD_REPOMIX_TIMEOUT_MS (120s default) or MD_REPOMIX_TIMEOUT_MS is invalid
  When the MCP Client converts a Git Repository
  Then the server aborts or refuses the request with a structured error (D7, D8, D28, D31)

@GR-8 @D6 @D9
Scenario: git-repo-to-markdown remains available in HTTP mode when Allowed Paths is unset
  Given the server runs in HTTP mode with MD_ALLOWED_PATHS unset (local file tools disabled per D9)
  When an MCP Client calls git-repo-to-markdown
  Then the server does not block the request under local file-access policy (D6, D9)
```

## 4. Return Markdown Result

```gherkin
@GR-6 @D8 @D30 @D31
Scenario: Missing repomix binary, non-zero exit, and empty/whitespace stdout return structured errors
  Given repomix is missing (ENOENT), exits non-zero, or exits 0 with empty or whitespace-only stdout
  When the MCP Client converts a Git Repository
  Then the server returns a clean structured MCP tool error (D8, D30, D31)

@GR-9 @D3 @D11 @I1 @I3
Scenario: Live harness converts a public GitHub repository and enforces live SSRF and timeout checks
  Given the harness runs in live mode with real DNS and the real repomix CLI
  When the live verification suite converts a public GitHub repository (with branch and compress) and tests live SSRF and timeout bounds
  Then valid repositories convert via repomix and unsafe or timed-out requests fail cleanly (D3, D11, I1, I3)
```
