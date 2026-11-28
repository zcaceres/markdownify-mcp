# Retrieve Markdown File: Plan

How the journey is built, slice by slice. What it must do is in its [acceptance criteria](acceptance-criteria.md);
decisions (D#) and questions (U#) are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md).

## Sources

The designs and existing code behind this journey, from its design session (2026-11-26).

- [REQUIREMENTS.md](../../../REQUIREMENTS.md): system decisions D1–D27, invariants I1–I5.
- [src/tools.ts](../../../src/tools.ts), [src/server.ts](../../../src/server.ts), [src/Markdownify.ts](../../../src/Markdownify.ts), [src/utils.ts](../../../src/utils.ts): existing `get-markdown-file` tool, `Markdownify.get`, and `isMarkdownFile`.
- [src/local-file-conversion/](../../../src/local-file-conversion/) & [src/integrations/filesystem/](../../../src/integrations/filesystem/): existing `FileAccessPolicy`, `FileStat`, `resolveRealpath`, and `statFile` adapters.

## Shape

An **MCP Client** calls `get-markdown-file` with `{ filepath }`. The server validates that `filepath` is a non-empty
absolute or `~`-prefixed string ending in `.md` or `.markdown` (case-insensitively, **D8, D18, D25, D26**), enforces
`FileAccessPolicy` (`D9, D23, D24`) and `Allowed Paths` containment via `realpath` **before** checking existence
(**D6, D21, I2**), verifies that the `realpath`-resolved target also ends in `.md`/`.markdown` (**D26**), verifies the
target exists, is a regular file, and is readable (**D17, D25**), reads its UTF-8 text verbatim with no separate byte
cap (**D19, D27**), and returns a derived **Markdown Result** (`path` = resolved `realpath`, verbatim `text`, **D5,
D27**) or a structured MCP tool error (`isError: true`, **D8**).

## Contexts, verbs and queries

Where this journey lives in the code. Shared pure local file-access primitives (`FileAccessPolicy`, `FileStat`,
`isAbsoluteOrHomePath`, `resolveFileAccessPolicy`, `checkFileAccess`, `validateReadableFile`) move to
`src/shared/local-access.ts` (re-exported by `src/local-file-conversion/` so bounded contexts never import each other).

| Context                   | Nouns                                                            | Verbs                                                                             | Queries          | Harness commands      |
| ------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------- | --------------------- |
| `src/markdown-retrieval/` | `MarkdownFilePath`, `MarkdownRetrievalRequest`, `MarkdownResult` | `isMarkdownExtension`, `validateMarkdownRetrievalRequest`, `retrieveMarkdownFile` | `markdownResult` | `retrieve [filepath]` |

## External systems

Every system outside ours is mocked in `src/integrations/<system>/` (with live counterparts in `live.ts`); world
commands make it do what the journey needs.

| System       | What we need from it                                                                             | World commands                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `filesystem` | Expand `~`, resolve `realpath` (or nearest ancestor), stat & readability checks, read UTF-8 text | `filesystem put <path> [content...]`, `filesystem mkdir <path>`, `filesystem symlink <link> <target>`, `filesystem unreadable <path>` |
| `config`     | `MD_ALLOWED_PATHS`, `MCP_TRANSPORT`, and `MCP_ALLOW_UNRESTRICTED_PATHS`                          | `config set <VAR> <value>`, `config clear <VAR>`                                                                                      |

## Slices

Each slice is one capability, wired through every part of the system (harness commands, verbs, ports, mocks) with a
scenario that runs it. Each has a [spec](specs/) and a scenario in `scenarios/retrieve-markdown-file/`.

### Done

1. **01-retrieve-markdown-file.** Extract shared local file-access primitives to `src/shared/local-access.ts`, build `src/markdown-retrieval/` (`nouns`, `ports`, `queries`, `verbs`), add `readTextFile` to `src/integrations/filesystem/{mock,live}.ts` and `retrieve [filepath]` to `cli/commands/markdown-retrieval.ts`, fix case-insensitive `isMarkdownFile` in `src/utils.ts`, and align `Markdownify.get` + `src/server.ts` with D8, D17, D18, D21, D25, D26, and D27. Covers RM-1, RM-2, RM-3, RM-4, RM-5, RM-6, RM-7.
   ([spec](specs/01-retrieve-markdown-file/spec.md), `scenarios/retrieve-markdown-file/01-retrieve-markdown-file.txt`)
2. **02-live-markdown-retrieval.** Add `scenarios/live/retrieve-markdown-file.live.txt` and real OS filesystem/symlink tests in `src/integrations/live.test.ts` verifying `.md`/`.MD`/`.markdown` retrieval, live `Allowed Paths`, escaping symlink refusal, `.md -> .txt` symlink refusal, and `realpath` return on in-bounds symlinks. Covers RM-8.
   ([spec](specs/02-live-markdown-retrieval/spec.md), `scenarios/live/retrieve-markdown-file.live.txt`)

### Next

_(All planned slices for Retrieve Markdown File are complete; 8/8 acceptance criteria hold.)_

## Deferred

- Frontmatter parsing or metadata extraction from Markdown Files.
- Recursive directory listing or glob-based multi-file Markdown retrieval.
- Writing, creating, or editing Markdown Files (server remains read-only).
