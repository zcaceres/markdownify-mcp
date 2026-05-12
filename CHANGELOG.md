# Changelog

## [Unreleased]

### Fixed
- `Markdownify.get()` now correctly resolves relative paths and home directory (`~`) paths. Previously the resolved path was computed but never used, causing `existsSync` and `readFile` to operate on the raw input.
- `isWithinDirectory()` no longer produces false positives for prefix matches (e.g. `/home/user/docs-other` matching `/home/user/docs`).
- `validateUrl()` now blocks IPv6 loopback addresses (`::1`) and rejects URLs with embedded credentials (`user:pass@host`).
- `inferExtensionFromUrl()` now correctly handles URLs with query strings and fragments before checking file extension.
- `isMarkdownFile()` now matches extensions case-insensitively (`.MD`, `.MARKDOWN`).

### Changed
- Increased test timeouts for PDF conversion (15s, onnxruntime warmup) and invalid repo detection (120s, GitHub API latency).

### Added
- `server.test.ts`: 17 MCP protocol integration tests covering tool listing, routing dispatch, argument validation, error formatting, and response structure.
- `tools.test.ts`: 15 tool schema validation tests for naming conventions, required fields, and annotation consistency.
- `Markdownify.extended.test.ts`: 16 edge case tests for redirect handling, command injection defense, path allowlist enforcement, and error message quality.
- Extended `utils.test.ts` with 12 additional tests for IPv6 security, credential injection, path boundary edge cases, and URL query/fragment handling.
- `.env.example` with documentation for all supported environment variables.

## [1.1.0] — 2025-05

### Added
- Docker path resolution: `MARKITDOWN_PATH`, `REPOMIX_PATH`, and `MD_ALLOWED_PATHS` environment variables are now overridable inside containers.
- Docker E2E smoke test via `scripts/docker-smoke-test.sh`.

### Fixed
- Dockerfile: use `markitdown[pdf]` instead of `[all]` to avoid ONNX runtime ARM compatibility issues.

## [1.0.4] — 2025-04

### Added
- GitHub Actions CI workflow with `lint → build → test` pipeline (on `ci/add-biome-and-github-actions` branch).
- Biome configuration for linting and formatting.

## [1.0.3] — 2025-04

### Fixed
- Dockerfile and `pyproject.toml` updated to use `markitdown[all]` for complete format support.
- CI: added Python setup step for markitdown tests.
- CI: ignore harmless stderr warnings from markitdown subprocess.

## [1.0.2] — 2025-04

### Fixed
- Missing `test.pdf` sample data file added.
- `CLAUDE.md` project documentation added.

## [1.0.1] — 2025-04

### Added
- Initial public release.
- 11 MCP tools for file-to-markdown conversion.
- SSRF protection with `private-ip` library and redirect validation.
- Path allowlist security (`MD_ALLOWED_PATHS` / `MD_SHARE_DIR`).
- `git-repo-to-markdown` tool wrapping Repomix.
- Docker multi-stage build support.
- 30+ unit tests and 14 integration tests.
