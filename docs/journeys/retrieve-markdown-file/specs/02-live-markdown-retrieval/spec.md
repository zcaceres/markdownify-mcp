# Slice 02: Live Markdown Retrieval Verification

Part of the [Retrieve Markdown File plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on [slice 01](../01-retrieve-markdown-file/spec.md).

Covers [acceptance criterion](../../acceptance-criteria.md) RM-8.

## Goal

Exercise **Retrieve Markdown File** end-to-end against the real host filesystem and OS symlinks
(**D8, D11, D25, D26, D27, I2**):

1. Add `scenarios/live/retrieve-markdown-file.live.txt` verifying real Markdown retrieval (`README.md`,
   `REQUIREMENTS.md`), live `Allowed Paths` containment & traversal refusal, non-Markdown refusal, missing file
   refusal, `D24` empty `MD_ALLOWED_PATHS` fail-closed, and `D9`/`D23` HTTP fail-closed.
2. Add real OS filesystem & symlink tests in `src/integrations/live.test.ts` verifying `.MD`/`.markdown` retrieval,
   verbatim whitespace-only preservation, realpath return on in-bounds symlinks, `.md -> .txt` symlink refusal,
   escaping symlink refusal, and `folder.md/` directory refusal.

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`bun run harness live scenarios/live/retrieve-markdown-file.live.txt` passes cleanly.

## Scope

**In:** `scenarios/live/retrieve-markdown-file.live.txt`, live retrieval & symlink tests in
`src/integrations/live.test.ts`, and `runbook.md` / `plan.md` links.

**Out:** _(None — completes Retrieve Markdown File.)_

## Vocabulary

- **MCP Client**, **Operator**, **Markdown File**, **Allowed Paths**, **Server Configuration**, **Markdown Result** _(derived)_, **retrieve**, **validate**.

## Harness

- `bun run harness live scenarios/live/retrieve-markdown-file.live.txt`: runs the offline live verification suite
  with `{{REPO_ROOT}}` expanded to the workspace root.

## Placeholders

_(None.)_

## Tests

- **Live integration tests** (`src/integrations/live.test.ts`): real `.md`/`.MD`/`.markdown` files, verbatim whitespace preservation, real OS symlinks (in-bounds returns `realpath`, `.md -> .txt` refused, escaping refused), directory named `folder.md/` refused, and replaying `scenarios/live/retrieve-markdown-file.live.txt`.
- **Live suite:** `scenarios/live/retrieve-markdown-file.live.txt`.
