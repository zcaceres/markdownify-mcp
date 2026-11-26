# Slice 02: SSRF Validation and Manual Redirects

Part of the [Convert Web URL plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on [slice 01](../01-basic-webpage/spec.md).

Covers [acceptance criteria](../../acceptance-criteria.md) WU-2 and WU-5.

## Goal

Enforce full SSRF validation (**I1, D14**) and manual redirect chain traversal (**D13, D14**) inside
`src/web-conversion/` and the DD harness: reject non-`http:`/`https:` schemes, blocked hostnames (`localhost`,
`*.localhost`, `*.local`, `*.internal`), private/reserved IPv4 and IPv6 literals, DNS resolution failures, and
hostnames resolving to any private/reserved IP — both on the initial Web URL and on every `3xx` redirect hop (including
relative `Location` headers), up to `DEFAULT_MAX_REDIRECTS` (10).

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/convert-web-url/02-ssrf-and-redirects.txt` replays cleanly
(`bun run harness run scenarios/convert-web-url/02-ssrf-and-redirects.txt`).

## Scope

**In:** `validateWebUrl` and redirect loop inside `convertWebUrl` (`src/web-conversion/verbs.ts`), `ResolveHost` port
(`src/web-conversion/ports.ts`), `location` on `FetchedResponse` (`src/web-conversion/nouns.ts`), DNS + redirect +
fetch-count controls on `src/integrations/network/mock.ts` and `cli/commands/network.ts`.

**Out:**

- `Content-Type` / pathname extension inference, YouTube/Bing pass-through, and unconverted raw HTML detection — waits for Slice 03 (`03-format-inference-and-passthrough`, WU-8, WU-9, WU-12).
- Fetch timeout, `markitdown` timeout, 25 MB download size cap, and `MD_*` env var overrides (`MD_MAX_REDIRECTS`, etc.) — waits for Slice 04 (`04-timeouts-and-size-limits`, WU-6, WU-13).
- Custom auth headers or cookies — deferred (U5).

## Vocabulary

- **MCP Client**, **Web URL**, **Temporary File**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

| Payload                | Shape                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ResolvedAddress`      | `{ readonly address: string; readonly family: number }`                                                         |
| `FetchedResponse`      | `{ readonly status: number; readonly body: Uint8Array; readonly finalUrl: string; readonly location?: string }` |
| `WebConversionOptions` | `{ readonly maxRedirects?: number }` (defaults to `10`; D13)                                                    |

## Verbs (`src/web-conversion/verbs.ts`)

| Function                                 | Rule                                                                                                                                                                                                                                                | Error                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validateWebUrl(url, resolveHost)`       | Must be `http:`/`https:`, not a blocked hostname or private/reserved IPv4/IPv6 literal; if hostname is not an IP literal, `resolveHost` must return at least one address and every resolved address must be public (D14, I1)                        | `Invalid URL "<url>"` / `Only http: and https: schemes are allowed.` / `Fetching <url> is potentially dangerous, aborting.` / `Could not resolve host "<hostname>" for <url>.` |
| `convertWebUrl(request, ports, options)` | Validates initial URL and every `3xx` redirect hop (resolving relative `Location` against current URL) before calling `fetchWebUrl`, allowing up to `maxRedirects` redirect hops and failing on the `(maxRedirects + 1)`-th redirect (D13, D14, I1) | `Too many redirects` / `Invalid redirect location "<location>"` (plus all errors from `validateWebUrl` and Slice 01)                                                           |

## Queries (`src/web-conversion/queries.ts`)

Unchanged from Slice 01 (`markdownResult`).

## Harness

| Command                                 | Kind  | What it does                                                                                        |
| --------------------------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| `network dns <host> <ip...>`            | world | Configures mock DNS resolution for `<host>` to return the given IP addresses                        |
| `network dns-fail <host>`               | world | Configures mock DNS lookup for `<host>` to fail (`ENOTFOUND`)                                       |
| `network redirect <from> <status> <to>` | world | Configures mock network to respond to `<from>` with `<status>` and `Location: <to>`                 |
| `network fetch-count`                   | world | Prints `fetch count: <n>` to prove blocked URLs and disallowed redirect hops are never fetched (I1) |

## Placeholders

_(None — `DEFAULT_MAX_REDIRECTS = 10` is decided by D13; env var override `MD_MAX_REDIRECTS` is wired in Slice 04.)_

## Tests

- **Example tests** (`src/web-conversion/web-conversion.test.ts`): unit tests for `validateWebUrl` (non-http(s) schemes, `localhost`/`.local`/`.internal`, IPv4/IPv6/IPv4-mapped private literals, public IP literals skipping DNS, multi-record DNS with one private IP, DNS failure/empty result) and `convertWebUrl` redirect chains (public relative redirect, redirect to private IP aborting before fetching the hop, redirect chain exceeding `maxRedirects`).
- **Scenario:** `scenarios/convert-web-url/02-ssrf-and-redirects.txt`.
