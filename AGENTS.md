# Markdownify MCP

A single-operator, stateless MCP server that converts local files, web URLs, and Git repositories to Markdown and
retrieves existing Markdown files.

What the system must do lives in `REQUIREMENTS.md` and the journeys' acceptance criteria, not here. Don't change
either unilaterally: propose and ask. This file is how we work.

## How we work

Decision-driven development. The domain has a vocabulary of nouns and verbs (`REQUIREMENTS.md` → Terminology), and
every artifact speaks it: requirements, journeys, specs, scenarios and code. Decisions are recorded once, in
`REQUIREMENTS.md`, cited everywhere else, and propagated to everything they touch.

- `/dd-journey` designs a new journey with the user (a design session), says what it must do, and plans its next
  slice.
- **Build** a slice: tests and scenario first, under the conventions below.
- `/dd-review` reviews a branch before it merges: its diff against the criteria, invariants, decisions and specs it
  touches, and its words against Terminology. It proves each bug by running it and proposes fixes, applying them only
  with a yes.
- `/dd-verify` runs a journey and reports where behavior and artifacts disagree, and what's undecided.
- `/dd-decide` records a decision, question or invariant and propagates it everywhere, code included. Given context
  instead (anything from outside that may hold decisions: an edited diagram, a document, an email), it first sorts
  what differs from what's decided.

You propose decisions; the user makes them. When building turns up a rule nobody has decided, don't pick one
silently: use a named placeholder (below), say so, and propose a U#.

## Documents

- `REQUIREMENTS.md`: what is true however the system is used: Terminology, requirements, invariants (I#), the
  Decision Log (D#) and Undecided Questions (U#). One numbering for every journey: a new one takes the next number,
  whichever journey raised it.
- `docs/journeys/<journey>/`: one folder per user journey, each with the same files.
  - `acceptance-criteria.md`: when the journey is done, as Gherkin scenarios in a `gherkin` block per step of the
    journey, each tagged with its criterion's id (`@CO-3`) and the D#s, U#s and I#s it cites. A criterion with several
    cases has a scenario for each, sharing its id.
  - `plan.md`: how the journey is built: the contexts and verbs it uses, the external systems it needs, and its
    slices. A slice is one capability, wired through every part of the system with a scenario that runs it. The first
    is the tracer bullet, the narrowest path a user would recognize; each later one adds one capability. The slices
    still to build are a queue (Next) that grows as running the journey turns up cases.
  - `specs/<nn>-<slice>/spec.md`: one per slice, naming the criteria it covers.
  - `runbook.md`: what needs a person to check (a browser, a real sandbox, a judgment call). Anything that can be
    scripted is a scenario instead.
- `scenarios/<journey>/<nn>-<slice>.txt`: each slice's journey as harness commands and what they print (when a harness
  is used).
- `notes/`: dated working notes, including `/dd-review` and `/dd-verify` reports. They're disposable: delete one once
  its findings are acted on.

Rules for every document:

- **Cite, don't restate.** Criteria, specs and runbooks point at D#, U# and I#; they never copy a rule's wording. A
  changed decision then changes in one place, plus only the artifacts whose meaning changed.
- **Say what's true now; git keeps the history.** No document records what it used to say. A changed decision is
  rewritten to what holds now; a spec is edited to what its capability does now; a dropped spec is deleted. The story
  of a change lives in its commit message, which names the ids it touched (see Commits).
- **Ids never move.** A D#, U# or I# number is never reused or renumbered. A resolved question stays as a one-line
  pointer to its decision, and a withdrawn decision keeps its heading as one line (`### D9. Withdrawn: see D14`), so
  an old reference always leads somewhere.
- **Use the vocabulary.** Documents, code and harness commands use Terminology's words and no others. A new word, or a
  change to one, is a decision.

## Package Manager & Commands

This project uses **Bun** (not pnpm, npm, or yarn) for JavaScript/TypeScript and **uv** for Python dependencies.

```bash
bun install --frozen-lockfile              # install JS deps + preinstall uv sync
bun run harness                            # the DD harness, interactive (mock mode): type help
bun run harness --live                     # the DD harness, interactive against live DNS/HTTP/fs/markitdown
bun run harness exec [--live] "<command>"  # run a single harness command and exit 0/1
bun run harness run <file|folder>          # replay deterministic mock scenarios (.txt, excludes .live.txt)
bun run harness run <…> --write            # accept what mock scenarios print now (see The harness → Scenarios)
bun run harness live <file|folder>         # run variance-tolerant live checks (.live.txt) against real systems
bun run harness docker                     # build and verify slim Docker image over stdio and Streamable HTTP
bun run harness e2e [--all|--form=...]     # verify real MCP transports across 6 Form Factors (--toolset=classic|compact)
bun run build                              # tsc && chmod +x dist/*.js (typechecks src and builds)
bun test                                   # run Bun test suite, including every mock scenario
bun run lint                               # biome check .  (bun run format to fix)
bun start                                  # start the built server (stdio by default)
```

Run `bun run lint`, `bun run build`, `bun test`, and `bun run harness run scenarios` before calling a change done.

## The harness

A CLI (`cli/`) that runs domain verbs and queries as commands against in-memory mocks of external systems
(`cli/world.ts`, `src/integrations/<system>/mock.ts`).

- **Domain commands** (`cli/commands/<context>.ts`) run one verb or query under its Terminology name.
- **World commands** (`cli/commands/<system>.ts`) control mocks (e.g. `clock advance 30m`, failing a fetch or CLI).
- **Scenarios** (`scenarios/<journey>/<nn>-<slice>.txt`) tell each slice as harness commands and expected output, with
  `#` comments citing criteria, D#, U# or I#. `cli/scenarios.test.ts` replays every scenario under `bun test`.
- `bun run harness run … --write` rewrites scenario output only when the new output matches a decision or spec, never
  to silence a failing test.

## Commits

Git is where history lives, so a commit that records or propagates a decision says so. Its subject starts with the id
and says what now holds; its body says what it resolves or replaces, and which artifacts it changed:

```text
D12: reject private IP redirects during URL fetch

Resolves U3. Was: only initial URL validated. Changes CV-4, spec 02-url-fetch,
src/Markdownify.ts, src/utils.ts.
```

`git log --grep D12` is then the whole story of a decision.

## Code conventions

- **Names are the vocabulary.** Types, functions, tools, and tests use Terminology's words from `REQUIREMENTS.md`. If
  code needs a word Terminology doesn't have, propose the term before using it.
- **Parse at the edges; don't cast.** External inputs (MCP tool arguments, HTTP headers, CLI flags, environment
  variables) are validated at the boundary (e.g. with Zod or explicit validators). Avoid `as`, `!`, and `any`.
- **Tests first.** Write the failing test, run it to see it fail, then implement.
- **Placeholders.** A value or rule that stands in for something undecided is a named constant, commented with the U#
  it stands in for, and listed in its slice's spec.
