# Convert Web URL: Acceptance Criteria

An **MCP Client** invokes `webpage-to-markdown`, `youtube-to-markdown`, or `bing-search-to-markdown` with a **Web URL**,
and receives a derived **Markdown Result** (text only) or a structured MCP tool error (`isError: true`). Built so far as
the MCP server and DD CLI harness ([plan](plan.md)).

Rules that hold whichever journey is involved, and the decisions (D#), questions (U#) and invariants (I#) cited here,
are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md). These criteria say what the **MCP Client** can do and see; they
cite rules rather than restate them. Each slice's [spec](specs/) names the criteria it covers.

Each criterion is one or more Gherkin scenarios tagged with its id (`@WU-1`) and the decisions, questions and
invariants it cites. Scenarios that share an id make up one criterion. A criterion that cites an open question (U#)
holds only for the prototype's stand-in until that question is decided.

## Steps

1. **Validate request & Web URL.** The server validates the MCP Client's tool arguments and initial Web URL at the boundary.
2. **Fetch & follow redirects.** The server fetches the Web URL with manual redirect handling, SSRF validation per hop, status checking, and timeout/size limits.
3. **Route & stage input.** The server passes allowlisted YouTube/Bing URLs directly to `markitdown`, or infers an extension and stages downloaded bytes into a Temporary File.
4. **Convert via `markitdown`.** The server runs `markitdown`, validates its output, and deletes any Temporary File regardless of outcome.
5. **Return Markdown Result.** The server returns the derived Markdown Result text or a structured MCP tool error.

## 1. Validate request & Web URL

```gherkin
@WU-1 @D3 @D8
Scenario: Missing or invalid URL argument is refused as a tool error
  Given an MCP Client calls "webpage-to-markdown" with a missing or malformed Web URL
  When the server validates the request
  Then it refuses the request with a structured MCP tool error (D8)

@WU-2 @D14 @I1
Scenario: Non-HTTP(S) scheme is refused before fetching
  Given an MCP Client passes a "file://" or "ftp://" Web URL
  When the server validates the Web URL
  Then it refuses the request without contacting the network (I1)

@WU-2 @D14 @I1
Scenario: Blocked hostname or private/reserved IP literal is refused before fetching
  Given an MCP Client passes a Web URL targeting "localhost", a ".internal" host, or a private/loopback IPv4 or IPv6 literal
  When the server validates the Web URL
  Then it refuses the request without contacting the network (I1)

@WU-2 @D14 @I1
Scenario: Hostname resolving to a private IP or failing DNS is refused before fetching
  Given a public hostname resolves to a private IP or fails DNS lookup
  When the server validates the Web URL
  Then it refuses the request without contacting the network (D14, I1)
```

## 2. Fetch & follow redirects

```gherkin
@WU-3 @D3 @D5
Scenario: Public HTML webpage returning HTTP 200 is fetched
  Given a public Web URL returns HTTP 200 with an HTML body
  When the MCP Client converts the Web URL
  Then the server fetches the response body for conversion

@WU-4 @D8 @D12
Scenario: Non-2xx HTTP response fails conversion with its status code
  Given a public Web URL returns HTTP 404 or HTTP 500
  When the MCP Client converts the Web URL
  Then conversion fails with a structured error reporting the HTTP status code (D8, D12)

@WU-5 @D13 @D14 @I1
Scenario: Valid public redirects are followed and resolved
  Given a public Web URL responds with 3xx redirects (including relative Location headers) to another public URL
  When the MCP Client converts the Web URL
  Then the server validates every hop and fetches the final public destination (D14, I1)

@WU-5 @D14 @I1
Scenario: Redirect to a private or disallowed target is refused
  Given a public Web URL redirects to a private IP or blocked hostname
  When the MCP Client converts the Web URL
  Then the server aborts before fetching the disallowed hop (D14, I1)

@WU-5 @D13
Scenario: Redirect chain exceeding the redirect limit is refused
  Given a public Web URL redirects more times than allowed by D13
  When the MCP Client converts the Web URL
  Then conversion fails with a too-many-redirects error (D13)

@WU-6 @D7 @D13
Scenario: Fetch exceeding the timeout or download size limit is aborted
  Given a public Web URL stalls beyond the fetch timeout or streams more bytes than the download cap (D13)
  When the MCP Client converts the Web URL
  Then the server aborts the fetch and returns a structured timeout or size-limit error (D7, D13)
```

## 3. Route & stage input

```gherkin
@WU-7 @D5 @I4
Scenario: Downloaded Web URL bytes are staged in a private random Temporary File
  Given a non-allowlisted Web URL returns HTTP 200
  When the server prepares input for conversion
  Then it writes the downloaded bytes into a Temporary File inside a private random temp directory (I4)

@WU-8 @D10 @D15
Scenario: Temporary File extension is inferred from Content-Type, pathname, or .html fallback
  Given a downloaded Web URL has a known Content-Type, a recognized pathname extension, or neither
  When the server stages the Temporary File
  Then it chooses the extension according to D10 and D15

@WU-9 @D10 @D14
Scenario: Canonical YouTube and Bing URLs route directly to markitdown
  Given a Web URL resolves (directly or via redirect such as youtu.be) to a canonical YouTube watch or Bing search URL (D14)
  When the server prepares input for conversion
  Then it cancels the fetch body without creating a Temporary File and passes the final URL directly to markitdown (D10, D14)
```

## 4. Convert via `markitdown`

```gherkin
@WU-10 @D3 @D5 @I3 @I4
Scenario: Successful markitdown conversion cleans up the Temporary File
  Given a staged Temporary File is passed to markitdown via execFile (I3)
  When markitdown exits 0 with Markdown text
  Then the server deletes the Temporary File and produces the Markdown Result (I4)

@WU-11 @D8 @D16 @I4
Scenario: Empty markitdown output returns an empty Markdown Result
  Given markitdown exits 0 with empty or whitespace-only stdout
  When conversion completes
  Then the server deletes any Temporary File and returns an empty Markdown Result (D16, I4)

@WU-11 @D8 @I3 @I4
Scenario: Converter failure or missing binary returns a structured error and cleans up
  Given markitdown is missing (ENOENT) or exits non-zero
  When the MCP Client converts a Web URL
  Then the server deletes any Temporary File and returns a structured MCP tool error (D8, I4)

@WU-12 @D3 @D8 @I4
Scenario: Unconverted raw HTML output fails conversion and cleans up
  Given markitdown returns raw HTML starting with DOCTYPE or html
  When conversion completes
  Then the server deletes any Temporary File and returns a structured unconverted-HTML error (D8, I4)

@WU-13 @D7 @D13 @I4
Scenario: Converter exceeding the timeout is aborted and cleans up
  Given markitdown runs longer than the conversion timeout (D13)
  When the MCP Client converts a Web URL
  Then the server aborts the conversion, deletes any Temporary File, and returns a structured timeout error (D7, D13, I4)
```

## 5. Return Markdown Result

```gherkin
@WU-14 @D3 @D5 @D8
Scenario: All three web tools return Markdown Result text without a file path
  Given an MCP Client calls "webpage-to-markdown", "youtube-to-markdown", or "bing-search-to-markdown" with a valid Web URL
  When conversion succeeds
  Then the server returns the derived Markdown Result text with no output path (D3, D5)
```
